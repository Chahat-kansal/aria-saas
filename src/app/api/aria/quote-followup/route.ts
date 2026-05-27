export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json() as { quote_id: string; send?: boolean; draft?: string; subject?: string }
  const { quote_id, send, draft: sendDraft, subject: sendSubject } = body
  if (!quote_id) return NextResponse.json({ error: 'quote_id required' }, { status: 400 })

  const { data: quote } = await supabaseAdmin
    .from('quotes')
    .select('id,business_id,customer_name,customer_email,job_description,quote_amount,status,sent_at,created_at')
    .eq('id', quote_id)
    .eq('business_id', bid)
    .maybeSingle()
  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabaseAdmin.from('businesses').select('name').eq('id', bid).maybeSingle()
  const bizName = (biz as { name: string } | null)?.name ?? 'the business'

  // Send mode: owner approved the draft, send it
  if (send && sendDraft && quote.customer_email) {
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey) {
      const from = process.env.RESEND_FROM_DOMAIN
        ? `${bizName} <quotes@${process.env.RESEND_FROM_DOMAIN}>`
        : `${bizName} <onboarding@resend.dev>`
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: quote.customer_email as string, subject: sendSubject ?? `Following up on your quote from ${bizName}`, html: `<p>${(sendDraft as string).replace(/\n/g, '<br>')}</p>` }),
      }).catch(() => {})
    }
    return NextResponse.json({ ok: true, sent: true })
  }

  const daysSinceSent = Math.floor(
    (Date.now() - new Date((quote.sent_at ?? quote.created_at) as string).getTime()) / 86400000
  )
  const total = Number(quote.quote_amount ?? 0)

  const msg = await trackAICall(
    { route: 'aria/quote-followup', model: 'claude-haiku-4-5-20251001', businessId: bid, purpose: 'quote-followup' },
    () => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: 'You are a professional business email writer. Return ONLY valid JSON with two keys: "draft" (email body string, max 90 words, warm and professional, no markdown) and "win_score" (integer 0-100, likelihood of acceptance).',
      messages: [{
        role: 'user',
        content: `Quote details:
- Business: ${bizName}
- Customer: ${(quote.customer_name as string | null) ?? 'the customer'}
- Job: ${(quote.job_description as string | null) ?? ''}
- Amount: A$${total.toFixed(2)}
- Days since sent: ${daysSinceSent}
- Status: ${quote.status}${quote.status === 'viewed' ? ' (customer has viewed the quote)' : ''}

Return JSON: {"draft": "...", "win_score": 0}`,
      }],
    })
  )

  const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '{}'
  let parsed: { draft?: string; win_score?: number } = {}
  try { parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}') } catch { parsed = {} }

  const draft = parsed.draft ?? ''
  const winScore = typeof parsed.win_score === 'number'
    ? Math.max(0, Math.min(100, Math.round(parsed.win_score)))
    : null

  if (winScore !== null) {
    await supabaseAdmin.from('quotes').update({ win_score: winScore }).eq('id', quote_id)
  }

  const subject = `Following up on your quote from ${bizName}`
  return NextResponse.json({ draft, subject, win_score: winScore, customer_email: quote.customer_email })
}

export const POST = withErrorCapture('aria/quote-followup', _POST)
