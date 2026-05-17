export interface ModifierSelection {
  modifier_id: string
  name: string
  price_adjustment: number
  quantity: number
}

export interface ModifierGroup {
  id: string
  name: string
  display_name?: string | null
  selection_type: 'single' | 'multi'
  is_required: boolean
  min_selections: number
  max_selections: number
  allow_quantity: boolean
  step_number?: number | null
  modifiers: Array<{
    id: string
    name: string
    price_adjustment: number
    is_default: boolean
    is_active: boolean
    allow_quantity: boolean
    max_quantity: number
  }>
}

export interface ValidationError {
  group_id: string
  message: string
}

export function validateSelections(
  groups: ModifierGroup[],
  selections: ModifierSelection[],
): ValidationError[] {
  const errors: ValidationError[] = []
  for (const g of groups) {
    const inGroup = selections.filter(s => g.modifiers.some(m => m.id === s.modifier_id))
    const totalQty = inGroup.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0)
    if (g.is_required && totalQty < (g.min_selections || 1)) {
      errors.push({ group_id: g.id, message: `${g.display_name ?? g.name}: choose at least ${g.min_selections || 1}` })
    }
    if (g.max_selections > 0 && totalQty > g.max_selections) {
      errors.push({ group_id: g.id, message: `${g.display_name ?? g.name}: choose at most ${g.max_selections}` })
    }
    if (g.selection_type === 'single' && inGroup.length > 1) {
      errors.push({ group_id: g.id, message: `${g.display_name ?? g.name}: only one option allowed` })
    }
  }
  return errors
}

export function computeLineUnitPrice(
  basePrice: number,
  selections: ModifierSelection[],
): number {
  const base = Number(basePrice) || 0
  const adj = selections.reduce(
    (sum, s) => sum + ((Number(s.price_adjustment) || 0) * (Number(s.quantity) || 1)),
    0,
  )
  return +(base + adj).toFixed(2)
}

export function defaultSelections(groups: ModifierGroup[]): ModifierSelection[] {
  return groups.flatMap(g =>
    g.modifiers
      .filter(m => m.is_default && m.is_active)
      .map(m => ({
        modifier_id: m.id,
        name: m.name,
        price_adjustment: Number(m.price_adjustment) || 0,
        quantity: 1,
      }))
  )
}
