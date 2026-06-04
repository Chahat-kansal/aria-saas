export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { waitUntil } from '@vercel/functions'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function _POST(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: biz } = await supabase.from('businesses').select('id, name')
    .eq('user_id', user.id).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 })
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: txns } = await supabase.from('pos_gift_card_transactions')
    .select('type, amount, balance_after, created_at, gift_card_id')
    .eq('business_id', biz.id).gte('created_at', yesterday).order('created_at', { ascending: false })
  if (!txns?.length) return NextResponse.json({ ok: true, insight: 'No gift card activity in the last 24 hours.' })
  const summary = txns.map(t => `${t.type} $${(Number(t.amount)||0).toFixed(2)} → balance $${(Number(t.balance_after)||0).toFixed(2)} at ${String(t.created_at).slice(0,16)}`).join('\n')
  const resp = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: `Analyse gift card transactions for ${biz.name} (Australian business) for fraud or unusual patterns. Last 24h:\n${summary}\n\nFlag suspicious patterns (bulk redemptions, same card repeatedly, reload-then-redeem spikes). If normal, say "No issues detected." Be specific and brief.` }],
  })
  const insight = (resp.content[0] as { type: string; text: string }).text
  waitUntil((async () => { try { await supabase.from('aria_ai_calls').insert({ business_id: biz.id, model: 'claude-haiku-4-5-20251001', prompt_summary: 'gift_card_fraud_check', response_summary: insight.slice(0, 200), tokens_used: resp.usage.input_tokens + resp.usage.output_tokens }) } catch {} })())
  if (!insight.includes('No issues')) {
    waitUntil((async () => { try { await supabase.from('aria_autopilot_actions').insert({ business_id: biz.id, category: 'compliance', action_type: 'gift_card_fraud_alert', title: 'Gift card activity alert', summary: insight.slice(0, 200), confidence: 0.8, status: 'pending' }) } catch {} })())
  }
  return NextResponse.json({ ok: true, insight })
}
export const POST = withErrorCapture('pos/gift-cards/aria-check', _POST)
