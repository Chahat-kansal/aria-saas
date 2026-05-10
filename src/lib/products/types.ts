export interface Outlet {
  id: string
  business_id: string
  name: string
  code: string | null
  address: string | null
  phone: string | null
  timezone: string
  is_global: boolean
  is_default: boolean
  active: boolean
}

export interface PriceSet {
  id: string
  business_id: string
  name: string
  is_default: boolean
  sort_order: number
  description: string | null
}

export interface ProductPrice {
  id: string
  business_id: string
  product_id: string
  price_set_id: string
  outlet_id: string | null
  quantity: number
  price: number
  cost: number | null
  margin_pct: number | null
  valid_from: string | null
  valid_until: string | null
}

export interface OutletInventory {
  id: string
  business_id: string
  product_id: string
  outlet_id: string
  items_on_hand: number
  items_reorder_level: number
  items_reorder_amount: number
  items_reorder_limit: number | null
  items_max_on_hand: number | null
  cases_on_hand: number
  cases_reorder_level: number
  cases_reorder_amount: number
  cases_reorder_limit: number | null
  cases_max_on_hand: number | null
  items_per_case: number
  reorder_rounding: 'no_rounding' | 'round_up' | 'round_down' | 'case_only'
  last_case_cost: number | null
  last_item_cost: number | null
  case_cost: number | null
  item_cost: number | null
}

export interface ProductBarcode {
  id: string
  business_id: string
  product_id: string
  barcode: string
  is_primary: boolean
  barcode_type: 'item' | 'case' | 'pack'
  notes: string | null
}

export interface ProductLoyalty {
  id: string
  business_id: string
  product_id: string
  earns_points: boolean
  points_multiplier: number
  eligible_for_rewards: boolean
  excluded_from_promotions: boolean
  notes: string | null
}

export interface ProductImage {
  id: string
  business_id: string
  product_id: string
  image_url: string
  is_primary: boolean
  sort_order: number
  alt_text: string | null
}

export interface ProductWithFullDetail {
  product: Record<string, unknown>  // existing pos_products row
  prices: ProductPrice[]
  inventory: OutletInventory[]
  barcodes: ProductBarcode[]
  loyalty: ProductLoyalty | null
  images: ProductImage[]
}
