export type ProductRenderMode = 'standard' | 'build' | 'coffee'

export interface RenderModeProduct {
  ordering_mode?: string | null
  ordering_archetype?: string | null
}

// All ordering_archetype values that trigger the spin viewer
export const COFFEE_DRINK_TYPES = new Set([
  // hot milk drinks → flat-white spin
  'flat-white', 'latte', 'cappuccino', 'mocha', 'chai', 'dirty-chai',
  'matcha', 'turmeric-latte', 'macchiato', 'long-macchiato', 'long-black',
  // espresso
  'espresso',
  // iced drinks
  'iced-latte', 'iced-mocha', 'iced-choc', 'iced-coffee',
  // hot chocolate
  'hot-choc',
  // chai tea
  'chai-tea',
  // cold brew
  'cold-brew',
  // milkshakes
  'choc-milkshake', 'caramel-milkshake', 'vanilla-milkshake',
  // smoothies
  'acai', 'avocado', 'banana', 'berry', 'choc-smoothie', 'green-smoothie', 'mango-smoothie',
  'smoothie-berry', 'smoothie-mango',
  // juices
  'juice-apple', 'juice-orange',
])

export function resolveRenderMode(product: RenderModeProduct): ProductRenderMode {
  if (product.ordering_mode === 'build') return 'build'
  if (product.ordering_archetype && COFFEE_DRINK_TYPES.has(product.ordering_archetype)) return 'coffee'
  return 'standard'
}