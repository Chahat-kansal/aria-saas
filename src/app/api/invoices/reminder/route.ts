export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { sendSMS } from '@/lib/clicksend'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { invoiceId, confirmedMessage, sendMethod } = body
  if (!invoiceId) return NextResponse.json({ error: 'invoiceId required' }, { status: 400 })

  const { data: inv } = await supabaseAdmin.from('invoices').select('*').eq('id', invoiceId).maybeSingle()
  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabase.from('businesses')
    .select('id, name').eq('id', inv.business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // If owner has confirmed and wants to send, dispatch the reminder
  if (confirmedMessage && sendMethod) {
    if (!['email', 'sms'].includes(sendMethod)) return NextResponse.json({ error: 'Invalid sendMethod' }, { status: 400 })

    if (sendMethod === 'email') {
      const toEmail = inv.bill_to_email as string | null
      if (!toEmail) return NextResponse.json({ error: 'No email on invoice' }, { status: 400 })
      const resendKey = process.env.RESEND_API_KEY
      if (!resendKey) return NextResponse.json({ error: 'Email not configured' }, { status: 503 })
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${biz.name} <aria@${process.env.RESEND_FROM_DOMAIN ?? 'resend.dev'}>`,
          to: toEmail,
          subject: `Payment reminder: Invoice ${inv.invoice_number} from ${biz.name}`,
          html: `<p style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;">${(confirmedMessage as string).replace(/\n/g, '<br>')}</p>`,
        }),
      })
      if (!emailRes.ok) {
        const errText = await emailRes.text().catch(() => emailRes.statusText)
        return NextResponse.json({ error: `Email failed: ${errText}` }, { status: 502 })
      }
    } else {
      const rawPhone = (inv.bill_to_phone ?? '') as string
      if (!rawPhone) return NextResponse.json({ error: 'No phone on invoice' }, { status: 400 })
      const phone = rawPhone.replace(/\s/g, '').replace(/^0/, '+61')
      const smsResult = await sendSMS(phone, confirmedMessage as string)
      if (!smsResult.ok) {
        return NextResponse.json({ error: smsResult.error ?? 'SMS failed' }, { status: 502 })
      }
    }
    return NextResponse.json({ ok: true, sent: true })
  }

  // Draft mode: generate reminder text for owner review
  const daysOverdue = inv.due_date
    ? Math.max(0, Math.floor((Date.now() - new Date(inv.due_date as string).getTime()) / 86400000))
    : 0
  const dueStr = inv.due_date
    ? new Date(inv.due_date as string).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'no due date set'
  const totalStr = `$${(Number(inv.total) || 0).toFixed(2)} AUD`

  const prompt = `Business: ${biz.name}
Customer: ${inv.bill_to_name}
Invoice: ${inv.invoice_number}
Amount: ${totalStr}
Due: ${dueStr}${daysOverdue > 0 ? ` (${daysOverdue} days overdue)` : ''}
Status: ${inv.status}

Write a polite, professional payment reminder${daysOverdue > 0 ? ' for an overdue invoice' : ''}.
- Under 120 words
- Reference the invoice number and amount
- Friendly but firm
- Include a call to action
- Do NOT include a signature line
Return ONLY the reminder text, no subject line, no preamble.`

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 })
  let reminderText = ''
  let inputTokens = 0, outputTokens = 0, success = false

  try {
    const res = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 200,
      temperature: 0.3,
      system: 'You are a professional business assistant. Write concise payment reminders.',
      messages: [{ role: 'user', content: prompt }],
    })
    reminderText = res.content
      .filter((b: { type: string; text?: string }) => b.type === 'text')
      .map((b: { type: string; text?: string }) => b.text ?? '').join('').trim()
    inputTokens = res.usage.input_tokens
    outputTokens = res.usage.output_tokens
    success = true
  } catch (err) {
    console.error('[reminder] failed:', (err as Error).message)
  }

  void (async () => {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id: inv.business_id, agent_key: 'invoice_reminder', provider: 'anthropic',
        model_id: 'claude-sonnet-4-5-20250929', role: 'draft',
        input_tokens: inputTokens, output_tokens: outputTokens, success,
      })
    } catch { /* non-fatal */ }
  })()

  if (!success || !reminderText) return NextResponse.json({ error: 'Failed to generate reminder' }, { status: 500 })

  return NextResponse.json({
    draft: reminderText,
    invoiceNumber: inv.invoice_number,
    billToName: inv.bill_to_name,
    billToEmail: inv.bill_to_email,
    total: totalStr,
  })
}

export const POST = withErrorCapture('invoices/reminder', _POST)
