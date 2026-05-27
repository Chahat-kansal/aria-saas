export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import Anthropic from '@anthropic-ai/sdk'
import { trackAICall } from '@/lib/aria/ai-telemetry'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()

  const [signalsRes, convRes] = await Promise.all([
    supabaseAdmin.from('instore_demand_signals')
      .select('query_text, product_asked, in_stock, matched_product_id, signal_type, created_at')
      .eq('business_id', bid).gte('created_at', sevenDaysAgo).limit(2000),
    supabaseAdmin.from('instore_conversations')
      .select('id, email_captured, customer_id, started_at')
      .eq('business_id', bid).gte('started_at', sevenDaysAgo).limit(2000),
  ])

  type Sig = { query_text: string | null; product_asked: string | null; in_stock: boolean | null; matched_product_id: string | null; signal_type: string | null; created_at: string }
  const signals = (signalsRes.data ?? []) as Sig[]
  const convs = (convRes.data ?? []) as Array<{ id: string; email_captured: string | null }>

  const answered = signals.filter(s => s.signal_type === 'answered').length
  const recipes = signals.filter(s => s.signal_type === 'recipe').length
  const recommendations = signals.filter(s => s.signal_type === 'recommendation').length
  const missed = signals.filter(s => s.signal_type === 'missed_demand' || s.in_stock === false)

  // Aggregate top-asked products + missed-demand groupings
  const askedCounts: Record<string, number> = {}
  for (const s of signals) {
    if (!s.product_asked) continue
    const key = s.product_asked.toLowerCase().trim()
    askedCounts[key] = (askedCounts[key] ?? 0) + 1
  }
  const topAsked = Object.entries(askedCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([name, count]) => ({ name, count }))

  const missedCounts: Record<string, number> = {}
  for (const s of missed) {
    if (!s.product_asked) continue
    const key = s.product_asked.toLowerCase().trim()
    missedCounts[key] = (missedCounts[key] ?? 0) + 1
  }
  const missedTop = Object.entries(missedCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([name, count]) => ({ name, count, estimated_value_aud: count * 8 })) // heuristic A$8/request

  const totalMissedValue = missedTop.reduce((s, m) => s + m.estimated_value_aud, 0)
  const emailsCaptured = convs.filter(c => c.email_captured).length
  const conversations = convs.length

  // Lightweight AI summary
  let ariaInsight: string | null = null
  if (process.env.ANTHROPIC_API_KEY && signals.length >= 5) {
    try {
      const summary = [
        `${conversations} conversations this week.`,
        `${answered} questions answered, ${recommendations} recommendations made, ${recipes} recipe ideas.`,
        `${emailsCaptured} emails captured.`,
        topAsked.length > 0 ? `Most asked: ${topAsked.slice(0, 3).map(t => `${t.name} (${t.count})`).join(', ')}.` : '',
        missedTop.length > 0 ? `MISSED: customers asked for ${missedTop.slice(0, 3).map(m => `${m.name} (${m.count})`).join(', ')} but you don't stock them. ~A$${totalMissedValue.toFixed(0)} demand.` : '',
      ].filter(Boolean).join(' ')

      const resp = await trackAICall(
        { route: 'instore/insights', model: 'claude-haiku-4-5-20251001', businessId: bid, purpose: 'instore-insights' },
        () => anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 160,
          system: 'You are Aria, an Australian SMB business advisor. Give ONE concise insight (2 sentences max) in plain owner language. No jargon. Recommend ONE specific action.',
          messages: [{ role: 'user', content: `Summarise this week of in-store kiosk data and recommend one action: ${summary}` }],
        })
      )
      ariaInsight = resp.content[0].type === 'text' ? resp.content[0].text.trim() : null
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({
    metrics: {
      conversations,
      questions_answered: answered,
      items_recommended: recommendations,
      recipes_suggested: recipes,
      emails_captured: emailsCaptured,
      missed_demand_value_aud: totalMissedValue,
    },
    top_asked: topAsked,
    missed_demand: missedTop,
    aria_insight: ariaInsight,
  })
}

export const GET = withErrorCapture('instore/insights', _GET)
