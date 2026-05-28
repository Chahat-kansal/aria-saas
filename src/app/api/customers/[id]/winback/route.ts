export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function sendTwilio(from: string, to: string, body: string, sid: string, token: string) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: from, To: to, Body: body }),
  })
  const data = await res.json()
  return { ok: res.ok, sid: data.sid as string | undefined, error: data.message as string | undefined }
}

async function _POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // The customers dashboard (list + detail) is backed by `customers`, so the id
  // here is a customers.id — look it up there, not in the POS-register table.
  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('id, business_id, name, phone, email')
    .eq('id', params.id)
    .maybeSingle()
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabase.from('businesses').select('id, name').eq('id', customer.business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const message = String(body.message ?? '').trim()
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 })

  const twilioSid   = process.env.TWILIO_ACCOUNT_SID
  const twilioToken = process.env.TWILIO_AUTH_TOKEN
  const twilioFrom  = process.env.TWILIO_PHONE_NUMBER

  if (!twilioSid || !twilioToken || !twilioFrom) {
    await supabaseAdmin.from('campaigns').insert({
      business_id: customer.business_id, customer_id: params.id,
      type: 'winback', message, status: 'pending_twilio', sms_sent: false,
    })
    return NextResponse.json({ ok: false, code: 'TWILIO_NOT_CONFIGURED', queued: true })
  }

  if (!customer.phone) return NextResponse.json({ error: 'No phone number on file' }, { status: 400 })

  const result = await sendTwilio(twilioFrom, customer.phone, message, twilioSid, twilioToken)

  await supabaseAdmin.from('campaigns').insert({
    business_id: customer.business_id, customer_id: params.id,
    type: 'winback', message, sms_sent: result.ok,
    twilio_sid: result.sid ?? null, error: result.error ?? null,
    status: result.ok ? 'sent' : 'failed',
    sent_at: result.ok ? new Date().toISOString() : null,
    failed_at: !result.ok ? new Date().toISOString() : null,
  })

  if (!result.ok) return NextResponse.json({ error: result.error ?? 'SMS failed', sms_sent: false }, { status: 500 })
  return NextResponse.json({ ok: true, sms_sent: true, sid: result.sid })
}

export const POST = withErrorCapture('customers/[id]/winback', _POST)
