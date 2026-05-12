import { CAFE_SEED_MENU } from '@/lib/seed-menus/cafe'

export interface CafeSeedProduct {
  name: string
  category: string
  price: number
  cost_price: number
  unit: string
  description?: string
  is_featured: boolean
  image_url?: string | null
}

// Map subcategory → display category name
const SUBCAT_TO_CATEGORY: Record<string, string> = {
  'coffee-hot':   'Coffee',
  'coffee-cold':  'Coffee',
  'tea':          'Tea',
  'breakfast':    'Breakfast',
  'lunch':        'Lunch',
  'pastries':     'Bakery',
  'cold-drinks':  'Cold Drinks',
}

// Products that should appear first on the terminal
const FEATURED_NAMES = new Set([
  'Flat White', 'Latte', 'Cappuccino', 'Long Black', 'Iced Latte',
  'Chai Latte', 'Matcha Latte', 'Avocado Toast', 'Big Breakfast',
  'Acai Bowl', 'Croissant', 'Cold Brew',
])

export const CAFE_CATEGORIES = [
  'Coffee', 'Tea', 'Breakfast', 'Lunch', 'Bakery', 'Cold Drinks',
]

export const CAFE_SEED_PRODUCTS: CafeSeedProduct[] = CAFE_SEED_MENU.map(p => ({
  name:        p.name,
  category:    SUBCAT_TO_CATEGORY[p.subcategory] ?? 'Coffee',
  price:       p.price,
  cost_price:  p.cost ?? Math.round(p.price * 0.4 * 100) / 100,
  unit:        'item',
  description: p.description,
  is_featured: FEATURED_NAMES.has(p.name),
  image_url:   p.image_url ?? null,
}))