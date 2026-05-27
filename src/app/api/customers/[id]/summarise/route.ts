export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { runAriaCouncil } from '@/lib/aria/council'

type Params = { params: { id: string } }

export async function POST(req: Request, { params }: Params) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: customer } = await supabaseAdmin.from('customers').select('*').eq('id', params.id).maybeSingle()
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabase
    .from('businesses').select('id, name, industry, city')
    .eq('id', customer.business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const totalSpent = Number(customer.total_spent ?? customer.total_spend ?? 0)
  const isHighValue = totalSpent > 500 || Number(customer.visit_count ?? 0) > 10

  const customerContext = `Customer: ${customer.name}, segment=${customer.customer_segment ?? 'unknown'}, churn_risk=${customer.churn_risk ?? 'unknown'}
Visits: ${customer.visit_count ?? 0} times, last ${customer.last_visit ?? 'never'}
Total spent: $${totalSpent.toFixed(2)}
Notes: ${customer.notes ?? 'none'}
Business: ${biz.name}, ${biz.industry ?? 'retail'}, ${biz.city ?? 'AU'}`

  let summary = ''
  let inputTokens = 0, outputTokens = 0, success = false
  const modelId = isHighValue ? 'council' : 'claude-sonnet-4-5-20250929'

  if (isHighValue) {
    try {
      const council = await runAriaCouncil(customerContext, customer.business_id, 'ask_aria')
      summary = council?.final_briefing ?? ''
      success = council?.meta.synthesis_succeeded ?? false
    } catch (e) {
      console.error('[summarise] council failed, falling back:', (e as Error).message)
    }
  }

  if (!summary) {
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 })
      const res = await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 150,
        temperature: 0,
        system: 'Summarise this customer for their business owner in one concise sentence covering value, behaviour, and any risk. No preamble.',
        messages: [{ role: 'user', content: customerContext }],
      })
      summary = res.content
        .filter((b: { type: string; text?: string }) => b.type === 'text')
        .map((b: { type: string; text?: string }) => b.text ?? '').join('').trim()
      inputTokens = res.usage.input_tokens
      outputTokens = res.usage.output_tokens
      success = true
    } catch (e) {
      console.error('[summarise] single-model failed:', (e as Error).message)
    }
  }

  if (summary) {
    await supabaseAdmin.from('customers').update({
      ai_summary: summary,
      ai_summary_at: new Date().toISOString(),
    }).eq('id', params.id)
  }

  void (async () => {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id: customer.business_id,
        agent_key: 'customer_summary',
        provider: 'anthropic',
        model_id: modelId,
        role: 'summary',
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        success,
      })
    } catch { /* non-fatal */ }
  })()

  return NextResponse.json({ summary })
}
