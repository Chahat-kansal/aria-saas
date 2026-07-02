'use client'
import { useState } from 'react'
import { composeBurger, type IngredientKey } from './ingredients'

// Fallback prices — overridden by real pos_modifier_group_options.price_cents ÷ 100 via props
export const TOPPING_PRICES: Partial<Record<IngredientKey, number>> = {
  cheese: 0.80,
  bacon:  1.50,
  tomato: 0.60,
  lettuce: 0.50,
  onion:  0.40,
  pickle: 0.30,
  sauce:  0.40,
}
export const BASE_PRICE = 8.90

// Toppings the user can toggle (excludes base layers bun-bottom / patty / bun-top)
export const OPTIONAL_TOPPINGS: IngredientKey[] = [
  'cheese', 'bacon', 'tomato', 'lettuce', 'onion', 'pickle', 'sauce',
]

// modifierPrices: real prices from pos_modifier_group_options.price_cents ÷ 100
// basePrice: the product's base price in dollars
// Both fall back to TOPPING_PRICES / BASE_PRICE when not provided (standalone use)
export function useOrderBuilder(
  modifierPrices?: Partial<Record<IngredientKey, number>>,
  basePrice?: number,
) {
  const prices = modifierPrices ?? TOPPING_PRICES
  const base   = basePrice ?? BASE_PRICE
  const [active, setActive] = useState<IngredientKey[]>([])

  const layers = composeBurger(active)
  const total  = Number(
    (base + active.reduce((s, k) => s + (prices[k] ?? 0), 0)).toFixed(2)
  )
  const points = Math.floor(total)

  function addTopping(k: IngredientKey) {
    setActive(prev => prev.includes(k) ? prev : [...prev, k])
  }

  function removeTopping(k: IngredientKey) {
    setActive(prev => prev.filter(x => x !== k))
  }

  function toggleTopping(k: IngredientKey) {
    setActive(prev =>
      prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]
    )
  }

  return { active, layers, total, points, addTopping, removeTopping, toggleTopping }
}