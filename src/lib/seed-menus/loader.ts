import { createServerSupabaseClient } from '@/lib/supabase-server'
import { CAFE_SEED_MENU, CAFE_MODIFIERS } from './cafe'

export async function seedBusinessMenu(business_id: string, business_type: string) {
  const supabase = createServerSupabaseClient()

  const { data: business } = await supabase
    .from('businesses')
    .select('seed_applied')
    .eq('id', business_id)
    .single()

  if (business?.seed_applied) {
    return { skipped: true, reason: 'already_seeded' }
  }

  if (business_type === 'cafe') {
    const products = CAFE_SEED_MENU.map(p => ({
      business_id,
      name: p.name,
      category: p.category,
      sku: `CAFE-${p.subcategory.toUpperCase()}-${p.name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)}`,
      price: p.price,
      cost_price: p.cost ?? p.price * 0.4,
      description: p.description ?? null,
      container_type: p.container_type ?? 'unknown',
      image_url: p.image_url ?? null,
      image_source: p.image_url ? 'owner' : 'pending',
      is_active: true,
    }))

    const { data: created, error } = await supabase
      .from('pos_products')
      .insert(products)
      .select('id, name')

    if (error) return { error: error.message }

    const modifiers = CAFE_MODIFIERS.map(m => ({
      business_id,
      product_id: null as string | null,
      modifier_group: m.group,
      name: m.name,
      price_delta: m.price_delta,
      is_default: m.is_default ?? false,
      enabled: true,
    }))

    await supabase.from('pos_product_modifiers').insert(modifiers)

    await supabase
      .from('businesses')
      .update({ seed_applied: true })
      .eq('id', business_id)

    return { products_created: created?.length ?? 0, modifiers_created: modifiers.length }
  }

  await supabase
    .from('businesses')
    .update({ seed_applied: true })
    .eq('id', business_id)

  return { skipped: true, reason: 'no_seed_for_type' }
}
