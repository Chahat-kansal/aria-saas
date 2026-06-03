export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const body = await req.json().catch(() => null) as {
    status?: string; outcome_notes?: string; actual_saving_achieved?: number
  } | null
  if (!body) return NextResponse.json({ error: 'Body required' }, { status: 400 })

  const validStatuses = ['pending', 'in_progress', 'won', 'lost', 'deferred']
  if (body.status && !validStatuses.includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (body.status) {
    updates.status = body.status
    if (body.status === 'in_progress') updates.negotiation_started_at = new Date().toISOString()
    if (body.status === 'won' || body.status === 'lost') updates.negotiation_completed_at = new Date().toISOString()
  }
  if (body.outcome_notes !== undefined) updates.outcome_notes = body.outcome_notes
  if (body.actual_saving_achieved !== undefined) updates.actual_saving_achieved = body.actual_saving_achieved

  const { error } = await supabaseAdmin
    .from('supplier_negotiation_briefs')
    .update(updates)
    .eq('id', params.id)
    .eq('business_id', biz.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const PATCH = withErrorCapture('agents/negotiation/briefs/[id]', _PATCH)
