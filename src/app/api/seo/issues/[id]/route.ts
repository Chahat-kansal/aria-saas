export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _PATCH(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: issue } = await supabase.from('seo_issues').select('id, business_id').eq('id', params.id).maybeSingle()
  if (!issue) return NextResponse.json({ error: 'Issue not found' }, { status: 404 })

  // Ownership check
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', issue.business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await supabase.from('seo_issues').update({ state: 'verified', fixed: true }).eq('id', params.id)

  return NextResponse.json({ ok: true })
}

export const PATCH = withErrorCapture('seo/issues/[id]', _PATCH)
