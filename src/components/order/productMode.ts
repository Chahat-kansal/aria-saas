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

export type ProductRenderMode = 'standard' | 'build'

export interface RenderModeProduct {
  /** Existing column — may carry 'inherit' | 'exclude' | 'override' today.
   *  ORD-3D-5 will also set 'build' here for build-your-own products. */
  ordering_mode?: string | null
  /** Existing column from resolveArchetype — checked as a secondary signal. */
  ordering_archetype?: string | null
}

export function resolveRenderMode(product: RenderModeProduct): ProductRenderMode {
  // Primary signal: ordering_mode === 'build'
  // ORD-3D-5 sets this on the pos_products row for build-your-own items.
  if (product.ordering_mode === 'build') return 'build'

  // Fallback: all other ordering_mode values and all archetypes → standard hero
  return 'standard'
}