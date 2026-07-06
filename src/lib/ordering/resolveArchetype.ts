/**
 * Ordering archetype resolver — pure function, no DB calls.
 *
 * Archetype controls which visual treatment a product gets in the online ordering
 * bottom sheet. Resolved at render time from category + product rows.
 *
 * Valid archetype values: 'food' | 'bottle' | 'cup' | 'bowl' | 'photo' | 'generic'
 *
 * Precedence (highest → lowest):
 *   1. ordering_mode = 'exclude'  → always 'generic' (opts out of all visuals)
 *   2. ordering_mode = 'override' → product.ordering_archetype (must be set)
 *   3. ordering_mode = 'inherit'  → product.ordering_archetype ?? category.ordering_archetype ?? 'generic'
 *
 * The fallback is always 'generic' so every product resolves to a known value — never null or blank.
 */

export type Archetype = 'food' | 'bottle' | 'cup' | 'bowl' | 'photo' | 'generic'

export interface ArchetypeProduct {
  ordering_mode?: string | null   // 'inherit' | 'exclude' | 'override' — default 'inherit'
  ordering_archetype?: string | null
}

export interface ArchetypeCategory {
  ordering_archetype?: string | null
}

const VALID: ReadonlySet<string> = new Set(['food', 'bottle', 'cup', 'bowl', 'photo', 'generic'])

function safe(value: string | null | undefined): Archetype {
  return (value && VALID.has(value) ? value : 'generic') as Archetype
}

export function resolveArchetype(
  product: ArchetypeProduct,
  category: ArchetypeCategory | null | undefined,
): Archetype {
  const mode = product.ordering_mode ?? 'inherit'

  // Rule 1: exclude → generic regardless of any archetype setting
  if (mode === 'exclude') return 'generic'

  // Rule 2: override → use the product-level archetype (falls back to generic if unset)
  if (mode === 'override') return safe(product.ordering_archetype)

  // Rule 3: inherit → product-level first, then category, then 'generic'
  return safe(product.ordering_archetype ?? category?.ordering_archetype)
}

// ── Build layout resolver ──────────────────────────────────────────────────────

const BUILD_LAYOUT_MAP: Record<string, 'stack' | 'bowl' | 'scatter'> = {
  salad:     'bowl',
  bowl:      'bowl',
  brekky:    'bowl',
  toastie:   'stack',
  sandwich:  'stack',
  roll:      'stack',
  wrap:      'stack',
  breakfast: 'scatter',
}

/**
 * Given a food-build archetype string, return the correct LayeredProduct layout.
 * Defaults to 'stack' for unknown archetypes.
 */
export function resolveBuildLayout(archetype: string): 'stack' | 'bowl' | 'scatter' {
  return BUILD_LAYOUT_MAP[archetype.toLowerCase()] ?? 'stack'
}