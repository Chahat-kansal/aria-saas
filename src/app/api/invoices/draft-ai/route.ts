export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { businessId, text, services, customerName } = body
  if (!businessId || !text?.trim()) return NextResponse.json({ error: 'businessId and text required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id, name').eq('id', businessId).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const servicesCatalogue = (services ?? [])
    .filter((s: { active: boolean }) => s.active)
    .map((s: { name: string; unit_price: number; gst_applicable: boolean }) =>
      `"${s.name}" — $${(Number(s.unit_price) || 0).toFixed(2)} ex-GST${s.gst_applicable ? ' (GST)' : ''}`
    ).join('\n') || 'No catalogue — use custom lines.'

  const prompt = `Business: ${biz.name}
Customer: ${customerName ?? 'unknown'}
Active services catalogue:\n${servicesCatalogue}

Owner's plain-language description:\n"${text}"

Extract invoice line items. Match catalogue items where exact, otherwise create custom lines.
Return ONLY valid JSON — no preamble, no code fences:
{ "lines": [{ "description": "string", "quantity": number, "unit_price": number, "gst_applicable": boolean }] }`

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 })
  let lines: unknown[] = []
  let inputTokens = 0, outputTokens = 0, success = false

  try {
    const res = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 600,
      temperature: 0,
      system: 'You are an invoice line-item extractor. Return ONLY valid JSON. Never compute totals or GST — that is done in code. Only provide description, quantity, unit_price, gst_applicable per line.',
      messages: [{ role: 'user', content: prompt }],
    })
    const text = res.content
      .filter((b: { type: string; text?: string }) => b.type === 'text')
      .map((b: { type: string; text?: string }) => b.text ?? '').join('')
    inputTokens = res.usage.input_tokens
    outputTokens = res.usage.output_tokens
    const clean = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
    const s = clean.indexOf('{'), e = clean.lastIndexOf('}')
    lines = JSON.parse(clean.slice(s, e + 1)).lines ?? []
    success = true
  } catch (err) {
    console.error('[draft-ai] failed:', (err as Error).message)
  }

  void (async () => {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id: businessId, agent_key: 'invoice_draft', provider: 'anthropic',
        model_id: 'claude-sonnet-4-5-20250929', role: 'draft',
        input_tokens: inputTokens, output_tokens: outputTokens, success,
      })
    } catch { /* non-fatal */ }
  })()

  return NextResponse.json({ lines })
}

export const POST = withErrorCapture('invoices/draft-ai', _POST)
