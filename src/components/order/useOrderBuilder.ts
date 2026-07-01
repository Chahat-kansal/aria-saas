'use client'
import { useState } from 'react'
import { composeBurger, type IngredientKey } from './ingredients'

// TEMP — replaced by real price_cents in ORD-3D-5
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

export function useOrderBuilder() {
  const [active, setActive] = useState<IngredientKey[]>([])

  const layers = composeBurger(active)
  const total  = Number(
    (BASE_PRICE + active.reduce((s, k) => s + (TOPPING_PRICES[k] ?? 0), 0)).toFixed(2)
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