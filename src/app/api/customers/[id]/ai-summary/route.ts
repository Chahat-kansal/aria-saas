export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'

const MODEL = 'claude-haiku-4-5-20251001'
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function _POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: customer } = await supabaseAdmin.from('customers').select('*').eq('id', params.id).maybeSingle()
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabase.from('businesses').select('id, name, industry').eq('id', customer.business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Fetch last 20 sales
  const orParts = ['customer_id.eq.' + params.id]
  if (customer.email) orParts.push('customer_email.eq.' + customer.email)
  const { data: sales } = await supabaseAdmin
    .from('pos_sales')
    .select('id, total_amount, created_at, items_count')
    .neq('status', 'voided')
    .or(orParts.join(','))
    .order('created_at', { ascending: false })
    .limit(20)

  const totalSpent = Number(customer.total_spent ?? customer.total_spend ?? 0)
  const avgSale = sales && sales.length > 0
    ? sales.reduce((s, x) => s + Number(x.total_amount ?? 0), 0) / sales.length
    : 0

  const context = [
    'Customer: ' + customer.name,
    'Business: ' + biz.name + ' (' + (biz.industry ?? 'retail') + ')',
    'Segment: ' + (customer.customer_segment ?? 'unknown'),
    'Churn risk: ' + (customer.churn_risk ?? 'unknown'),
    'Total spend: $' + totalSpent.toFixed(2),
    'Visits: ' + (customer.visit_count ?? 0),
    'Last visit: ' + (customer.last_visit ?? 'never'),
    'Avg sale: $' + avgSale.toFixed(2),
    'Recent purchases: ' + (sales?.length ?? 0),
  ].join('\n')

  const res = await trackAICall(
    { route: 'customers/[id]/ai-summary', model: MODEL, businessId: customer.business_id, purpose: 'customer_summary' },
    () => anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      temperature: 0,
      system: 'Summarise this customer for their business owner in 2-3 sentences: spending patterns, favourite visit frequency, and churn risk. Be specific and actionable.',
      messages: [{ role: 'user', content: context }],
    })
  )

  const summary = res.content.filter((b: { type: string }) => b.type === 'text').map((b: { type: string; text?: string }) => b.text ?? '').join('').trim()

  if (summary) {
    await supabaseAdmin.from('customers').update({ ai_summary: summary, ai_summary_at: new Date().toISOString() }).eq('id', params.id)
  }

  return NextResponse.json({ summary })
}

export const POST = withErrorCapture('customers/[id]/ai-summary', _POST)
