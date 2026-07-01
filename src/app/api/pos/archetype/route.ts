export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ categories: [], products: [], modifierGroups: [] })

  const [
    { data: categories },
    { data: products },
    { data: modifierGroups },
  ] = await Promise.all([
    supabase.from('pos_categories')
      .select('id, name, color, ordering_archetype')
      .eq('business_id', bid)
      .order('name'),
    supabase.from('pos_products')
      .select('id, name, category_id, ordering_mode, ordering_archetype')
      .eq('business_id', bid)
      .eq('is_active', true)
      .order('name'),
    supabase.from('pos_modifier_groups')
      .select('id, name, display_name, archetype_slot')
      .eq('business_id', bid)
      .order('display_order'),
  ])

  return NextResponse.json({
    categories: categories ?? [],
    products: products ?? [],
    modifierGroups: modifierGroups ?? [],
  })
}

export const GET = withErrorCapture('pos/archetype', _GET)