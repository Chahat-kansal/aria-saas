export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyBusinessAccess } from '@/lib/auth/verify-business-access'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { toOwnerJob } from '@/lib/owner-app/jobs'

type Params = { params: Promise<{ id: string }> | { id: string } }

// GET /api/owner/jobs/[id]?business_id=X — job detail incl. steps[] for polling while RUNNING,
// plus which decisions it produced (aria_autopilot_actions.action_data->>'source_job_id' = id —
// no new FK column, see migration 20260729010000's header).
async function _GET(req: Request, { params }: Params) {
  const { id } = 'then' in params ? await params : params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const denied = await verifyBusinessAccess(user.id, business_id)
  if (denied) return denied

  const { data: row } = await supabase.from('aria_user_tasks').select('*').eq('id', id).eq('business_id', business_id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: producedRows } = await supabase
    .from('aria_autopilot_actions')
    .select('id, title, domain, status')
    .eq('business_id', business_id)
    .contains('action_data', { source_job_id: id })

  return NextResponse.json({ job: toOwnerJob(row), produced_decisions: producedRows ?? [] })
}

// PATCH /api/owner/jobs/[id] { business_id, action:'cancel' } or { business_id, enabled:boolean }
async function _PATCH(req: Request, { params }: Params) {
  const { id } = 'then' in params ? await params : params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { business_id?: string; action?: 'cancel'; enabled?: boolean }
  const { business_id } = body
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const denied = await verifyBusinessAccess(user.id, business_id)
  if (denied) return denied

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.action === 'cancel') update.status = 'cancelled'
  if (typeof body.enabled === 'boolean') update.enabled = body.enabled
  if (Object.keys(update).length === 1) return NextResponse.json({ error: 'action or enabled required' }, { status: 400 })

  const { data: updated, error } = await supabaseAdmin
    .from('aria_user_tasks').update(update).eq('id', id).eq('business_id', business_id).select('*').maybeSingle()
  if (error || !updated) return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 })

  return NextResponse.json({ job: toOwnerJob(updated) })
}

export const GET = withErrorCapture('owner/jobs/[id]', _GET)
export const PATCH = withErrorCapture('owner/jobs/[id]', _PATCH)
