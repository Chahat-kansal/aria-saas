export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const { data: anomalies, error } = await supabaseAdmin
    .from('expense_anomalies')
    .select('*')
    .eq('business_id', biz.id)
    .eq('status', 'open')
    .order('deviation_pct', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ anomalies: anomalies ?? [] })
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const body = await req.json().catch(() => null) as { status?: string; explanation?: string } | null
  if (!body) return NextResponse.json({ error: 'Body required' }, { status: 400 })

  const validStatuses = ['explained', 'error', 'accepted']
  if (body.status && !validStatuses.includes(body.status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('expense_anomalies')
    .update({
      status: body.status ?? 'explained',
      explanation: body.explanation ?? null,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('business_id', biz.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('agents/reconciliation/anomalies', _GET)
export const PATCH = withErrorCapture('agents/reconciliation/anomalies', _PATCH)
