export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { generateABA } from '@/lib/staff/payroll'

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const runId = new URL(req.url).searchParams.get('run_id')
  if (!runId) return NextResponse.json({ error: 'run_id required' }, { status: 400 })

  const { data: run } = await supabaseAdmin.from('payroll_runs')
    .select('*, businesses(name, abn)')
    .eq('id', runId).maybeSingle()
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Verify the authenticated user owns this business
  const { data: ownership } = await supabase.from('businesses')
    .select('id').eq('id', run.business_id).eq('user_id', user.id).maybeSingle()
  if (!ownership) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabaseAdmin.from('businesses')
    .select('name, abn, bank_bsb, bank_account').eq('id', run.business_id).maybeSingle()

  const lines = (run.line_items ?? []) as Parameters<typeof generateABA>[0]
  const aba = generateABA(lines, biz ?? { name: 'Business' }, run.period_end)

  const filename = `payroll-${run.period_start}-to-${run.period_end}.aba`

  await supabaseAdmin.from('payroll_runs')
    .update({ aba_generated_at: new Date().toISOString() }).eq('id', runId)

  return new Response(aba, {
    headers: {
      'Content-Type': 'text/plain',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
