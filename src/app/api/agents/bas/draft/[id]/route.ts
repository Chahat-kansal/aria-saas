export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const { data: draft, error } = await supabaseAdmin
    .from('bas_drafts')
    .select('*')
    .eq('id', params.id)
    .eq('business_id', biz.id)
    .maybeSingle()

  if (error || !draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Get super obligations for the period
  const { data: superObligations } = await supabaseAdmin
    .from('super_obligations')
    .select('*')
    .eq('business_id', biz.id)
    .eq('period_start', String(draft.period_start))

  return NextResponse.json({ draft, super_obligations: superObligations ?? [] })
}

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const body = await req.json().catch(() => null) as { status?: string; lodged_at?: string } | null
  if (!body) return NextResponse.json({ error: 'Body required' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (body.status) {
    const validStatuses = ['draft', 'reviewed', 'lodged', 'amended']
    if (!validStatuses.includes(body.status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    updates.status = body.status
    if (body.status === 'reviewed') updates.reviewed_at = new Date().toISOString()
    if (body.status === 'lodged') updates.lodged_at = body.lodged_at ?? new Date().toISOString()
  }

  const { error } = await supabaseAdmin
    .from('bas_drafts')
    .update(updates)
    .eq('id', params.id)
    .eq('business_id', biz.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('agents/bas/draft/[id]', _GET)
export const PATCH = withErrorCapture('agents/bas/draft/[id]', _PATCH)
