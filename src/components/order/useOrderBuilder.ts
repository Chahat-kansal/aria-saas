'use client'
import { useState } from 'react'
import { composeBurger, OPTIONAL_TOPPINGS, type IngredientKey } from './ingredients'

export const BASE_PRICE = 8.90

// Fallback prices used when no modifier config is provided (standalone demo mode)
export const TOPPING_PRICES: Partial<Record<IngredientKey, number>> = {
  cheese: 0.80, bacon: 1.50, tomato: 0.60,
  lettuce: 0.50, onion: 0.40, pickle: 0.30, sauce: 0.40,
}

// Info about one modifier option as derived from pos_modifiers row
export interface ModifierInfo {
  id: string
  name: string
  priceCents: number
  allowQty: boolean
  maxQty: number
}

/**
 * Core customiser state machine.
 *
 * defaultKeys  — ingredients pre-included by the café (is_default=true in DB)
 * modifierMap  — live DB prices/qty caps per ingredient key
 * basePrice    — product base price in dollars
 * initialProtein — which patty variant is selected on open
 *
 * PRICING RULE: removing a default = $0. Adding extras = +priceCents each unit.
 */
export function useOrderBuilder(opts: {
  defaultKeys?: IngredientKey[]
  modifierMap?: Partial<Record<IngredientKey, ModifierInfo>>
  basePrice?: number
  initialProtein?: IngredientKey
} = {}) {
  const {
    defaultKeys = [],
    modifierMap = {},
    basePrice = BASE_PRICE,
    initialProtein = 'patty',
  } = opts

  const [removed, setRemoved] = useState<ReadonlySet<IngredientKey>>(new Set())
  const [extras, setExtras] = useState<Partial<Record<IngredientKey, number>>>({})
  const [protein, setProteinState] = useState<IngredientKey>(initialProtein)

  const layers = composeBurger({ protein, defaults: defaultKeys, removed, extras })

  // Price: base + Σ(extra_qty × priceCents/100)
  const total = Number(
    (basePrice + OPTIONAL_TOPPINGS.reduce((sum, key) => {
      const qty = extras[key] ?? 0
      const cents = modifierMap[key]?.priceCents ?? (TOPPING_PRICES[key] ?? 0) * 100
      return sum + qty * cents / 100
    }, 0)).toFixed(2),
  )
  const points = Math.floor(total)

  // Flat active list for display (defaults-kept + extras>0)
  const defaultSet = new Set(defaultKeys)
  const active: IngredientKey[] = [
    protein,
    ...defaultKeys.filter(k => !removed.has(k)),
    ...OPTIONAL_TOPPINGS.filter(k => !defaultSet.has(k) && (extras[k] ?? 0) > 0),
  ]

  // Toggle a default on/off (free — does not change price)
  function toggleDefault(key: IngredientKey) {
    setRemoved(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  // Set extra-unit count for a topping (0 = none, 1+ = repeated layers + price)
  function setExtraQty(key: IngredientKey, qty: number) {
    const max = modifierMap[key]?.maxQty ?? 10
    setExtras(prev => ({ ...prev, [key]: Math.max(0, Math.min(max, qty)) }))
  }

  // Swap protein pill (crossfade handled by AnimatePresence key change)
  function swapProtein(key: IngredientKey) {
    setProteinState(key)
  }

  // Backward-compat drag helpers (for DnD drop zone)
  function addTopping(key: IngredientKey) {
    if (defaultSet.has(key)) {
      if (removed.has(key)) toggleDefault(key)
    } else {
      setExtraQty(key, (extras[key] ?? 0) + 1)
    }
  }
  function removeTopping(key: IngredientKey) {
    setExtraQty(key, 0)
  }
  function toggleTopping(key: IngredientKey) {
    if (defaultSet.has(key)) {
      toggleDefault(key)
    } else {
      const cur = extras[key] ?? 0
      setExtraQty(key, cur > 0 ? 0 : 1)
    }
  }

  return {
    protein, removed, extras, layers, active,
    total, points,
    toggleDefault, setExtraQty, swapProtein,
    addTopping, removeTopping, toggleTopping,
  }
}