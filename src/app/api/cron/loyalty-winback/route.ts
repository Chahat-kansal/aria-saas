export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { createClient } from '@supabase/supabase-js'
import { aestDateParts, claimLifecycle, awardLifecyclePoints, deliverLifecycleMessage, finaliseLifecycle, winbackOnCooldown } from '@/lib/loyalty/lifecycle'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

// LOY-LIFECYCLE — daily winback for lapsed members. Wires pos_loyalty_config (winback_enabled,
// winback_after_days, winback_reward_text, winback_reward_points). "Lapsed" is computed from the REAL
// pos_sales history (last non-voided purchase older than the window) — never from a guessed date.
// Idempotent + non-spammy: a cooldown (= winback_after_days) means a lapsed member is messaged at most
// once per lapse window, and the per-day lifecycle claim blocks same-day double-runs. Points via the
// existing ledger; message via existing ClickSend SMS / Resend email.
export async function GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const sb = adminClient()
  const { ymd } = aestDateParts()

  const { data: configs } = await sb
    .from('pos_loyalty_config')
    .select('business_id, program_type, winback_enabled, winback_after_days, winback_reward_text, winback_reward_points')
    .eq('winback_enabled', true)
    .neq('program_type', 'off')
    .not('winback_reward_text', 'is', null)
    .gt('winback_after_days', 0)

  if (!configs?.length) return NextResponse.json({ ok: true, sent: 0, rewarded: 0 })

  let sent = 0, rewarded = 0
  for (const cfg of configs) {
    const days = Number(cfg.winback_after_days ?? 30)
    const cutoff = new Date(Date.now() - days * 86400000).toISOString()
    const points = Math.max(0, Math.round(Number(cfg.winback_reward_points ?? 0)))

    // GROUNDING — derive "lapsed" from real purchases: everyone who has ever bought, minus anyone who
    // bought within the window. Both sets come straight from pos_sales (non-voided).
    const { data: recent } = await sb.from('pos_sales')
      .select('customer_id').eq('business_id', cfg.business_id).neq('status', 'voided')
      .not('customer_id', 'is', null).gte('created_at', cutoff).limit(20000)
    const recentSet = new Set((recent ?? []).map(r => r.customer_id as string))

    const { data: ever } = await sb.from('pos_sales')
      .select('customer_id').eq('business_id', cfg.business_id).neq('status', 'voided')
      .not('customer_id', 'is', null).limit(20000)
    const lapsedIds = [...new Set((ever ?? []).map(r => r.customer_id as string))].filter(id => !recentSet.has(id))
    if (lapsedIds.length === 0) continue

    const { data: lapsed } = await sb.from('pos_customers')
      .select('id, name, phone, email, business_id, marketing_consent')
      .eq('business_id', cfg.business_id).eq('marketing_consent', true)
      .in('id', lapsedIds.slice(0, 500))
      .or('phone.not.is.null,email.not.is.null')
      .limit(50) // rate-limit per run

    for (const c of lapsed ?? []) {
      // Cooldown — don't re-message a lapsed member daily; only once per lapse window.
      if (await winbackOnCooldown(c.business_id, c.id, days)) continue
      const logId = await claimLifecycle(c.business_id, c.id, 'winback', ymd, points)
      if (!logId) continue // already handled today

      await awardLifecyclePoints(c.id, c.business_id, points, 'winback', cfg.winback_reward_text)
      if (points > 0) rewarded++

      const firstName = (c.name ?? 'there').split(' ')[0]
      const rewardLine = cfg.winback_reward_text ? `${cfg.winback_reward_text} ` : ''
      const pointLine = points > 0 ? `Here's ${points} bonus points to welcome you back. ` : ''
      const smsBody = `Hey ${firstName}, we miss you! ☕ ${pointLine}${rewardLine}Reply STOP to unsubscribe.`
      const emailHtml = `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#0a0a0a;line-height:1.5"><p>Hey ${firstName}, we miss you! ☕</p>${points > 0 ? `<p>Here's <strong>${points} bonus points</strong> to welcome you back.</p>` : ''}${cfg.winback_reward_text ? `<p>${cfg.winback_reward_text}</p>` : ''}<p>Hope to see you soon.</p></div>`
      const r = await deliverLifecycleMessage(c, smsBody, "We miss you — here's a little something", emailHtml)
      await finaliseLifecycle(logId, r.channel, r.status)
      if (r.status === 'sent') sent++
    }
  }

  return NextResponse.json({ ok: true, sent, rewarded })
}
