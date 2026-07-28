export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { notifyOwnerBatch } from '@/lib/push/notifyOwner'

// OWNER-APP PH-4 — the decision_waiting emit point, implemented as a daily SWEEP.
//
// WHY A SWEEP AND NOT A DIRECT CALL AT CREATION (stated plainly, this is a real trade-off):
// there is no single choke point where a decision becomes 'waiting'. ~30 different agent files
// insert into aria_autopilot_actions directly (inventory, compliance, reputation_defence, bas,
// clv, ...) — the same structural reality PH-2 disclosed for recordEvent's 'proposed' events.
// Rather than touch 30 files (and still miss the 31st written next month), this sweep catches
// EVERY creation path by construction, whoever wrote it.
//
// THE COST, HONESTLY: push latency is up to ~24h, because RULE 4 caps crons at DAILY (sub-daily
// schedules silently break Vercel Pro deploys — a documented incident in this repo). A decision
// created just after the sweep waits until tomorrow's run to buzz. This is a deliberate,
// constraint-driven choice, NOT "real-time push" — do not describe it as such. The in-app Today
// badge remains the immediate signal (push is additive, never the only path to a decision, exactly
// as the brief requires). Real-time-at-creation would need agents to call notifyOwner directly at
// their own insert sites — tracked as future work, not silently claimed here.
//
// COALESCE: this is also the natural home for the brief's grouping rule — a cron run that finds N
// new waiting decisions sends ONE grouped push ("N decisions need you") via notifyOwnerBatch,
// while still writing one ledger row per decision so each keeps its permanent dedupe slot.
//
// BACKLOG GUARD: bounded to decisions created in the last 25h (slight overlap with the daily
// cadence so nothing falls through a gap). Without this, the first run would buzz "350 decisions
// need you" from the pre-existing agent backlog — technically correct, practically the exact
// over-notification failure this sprint exists to prevent.
const LOOKBACK_HOURS = 25

async function _GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const since = new Date(Date.now() - LOOKBACK_HOURS * 3600_000).toISOString()

  // Only decisions still genuinely waiting, created recently, that have NOT already been notified
  // (the owner_notifications ledger is the source of truth for "already buzzed").
  const { data: candidates } = await supabaseAdmin
    .from('aria_autopilot_actions')
    .select('id, business_id, title, domain')
    .eq('status', 'pending')
    .gte('created_at', since)
    .limit(500)

  const rows = (candidates ?? []) as Array<{ id: string; business_id: string; title: string | null; domain: string | null }>
  if (rows.length === 0) return NextResponse.json({ ok: true, candidates: 0, businesses_notified: 0 })

  const { data: alreadyNotified } = await supabaseAdmin
    .from('owner_notifications')
    .select('subject_id')
    .eq('subject_type', 'decision')
    .eq('reason', 'decision_waiting')
    .in('subject_id', rows.map(r => r.id))
  const notifiedIds = new Set(((alreadyNotified ?? []) as Array<{ subject_id: string }>).map(r => r.subject_id))

  // Group the un-notified ones per business — each business gets at most ONE interruption per run.
  const byBusiness = new Map<string, Array<{ subject_id: string; title: string }>>()
  for (const r of rows) {
    if (notifiedIds.has(r.id)) continue
    const list = byBusiness.get(r.business_id) ?? []
    list.push({ subject_id: r.id, title: r.title ?? 'A decision needs you' })
    byBusiness.set(r.business_id, list)
  }

  let businessesNotified = 0
  for (const [business_id, subjects] of byBusiness) {
    const { data: biz } = await supabaseAdmin.from('businesses').select('slug').eq('id', business_id).maybeSingle()
    const slug = (biz?.slug as string) ?? ''
    await notifyOwnerBatch(business_id, subjects, {
      subject_type: 'decision',
      reason: 'decision_waiting',
      urlFor: id => '/owner/' + slug + '/decisions?open=' + id,
      groupedUrl: '/owner/' + slug + '/decisions',
    })
    businessesNotified++
  }

  return NextResponse.json({ ok: true, candidates: rows.length, businesses_notified: businessesNotified })
}

export const GET = withErrorCapture('cron/decision-notify-sweep', _GET)
