import manifest from '../../../public/menu/assets-manifest.json'

export type IngredientKey =
  | 'bun-bottom' | 'patty' | 'cheese' | 'bacon' | 'tomato'
  | 'lettuce' | 'onion' | 'pickle' | 'sauce' | 'bun-top'

export const INGREDIENT_PATHS: Record<IngredientKey, string> =
  manifest.ingredients as Record<IngredientKey, string>

export const BURGER_STACK_ORDER: IngredientKey[] = [
  'bun-bottom',
  'patty',
  'cheese',
  'bacon',
  'tomato',
  'lettuce',
  'onion',
  'pickle',
  'sauce',
  'bun-top',
]

const BASE_LAYERS = new Set<IngredientKey>(['bun-bottom', 'patty', 'bun-top'])

export function composeBurger(activeToppings: IngredientKey[]): IngredientKey[] {
  const active = new Set<IngredientKey>([...BASE_LAYERS, ...activeToppings])
  return BURGER_STACK_ORDER.filter(k => active.has(k))
}