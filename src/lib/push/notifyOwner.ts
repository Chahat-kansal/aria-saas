import webpush from 'web-push'
import { supabaseAdmin } from '@/lib/supabase-admin'

// OWNER-APP PH-4 — the ONE owner-push emit path, mirroring how recordEvent (business_events)
// centralises the moat spine. notifyOwner and recordEvent deliberately fire at the SAME moments
// but stay two separate calls: recordEvent writes the immutable analytics fact, notifyOwner
// decides whether a human deserves an interruption. Merging them would couple "what happened" to
// "who gets woken up".
//
// TRANSPORT REUSE: web-push + VAPID config mirrors src/lib/community/push.ts (already proven in
// production for customer pushes) rather than introducing a second transport. Same no-op-when-
// unconfigured dev guard, same 404/410 stale-subscription pruning.

let configured = false
function configure(): boolean {
  if (configured) return true
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const sub = process.env.VAPID_SUBJECT ?? 'mailto:hello@ariaos.site'
  if (!pub || !priv) return false
  try {
    webpush.setVapidDetails(sub, pub, priv)
    configured = true
    return true
  } catch (err) {
    console.error('[notifyOwner] VAPID config failed', err)
    return false
  }
}

export type NotifyReason = 'decision_waiting' | 'job_needs_input' | 'job_failed' | 'job_done'
export type NotifySubject = 'decision' | 'job'

export interface NotifyOwnerParams {
  business_id: string
  subject_type: NotifySubject
  subject_id: string
  reason: NotifyReason
  title: string
  body: string
  /** Deep-link path within the owner app, e.g. /owner/<slug>/decisions?open=<id> */
  url: string
}

export interface NotifyResult {
  status: 'sent' | 'deduped' | 'quiet_hours_held' | 'no_devices' | 'not_configured' | 'error'
  delivered?: number
  pruned?: number
}

// ── QUIET HOURS ────────────────────────────────────────────────────────────────────────────────
// Documented default (the brief's instruction: a simple hold with a documented default, no
// per-reason config yet): 21:00–07:00 in the BUSINESS's own timezone (businesses.timezone, real
// data — confirmed populated, e.g. 'Australia/Melbourne'; falls back to Australia/Melbourne, this
// product's home market, if a business somehow has none). Inside that window a push is NOT sent,
// but the ledger row IS still written — so the dedupe guarantee holds and the owner sees it in-app;
// they simply aren't woken at 2am. Per-reason overrides (e.g. always buzz for urgent money) are
// deliberately NOT invented here.
const QUIET_START_HOUR = 21
const QUIET_END_HOUR = 7

export function isQuietHours(timezone: string | null | undefined, now = new Date()): boolean {
  const tz = timezone || 'Australia/Melbourne'
  let hour: number
  try {
    hour = Number(new Intl.DateTimeFormat('en-AU', { timeZone: tz, hour: 'numeric', hour12: false }).format(now))
  } catch {
    // Unknown/invalid tz string — fall back to the home market rather than guessing or crashing.
    hour = Number(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: 'numeric', hour12: false }).format(now))
  }
  if (Number.isNaN(hour)) return false
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR
}

export const QUIET_HOURS_LABEL = '9:00pm – 7:00am'

/**
 * Notify the owner about ONE subject, at most ONCE per (subject, reason) — ever.
 *
 * Dedupe is enforced by the DATABASE (owner_notifications' unique(subject_type, subject_id,
 * reason)), not by an application check: we INSERT first and only deliver if the insert actually
 * created a row. A concurrent second caller loses the race at the constraint and returns
 * 'deduped'. This is what makes push trustworthy — see the migration header.
 *
 * Fire-and-forget by contract: callers must NOT await this in a way that blocks their write path
 * (see the call sites — all use void/catch). It never throws.
 */
export async function notifyOwner(params: NotifyOwnerParams): Promise<NotifyResult> {
  try {
    const { data: biz } = await supabaseAdmin
      .from('businesses')
      .select('user_id, timezone, slug')
      .eq('id', params.business_id)
      .maybeSingle()

    // ── STEP 1: claim the dedupe slot FIRST, before any send decision ───────────────────────────
    // Written even when we end up holding for quiet hours or having no devices, so the
    // "once per decision" promise is about the DECISION, not about delivery luck.
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('owner_notifications')
      .insert({
        business_id: params.business_id,
        user_id: (biz?.user_id as string) ?? null,
        subject_type: params.subject_type,
        subject_id: params.subject_id,
        reason: params.reason,
        title: params.title,
        body: params.body,
        delivered: false,
      })
      .select('id')
      .maybeSingle()

    if (insertErr || !inserted) {
      // 23505 = unique violation = we have ALREADY buzzed for this subject+reason. Correct, silent, no send.
      return { status: 'deduped' }
    }

    if (isQuietHours(biz?.timezone as string | null)) {
      return { status: 'quiet_hours_held' }
    }

    if (!configure()) return { status: 'not_configured' }

    const { data: subs } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id, endpoint, keys')
      .eq('business_id', params.business_id)
      .eq('disabled', false)

    const list = (subs ?? []) as Array<{ id: string; endpoint: string; keys: { p256dh?: string; auth?: string } }>
    if (list.length === 0) return { status: 'no_devices' }

    const payload = JSON.stringify({
      title: params.title,
      body: params.body,
      url: params.url,
      // tag collapses any same-subject notification in the tray (belt-and-braces on top of the DB dedupe)
      tag: params.subject_type + ':' + params.subject_id,
    })

    let delivered = 0
    let pruned = 0
    await Promise.all(list.map(async s => {
      if (!s.keys?.p256dh || !s.keys?.auth) return
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } },
          payload,
        )
        delivered++
      } catch (err: unknown) {
        const code = (err as { statusCode?: number })?.statusCode
        if (code === 404 || code === 410) {
          // Endpoint gone / subscription expired — prune so a dead device stops costing sends.
          await supabaseAdmin.from('push_subscriptions').delete().eq('id', s.id)
          pruned++
        } else {
          console.warn('[notifyOwner] send failed', code, (err as Error)?.message)
        }
      }
    }))

    if (delivered > 0) {
      await supabaseAdmin.from('owner_notifications').update({ delivered: true }).eq('id', inserted.id)
    }
    return { status: 'sent', delivered, pruned }
  } catch (err) {
    console.error('[notifyOwner] unexpected failure', err)
    return { status: 'error' }
  }
}

/**
 * COALESCE — several decisions entering 'waiting' at once (the daily cron proposing a batch) must
 * produce ONE grouped buzz ("3 decisions need you"), not N.
 *
 * How it's implemented: one ledger row per decision is still written (so each decision keeps its
 * own permanent dedupe slot and none can ever be buzzed again individually), but only ONE delivery
 * goes out for the whole batch. The first subject is notified normally (carrying the grouped
 * title/body when the batch is >1); every other subject in the batch claims its dedupe slot via a
 * silent ledger insert with no send. So: N rows, 1 interruption.
 */
export async function notifyOwnerBatch(
  business_id: string,
  subjects: Array<{ subject_id: string; title: string }>,
  opts: { subject_type: NotifySubject; reason: NotifyReason; urlFor: (id: string) => string; groupedUrl: string },
): Promise<NotifyResult> {
  if (subjects.length === 0) return { status: 'no_devices', delivered: 0 }

  // Claim dedupe slots for every subject EXCEPT the first — silent, no delivery.
  const rest = subjects.slice(1)
  if (rest.length > 0) {
    const { data: biz } = await supabaseAdmin.from('businesses').select('user_id').eq('id', business_id).maybeSingle()
    await supabaseAdmin.from('owner_notifications').insert(
      rest.map(s => ({
        business_id,
        user_id: (biz?.user_id as string) ?? null,
        subject_type: opts.subject_type,
        subject_id: s.subject_id,
        reason: opts.reason,
        title: s.title,
        body: 'Included in a grouped notification.',
        delivered: false,
      })),
    ).then(() => {}, () => {}) // conflicts here are expected + correct (already-notified subjects)
  }

  const first = subjects[0]
  const grouped = subjects.length > 1
  return notifyOwner({
    business_id,
    subject_type: opts.subject_type,
    subject_id: first.subject_id,
    reason: opts.reason,
    title: grouped ? subjects.length + ' decisions need you' : first.title,
    body: grouped ? 'Tap to review them in Decisions.' : first.title,
    url: grouped ? opts.groupedUrl : opts.urlFor(first.subject_id),
  })
}
