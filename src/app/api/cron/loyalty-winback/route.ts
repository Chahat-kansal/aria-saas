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
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token || !from) return false
        await sendSMS(to, body)
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

  // Get all businesses with winback configured
  const { data: configs } = await sb
    .from('pos_loyalty_config')
    .select('business_id, program_type, winback_after_days, winback_reward_text')
    .neq('program_type', 'off')
    .not('winback_reward_text', 'is', null)
    .gt('winback_after_days', 0)

  if (!configs?.length) return NextResponse.json({ ok: true, sent: 0 })

  let sent = 0

  for (const cfg of configs) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - (cfg.winback_after_days ?? 30))

    // Customers whose last_visit_at is exactly at the cutoff (within a 24h window)
    const windowStart = new Date(cutoff)
    windowStart.setDate(windowStart.getDate() - 1)

    const { data: lapsed } = await sb
      .from('pos_customers')
      .select('id, name, phone, points_balance')
      .eq('business_id', cfg.business_id)
      .eq('marketing_consent', true)
      .not('phone', 'is', null)
      .not('last_visit_at', 'is', null)
      .lte('last_visit_at', cutoff.toISOString())
      .gte('last_visit_at', windowStart.toISOString())
      .limit(50) // rate-limit per run

    for (const c of lapsed ?? []) {
      const firstName = (c.name ?? 'there').split(' ')[0]
      const msg = `Hey ${firstName}, we miss you! ☕ ${cfg.winback_reward_text} Come back and show this message. Reply STOP to unsubscribe.`
      const ok = await sendSMS(c.phone!, msg)
      if (ok) {
        await sb.from('pos_loyalty_transactions').insert({
          business_id: cfg.business_id,
          customer_id: c.id,
          type: 'winback',
          points_delta: 0,
          stamps_delta: 0,
          reward_redeemed: cfg.winback_reward_text,
          created_at: new Date().toISOString(),
        })
        sent++
      }
    }
  }

  return NextResponse.json({ ok: true, sent })
}