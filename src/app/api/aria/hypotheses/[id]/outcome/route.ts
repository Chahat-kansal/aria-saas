export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { verdict } = await req.json().catch(() => ({}))
  if (!['worked', 'failed', 'inconclusive'].includes(verdict)) return NextResponse.json({ error: 'Invalid verdict' }, { status: 400 })

  // Verify ownership
  const { data: hyp } = await supabaseAdmin.from('aria_hypotheses').select('id, business_id').eq('id', params.id).maybeSingle()
  if (!hyp) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data: biz } = await supabaseAdmin.from('businesses').select('id').eq('id', (hyp as { business_id: string }).business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabaseAdmin.from('aria_hypotheses')
    .update({ outcome_verdict: verdict, status: 'closed' })
    .eq('id', params.id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ hypothesis: data })
}

export const PATCH = withErrorCapture('aria/hypotheses/outcome', _PATCH)
