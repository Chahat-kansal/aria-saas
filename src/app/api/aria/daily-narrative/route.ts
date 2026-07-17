export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'
import { parseLLMJsonOr } from '@/lib/ai-json'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { ariaInvoke } from '@/lib/aria/invoke'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const NARRATIVE_SYSTEM = `You are Aria, an AI business advisor for Australian SMBs.
Generate a 3-line daily narrative for the owner.

Line 1 (headline): How today compares to baseline — revenue delta % + primary driver.
Line 2 (pattern): Notable pattern — top product, surprising hour, anomaly.
Line 3 (action): A single recommended action OR a concise celebration.

RULES (non-negotiable):
- Every number and causal claim must come from the DATA PACKET at the top of the user message. Never invent, round, or estimate any figure.
- If a value is not in the DATA PACKET, omit it — never guess or approximate.
- NEVER claim a promotion is "working" or "driving" anything unless it appears under active_promotions in the DATA PACKET.
- A promotion listed under scheduled_promotions must be described as "scheduled for [date]" — never as "working" or "running".
- NEVER say "zero customers" unless customer_count in the DATA PACKET is explicitly 0.
- Use exact dollar figures from the DATA PACKET — do not round or alter them (e.g. if revenue_7d = $2,971.00 do NOT output $3,116 or $3,000).
- If revenue is flat or down, say so honestly. Don't soften.
- If a cash variance is present in the summary, mention it concretely.
- 3 sentences max total. No emoji. No fluff. Owner-tone, not bot-tone.
- Respond ONLY with valid JSON: { "headline": "...", "pattern": "...", "action": "..." }`

interface DailyNarrative { headline: string; pattern: string; action: string }
const FALLBACK: DailyNarrative = { headline: '', pattern: '', action: '' }

async function _POST(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const body = await req.json().catch(() => ({}))
  let summary = body.summary

  if (!summary) {
    const base = `${req.headers.get('x-forwarded-proto') ?? 'http'}://${req.headers.get('host')}`
    const r = await fetch(`${base}/api/pos/daily-summary`, { headers: { cookie: req.headers.get('cookie') ?? '' } })
    summary = r.ok ? await r.json() : null
  }

  // Build DATA PACKET from live database — narrator may only cite these values
  const todayStr = new Date().toISOString().slice(0, 10)
  const ago7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const ago30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [sales7Raw, sales30Raw, custCountRaw, custEmailCountRaw, promosRaw] = await Promise.allSettled([
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', bid).neq('status', 'voided').gte('created_at', ago7d),
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', bid).neq('status', 'voided').gte('created_at', ago30d),
    supabaseAdmin.from('pos_customers').select('*', { count: 'exact', head: true }).eq('business_id', bid),
    supabaseAdmin.from('pos_customers').select('*', { count: 'exact', head: true }).eq('business_id', bid).not('email', 'is', null).neq('email', ''),
    supabaseAdmin.from('pos_promotions').select('id,name,active,starts_at,ends_at').eq('business_id', bid).order('created_at', { ascending: false }).limit(10),
  ])

  const rev7 = sales7Raw.status === 'fulfilled'
    ? (sales7Raw.value.data ?? []).reduce((s: number, r: Record<string, unknown>) => s + (Number(r.total_amount) || 0), 0)
    : null
  const rev30 = sales30Raw.status === 'fulfilled'
    ? (sales30Raw.value.data ?? []).reduce((s: number, r: Record<string, unknown>) => s + (Number(r.total_amount) || 0), 0)
    : null
  const custCount = custCountRaw.status === 'fulfilled' ? (custCountRaw.value.count ?? 0) : null
  const custEmailCount = custEmailCountRaw.status === 'fulfilled' ? (custEmailCountRaw.value.count ?? 0) : null
  const allPromos = promosRaw.status === 'fulfilled'
    ? (promosRaw.value.data ?? []) as Array<{ id: string; name: string; active: boolean; starts_at: string | null; ends_at: string | null }>
    : []
  const activePromos = allPromos.filter(p => p.active && (!p.starts_at || p.starts_at <= todayStr))
  const scheduledPromos = allPromos.filter(p => !p.active || (!!p.starts_at && p.starts_at > todayStr))

  const packetLines: string[] = [
    'DATA PACKET — computed from live database. ONLY cite values listed here. Never invent, round, or estimate any figure not in this packet.',
  ]
  if (rev7 != null) packetLines.push(`  revenue_7d = $${rev7.toFixed(2)}  (use this exact figure for "last week" or "7-day" revenue)`)
  if (rev30 != null) packetLines.push(`  revenue_30d = $${rev30.toFixed(2)}  (use this exact figure for "30-day" or "monthly" revenue)`)
  if (custCount != null) packetLines.push(`  customer_count = ${custCount}  (NEVER say "zero customers" unless this is 0)`)
  if (custEmailCount != null) packetLines.push(`  customers_with_email = ${custEmailCount}`)
  if (activePromos.length > 0) {
    packetLines.push(`  active_promotions = ${activePromos.map(p => p.name).join(', ')}  (LIVE — may describe as running)`)
  } else {
    packetLines.push('  active_promotions = none  (no promotions live — do NOT say any promotion is "working")')
  }
  if (scheduledPromos.length > 0) {
    packetLines.push(`  scheduled_promotions = ${scheduledPromos.map(p => `${p.name} starts ${p.starts_at ?? 'TBD'}`).join(', ')}  (NOT YET LIVE — say "scheduled for [date]", never "working")`)
  }
  const dataPacket = packetLines.join('\n')

  // Use ops_narrative agent for narrative enriched with Aria context
  const agentResult = await ariaInvoke('ops_narrative', bid, { includeWeather: true }).catch(() => null)

  // Direct Anthropic call for the structured narrative — DATA PACKET is first content block
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: NARRATIVE_SYSTEM,
    messages: [{ role: 'user', content: `${dataPacket}\n\nToday summary:\n${JSON.stringify(summary ?? {}, null, 2)}${agentResult?.recommendation ? `\nAria context: ${agentResult.recommendation.description}` : ''}` }],
  })

  const raw = msg.content[0]?.type === 'text' ? msg.content[0].text : ''
  const narrative = parseLLMJsonOr<DailyNarrative>(raw, FALLBACK, 'aria/daily-narrative')

  try {
    const today = new Date().toISOString().slice(0, 10)
    await supabase.from('pos_daily_briefings').upsert({
      business_id: bid, briefing_date: today, briefing_type: 'ai_daily_narrative',
      summary: [narrative.headline, narrative.pattern, narrative.action].filter(Boolean).join('\n'),
      yesterday_revenue: summary?.totals?.gross_revenue ?? null,
      yesterday_transactions: summary?.totals?.count ?? null,
      top_products: summary?.top_products ?? null,
      generated_at: new Date().toISOString(),
    }, { onConflict: 'business_id,briefing_date' })
  } catch (e) { console.error('[non-fatal]', e) }

  return NextResponse.json({ narrative, summary })
}

export const POST = withBusinessContext('aria/daily-narrative', _POST)
