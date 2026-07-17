export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { verifyBusinessAccess } from '@/lib/auth/verify-business-access'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const bid = searchParams.get('business_id') ?? await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ alerts: [] })
  const denied = await verifyBusinessAccess(user.id, bid)
  if (denied) return denied

  const { data: alerts } = await supabase
    .from('pos_expiry_alerts')
    .select('*, pos_products(name)')
    .eq('business_id', bid)
    .eq('acknowledged', false)
    .order('days_until_expiry', { ascending: true })
    .limit(20)

  return NextResponse.json({
    alerts: (alerts ?? []).map((a: any) => ({
      ...a,
      product_name: a.pos_products?.name ?? 'Unknown product',
    })),
  })
}

// CANON-SEC-1 — no business-scoping existed on this update at all (id alone). pos_expiry_alerts
// carries an RLS ALL policy scoped to business ownership (biz_expiry_alerts), so on the
// RLS-scoped client a foreign id already matched zero rows — defense-in-depth-only. Explicit
// scoping added anyway; moving onto withBusinessContext is the fix and canonicalization in one act.
async function _PATCH(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const { id, acknowledged } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('pos_expiry_alerts')
    .update({ acknowledged: acknowledged ?? true }).eq('id', id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// CANON-SEC-1 — the genuinely-exploitable gap: product_id was gated by an RLS-scoped SELECT
// (safe, since pos_products carries a WITH CHECK'd business-scoped RLS policy), but the actual
// writes ran via supabaseAdmin (no RLS backstop) scoped by id alone — and alert_id specifically
// was NEVER checked against product_id or business ownership at all before its supabaseAdmin
// update. A caller could supply their OWN valid product_id (passes the RLS gate) alongside a
// FOREIGN business's alert_id and silently acknowledge/dismiss that foreign alert. Every id used
// in every write below (product_id AND alert_id) is now explicitly scoped by the caller's own
// resolved+verified business_id.
async function _POST(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const body = await req.json() as {
    action: 'mark_down' | 'write_off' | 'log_waste'
    product_id: string
    alert_id?: string
    business_id?: string
    markdown_pct?: number
    write_off_qty?: number
  }
  const { action, product_id, alert_id, markdown_pct, write_off_qty } = body
  if (!action || !product_id) return NextResponse.json({ error: 'action and product_id required' }, { status: 400 })

  // Verify ownership via RLS (use user's supabase client), now also explicitly scoped by business_id
  const { data: prod } = await supabase.from('pos_products').select('id, price, stock_quantity, name').eq('id', product_id).eq('business_id', bid).maybeSingle()
  if (!prod) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  if (action === 'mark_down') {
    const pct = Math.min(Math.max(Number(markdown_pct ?? 20), 1), 99)
    const newPrice = +(Number(prod.price ?? 0) * (1 - pct / 100)).toFixed(2)
    await supabaseAdmin.from('pos_products').update({ price: newPrice, updated_at: new Date().toISOString() }).eq('id', product_id).eq('business_id', bid)
    if (alert_id) await supabaseAdmin.from('pos_expiry_alerts').update({ acknowledged: true }).eq('id', alert_id).eq('business_id', bid)
    return NextResponse.json({ ok: true, new_price: newPrice })
  }

  if (action === 'write_off') {
    const qty = Math.min(Number(write_off_qty ?? prod.stock_quantity ?? 0), Number(prod.stock_quantity ?? 0))
    const newQty = Math.max(0, Number(prod.stock_quantity ?? 0) - qty)
    await supabaseAdmin.from('pos_products').update({ stock_quantity: newQty, updated_at: new Date().toISOString() }).eq('id', product_id).eq('business_id', bid)
    // Log to waste if table exists (best-effort)
    try { await supabaseAdmin.from('pos_waste_log').insert({ product_id, qty_written_off: qty, reason: 'Expired — write off', created_at: new Date().toISOString() }) } catch { /* table may not exist */ }
    if (alert_id) await supabaseAdmin.from('pos_expiry_alerts').update({ acknowledged: true }).eq('id', alert_id).eq('business_id', bid)
    return NextResponse.json({ ok: true, new_qty: newQty })
  }

  if (action === 'log_waste') {
    try { await supabaseAdmin.from('pos_waste_log').insert({ product_id, qty_written_off: write_off_qty ?? 0, reason: 'Expiry waste log', created_at: new Date().toISOString() }) } catch { /* best-effort */ }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export const GET   = withErrorCapture('pos/expiry-alerts', _GET)
export const PATCH = withBusinessContext('pos/expiry-alerts', _PATCH)
export const POST  = withBusinessContext('pos/expiry-alerts', _POST)