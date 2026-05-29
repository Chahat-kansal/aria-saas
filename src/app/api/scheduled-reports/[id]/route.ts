export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function verifyOwnership(reportId: string, userId: string) {
  const { data: report } = await supabaseAdmin
    .from('scheduled_pdf_reports').select('id, business_id')
    .eq('id', reportId).maybeSingle()
  if (!report) return null

  const supabase = createServerSupabaseClient()
  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', report.business_id as string).eq('user_id', userId).maybeSingle()
  return biz ? report : null
}

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const report = await verifyOwnership(params.id, user.id)
  if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const allowed = ['is_active', 'label', 'recipients', 'hour_aest', 'day_of_week', 'day_of_month', 'include_share_link']
  const updates: Record<string, unknown> = {}
  for (const k of allowed) if (k in body) updates[k] = body[k]

  await supabaseAdmin.from('scheduled_pdf_reports').update(updates).eq('id', params.id)
  return NextResponse.json({ ok: true })
}

async function _DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const report = await verifyOwnership(params.id, user.id)
  if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabaseAdmin.from('scheduled_pdf_reports').delete().eq('id', params.id)
  return NextResponse.json({ ok: true })
}

export const PATCH = withErrorCapture('scheduled-reports/[id]', _PATCH)
export const DELETE = withErrorCapture('scheduled-reports/[id]', _DELETE)
