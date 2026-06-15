import { supabaseAdmin } from '@/lib/supabase-admin'

// TP-7 — daily training reminders. Runs from an existing daily cron (no new vercel cron).
// Writes ONE consolidated owner notification per business (aria_notifications type='training'),
// deduped by the unique (business_id, type) constraint. Idempotent: re-running the same day with
// the same facts does NOT re-nag (the `read` flag is preserved when the message is unchanged).

type EnrolRow = {
  business_id: string; due_at: string | null; status: string
  staff_members: { first_name: string | null; last_name: string | null } | null
  training_courses: { title: string | null; is_mandatory: boolean } | null
}
type CertRow = {
  business_id: string; expires_at: string | null; staff_name: string | null; course_title: string | null
  training_courses: { is_mandatory: boolean } | null
}

const nameOf = (s: { first_name?: string | null; last_name?: string | null } | null) =>
  `${s?.first_name ?? ''} ${s?.last_name ?? ''}`.trim() || 'A staff member'

export interface ReminderResult { businesses_notified: number; details: Array<{ business_id: string; message: string }> }

export async function runTrainingReminders(): Promise<ReminderResult> {
  const db = supabaseAdmin
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  const in3 = new Date(now + 3 * 86400000).toISOString()
  const in30 = new Date(now + 30 * 86400000).toISOString()

  const [enrRes, certRes] = await Promise.all([
    db.from('training_enrolments')
      .select('business_id, due_at, status, staff_members(first_name, last_name), training_courses(title, is_mandatory)')
      .neq('status', 'complete').not('due_at', 'is', null).lte('due_at', in3).limit(5000),
    db.from('training_certificates')
      .select('business_id, expires_at, staff_name, course_title, training_courses(is_mandatory)')
      .not('expires_at', 'is', null).lte('expires_at', in30).limit(5000),
  ])
  const enrols = (enrRes.data ?? []) as unknown as EnrolRow[]
  const certs = (certRes.data ?? []) as unknown as CertRow[]

  // Aggregate per business.
  type Agg = { overdue: number; dueSoon: number; expiring: number; expiredMandatory: number; sample: string | null }
  const byBiz = new Map<string, Agg>()
  const get = (b: string) => { let a = byBiz.get(b); if (!a) { a = { overdue: 0, dueSoon: 0, expiring: 0, expiredMandatory: 0, sample: null }; byBiz.set(b, a) } return a }

  for (const e of enrols) {
    if (!e.due_at) continue
    const a = get(e.business_id)
    const t = new Date(e.due_at).getTime()
    if (t < now) { a.overdue++; if (!a.sample) a.sample = `${nameOf(e.staff_members)} on ${e.training_courses?.title ?? 'a course'}` }
    else { a.dueSoon++ }
  }
  for (const c of certs) {
    if (!c.expires_at) continue
    const a = get(c.business_id)
    const t = new Date(c.expires_at).getTime()
    if (t < now) { if (c.training_courses?.is_mandatory) a.expiredMandatory++ }
    else { a.expiring++ }
  }

  const details: Array<{ business_id: string; message: string }> = []
  for (const [bizId, a] of byBiz) {
    const parts: string[] = []
    if (a.overdue) parts.push(`${a.overdue} staff overdue`)
    if (a.dueSoon) parts.push(`${a.dueSoon} due within 3 days`)
    if (a.expiring) parts.push(`${a.expiring} certificate(s) expiring within 30 days`)
    if (a.expiredMandatory) parts.push(`${a.expiredMandatory} expired mandatory cert(s)`)
    if (parts.length === 0) continue
    let message = parts.join(', ') + '.'
    if (a.sample) message += ` e.g. ${a.sample}.`
    details.push({ business_id: bizId, message })
    await upsertTrainingNotification(bizId, message)
  }

  return { businesses_notified: details.length, details }
}

// One consolidated notification per business; preserve `read` if the message is unchanged
// (so re-running the cron the same day does not re-mark it unread / re-nag).
async function upsertTrainingNotification(businessId: string, message: string) {
  const title = 'Training needs attention'
  const { data: existing } = await supabaseAdmin.from('aria_notifications')
    .select('id, message, read').eq('business_id', businessId).eq('type', 'training').maybeSingle()

  if (existing) {
    const unchanged = existing.message === message
    const { error } = await supabaseAdmin.from('aria_notifications').update({
      title, message, action_url: '/dashboard/staff/training', action_label: 'Open training',
      // keep `read` if nothing changed; if the facts changed, re-surface (read=false).
      read: unchanged ? existing.read : false,
    }).eq('id', existing.id)
    if (error) console.error('[training reminders] update failed', error.message)
    return
  }
  const { error } = await supabaseAdmin.from('aria_notifications').insert({
    business_id: businessId, type: 'training', title, message,
    action_url: '/dashboard/staff/training', action_label: 'Open training',
    read: false, created_at: new Date().toISOString(),
  })
  if (error) console.error('[training reminders] insert failed', error.message)
}
