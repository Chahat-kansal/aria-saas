import type { ConfiguredCartItem, SelectedModifier } from '@/types/pos-modifiers'

/**
 * Formats a configured sandwich/food item into a multi-line kitchen ticket string.
 * Allergy flags appear in ALL CAPS at the top with *** banner.
 */
export function formatSandwichForKitchen(item: ConfiguredCartItem): string {
  const lines: string[] = []

  // Group modifiers by group_name
  const byGroup: Record<string, SelectedModifier[]> = {}
  for (const m of item.selected_modifiers) {
    const key = m.group_name
    if (!byGroup[key]) byGroup[key] = []
    byGroup[key].push(m)
  }

  // Allergy flags first — ALL CAPS banner
  const allergies = byGroup['Allergy Flags'] ?? []
  if (allergies.length > 0) {
    const flags = allergies.map(a => a.modifier_name.toUpperCase()).join(', ')
    lines.push(`*** ALLERGY: ${flags} ***`)
  }

  // Bread + toast
  const bread = byGroup['Bread']?.[0]?.modifier_name
  const toast = byGroup['Toasted']?.[0]?.modifier_name
  if (bread) {
    const toastNote = toast && toast !== 'No' ? ` (${toast.toLowerCase()} toast)` : ''
    lines.push(`${bread}${toastNote}`)
  }

  // Protein quantity
  const qty = byGroup['Protein Quantity']?.[0]?.modifier_name
  if (qty && qty !== 'Single') lines.push(qty)

  // Egg prep
  const eggs = byGroup['Egg Preparation']?.[0]?.modifier_name
  if (eggs) lines.push(`Eggs: ${eggs}`)

  // Cooking temp
  const temp = byGroup['Cooking Temperature']?.[0]?.modifier_name
  if (temp) lines.push(`Cook: ${temp}`)

  // Cheese
  const cheeses = (byGroup['Cheese'] ?? []).map(m => m.modifier_name)
  if (cheeses.length > 0) lines.push(cheeses.join(', '))

  // Vegetables
  const veggies = (byGroup['Vegetables'] ?? []).map(m => m.modifier_name)
  if (veggies.length > 0) lines.push(`+ ${veggies.join(', ')}`)

  // Sauces
  const sauces = (byGroup['Sauces'] ?? []).map(m => m.modifier_name)
  if (sauces.length > 0) lines.push(`+ ${sauces.join(', ')}`)

  // Side
  const side = byGroup['Sides']?.[0]?.modifier_name
  if (side && side !== 'None') lines.push(`Side: ${side}`)

  // Cut
  const cut = byGroup['Cut']?.[0]?.modifier_name
  if (cut && cut !== 'Whole') lines.push(`>> Cut in ${cut.toLowerCase()}`)

  // Special instructions
  const note = (item as any).special_instructions as string | undefined
  if (note?.trim()) lines.push(`Note: "${note.trim()}"`)

  return lines.join('\n')
}

/**
 * Returns a concise POS display summary (single line) for cart/receipt display.
 */
export function formatSandwichDisplay(item: ConfiguredCartItem): string {
  const parts: string[] = []
  if (item.variation_name) parts.push(item.variation_name)

  const allergies = item.selected_modifiers.filter(m => m.group_name === 'Allergy Flags')
  if (allergies.length > 0) parts.push(`[${allergies.map(a => a.modifier_name).join('/')}]`)

  const nonAllergy = item.selected_modifiers.filter(
    m => m.group_name !== 'Allergy Flags' && m.operator !== 'no'
  )
  for (const m of nonAllergy.slice(0, 5)) {
    const qty = m.quantity > 1 ? `${m.quantity}x ` : ''
    parts.push(`${qty}${m.modifier_name}`)
  }
  if (nonAllergy.length > 5) parts.push(`+${nonAllergy.length - 5} more`)

  return parts.join(', ') || item.product_name
}