export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'
import { parseLLMJsonOr } from '@/lib/ai-json'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM = `You are Aria, an AI business advisor for Australian SMBs.
Generate a 3-line daily narrative for the owner.

Line 1 (headline): How today compares to baseline — revenue delta % + primary driver.
Line 2 (pattern): Notable pattern — top product, surprising hour, anomaly.
Line 3 (action): A single recommended action OR a concise celebration.

RULES (non-negotiable):
- Never fabricate numbers. Only use values present in the input JSON.
- If revenue is flat or down, say so honestly. Don't soften.
- If a cash variance is present, mention it concretely (e.g. "$12 short", not "minor discrepancy").
- 3 sentences max total. No emoji. No fluff. Owner-tone, not bot-tone.
- Respond ONLY with valid JSON: { "headline": "...", "pattern": "...", "action": "..." }`

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

interface DailyNarrative {
  headline: string
  pattern: string
  action: string
}

const FALLBACK: DailyNarrative = { headline: '', pattern: '', action: '' }

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({}))

  // Accept pre-fetched summary or fetch it
  let summary = body.summary
  if (!summary) {
    const base = `${req.headers.get('x-forwarded-proto') ?? 'http'}://${req.headers.get('host')}`
    const r = await fetch(`${base}/api/pos/daily-summary`, {
      headers: { cookie: req.headers.get('cookie') ?? '' },
    })
    summary = r.ok ? await r.json() : null
  }

  if (!summary) {
    return NextResponse.json({ error: 'Could not load daily summary' }, { status: 503 })
  }

  const userPrompt = `Today's business summary:\n${JSON.stringify(summary, null, 2)}`

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 400,
    system: SYSTEM,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const raw = msg.content[0]?.type === 'text' ? msg.content[0].text : ''
  const narrative = parseLLMJsonOr<DailyNarrative>(raw, FALLBACK, 'aria/daily-narrative')

  // Optionally persist to pos_daily_briefings
  try {
    const today = new Date().toISOString().slice(0, 10)
    await supabase.from('pos_daily_briefings').upsert({
      business_id: bid,
      briefing_date: today,
      briefing_type: 'ai_daily_narrative',
      summary: [narrative.headline, narrative.pattern, narrative.action].filter(Boolean).join('\n'),
      yesterday_revenue: summary?.totals?.gross_revenue ?? null,
      yesterday_transactions: summary?.totals?.count ?? null,
      top_products: summary?.top_products ?? null,
      generated_at: new Date().toISOString(),
    }, { onConflict: 'business_id,briefing_date' })
  } catch { /* non-fatal */ }

  return NextResponse.json({ narrative, summary })
}

export const POST = withErrorCapture('aria/daily-narrative', _POST)
