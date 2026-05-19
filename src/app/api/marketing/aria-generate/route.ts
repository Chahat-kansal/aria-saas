export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { callAnthropic } from '@/lib/aria/providers/anthropic'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: uab } = await supabaseAdmin.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
  const bid = uab?.business_id
  if (!bid) return NextResponse.json({ error: 'No active business' }, { status: 400 })

  const [bizRes, segRes, recentRes] = await Promise.all([
    supabaseAdmin.from('businesses').select('name,industry,city').eq('id', bid).maybeSingle(),
    supabaseAdmin.from('pos_customers').select('segment').eq('business_id', bid).eq('marketing_consent', true).not('segment', 'is', null),
    supabaseAdmin.from('campaigns').select('type,status,sent_count,created_at').eq('business_id', bid).order('created_at', { ascending: false }).limit(5),
  ])

  const biz = bizRes.data as Record<string, unknown> | null
  const segments: Record<string, number> = {}
  for (const c of segRes.data ?? []) {
    const s = (c as Record<string, unknown>).segment as string
    if (s) segments[s] = (segments[s] ?? 0) + 1
  }

  const now = new Date()
  const todayStr = now.toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Australia/Sydney' })
  const prompt = `TODAY (Sydney time): ${todayStr}
Business: ${biz?.name} (${biz?.industry}, ${biz?.city ?? 'Australia'})
Marketing-consented customer segments: ${JSON.stringify(segments)}
Recent campaigns (last 5): ${JSON.stringify(recentRes.data ?? [])}

You are Aria, an AI marketing strategist for Australian small businesses. Based on this data, generate ONE campaign recommendation.

Return JSON ONLY — no preamble:
{
  "name": "Campaign name (max 40 chars)",
  "type": "winback|birthday|promotion|loyalty|announcement",
  "channel": "sms",
  "target_type": "segment|all",
  "target_segment": "champions|loyal|regular|new|at_risk|hibernating|never_returned|needs_attention or null if target_type=all",
  "target_count": 0,
  "message": "SMS message text (max 160 chars). Use {first_name} and {business_name} variables.",
  "best_send_time": "ISO datetime within next 7 days from TODAY at an optimal time (Tue-Thu 11am-2pm or 5pm-7pm AEST). Use the exact year ${now.getFullYear()} — never use a past year.",
  "rationale": "2 sentences explaining why this segment now and what you expect.",
  "predicted_response_rate": 0.0,
  "predicted_revenue_cents": 0
}`

  const result = await callAnthropic(
    {
      model: 'sonnet',
      systemPrompt: 'You are an expert SMS marketing strategist for Australian SMBs. Return JSON only.',
      userPrompt: prompt,
      maxTokens: 800,
      businessId: bid,
      agentKey: 'marketing_ai_generate',
      role: 'analysis',
    },
    {},
  )

  try {
    const cleaned = result.raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(cleaned)
    return NextResponse.json({ suggestion: parsed })
  } catch {
    return NextResponse.json({ error: 'Could not generate suggestion' }, { status: 500 })
  }
}

export const POST = withErrorCapture('marketing/aria-generate', _POST)
