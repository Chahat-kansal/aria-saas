export type Industry = 'retail' | 'cafe' | 'bakery' | 'restaurant' | 'warehouse' | 'gym' | 'tradie' | 'visa' | 'realestate'
export type IndustrySubtype = 'liquor' | 'grocery' | 'convenience' | 'fashion' | null
export type ProductIndustryKind = 'retail' | 'liquor' | 'cafe' | 'bakery' | 'restaurant'

export const PUBLISHED_PRODUCT_INDUSTRIES: ProductIndustryKind[] = [
  'retail', 'liquor', 'cafe', 'bakery', 'restaurant',
]

export const INDUSTRY_LABELS: Record<ProductIndustryKind, string> = {
  retail: 'Retail',
  liquor: 'Liquor',
  cafe: 'Cafe',
  bakery: 'Bakery',
  restaurant: 'Restaurant',
}

/**
 * Resolve a business's industry + subtype into the product form kind.
 * Liquor stores are industry=retail + subtype=liquor.
 */
export function resolveProductIndustry(
  industry?: string | null,
  subtype?: string | null,
): ProductIndustryKind {
  if (industry === 'retail' && subtype === 'liquor') return 'liquor'
  if (industry === 'cafe') return 'cafe'
  if (industry === 'bakery') return 'bakery'
  if (industry === 'restaurant') return 'restaurant'
  return 'retail'
}

export const ALLERGEN_OPTIONS = [
  'gluten', 'dairy', 'eggs', 'soy', 'peanuts', 'tree_nuts',
  'sesame', 'fish', 'shellfish', 'sulphites', 'lupin',
] as const

export const COURSE_TYPES = [
  'appetiser', 'entree', 'main', 'side', 'dessert', 'beverage', 'special',
] as const

export const CONTAINER_TYPES = [
  'bottle', 'can', 'keg', 'cask', 'box', 'multipack',
] as const
