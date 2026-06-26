import type { SupabaseClient } from '@supabase/supabase-js'

// INV-TICKETS — seed ONE minimal default shelf-ticket template when a business has none, so the queued-batch
// print works out of the box (the owner can still design richer ones). Idempotent: only seeds if zero exist.
// Flagged: this is the one minimal additive seed; everything else (tables/routes/UI) was already built.

export async function ensureDefaultTemplate(supabase: SupabaseClient, businessId: string): Promise<void> {
  const { count } = await supabase.from('pos_shelf_ticket_templates').select('id', { count: 'exact', head: true }).eq('business_id', businessId)
  if ((count ?? 0) > 0) return
  await supabase.from('pos_shelf_ticket_templates').insert({
    business_id: businessId, name: 'Standard label', is_default: true,
    width_mm: 50, height_mm: 30, layout: 'standard', ticket_type: 'standard', paper_type: 'label', corner_radius: 0,
    background_color: '#ffffff', text_color: '#111827', accent_color: '#2563eb',
    band_color: '#374151', band_text_color: '#ffffff', band_label: 'PRICE', price_color: '#111827',
    font_size_name: 14, font_size_price: 22, canvas_elements: [],
    show_name: true, show_price: true, show_barcode: true, show_logo: true, show_promo_band: true,
    show_sku: false, show_description: false, show_was_price: true, show_save_badge: false,
    show_member_price: false, show_per_unit: false, show_multibuy: false, show_valid_date: false,
  }).then(() => {}, () => {}) // best-effort; a concurrent seed is harmless
}
