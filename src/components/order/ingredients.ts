import manifest from '../../../public/menu/assets-manifest.json'

export type IngredientKey =
  | 'bun-bottom' | 'patty' | 'patty-chicken' | 'patty-veg'
  | 'cheese' | 'bacon' | 'tomato' | 'lettuce' | 'onion' | 'pickle' | 'sauce' | 'bun-top'

export const INGREDIENT_PATHS: Record<IngredientKey, string> =
  manifest.ingredients as Record<IngredientKey, string>

// Three proteins sit in the same vertical slot; only the selected one renders.
export const ALL_PROTEINS: ReadonlyArray<IngredientKey> = ['patty', 'patty-chicken', 'patty-veg']

// Optional toppings shown in the drag/tap tray.
export const OPTIONAL_TOPPINGS: IngredientKey[] = [
  'cheese', 'bacon', 'tomato', 'lettuce', 'onion', 'pickle', 'sauce',
]

// Complete render order — protein alternatives share the same slot.
export const BURGER_STACK_ORDER: IngredientKey[] = [
  'bun-bottom',
  'patty', 'patty-chicken', 'patty-veg',
  'cheese', 'bacon', 'tomato', 'lettuce', 'onion', 'pickle', 'sauce',
  'bun-top',
]

/**
 * Build the ordered visual layer array from customiser state.
 * Only one protein renders; defaults not removed stay in; extras repeat qty times.
 */
export function composeBurger(opts: {
  protein?: IngredientKey
  defaults?: IngredientKey[]
  removed?: ReadonlySet<IngredientKey>
  extras?: Readonly<Partial<Record<IngredientKey, number>>>
}): IngredientKey[] {
  const {
    protein = 'patty',
    defaults = [],
    removed = new Set<IngredientKey>(),
    extras = {},
  } = opts

  const defaultSet = new Set(defaults)
  const result: IngredientKey[] = []

  for (const key of BURGER_STACK_ORDER) {
    if ((ALL_PROTEINS as readonly string[]).includes(key)) {
      if (key === protein) result.push(key)
    } else if (key === 'bun-bottom' || key === 'bun-top') {
      result.push(key)
    } else {
      if (defaultSet.has(key) && !removed.has(key)) result.push(key)
      const qty = extras[key] ?? 0
      for (let i = 0; i < qty; i++) result.push(key)
    }
  }

  return result
}