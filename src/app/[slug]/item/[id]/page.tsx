export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { ItemDetailClient } from './ItemDetailClient'

type Product = {
  id: string
  name: string
  description: string | null
  price: number
  image_url: string | null
  category: string | null
  is_active: boolean | null
  tags: unknown
  allergens: unknown
}

export type ModOption = {
  id: string
  name: string
  price_cents: number
  is_default: boolean | null
}

export type ModGroup = {
  id: string
  name: string
  required: boolean
  min: number
  max: number
  selection_type: string
  options: ModOption[]
}

type RawBinding = {
  group_id: string
  override_required: boolean | null
  override_min: number | null
  override_max: number | null
  display_order: number | null
}

type RawGroup = {
  id: string
  name: string
  min_selections: number | null
  max_selections: number | null
  is_required: boolean | null
  selection_type: string | null
}

type RawMod = {
  id: string
  name: string
  price_cents: number
  group_id: string
  is_default: boolean | null
}

export default async function ItemDetailPage({ params }: { params: { slug: string; id: string } }) {
  const slug = decodeURIComponent(params.slug ?? '').toLowerCase()
  const id = params.id ?? ''
  if (!slug || !id) notFound()

  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) notFound()

  const { data: product } = await supabaseAdmin
    .from('pos_products')
    .select('id, name, description, price, image_url, category, is_active, tags, allergens')
    .eq('id', id)
    .eq('business_id', bid)
    .maybeSingle()

  if (!product) notFound()

  // ── Fetch modifier groups bound to this product ────────────────────────────
  let modifierGroups: ModGroup[] = []

  try {
    const { data: bindingsRaw } = await supabaseAdmin
      .from('pos_product_modifier_groups')
      .select('group_id, override_required, override_min, override_max, display_order')
      .eq('product_id', id)
      .order('display_order')

    const bindings = (bindingsRaw ?? []) as unknown as RawBinding[]

    if (bindings.length > 0) {
      const groupIds = bindings.map(b => b.group_id)

      const [{ data: groupsRaw }, { data: modsRaw }] = await Promise.all([
        supabaseAdmin
          .from('pos_modifier_groups')
          .select('id, name, min_selections, max_selections, is_required, selection_type')
          .in('id', groupIds),
        supabaseAdmin
          .from('pos_modifiers')
          .select('id, name, price_cents, group_id, is_default')
          .in('group_id', groupIds)
          .eq('is_active', true)
          .order('display_order'),
      ])

      const groups = (groupsRaw ?? []) as unknown as RawGroup[]
      const mods = (modsRaw ?? []) as unknown as RawMod[]

      modifierGroups = bindings
        .map(binding => {
          const group = groups.find(g => g.id === binding.group_id)
          if (!group) return null
          const options: ModOption[] = mods
            .filter(m => m.group_id === binding.group_id)
            .map(m => ({
              id: m.id,
              name: m.name,
              price_cents: m.price_cents ?? 0,
              is_default: m.is_default ?? null,
            }))
          return {
            id: group.id,
            name: group.name,
            required: binding.override_required ?? group.is_required ?? false,
            min: binding.override_min ?? group.min_selections ?? 0,
            max: binding.override_max ?? group.max_selections ?? 1,
            selection_type: group.selection_type ?? 'single',
            options,
          } satisfies ModGroup
        })
        .filter((g): g is ModGroup => g !== null)
    }
  } catch {
    // modifier tables unavailable — render page without modifiers
  }

  return (
    <ItemDetailClient
      slug={slug}
      product={product as Product}
      modifierGroups={modifierGroups}
    />
  )
}