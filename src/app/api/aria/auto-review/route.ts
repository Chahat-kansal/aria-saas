export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import Anthropic from '@anthropic-ai/sdk'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json() as { sale_id?: string; customer_id?: string; force?: boolean }
  const { data: biz } = await supabaseAdmin.from('businesses').select('name,industry,google_business_url,review_auto_send,review_send_delay_hours').eq('id', bid).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  if (!biz.review_auto_send && !body.force) return NextResponse.json({ skipped: true, reason: 'Auto review send disabled. Enable in Settings.' })

  let customer: { id: string; name: string; phone: string | null; email: string | null } | null = null
  if (body.customer_id) {
    const { data } = await supabaseAdmin.from('pos_customers').select('id,name,phone,email').eq('id', body.customer_id).maybeSingle()
    customer = data
  } else if (body.sale_id) {
    const { data: sale } = await supabaseAdmin.from('pos_sales').select('customer_id,pos_customers(id,name,phone,email)').eq('id', body.sale_id).maybeSingle()
    customer = (sale as any)?.pos_customers ?? null
  }

  if (!customer) return NextResponse.json({ skipped: true, reason: 'No customer linked' })
  if (!customer.phone && !customer.email) return NextResponse.json({ skipped: true, reason: 'No phone or email' })

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString()
  const { data: existing } = await supabaseAdmin.from('pos_review_requests').select('id').eq('business_id', bid).eq('customer_id', customer.id).gte('created_at', thirtyDaysAgo).maybeSingle()
  if (existing && !body.force) return NextResponse.json({ skipped: true, reason: 'Already sent in last 30 days' })

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  let messageText = 'Hi ' + customer.name.split(' ')[0] + '! Thanks for visiting ' + (biz.name ?? '') + '. We'd love your feedback! ' + (biz.google_business_url ? biz.google_business_url + ' ' : '') + 'Reply STOP to opt out.'
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 160,
      system: 'Write a short friendly review request SMS for an Australian small business. Max 160 chars. Include "Reply STOP to opt out." Return ONLY the SMS text.',
      messages: [{ role: 'user', content: 'Customer: ' + customer.name.split(' ')[0] + ', Business: ' + (biz.name ?? '') + ' (' + (biz.industry ?? '') + '), Google URL: ' + (biz.google_business_url ?? 'not set') }],
    })
    const gen = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    if (gen.length > 10 && gen.length <= 160) messageText = gen
  } catch { /* use default */ }

  const sid = process.env.TWILIO_ACCOUNT_SID; const tok = process.env.TWILIO_AUTH_TOKEN; const from = process.env.TWILIO_PHONE_NUMBER
  let sendStatus = 'pending'; let errorMsg = ''

  if (sid && tok && from && customer.phone) {
    try {
      const res = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + sid + '/Messages.json', {
        method: 'POST',
        headers: { Authorization: 'Basic ' + Buffer.from(sid + ':' + tok).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ From: from, To: customer.phone, Body: messageText }),
      })
      sendStatus = res.ok ? 'sent' : 'failed'
      if (!res.ok) { const d = await res.json() as any; errorMsg = d?.message ?? 'Twilio error' }
    } catch (e) { sendStatus = 'failed'; errorMsg = String(e) }
  } else { sendStatus = 'skipped'; errorMsg = !sid ? 'Twilio not configured' : 'No phone' }

  await supabaseAdmin.from('pos_review_requests').insert({
    business_id: bid, customer_id: customer.id, sale_id: body.sale_id ?? null,
    customer_name: customer.name, customer_phone: customer.phone ?? null, customer_email: customer.email ?? null,
    channel: customer.phone ? 'sms' : 'email', message_text: messageText,
    sent_at: sendStatus === 'sent' ? new Date().toISOString() : null,
    send_status: sendStatus, error_msg: errorMsg || null,
  })

  return NextResponse.json({ ok: sendStatus === 'sent', send_status: sendStatus, error: errorMsg || null })
}

export const POST = withErrorCapture('aria/auto-review', _POST)
