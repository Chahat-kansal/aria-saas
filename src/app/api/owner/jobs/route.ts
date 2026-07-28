export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyBusinessAccess } from '@/lib/auth/verify-business-access'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { toOwnerJob } from '@/lib/owner-app/jobs'
import { recordEvent } from '@/lib/moat/recordEvent'

// OWNER-APP PH-2, Part A — Jobs tab list + create. Reuses the EXISTING aria_user_tasks execution
// pipeline (api/aria/process-user-task, generateDeliverable) rather than a second runner — this
// route's POST mirrors exactly what api/aria/ask/route.ts's own background-task path already does
// (insert queued row, fire process-user-task via waitUntil), just reachable directly from the
// Jobs tab's "hand over something new" input instead of only via chat-intent detection.

// GET /api/owner/jobs?business_id=X — running + done-today + standing, one call (the Jobs tab
// renders all three sections from one load).
async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const denied = await verifyBusinessAccess(user.id, business_id)
  if (denied) return denied

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)

  const [runningRes, doneRes, standingRes] = await Promise.all([
    supabase.from('aria_user_tasks').select('*').eq('business_id', business_id)
      .in('status', ['queued', 'running', 'needs_input']).is('schedule', null)
      .order('created_at', { ascending: false }),
    supabase.from('aria_user_tasks').select('*').eq('business_id', business_id)
      .in('status', ['done', 'failed']).is('schedule', null)
      .gte('completed_at', todayStart.toISOString())
      .order('completed_at', { ascending: false }),
    supabase.from('aria_user_tasks').select('*').eq('business_id', business_id)
      .not('schedule', 'is', null)
      .order('created_at', { ascending: true }),
  ])

  return NextResponse.json({
    running: ((runningRes.data ?? []) as Array<Record<string, unknown>>).map(toOwnerJob),
    done_today: ((doneRes.data ?? []) as Array<Record<string, unknown>>).map(toOwnerJob),
    standing: ((standingRes.data ?? []) as Array<Record<string, unknown>>).map(toOwnerJob),
  })
}

// POST /api/owner/jobs { business_id, ask }
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { business_id, ask } = await req.json().catch(() => ({})) as { business_id?: string; ask?: string }
  if (!business_id || !ask?.trim()) return NextResponse.json({ error: 'business_id and ask are required' }, { status: 400 })

  const denied = await verifyBusinessAccess(user.id, business_id)
  if (denied) return denied

  const now = new Date().toISOString()
  const { data: job, error } = await supabaseAdmin.from('aria_user_tasks').insert({
    business_id, title: ask.trim().slice(0, 120), task_prompt: ask.trim(),
    status: 'queued', notify_email: true, created_by: 'owner',
    steps: [{ label: 'Queued', state: 'pending' }], progress_step: 0, updated_at: now,
  }).select('*').maybeSingle()

  if (error || !job) return NextResponse.json({ error: error?.message ?? 'Failed to create job' }, { status: 500 })

  await recordEvent({ business_id, entity_type: 'job', entity_id: job.id as string, event_type: 'job_created', actor: 'owner' })

  // Same waitUntil-backed background execution ask/route.ts's own background-task path uses —
  // genuinely survives the phone closing, bounded by process-user-task's own 300s maxDuration
  // (not a fully durable/retriable queue — see the sprint report for the honest caveat).
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const cronSec = process.env.CRON_SECRET ?? ''
  waitUntil(
    fetch(appUrl + '/api/aria/process-user-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': cronSec },
      body: JSON.stringify({ task_id: job.id, business_id }),
    }).catch(() => {}),
  )

  return NextResponse.json({ job: toOwnerJob(job) }, { status: 201 })
}

export const GET = withErrorCapture('owner/jobs', _GET)
export const POST = withErrorCapture('owner/jobs', _POST)
