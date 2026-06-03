export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id,name,google_place_id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const body = await req.json().catch(() => null) as { customer_id?: string } | null
  if (!body?.customer_id) return NextResponse.json({ error: 'customer_id required' }, { status: 400 })

  const { data: customer } = await supabaseAdmin
    .from('pos_customers').select('name,phone,email,marketing_opt_in').eq('id', body.customer_id).eq('business_id', biz.id).maybeSingle()
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  if (!customer.marketing_opt_in) return NextResponse.json({ error: 'Customer has not opted in to marketing' }, { status: 422 })

  const placeId = String(biz.google_place_id ?? '')
  const reviewLink = placeId ? 'https://g.page/' + placeId + '/review' : ''
  const firstName = String(customer.name ?? 'there').split(' ')[0]
  const msg = 'Hi ' + firstName + '! Hope you enjoyed your visit to ' + String(biz.name) + '. Mind leaving us a quick Google review? It means a lot: ' + reviewLink

  let channel: 'sms' | 'email' | null = null

  if (customer.phone && process.env.TWILIO_ACCOUNT_SID) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const twilio = require('twilio') as { default: (sid: string, token: string | undefined) => { messages: { create: (opts: Record<string, string>) => Promise<unknown> } } }
      const client = twilio.default(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
      await client.messages.create({ body: msg, from: process.env.TWILIO_FROM_NUMBER ?? '', to: String(customer.phone) })
      channel = 'sms'
    } catch { /* try email */ }
  }

  if (!channel && customer.email && process.env.RESEND_API_KEY) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Aria <noreply@ariaos.site>',
        to: String(customer.email),
        subject: 'How was your visit to ' + String(biz.name) + '?',
        html: '<p>' + msg + '</p>',
      }),
    })
    channel = 'email'
  }

  if (!channel) return NextResponse.json({ error: 'No contact method available' }, { status: 422 })

  await supabaseAdmin.from('review_requests').insert({
    business_id: biz.id,
    customer_id: body.customer_id,
    channel,
    message_text: msg,
    google_review_link: reviewLink || null,
  })

  return NextResponse.json({ ok: true, channel })
}

export const POST = withErrorCapture('agents/reputation/request', _POST)
