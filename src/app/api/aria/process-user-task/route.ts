export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { generateDeliverable } from '@/lib/aria/deliverables'
import { recordEvent } from '@/lib/moat/recordEvent'
import { notifyOwner } from '@/lib/push/notifyOwner'

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Fail closed: if CRON_SECRET is unset the route is always blocked (same pattern as verifyCronAuth).
  const cronSecret = process.env.CRON_SECRET
  const headerSecret = req.headers.get('x-cron-secret') ?? ''
  if (!cronSecret || headerSecret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { task_id?: string; business_id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  const { task_id, business_id } = body
  if (!task_id) return NextResponse.json({ error: 'task_id required' }, { status: 400 })

  const { data: task } = await supabaseAdmin
    .from('aria_user_tasks')
    .select('*')
    .eq('id', task_id)
    .maybeSingle()

  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  if (task.status !== 'queued') return NextResponse.json({ ok: true, status: task.status })

  const bid = business_id ?? task.business_id
  const startedAt = new Date().toISOString()
  // OWNER-APP PH-2 — steps here are deliberately a single real step, not a fabricated multi-stage
  // checklist: generateDeliverable() is one opaque async call from this route's perspective, with
  // no intermediate progress callback. Claiming step-by-step progress this pipeline can't actually
  // report would violate GROUNDING-TEETH ("real states only, never fake progress"). The Jobs tab's
  // richer per-step checklist is exercised by dev-seed data demonstrating the UI, not by this real
  // execution path — flagged in the sprint report, not silently faked here.
  await supabaseAdmin.from('aria_user_tasks').update({
    status: 'running', started_at: startedAt, updated_at: startedAt,
    steps: [{ label: 'Working on your request', state: 'active' }], progress_step: 0,
  }).eq('id', task_id)

  try {
    // PH-4 additively selects `slug` here (one query, not a second) so the push deep-link can
    // address the owner app at /owner/<slug>/jobs.
    const { data: bizInfo } = await supabaseAdmin.from('businesses').select('industry, owner_email, slug').eq('id', bid).maybeSingle()
    const industry = (bizInfo as { industry?: string } | null)?.industry ?? 'retail'
    const bizSlug = (bizInfo as { slug?: string } | null)?.slug ?? ''
    const result = await generateDeliverable(bid, null, task.task_prompt, 'dashboard', industry)

    const completedAt = new Date().toISOString()
    await supabaseAdmin.from('aria_user_tasks').update({
      status: 'done',
      output_id: result.outputId,
      completed_at: completedAt,
      updated_at: completedAt,
      last_run_at: completedAt,
      steps: [{ label: 'Working on your request', state: 'done' }],
      progress_step: 1,
    }).eq('id', task_id)
    await recordEvent({ business_id: bid, entity_type: 'job', entity_id: task_id, event_type: 'job_completed', actor: 'cron' })

    // OWNER-APP PH-4 — job_done pushes because the owner EXPLICITLY asked for this job (every row
    // here originates from an owner ask — the Jobs tab, chat, or a standing job they set up), which
    // is exactly the "done that the owner asked for" case the attention law permits. Job STEPS
    // never reach this line — progress updates above deliberately have no notify call at all.
    // Fire-and-forget: never blocks the job from completing.
    void notifyOwner({
      business_id: bid, subject_type: 'job', subject_id: task_id, reason: 'job_done',
      title: 'Aria finished: ' + (task.title as string),
      body: 'Your deliverable is ready to open.',
      url: '/owner/' + bizSlug + '/jobs',
    }).catch(() => {})

    if (task.notify_email) {
      const ownerEmail = (bizInfo as { owner_email?: string } | null)?.owner_email
      const resendKey = process.env.RESEND_API_KEY
      if (ownerEmail && resendKey) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Aria OS <aria@ariaos.site>',
            to: [ownerEmail],
            subject: 'Your analysis is ready: ' + result.title,
            html: '<p>Aria has finished your background task: <strong>' + result.title + '</strong>.</p><p>Log in to view your results.</p>',
          }),
        }).catch(() => {})
      }
    }

    return NextResponse.json({ ok: true, output_id: result.outputId })
  } catch (err) {
    const msg = (err as Error).message
    const failedAt = new Date().toISOString()
    await supabaseAdmin.from('aria_user_tasks').update({
      status: 'failed',
      error_message: msg,
      completed_at: failedAt,
      updated_at: failedAt,
      last_run_at: failedAt,
      steps: [{ label: 'Working on your request', state: 'failed' }],
    }).eq('id', task_id)
    await recordEvent({ business_id: bid, entity_type: 'job', entity_id: task_id, event_type: 'job_failed', actor: 'cron' })
    // OWNER-APP PH-4 — a failed job needs a human: the work the owner delegated did NOT happen, and
    // only they can decide whether it matters. Re-reads slug here because the failure may have been
    // thrown before bizInfo was assigned in the try block.
    void (async () => {
      const { data: b } = await supabaseAdmin.from('businesses').select('slug').eq('id', bid).maybeSingle()
      await notifyOwner({
        business_id: bid, subject_type: 'job', subject_id: task_id, reason: 'job_failed',
        title: 'A job didn\'t finish',
        body: (task.title as string) + ' — tap to see what went wrong.',
        url: '/owner/' + ((b?.slug as string) ?? '') + '/jobs',
      })
    })().catch(() => {})
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
