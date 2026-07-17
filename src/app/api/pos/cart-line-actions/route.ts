export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

async function _POST(req: Request, _context: unknown, { supabase, userId, businessId: bid }: BusinessContext) {
  const body = await req.json()

  // Resolve pos_user + check permission
  const { data: posUser } = await supabase.from('pos_users').select('id, role, permissions').eq('business_id', bid).eq('auth_user_id', userId).maybeSingle()
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
      performed_by: userId,
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
      triggered_by: userId,
    })
  } catch (e) { console.error('[non-fatal]', e) }

  return NextResponse.json({ ok: true })
}

export const POST = withBusinessContext('pos/cart-line-actions', _POST)
