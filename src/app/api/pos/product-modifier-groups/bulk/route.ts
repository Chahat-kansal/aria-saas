export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { ModifierGroup } from '@/lib/pos/modifier-engine'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

// Returns a cache map of product_id → { hasModifiers, hasVariants }, PLUS the full
// modifier group/option data per product (POS-MODIFIER-SPEED-1) so the POS tap path
// never needs its own network round trip. Called once on terminal load.
export async function GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ cache: {}, modifierGroups: {} })

  const { searchParams } = new URL(req.url)
  const idsParam = searchParams.get('product_ids') ?? ''
  const ids = idsParam.split(',').filter(id => id.length > 10).slice(0, 200)

  if (!ids.length) return NextResponse.json({ cache: {}, modifierGroups: {} })

  // Fetch both modifier groups AND variants in parallel — single round trip
  const [modRes, varRes] = await Promise.all([
    supabaseAdmin
      .from('pos_product_modifier_groups')
      .select('product_id')
      .in('product_id', ids),
    supabaseAdmin
      .from('pos_product_variant_groups')
      .select('product_id')
      .in('product_id', ids),
  ])

  const withMods = new Set((modRes.data ?? []).map(r => r.product_id))
  const withVars = new Set((varRes.data ?? []).map(r => r.product_id))

  const cache: Record<string, { hasModifiers: boolean; hasVariants: boolean }> = {}
  for (const id of ids) {
    cache[id] = {
      hasModifiers: withMods.has(id),
      hasVariants: withVars.has(id),
    }
  }

  // POS-MODIFIER-SPEED-1 — full group + modifier data for every product that has
  // modifiers, batched in one extra pair of queries (not per-product, not per-tap).
  // Same enrichment shape as the per-product GET route (pos/product-modifier-groups),
  // so ModifierPickerModal can consume it directly with zero transformation.
  const modifierGroups: Record<string, ModifierGroup[]> = {}
  const bid = await getBid(supabase, user.id)

  if (bid) {
    const { data: bindings } = await supabaseAdmin
      .from('pos_product_modifier_groups')
      .select('product_id, group_id, override_required, override_min, override_max, display_order')
      .in('product_id', ids)
      .eq('business_id', bid)

    const groupIds = [...new Set((bindings ?? []).map(b => b.group_id))]

    if (groupIds.length > 0) {
      const [groupsRes, modsRes] = await Promise.all([
        supabaseAdmin.from('pos_modifier_groups').select('*').in('id', groupIds).eq('business_id', bid),
        supabaseAdmin.from('pos_modifiers').select('*').in('group_id', groupIds).eq('business_id', bid).eq('is_active', true).order('sort_order'),
      ])

      const groupsById = new Map((groupsRes.data ?? []).map(g => [g.id as string, g]))
      const modsByGroup = new Map<string, NonNullable<typeof modsRes.data>>()
      for (const m of (modsRes.data ?? [])) {
        const arr = modsByGroup.get(m.group_id as string) ?? []
        arr.push(m)
        modsByGroup.set(m.group_id as string, arr)
      }

      const bindingsByProduct = new Map<string, NonNullable<typeof bindings>>()
      for (const b of (bindings ?? [])) {
        const arr = bindingsByProduct.get(b.product_id) ?? []
        arr.push(b)
        bindingsByProduct.set(b.product_id, arr)
      }

      for (const [productId, productBindings] of bindingsByProduct) {
        const groups = productBindings
          .map(b => {
            const g = groupsById.get(b.group_id)
            if (!g) return null
            return {
              ...g,
              is_required: b.override_required ?? g.is_required,
              min_selections: b.override_min ?? g.min_selections,
              max_selections: b.override_max ?? g.max_selections,
              modifiers: modsByGroup.get(g.id as string) ?? [],
            }
          })
          .filter((g): g is NonNullable<typeof g> => g !== null)
          .sort((a, b) => {
            const oa = productBindings.find(bnd => bnd.group_id === a.id)?.display_order ?? 0
            const ob = productBindings.find(bnd => bnd.group_id === b.id)?.display_order ?? 0
            return oa - ob
          })
        modifierGroups[productId] = groups as unknown as ModifierGroup[]
      }
    }
  }

  return NextResponse.json({ cache, modifierGroups })
}
