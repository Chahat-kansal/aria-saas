import type { SupabaseClient } from '@supabase/supabase-js'
import { pointsToLevel } from '@/lib/community/levels'
import { getLifetimePointsBatch } from '@/lib/community/points'
import type { LeaderboardPeriod, LeaderboardRow } from '@/lib/community/leaderboard'
import { sendEmail } from '@/lib/external-apis'

// CX-GAME-LEAN — daily digest, email-only, consent-gated (pos_customers.email_consent, reusing the
// WHATSAPP sprint's consent-column pattern). Skip-if-nothing-happened: a member with zero points
// delta AND unchanged rank gets no email — never spam an inactive member.
//
// CX-GAME-CLOSEOUT — this originally called Resend directly via a raw fetch(), which meant it had
// NO unsubscribe footer, NO List-Unsubscribe header, and never checked the email_suppression list —
// a real gap found in production verification, not caught by tsc/build. Routed through the existing
// canonical sendEmail() (lib/external-apis.ts) instead: category:'marketing' gets the automatic
// signed one-click unsubscribe link + footer + suppression check + cost logging, all for free —
// the exact machinery loyalty-birthday/winback/campaign sends already use. Never build a second
// email-sending path when one with real compliance handling already exists.
//
// CX-GAME-DIGEST-FIX (2026-07-25) — a real incident: two contradictory digests landed for the same
// identity in the same minute (the real hourly cron + a manual test-digest run, close together).
// Two root causes fixed here:
// 1. last_digest_at was read, then written AFTER the send, with no lock in between — a genuine
//    read-then-write race. Now claimed atomically via claim_daily_digest_send() (a row-locked RPC,
//    see its migration comment) BEFORE computing the delta, so a second concurrent invocation for
//    the same customer always finds the day already claimed and skips silently, no matter which
//    caller (real cron vs. a manual test run) got there first.
// 2. Rank/movement was sourced from whatever in-memory snapshot array the CALLER happened to pass
//    in — if two callers each computed their own fresh (and non-deterministically tie-broken)
//    snapshot before persisting, they could disagree. This function now reads its own rank source
//    directly from the persisted community_leaderboard_snapshots row (one hardcoded period, see
//    DIGEST_PERIOD below) rather than accepting one as a parameter — always the single durable
//    source of truth, never a bespoke recompute.
const DIGEST_PERIOD: LeaderboardPeriod = '30d' // hardcoded together with the "this month" copy below — if this ever changes, the copy must change with it, not separately

interface DigestCandidate {
  customer_id: string
  email: string | null
  email_consent: boolean | null
  name: string | null
}

export async function sendDailyDigests(
  supabase: SupabaseClient,
  businessId: string,
  businessName: string,
  opts?: { force?: boolean; why?: boolean },
): Promise<{ sent: number; skipped: number }> {
  const force = opts?.force ?? false
  const why = opts?.why ?? false
  // --why diagnostic logging ONLY — never changes which branch runs or what gets sent. Every skip
  // point below gets a matching log(...) call right before its `skipped++; continue`/return, so a
  // confusing "sent:0 skipped:1" always has a printed reason next to it instead of requiring a
  // fresh SQL trace each time (see CX-GAME-DIGEST-FIX follow-up: a real --force run still skipped
  // legitimately — delta was genuinely 0 since last_digest_at, rank hadn't moved — and there was no
  // way to see that from the result alone).
  const log = (...args: unknown[]) => { if (why) console.log('[digest:why]', ...args) }

  // Candidates are every linked member with a consenting email — NOT "whoever made the leaderboard
  // snapshot". A customer who opted out of the leaderboard (or a business with no snapshot yet)
  // still gets a real points-delta digest; the rank line is just omitted for them (see below).
  // Dedupe by customer_id — the same real customer can have more than one
  // community_member_loyalty_links row (confirmed live: multiple anonymous community sessions/
  // devices opportunistically linking to the same loyalty customer), which would otherwise queue
  // the same recipient twice in this loop. The atomic claim below would still prevent a second
  // email going out, but there's no reason to do the extra claim/delta work for a row we know is
  // the same person.
  const { data: links } = await supabase
    .from('community_member_loyalty_links')
    .select('pos_customers(id, email, email_consent, name)')
    .eq('business_id', businessId)
  type LinkRow = { pos_customers: DigestCandidate & { id: string } | null }
  const candidateMap = new Map<string, DigestCandidate & { id: string }>()
  for (const l of (links ?? []) as unknown as LinkRow[]) {
    const c = l.pos_customers
    if (c?.email && c.email_consent === true) candidateMap.set(c.id, c)
  }
  const candidates = Array.from(candidateMap.values())
  log(`${candidates.length} candidate(s) for business ${businessId}:`, candidates.map(c => ({ id: c.id, email: c.email })))
  if (!candidates.length) { log('no candidates (no linked member has a consenting email) — nothing to do'); return { sent: 0, skipped: 0 } }

  // Canonical rank/movement source — one read of the persisted snapshot, never recomputed here.
  const { data: snapshotRow } = await supabase
    .from('community_leaderboard_snapshots')
    .select('rows').eq('business_id', businessId).eq('period', DIGEST_PERIOD).maybeSingle()
  const rankByCustomer = new Map(
    (((snapshotRow?.rows as LeaderboardRow[] | undefined) ?? [])).map(r => [r.customer_id, r])
  )
  log(`${DIGEST_PERIOD} snapshot: ${snapshotRow ? `${rankByCustomer.size} row(s)` : 'no snapshot row for this business'}`)

  let sent = 0, skipped = 0
  for (const cust of candidates) {
    const { data: claimRows } = await supabase.rpc('claim_daily_digest_send', {
      p_customer_id: cust.id, p_force: force,
    })
    const claim = (claimRows as Array<{ claimed: boolean; previous_last_digest_at: string | null }> | null)?.[0]
    if (!claim?.claimed) {
      log(cust.email, 'SKIP — already claimed today (last_digest_at is today; rerun with --force to bypass)')
      skipped++; continue
    }
    log(cust.email, `claimed — previous_last_digest_at was ${claim.previous_last_digest_at ?? '(never sent before)'}`)

    const since = claim.previous_last_digest_at ?? '1970-01-01T00:00:00.000Z'
    const { data: deltaRows } = await supabase
      .from('pos_loyalty_transactions')
      .select('points_delta')
      .eq('business_id', businessId).eq('customer_id', cust.id)
      .gt('created_at', since)
    const pointsDelta = (deltaRows ?? []).reduce((s, r) => s + (Number(r.points_delta) || 0), 0)
    log(cust.email, `delta since ${since}: ${pointsDelta} pts across ${(deltaRows ?? []).length} transaction(s)`)

    // No snapshot row for this customer (opted out of the leaderboard, or the business has none
    // yet) — rank/movement stay null, the rank line is omitted entirely below. Never fabricated.
    const leaderboardRow = rankByCustomer.get(cust.id)
    const movement = leaderboardRow?.rankMovement ?? null
    const rankChanged = movement != null && movement !== 0
    log(cust.email, leaderboardRow
      ? `snapshot row: rank #${leaderboardRow.rank}, rankMovement=${movement} (changed=${rankChanged})`
      : 'no snapshot row for this customer — rank line will be omitted')

    // The claim ALREADY prevents a same-day retry regardless of what happens below — accepting a
    // "nothing happened" day still consumes today's slot is intentional, not a bug.
    if (pointsDelta === 0 && !rankChanged) {
      log(cust.email, 'SKIP — skip-if-nothing-happened: 0 pts delta and rank unchanged since', since)
      skipped++; continue
    }

    const lifetimeMap = await getLifetimePointsBatch([cust.id])
    const lifetimePoints = lifetimeMap.get(cust.id) ?? 0
    const level = pointsToLevel(lifetimePoints)
    const first = (cust.name ?? '').trim().split(/\s+/)[0] || 'there'

    // No percentage — "0% of the way" reads as deflating right after a level-up. Just the count.
    const progressLine = level.nextAt != null
      ? `${level.nextAt - lifetimePoints} pts to Level ${level.level + 1}`
      : `top level`

    const rankLine = !leaderboardRow
      ? '' // no snapshot row for this customer — omit the rank line entirely, never fabricate one
      : movement == null
        ? `<p>You're ranked #${leaderboardRow.rank} this month.</p>`
        : movement > 0
          ? `<p>You're up ${movement} spot${movement === 1 ? '' : 's'} to #${leaderboardRow.rank} this month!</p>`
          : movement < 0
            ? `<p>You're now #${leaderboardRow.rank} this month (down ${Math.abs(movement)}).</p>`
            : `<p>You're holding steady at #${leaderboardRow.rank} this month.</p>`

    const subject = pointsDelta > 0 ? `+${pointsDelta} points at ${businessName}` : `Your ${businessName} community update`
    const html = `<p>Hi ${first},</p>` +
      (pointsDelta !== 0 ? `<p>You ${pointsDelta > 0 ? 'earned' : 'used'} <strong>${Math.abs(pointsDelta)} points</strong> at ${businessName} since your last update.</p>` : '') +
      rankLine +
      `<p>Level ${level.level} · ${level.name} — ${progressLine}</p>`

    // sendEmail (category:'marketing') adds the signed one-click unsubscribe link + footer + List-
    // Unsubscribe header, checks the email_suppression list, and re-checks email_consent itself —
    // the same compliance machinery every other consent-gated send in this codebase already uses.
    const ok = await sendEmail(
      { to: cust.email!, subject, html, from_name: 'Aria' },
      { category: 'marketing', businessId, customerId: cust.id },
    )
    // If the send itself fails, the claim above still stands — today's slot is spent either way.
    // Tradeoff accepted deliberately: a missed day (retried tomorrow, delta computed from today's
    // claim onward) is far better than risking the double-send this whole fix exists to prevent.
    if (ok) { log(cust.email, 'SENT —', subject); sent++ }
    else { log(cust.email, 'SKIP — sendEmail() returned false (suppressed, consent re-check failed, or provider error — see its own logs)'); skipped++ }
  }

  return { sent, skipped }
}
