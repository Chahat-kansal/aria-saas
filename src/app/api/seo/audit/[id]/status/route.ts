export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: audit } = await supabase.from('seo_audits')
    .select('id, business_id, status, pages_crawled, issues_found, issues_fixed, health_score, critical_count, warning_count, info_count, error_detail, started_at, finished_at')
    .eq('id', params.id).maybeSingle()
  if (!audit) return NextResponse.json({ error: 'Audit not found' }, { status: 404 })

  // Ownership check (RLS-safe).
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', audit.business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return NextResponse.json({ audit })
}

export const GET = withErrorCapture('seo/audit/[id]/status', _GET)
