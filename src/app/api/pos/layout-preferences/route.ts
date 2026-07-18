export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

async function getBid(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string,
): Promise<string | null> {
  const { data: active } = await supabase
    .from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase
    .from('businesses').select('id').eq('user_id', userId).eq('is_active', true)
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ nav_order: null, nav_groups: null, product_grid_order: null })
  const { data } = await supabaseAdmin
    .from('pos_layout_preferences')
    .select('nav_order,nav_groups,product_grid_order')
    .eq('business_id', bid)
    .maybeSingle()
  return NextResponse.json({
    nav_order: data?.nav_order ?? null,
    nav_groups: data?.nav_groups ?? null,
    product_grid_order: data?.product_grid_order ?? null,
  })
}

async function _PATCH(req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const patch: Record<string, unknown> = {
    business_id: bid,
    updated_at: new Date().toISOString(),
  }
  if ('nav_order' in body) patch.nav_order = body.nav_order
  if ('nav_groups' in body) patch.nav_groups = body.nav_groups
  if ('product_grid_order' in body) {
    if (body.product_grid_order === null) {
      patch.product_grid_order = null
    } else {
      // Server-side deep-merge: preserve untouched category keys
      const { data: existing } = await supabaseAdmin
        .from('pos_layout_preferences')
        .select('product_grid_order')
        .eq('business_id', bid)
        .maybeSingle()
      const existingMap = (existing?.product_grid_order ?? {}) as Record<string, string[] | null>
      const incoming = body.product_grid_order as Record<string, string[] | null>
      const merged: Record<string, string[]> = { ...existingMap } as Record<string, string[]>
      for (const [catId, order] of Object.entries(incoming)) {
        if (order === null) {
          delete merged[catId]
        } else {
          merged[catId] = order
        }
      }
      patch.product_grid_order = merged
    }
  }
  const { data, error } = await supabaseAdmin
    .from('pos_layout_preferences')
    .upsert(patch, { onConflict: 'business_id' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

async function _DELETE() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ ok: true })
  await supabaseAdmin
    .from('pos_layout_preferences')
    .update({ nav_order: null, nav_groups: null, updated_at: new Date().toISOString() })
    .eq('business_id', bid)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('pos/layout-preferences', _GET)
export const PATCH = withBusinessContext('pos/layout-preferences', _PATCH)
export const DELETE = withErrorCapture('pos/layout-preferences', _DELETE)
