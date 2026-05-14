export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const CRON_SECRET = process.env.CRON_SECRET ?? ''

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

async function sendSMS(to: string, body: string): Promise<boolean> {
  const sid   = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from  = process.env.TWILIO_PHONE_NUMBER
  if (!sid || !token || !from) return false
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: from, To: to, Body: body }),
  })
  return res.ok
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = adminClient()
  const today = new Date()
  const mmdd  = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  // Find customers whose birthday month-day matches today, with marketing consent
  const { data: customers } = await sb
    .from('pos_customers')
    .select('id, name, phone, business_id, points_balance')
    .eq('marketing_consent', true)
    .not('birthday', 'is', null)
    .not('phone', 'is', null)
    // birthday is stored as 'YYYY-MM-DD', extract MM-DD
    .like('birthday', `%-${mmdd}`)

  if (!customers?.length) return NextResponse.json({ ok: true, sent: 0 })

  // Get loyalty configs for all unique businesses
  const bizIds = [...new Set(customers.map(c => c.business_id))]
  const { data: configs } = await sb
    .from('pos_loyalty_config')
    .select('business_id, program_type, birthday_reward_text, points_per_dollar')
    .in('business_id', bizIds)

  type LoyaltyConfigRow = { business_id: string; program_type: string; birthday_reward_text: string | null; points_per_dollar: number }
  const configMap: Record<string, LoyaltyConfigRow> = {}
  for (const cfg of configs ?? []) configMap[cfg.business_id] = cfg

  let sent = 0
  for (const c of customers) {
    const cfg = configMap[c.business_id]
    if (!cfg || cfg.program_type === 'off') continue
    if (!cfg.birthday_reward_text) continue

    const msg = `Happy Birthday, ${c.name?.split(' ')[0] ?? 'there'}! 🎂 ${cfg.birthday_reward_text} Show this message to redeem. Reply STOP to unsubscribe.`
    const ok = await sendSMS(c.phone!, msg)
    if (ok) {
      // Log transaction
      await sb.from('pos_loyalty_transactions').insert({
        business_id: c.business_id,
        customer_id: c.id,
        type: 'birthday',
        points_delta: 0,
        stamps_delta: 0,
        reward_redeemed: cfg.birthday_reward_text,
        created_at: new Date().toISOString(),
      })
      sent++
    }
  }

  return NextResponse.json({ ok: true, sent, total_birthday_customers: customers.length })
}