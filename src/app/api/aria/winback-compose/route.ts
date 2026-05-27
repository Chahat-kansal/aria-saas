export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { business_id, prompt } = await req.json()
  if (!business_id || !prompt) return NextResponse.json({ error: 'business_id and prompt required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id, name, industry, city').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const now = new Date()
  const [d30, d60, d90] = [30, 60, 90].map(d => new Date(now.getTime() - d * 86400_000).toISOString())

  const [{ count: c30 }, { count: c60 }, { count: c90 }] = await Promise.all([
    supabaseAdmin.from('pos_customers').select('id', { count: 'exact', head: true }).eq('business_id', business_id).lt('last_visit_at', d30).gt('last_visit_at', d60),
    supabaseAdmin.from('pos_customers').select('id', { count: 'exact', head: true }).eq('business_id', business_id).lt('last_visit_at', d60).gt('last_visit_at', d90),
    supabaseAdmin.from('pos_customers').select('id', { count: 'exact', head: true }).eq('business_id', business_id).lt('last_visit_at', d90),
  ])

  const context = `Business: ${biz.name} (${biz.industry}, ${biz.city ?? 'Australia'})
Lapsed segments: ${c30 ?? 0} customers lapsed 30-60 days, ${c60 ?? 0} lapsed 60-90 days, ${c90 ?? 0} lapsed 90+ days`

  const system = `You are Aria, an AI marketing assistant for Australian small businesses. Generate a winback campaign. Return ONLY valid JSON with exactly these fields:
{"audience_filter":{"lapsed_days":<number>},"sms_message":"<160 chars max, compelling SMS>","email_subject":"<subject line>","email_body":"<HTML, 3-4 short paragraphs>","suggested_send_time":"<HH:MM 24h>","estimated_reach":<number>}
No text outside the JSON.`

  try {
    const msg = await trackAICall(
      { route: 'aria/winback-compose', model: 'claude-haiku-4-5-20251001', businessId: business_id, purpose: 'winback-compose' },
      () => anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system,
        messages: [{ role: 'user', content: `Context:\n${context}\n\nRequest: ${prompt}` }],
      })
    )
    const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('no JSON')
    return NextResponse.json(JSON.parse(match[0]))
  } catch {
    const days = parseInt(prompt.match(/\d+\s*day/)?.[0] ?? '60')
    return NextResponse.json({
      audience_filter: { lapsed_days: isNaN(days) ? 60 : days },
      sms_message: `Hi! We miss you at ${biz.name}. It's been a while — come back and enjoy 10% off your next visit. See you soon!`,
      email_subject: `We miss you — come back to ${biz.name}`,
      email_body: `<p>Hi there,</p><p>We've noticed it's been a while since your last visit to ${biz.name} and we'd love to welcome you back!</p><p>As a valued customer, enjoy <strong>10% off</strong> your next visit.</p><p>We hope to see you soon!<br>The ${biz.name} team</p>`,
      suggested_send_time: '18:00',
      estimated_reach: (c30 ?? 0) + (c60 ?? 0) + (c90 ?? 0),
    })
  }
}

export const POST = withErrorCapture('aria/winback-compose', _POST)
