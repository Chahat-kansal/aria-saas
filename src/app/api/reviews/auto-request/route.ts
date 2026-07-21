export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { sendSMS } from '@/lib/clicksend'
import { rateLimit, tooManyRequests, clientIp } from '@/lib/security/rate-limit'

// Called by POS terminal after a sale completes
// Auto-sends a review request SMS if conditions are met
export async function POST(req: Request) {
  const { sale_id, business_id } = await req.json()
  if (!sale_id || !business_id) {
    return NextResponse.json({ skipped: true, reason: 'missing params' })
  }

  // SECURITY-RESIDUE-FIX-1 PART 3 — same leak class as WIDGET-PII-LEAK-FIX: this route has no
  // caller authentication at all (it's an internal fire-and-forget call from pos/sales/route.ts,
  // not a session-scoped one), and on success used to return the customer's real phone and name
  // directly in the JSON response, plus trigger a real, paid SMS send — anyone who obtains a real
  // sale_id (e.g. from a receipt link) could replay it here. Response below no longer echoes any
  // identity-bearing field; a lookup-scoped rate limit and activity_log entry are added too.
  const rl = await rateLimit(`reviews-auto-request:${clientIp(req)}:${business_id}`, 20, 3600)
  if (!rl.allowed) return tooManyRequests(rl.retryAfter)

  // Get business auto-request settings
  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id, name, google_place_id, review_auto_request_enabled, review_request_min_spend_cents, review_request_cooldown_days')
    .eq('id', business_id)
    .maybeSingle()

  if (!biz?.review_auto_request_enabled) {
    return NextResponse.json({ skipped: true, reason: 'auto-request disabled' })
  }
  if (!biz.google_place_id) {
    return NextResponse.json({ skipped: true, reason: 'no Google Place ID' })
  }

  // Get sale details
  const { data: sale } = await supabaseAdmin
    .from('pos_sales')
    .select('id, customer_id, total_amount, status')
    .eq('id', sale_id)
    .eq('business_id', business_id)
    .maybeSingle()

  if (!sale || sale.status === 'voided') {
    return NextResponse.json({ skipped: true, reason: 'invalid sale' })
  }

  const saleAmountCents = Math.round(Number(sale.total_amount) * 100)
  const minSpend = biz.review_request_min_spend_cents ?? 1500

  if (saleAmountCents < minSpend) {
    return NextResponse.json({ skipped: true, reason: `under min spend ($${(minSpend / 100).toFixed(2)})` })
  }

  if (!sale.customer_id) {
    return NextResponse.json({ skipped: true, reason: 'no customer attached' })
  }

  // Get customer details
  const { data: customer } = await supabaseAdmin
    .from('pos_customers')
    .select('id, name, phone, marketing_consent')
    .eq('id', sale.customer_id)
    .maybeSingle()

  if (!customer?.phone || !customer.marketing_consent) {
    return NextResponse.json({ skipped: true, reason: 'no SMS consent' })
  }

  // Check cooldown — don't request more than once per N days per customer
  const cooldownDays = biz.review_request_cooldown_days ?? 60
  const cooldownAgo = new Date(Date.now() - cooldownDays * 86400000).toISOString()
  const { data: recentRequest } = await supabaseAdmin
    .from('review_request_log')
    .select('id')
    .eq('customer_id', customer.id)
    .gte('sent_at', cooldownAgo)
    .maybeSingle()

  if (recentRequest) {
    return NextResponse.json({ skipped: true, reason: `cooldown active (${cooldownDays}d)` })
  }

  // Send SMS via ClickSend (the app's SMS channel)
  const reviewLink = `https://search.google.com/local/writereview?placeid=${biz.google_place_id}`
  const message = `Hi ${customer.name?.split(' ')[0] ?? 'there'}! Thanks for stopping by ${biz.name}. If you enjoyed it, we'd love a quick Google review: ${reviewLink} 🙏`

  const phone = customer.phone.replace(/\s/g, '').replace(/^0/, '+61')

  const smsRes = await sendSMS(phone, message, { category: 'marketing', businessId: business_id, customerId: customer.id })

  if (!smsRes.ok) {
    return NextResponse.json({ skipped: true, reason: 'SMS send failed' })
  }

  // Log it
  await supabaseAdmin.from('review_request_log').insert({
    business_id,
    customer_id: customer.id,
    customer_phone: customer.phone,
    sale_id,
    status: 'sent',
  })

  // Owner-facing audit trail — never surfaced to the caller.
  void supabaseAdmin.from('activity_log').insert({
    business_id,
    action_type: 'review_auto_request_sent',
    description: '[reviews/auto-request] review request SMS sent',
    metadata: { sale_id, customer_id: customer.id },
    created_at: new Date().toISOString(),
  }).then(({ error }) => { if (error) console.error('[non-fatal] activity_log insert failed', error) })

  return NextResponse.json({ ok: true })
}
