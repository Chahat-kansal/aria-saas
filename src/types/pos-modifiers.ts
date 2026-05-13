export type ModifierGroupSelectionType = 'single' | 'multi'

export interface ModifierGroup {
  id: string
  business_id: string
  name: string
  display_name: string | null
  selection_type: ModifierGroupSelectionType
  is_required: boolean
  min_selections: number
  max_selections: number | null
  allow_quantity: boolean
  show_conversational_buttons: boolean
  display_order: number
  color: string
  modifiers?: Modifier[]
}

export interface Modifier {
  id: string
  group_id: string
  business_id: string
  name: string
  price_adjustment: number
  price_per_size: Record<string, number>
  is_default: boolean
  allow_quantity: boolean
  max_quantity: number
  inventory_link: string | null
  is_active: boolean
  display_order: number
}

export interface ProductVariation {
  id: string
  product_id: string
  business_id: string
  name: string
  price: number
  size_key: string | null
  is_default: boolean
  display_order: number
}

export interface ProductModifierGroup {
  id: string
  product_id: string
  group_id: string
  business_id: string
  override_required: boolean | null
  override_min: number | null
  override_max: number | null
  display_order: number
  group?: ModifierGroup
}

export interface SelectedModifier {
  modifier_id: string
  group_id: string
  group_name: string
  modifier_name: string
  price: number
  quantity: number
  operator: 'add' | 'extra' | 'no' | 'sub' | 'side' | 'allergy' | null
}

export interface ConfiguredCartItem {
  product_id: string
  product_name: string
  variation_id: string | null
  variation_name: string | null
  base_price: number
  selected_modifiers: SelectedModifier[]
  total_price: number
  display_summary: string
  kitchen_summary: string
  quantity: number
}