export type KdsStatus = 'fired' | 'preparing' | 'bumped' | 'recalled' | 'voided'

export interface KdsStation {
  id: string
  business_id: string
  outlet_id: string | null
  station_key: string
  display_name: string
  description: string | null
  sound_enabled: boolean
  auto_recall_threshold_seconds: number | null
  show_modifiers: boolean
  show_allergens: boolean
  sort_order: number
  is_active: boolean
}

export interface KdsTicket {
  id: string
  business_id: string
  outlet_id: string | null
  sale_id: string | null
  sale_item_id: string | null
  station: string
  course: number | null
  seat_number: number | null
  table_label: string | null
  status: KdsStatus
  fired_at: string
  bumped_at: string | null
  recalled_at: string | null
  prep_time_seconds: number | null
  quantity: number
  modifiers_summary: string | null
  notes: string | null
  expedited: boolean
}

export interface ActiveTicketView extends KdsTicket {
  product_name: string
  elapsed_seconds: number
  prep_progress_pct: number
  urgency: 'on-time' | 'warning' | 'overdue'
}
