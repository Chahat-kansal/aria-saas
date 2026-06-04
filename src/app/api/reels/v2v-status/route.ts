export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const jobId = req.nextUrl.searchParams.get('job_id')
  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 })

  // supabase (not admin) — RLS ensures the caller owns this job
  const { data: job, error } = await supabase
    .from('reel_v2v_jobs')
    .select('status, output_url, op')
    .eq('id', jobId)
    .maybeSingle()

  if (error || !job) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    status: job.status as 'processing' | 'done' | 'error',
    ...(job.output_url ? { output_url: job.output_url as string } : {}),
  })
}
