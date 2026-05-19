export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const customer_id = String(body.customer_id ?? '')
  if (!customer_id) return NextResponse.json({ error: 'Missing customer_id' }, { status: 400 })

  const { data: customer } = await supabaseAdmin.from('pos_customers').select('*').eq('id', customer_id).single()
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabaseAdmin.from('businesses').select('id,name,industry,city,user_id').eq('id', (customer as Record<string, unknown>).business_id as string).single()
  if (!biz || (biz as Record<string, unknown>).user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: recentSales } = await supabaseAdmin.from('pos_sales')
    .select('total_amount,created_at,payment_method')
    .eq('business_id', (customer as Record<string, unknown>).business_id as string)
    .eq('customer_id', customer_id)
    .neq('status', 'voided')
    .order('created_at', { ascending: false })
    .limit(10)

  const c = customer as Record<string, unknown>
  const lastVisit = c.last_visit_at ?? c.last_visit
  const ltv = c.lifetime_value_cents ? Number(c.lifetime_value_cents) / 100 : Number(c.total_spend ?? c.total_spent ?? 0)
  const b = biz as Record<string, unknown>

  const ctx = [
    `Business: ${b.name} (${b.industry}, ${b.city})`,
    `Customer: ${c.name || 'Unknown'}`,
    `Segment: ${c.segment || 'unscored'}`,
    `RFM: R=${c.rfm_recency_score ?? '?'} F=${c.rfm_frequency_score ?? '?'} M=${c.rfm_monetary_score ?? '?'}`,
    `Lifetime value: $${ltv.toFixed(2)}`,
    `Visits: ${c.visit_count || 0}`,
    `Days since last visit: ${c.days_since_visit ?? 'unknown'}`,
    `Last visit: ${lastVisit ? new Date(lastVisit as string).toLocaleDateString('en-AU') : 'never'}`,
    `Member since: ${c.created_at ? new Date(c.created_at as string).toLocaleDateString('en-AU') : 'unknown'}`,
    `Marketing consent: ${c.marketing_consent ? 'yes' : 'no'}`,
    recentSales?.length
      ? `Recent purchases: ${recentSales.map(s => `$${Number(s.total_amount).toFixed(2)} (${s.payment_method})`).join(', ')}`
      : 'No recent purchases',
  ].join('\n')

  const prompt = `${ctx}\n\nWrite ONE paragraph for the owner about this customer: who they are based on the data, what stage they are in, one specific action to take. 4-5 sentences max. No fluff. No bullet points. Australian English. Refer to the customer by first name only.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 512, messages: [{ role: 'user', content: prompt }] }),
  })

  if (!res.ok) {
    const err = await res.json() as { error?: { message?: string } }
    return NextResponse.json({ error: err.error?.message ?? 'AI error' }, { status: 500 })
  }

  const data = await res.json() as { content?: Array<{ type: string; text?: string }>; usage?: Record<string, number> }
  const insight = data.content?.[0]?.text ?? ''

  await supabaseAdmin.from('aria_ai_calls').insert({
    business_id: (customer as Record<string, unknown>).business_id as string,
    agent_key: 'customer_insight', provider: 'anthropic', model_id: 'claude-haiku-4-5-20251001',
    input_tokens: data.usage?.input_tokens ?? 0, output_tokens: data.usage?.output_tokens ?? 0,
    success: true, request_summary: `Customer insight for ${c.name ?? customer_id}`,
  })

  return NextResponse.json({ insight })
}

export const POST = withErrorCapture('aria/customer-insight', _POST)
