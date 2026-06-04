import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { sendSMS } from '@/lib/clicksend'

export const dynamic = 'force-dynamic'

/**
 * POST /api/aria/review-request
 * Sends a ClickSend SMS review request 30min after a completed POS sale.
 * Rate-limited: one request per customer per 30 days.
 * UPGRADE_ONLY: add more channels, never remove SMS.
 */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { business_id, sale_id, customer_phone, customer_name } = await req.json()
  if (!business_id || !customer_phone)
    return NextResponse.json({ error: 'business_id and customer_phone required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses')
    .select('id,name,google_review_url,suburb')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Rate limit: skip if sent a review request to this number in the last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recent } = await supabase.from('aria_autopilot_actions')
    .select('id, action_data').eq('business_id', business_id)
    .eq('action_type', 'review_request')
    .gte('created_at', thirtyDaysAgo)
    .limit(20)

  const alreadySent = (recent ?? []).some(
    r => (r as any).action_data?.phone === customer_phone
  )
  if (alreadySent)
    return NextResponse.json({ ok: true, skipped: true, reason: 'Rate limited — already sent in last 30 days' })

  const firstName = customer_name?.split(' ')[0] ?? 'there'
  const reviewUrl = (biz as any).google_review_url
    ?? `https://www.google.com/search?q=${encodeURIComponent(((biz as any).name ?? '') + ' ' + ((biz as any).suburb ?? '') + ' reviews')}`

  const message = `Hi ${firstName}! Thanks for visiting ${(biz as any).name ?? 'us'} today. We'd love your feedback — helps other locals find us. Takes 30 sec: ${reviewUrl}`

  const result = await sendSMS(customer_phone, message)

  if (!result.ok)
    return NextResponse.json({ error: result.error ?? 'SMS failed' }, { status: 500 })

  // Log for rate limiting + dashboard stats
  await supabase.from('aria_autopilot_actions').insert({
    business_id,
    category: 'marketing',
    action_type: 'review_request',
    title: 'Review SMS → ' + firstName,
    description: 'Google review request sent via ClickSend SMS',
    status: 'executed',
    action_data: { phone: customer_phone, sale_id, message_id: result.message_id },
  })

  return NextResponse.json({ ok: true, message_id: result.message_id })
}
