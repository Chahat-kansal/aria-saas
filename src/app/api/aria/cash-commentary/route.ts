export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { business_id, burn_rate, runway_days, lowest_point } = body as {
    business_id?: string; burn_rate?: number; runway_days?: number | null; lowest_point?: number
  }
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const runwayText = runway_days !== null && runway_days !== undefined ? runway_days + ' days' : 'positive (no burndown)'
  const prompt = 'Cash flow data for an Australian small business:\n- Daily burn rate: $' + (burn_rate ?? 0).toFixed(2) + '/day\n- Runway: ' + runwayText + '\n- Lowest forecast cash point: $' + (lowest_point ?? 0).toFixed(0) + '\n\nWrite exactly 2 sentences of cash flow commentary. Be specific, practical, and actionable. No fluff or filler phrases.'

  let commentary = 'Monitor your cash position and align supplier payments with your strongest revenue days.'
  try {
    const msg = await trackAICall(
      { route: 'aria/cash-commentary', model: 'claude-haiku-4-5-20251001', businessId: business_id, purpose: 'cash-commentary' },
      () => anthropic.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 150, messages: [{ role: 'user', content: prompt }] })
    )
    const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    if (raw.length > 20) commentary = raw
  } catch { /* use fallback */ }

  return NextResponse.json({ commentary })
}

export const POST = withErrorCapture('aria/cash-commentary', _POST)
