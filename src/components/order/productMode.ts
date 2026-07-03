/**
 * ProductRenderMode — controls which visual treatment an ordering product gets.
 *
 * 'build'    → drag-to-build burger customiser (ORD-3D-3 ProductCustomiser)
 * 'standard' → single floating hero image / spin-video (ORD-3D-4 ProductHero)
 *
 * ORD-3D-5 will wire the real DB flag here. Options under consideration:
 *   a) pos_products.ordering_mode = 'build'  (extends existing 'inherit'|'exclude'|'override')
 *   b) pos_products.ordering_archetype = 'builder'  (extends resolveArchetype valid set)
 * Until then, every product resolves to 'standard'.
 */

export type ProductRenderMode = 'standard' | 'build' | 'coffee'

export interface RenderModeProduct {
  /** Existing column — may carry 'inherit' | 'exclude' | 'override' today.
   *  ORD-3D-5 will also set 'build' here for build-your-own products. */
  ordering_mode?: string | null
  /** Existing column from resolveArchetype — checked as a secondary signal. */
  ordering_archetype?: string | null
}

export function resolveRenderMode(product: RenderModeProduct): ProductRenderMode {
  // Primary signal: ordering_mode === 'build'
  if (product.ordering_mode === 'build') return 'build'

  // ordering_archetype holding a coffee drink type → filled GLB viewer
  const COFFEE_DRINK_TYPES = new Set([
    'flat-white', 'latte', 'cappuccino', 'mocha', 'long-black',
    'hot-choc', 'chai', 'matcha', 'iced-coffee', 'iced-latte',
    'iced-choc', 'juice-orange', 'juice-apple', 'smoothie-berry', 'smoothie-mango',
  ])
  if (product.ordering_archetype && COFFEE_DRINK_TYPES.has(product.ordering_archetype)) return 'coffee'

  return 'standard'
}