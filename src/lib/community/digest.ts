import type { SupabaseClient } from '@supabase/supabase-js'
import { pointsToLevel } from '@/lib/community/levels'
import { getLifetimePointsBatch } from '@/lib/community/points'
import type { LeaderboardRow } from '@/lib/community/leaderboard'

// CX-GAME-LEAN — daily digest, email-only (Resend), consent-gated (pos_customers.email_consent,
// reusing the WHATSAPP sprint's consent-column pattern). Skip-if-nothing-happened: a member with
// zero points delta AND unchanged rank gets no email — never spam an inactive member. One email/day
// max by construction (the daily cron calls this once; last_digest_at makes a truthful delta possible
// even if the cron were ever accidentally re-run same day — see the >last_digest_at filter below,
// which would correctly compute a 0 delta on a same-day re-run rather than double-counting).

interface DigestCandidate {
  customer_id: string
  email: string | null
  email_consent: boolean | null
  last_digest_at: string | null
  name: string | null
}

export async function sendDailyDigests(
  supabase: SupabaseClient,
  businessId: string,
  businessName: string,
  newSnapshot: LeaderboardRow[],
): Promise<{ sent: number; skipped: number }> {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey || !newSnapshot.length) return { sent: 0, skipped: newSnapshot.length }

  const customerIds = newSnapshot.map(r => r.customer_id)
  const { data: customers } = await supabase
    .from('pos_customers')
    .select('id, email, email_consent, last_digest_at, name')
    .in('id', customerIds)
  const custMap = new Map(((customers ?? []) as unknown as Array<DigestCandidate & { id: string }>).map(c => [c.id, c]))

  let sent = 0, skipped = 0
  for (const row of newSnapshot) {
    const cust = custMap.get(row.customer_id)
    if (!cust?.email || cust.email_consent !== true) { skipped++; continue }

    const since = cust.last_digest_at ?? '1970-01-01T00:00:00.000Z'
    const { data: deltaRows } = await supabase
      .from('pos_loyalty_transactions')
      .select('points_delta')
      .eq('business_id', businessId).eq('customer_id', row.customer_id)
      .gt('created_at', since)
    const pointsDelta = (deltaRows ?? []).reduce((s, r) => s + (Number(r.points_delta) || 0), 0)

    // rankMovement was embedded onto the row at persist time (attachRankMovement) — null means no
    // prior snapshot existed for this member, so "changed" is false, never a fabricated delta.
    const rankChanged = row.rankMovement != null && row.rankMovement !== 0

    if (pointsDelta === 0 && !rankChanged) { skipped++; continue }

    const lifetimeMap = await getLifetimePointsBatch([row.customer_id])
    const lifetimePoints = lifetimeMap.get(row.customer_id) ?? 0
    const level = pointsToLevel(lifetimePoints)
    const movement = row.rankMovement
    const first = (cust.name ?? '').trim().split(/\s+/)[0] || 'there'

    const progressLine = level.nextAt != null
      ? `${Math.round(level.progress * 100)}% of the way to the next level (${level.nextAt - lifetimePoints} pts to go)`
      : `You've reached the top level — Legend.`

    const rankLine = movement == null
      ? `You're ranked #${row.rank} this month.`
      : movement > 0
        ? `You're up ${movement} spot${movement === 1 ? '' : 's'} to #${row.rank} this month!`
        : movement < 0
          ? `You're now #${row.rank} this month (down ${Math.abs(movement)}).`
          : `You're holding steady at #${row.rank} this month.`

    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Aria <community@ariaos.site>',
          to: [cust.email],
          subject: pointsDelta > 0 ? `+${pointsDelta} points at ${businessName}` : `Your ${businessName} community update`,
          html: `<p>Hi ${first},</p>` +
            (pointsDelta !== 0 ? `<p>You ${pointsDelta > 0 ? 'earned' : 'used'} <strong>${Math.abs(pointsDelta)} points</strong> at ${businessName} since your last update.</p>` : '') +
            `<p>${rankLine}</p>` +
            `<p>Level ${level.level} · ${level.name} — ${progressLine}</p>`,
        }),
      })
      await supabase.from('pos_customers').update({ last_digest_at: new Date().toISOString() }).eq('id', row.customer_id)
      sent++
    } catch (e) {
      console.error('[sendDailyDigests] send failed:', row.customer_id, String(e))
      skipped++
    }
  }

  return { sent, skipped }
}
