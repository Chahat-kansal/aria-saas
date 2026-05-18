export const runtime = 'nodejs'
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

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json()

  // Resolve pos_user + check permission
  const { data: posUser } = await supabase.from('pos_users').select('id, role, permissions').eq('business_id', bid).eq('auth_user_id', user.id).maybeSingle()
  const canOverride = !!(posUser?.permissions as Record<string, unknown> | null)?.can_override_price
  if (!canOverride) return NextResponse.json({ error: 'Permission denied: can_override_price required' }, { status: 403 })

  const origPrice = Number(body.original_unit_price) || 0
  const newPrice = Number(body.new_unit_price) || 0
  const delta = newPrice - origPrice
  const deltaPct = origPrice > 0 ? (Math.abs(delta) / origPrice) * 100 : 0

  // Log audit trail
  try {
    await supabase.from('pos_audit_log').insert({
      business_id: bid,
      action: 'price_override',
      performed_by: user.id,
      sale_id: null,
      amount: newPrice,
      reason_note: String(body.reason ?? '').slice(0, 500),
      reason_code: 'price_override',
    })
  } catch {
    // non-fatal — table schema varies
  }

  // Fire ariaObserve — non-fatal
  try {
    const { ariaObserve } = await import('@/lib/aria/brain')
    await ariaObserve({
      business_id: bid,
      category: 'pricing',
      event_type: 'price_override',
      data: {
        product_id: body.product_id,
        product_name: body.product_name,
        original_unit_price: origPrice,
        new_unit_price: newPrice,
        delta_pct: +deltaPct.toFixed(2),
        reason: body.reason,
        pos_user_role: posUser?.role,
      },
      triggered_by: user.id,
    })
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true })
}

export const POST = withErrorCapture('pos/cart-line-actions', _POST)
