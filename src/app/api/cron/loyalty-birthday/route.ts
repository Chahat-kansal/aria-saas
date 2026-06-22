export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { createClient } from '@supabase/supabase-js'
import { aestDateParts, claimLifecycle, awardLifecyclePoints, deliverLifecycleMessage, finaliseLifecycle } from '@/lib/loyalty/lifecycle'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

// LOY-LIFECYCLE — daily birthday reward. Wires pos_loyalty_config (birthday_enabled, birthday_reward_text,
// birthday_reward_points). Birthday is matched from the REAL pos_customers.birthday (AEST) — never guessed.
// Idempotent: the loyalty_lifecycle_log claim (customer + 'birthday' + year) fires at most once per year,
// so re-running the cron the same day awards nothing extra. Points via the existing ledger; message via
// existing ClickSend SMS / Resend email.
export async function GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const sb = adminClient()
  const { mmdd, year } = aestDateParts()

  // Only businesses that have birthday rewards switched on (bounds the customer scan).
  const { data: configs } = await sb
    .from('pos_loyalty_config')
    .select('business_id, program_type, birthday_enabled, birthday_reward_text, birthday_reward_points')
    .eq('birthday_enabled', true)
    .neq('program_type', 'off')

  type Cfg = { business_id: string; program_type: string; birthday_enabled: boolean; birthday_reward_text: string | null; birthday_reward_points: number | null }
  const cfgMap: Record<string, Cfg> = {}
  for (const cfg of (configs ?? []) as Cfg[]) cfgMap[cfg.business_id] = cfg
  const bizIds = Object.keys(cfgMap)
  if (bizIds.length === 0) return NextResponse.json({ ok: true, sent: 0, rewarded: 0 })

  // Members of those businesses with a real birthday (date col) — match MM-DD in code (a LIKE filter
  // doesn't work on a date column). Birthday comes back as 'YYYY-MM-DD'.
  const { data: all } = await sb
    .from('pos_customers')
    .select('id, name, phone, email, business_id, marketing_consent, birthday')
    .in('business_id', bizIds)
    .eq('marketing_consent', true)
    .not('birthday', 'is', null)
  const customers = (all ?? []).filter(c => typeof c.birthday === 'string' && (c.birthday as string).endsWith(`-${mmdd}`))

  if (!customers.length) return NextResponse.json({ ok: true, sent: 0, rewarded: 0 })

  let sent = 0, rewarded = 0
  for (const c of customers) {
    const cfg = cfgMap[c.business_id]
    if (!cfg || !cfg.birthday_enabled || cfg.program_type === 'off') continue

    const points = Math.max(0, Math.round(Number(cfg.birthday_reward_points ?? 0)))
    // Atomic idempotency claim — one birthday reward per member per year.
    const logId = await claimLifecycle(c.business_id, c.id, 'birthday', year, points)
    if (!logId) continue // already rewarded this year

    await awardLifecyclePoints(c.id, c.business_id, points, 'birthday', cfg.birthday_reward_text)
    if (points > 0) rewarded++

    const firstName = (c.name ?? 'there').split(' ')[0]
    const rewardLine = cfg.birthday_reward_text ? `${cfg.birthday_reward_text} ` : ''
    const pointLine = points > 0 ? `We've added ${points} bonus points to your account. ` : ''
    const smsBody = `Happy Birthday, ${firstName}! 🎂 ${pointLine}${rewardLine}Reply STOP to unsubscribe.`
    const emailHtml = `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#0a0a0a;line-height:1.5"><p>Happy Birthday, ${firstName}! 🎂</p>${points > 0 ? `<p>We've added <strong>${points} bonus points</strong> to your account.</p>` : ''}${cfg.birthday_reward_text ? `<p>${cfg.birthday_reward_text}</p>` : ''}<p>Enjoy your day from all of us.</p></div>`
    const r = await deliverLifecycleMessage(c, smsBody, '🎂 Happy Birthday — a gift inside', emailHtml)
    await finaliseLifecycle(logId, r.channel, r.status)
    if (r.status === 'sent') sent++
  }

  return NextResponse.json({ ok: true, sent, rewarded, total_birthday_customers: customers.length })
}
