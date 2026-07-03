export type ProductRenderMode = 'standard' | 'build'

export interface RenderModeProduct {
  ordering_mode?: string | null
  ordering_archetype?: string | null
}

// Exported so MenuClient can resolve the sip-ff5055 hero path for coffee products
export const COFFEE_DRINK_TYPES = new Set([
  'flat-white', 'latte', 'cappuccino', 'mocha', 'long-black',
  'hot-choc', 'chai', 'matcha', 'iced-coffee', 'iced-latte',
  'iced-choc', 'juice-orange', 'juice-apple', 'smoothie-berry', 'smoothie-mango',
])

export function resolveRenderMode(product: RenderModeProduct): ProductRenderMode {
  if (product.ordering_mode === 'build') return 'build'
  return 'standard'
}