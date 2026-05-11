export type POStatus = 'draft' | 'sent' | 'received' | 'cancelled'
export type POSource = 'manual' | 'auto_reorder' | 'agent'

export interface PurchaseOrder {
  id: string
  business_id: string
  order_number: string
  status: POStatus
  source: POSource
  supplier_id: string | null
  supplier_name: string | null
  notes: string | null
  total_estimated: number | null
  sent_at: string | null
  received_at: string | null
  created_by: string
  created_at: string
  updated_at: string
  lines?: PurchaseOrderLine[]
}

export interface PurchaseOrderLine {
  id: string
  business_id: string
  order_id: string
  product_id: string
  product_name: string
  product_sku: string | null
  supplier_id: string | null
  supplier_name: string | null
  quantity_cases: number
  quantity_items: number
  unit: 'case' | 'item'
  last_purchase_price: number | null
  suggested_price: number | null
  open_market_low: number | null
  open_market_high: number | null
  open_market_source: string | null
  confirmed_price: number | null
  line_total: number | null
  notes: string | null
  sort_order: number
}

export interface ReorderSchedule {
  id: string
  business_id: string
  enabled: boolean
  day_of_week: number
  hour_utc: number
  lookback_days: number
  min_stock_threshold_days: number
  notify_email: boolean
  last_run_at: string | null
  last_order_id: string | null
}

export interface MarketPriceResult {
  source_name: string
  source_url: string | null
  shelf_price: number
  fetched_at: string
  is_cached: boolean
  is_estimate?: boolean
}
