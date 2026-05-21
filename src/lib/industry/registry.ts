export type Industry = 'retail' | 'cafe' | 'bakery' | 'restaurant' | 'warehouse' | 'gym' | 'tradie' | 'visa' | 'realestate'
export type IndustrySubtype = 'liquor' | 'grocery' | 'convenience' | 'fashion' | null
export type ProductIndustryKind = 'retail' | 'liquor' | 'cafe' | 'bakery' | 'restaurant' | 'fashion' | 'convenience' | 'pharmacy'

export const PUBLISHED_PRODUCT_INDUSTRIES: ProductIndustryKind[] = [
  'retail', 'liquor', 'cafe', 'bakery', 'restaurant', 'fashion', 'convenience', 'pharmacy',
]

export const INDUSTRY_LABELS: Record<ProductIndustryKind, string> = {
  retail: 'Retail',
  liquor: 'Liquor',
  cafe: 'Cafe',
  bakery: 'Bakery',
  restaurant: 'Restaurant',
  fashion: 'Fashion & Clothing',
  convenience: 'Convenience Store',
  pharmacy: 'Pharmacy & Health',
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
  if (industry === 'retail' && subtype === 'fashion') return 'fashion'
  if (industry === 'retail' && subtype === 'convenience') return 'convenience'
  if (industry === 'cafe') return 'cafe'
  if (industry === 'bakery') return 'bakery'
  if (industry === 'restaurant') return 'restaurant'
  if (industry === 'pharmacy') return 'pharmacy'
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

export const SIZE_OPTIONS_CLOTHING = ['XS','S','M','L','XL','XXL','XXXL','One Size'] as const
export const SIZE_OPTIONS_SHOES = ['5','6','7','8','9','10','11','12','13','14','US6','US7','US8','US9','US10','US11','US12'] as const
export const GENDER_OPTIONS = ['Men','Women','Unisex','Boys','Girls','Baby'] as const
export const FIT_OPTIONS = ['Slim Fit','Regular Fit','Relaxed Fit','Oversized','Tailored'] as const
export const STORAGE_TEMP_OPTIONS = ['Ambient','Refrigerated (2-8°C)','Frozen (-18°C)','Cool & Dry'] as const
