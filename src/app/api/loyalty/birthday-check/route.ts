export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function sendSMS(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_PHONE_NUMBER
  if (!sid || !token || !from) return { ok: false, error: 'Twilio not configured' }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: from, To: to, Body: body }),
  })
  const data = await res.json()
  return { ok: res.ok, sid: data.sid, error: data.message }
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const business_id = String(body.business_id ?? '')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: config } = await supabaseAdmin.from('pos_loyalty_config').select('birthday_reward_text, points_per_dollar').eq('business_id', business_id).maybeSingle()
  if (!config?.birthday_reward_text) return NextResponse.json({ ok: true, sent: 0, message: 'No birthday reward configured' })

  const today = new Date()
  const mmdd = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const { data: customers } = await supabaseAdmin
    .from('pos_customers')
    .select('id, name, phone, points_balance, loyalty_points')
    .eq('business_id', business_id)
    .eq('marketing_consent', true)
    .not('birthday', 'is', null)
    .not('phone', 'is', null)
    .like('birthday', `%-${mmdd}`)

  let sent = 0
  const results: Array<{ name: string; ok: boolean; error?: string }> = []

  for (const c of customers ?? []) {
    const msg = `Happy Birthday, ${c.name?.split(' ')[0] ?? 'there'}! 🎂 ${config.birthday_reward_text} Show this message in store to redeem. Reply STOP to unsubscribe.`
    const result = await sendSMS(c.phone!, msg)
    if (result.ok) {
      await supabaseAdmin.from('pos_loyalty_transactions').insert({
        business_id, customer_id: c.id, type: 'birthday',
        points_delta: 0, stamps_delta: 0,
        reward_redeemed: config.birthday_reward_text,
        created_at: new Date().toISOString(),
      })
      sent++
    }
    results.push({ name: c.name ?? '', ok: result.ok, error: result.error })
  }

  return NextResponse.json({ ok: true, sent, total: (customers ?? []).length, results })
}

export const POST = withErrorCapture('loyalty/birthday-check', _POST)
