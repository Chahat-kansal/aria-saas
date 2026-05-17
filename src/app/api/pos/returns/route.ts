export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { processReturn, REASON_CODES, REFUND_METHODS, CONDITIONS, detectReturnAbuse } from '@/lib/pos/return-engine'

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
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const sale_id = searchParams.get('sale_id')

  let q = supabase.from('pos_returns')
    .select('*, pos_return_lines(*)')
    .eq('business_id', bid)
    .order('created_at', { ascending: false })
    .limit(100)
  if (sale_id) q = q.eq('original_sale_id', sale_id)

  const { data } = await q
  return NextResponse.json({ returns: data ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const { original_sale_id, reason_code, reason_note, refund_method,
    lines, customer_id, pos_user_id, manager_token, exchange_cart } = body

  if (!original_sale_id) return NextResponse.json({ error: 'original_sale_id required' }, { status: 400 })
  if (!REASON_CODES.includes(reason_code)) return NextResponse.json({ error: `reason_code must be one of: ${REASON_CODES.join(', ')}` }, { status: 400 })
  if (!REFUND_METHODS.includes(refund_method)) return NextResponse.json({ error: `refund_method must be one of: ${REFUND_METHODS.join(', ')}` }, { status: 400 })
  if (!Array.isArray(lines) || lines.length === 0) return NextResponse.json({ error: 'lines required' }, { status: 400 })
  for (const l of lines) {
    if (!CONDITIONS.includes(l.condition)) return NextResponse.json({ error: `condition must be one of: ${CONDITIONS.join(', ')}` }, { status: 400 })
    if (!l.quantity || l.quantity < 1) return NextResponse.json({ error: 'each line quantity must be >= 1' }, { status: 400 })
  }

  let managerApprovedBy: string | null = null
  if (manager_token) {
    try {
      const mod = await import('@/app/api/pos/manager-verify/route')
      managerApprovedBy = mod.verifyManagerToken(manager_token)
    } catch { /* non-fatal */ }
  }

  const result = await processReturn(supabase, {
    business_id: bid,
    original_sale_id,
    performed_by_user_id: user.id,
    pos_user_id: pos_user_id ?? null,
    manager_approved_by: managerApprovedBy,
    reason_code,
    reason_note: reason_note ?? null,
    refund_method,
    lines,
    customer_id: customer_id ?? null,
    exchange_cart,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  // Fire abuse detection + ariaObserve async — non-blocking
  detectReturnAbuse(supabase, bid, customer_id ?? null).then(({ flag, reason }) => {
    if (flag && reason) {
      import('@/lib/aria/brain').then(({ ariaObserve }) => {
        ariaObserve({
          business_id: bid,
          category: 'customers',
          event_type: 'return_abuse_detected',
          data: { reason, return_number: result.result.return_number, refund_method },
        }).catch(() => {})
      }).catch(() => {})
    }
  }).catch(() => {})

  return NextResponse.json({ ok: true, ...result.result }, { status: 201 })
}

export const GET = withErrorCapture('pos/returns', _GET)
export const POST = withErrorCapture('pos/returns', _POST)