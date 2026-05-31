export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { run_id } = await req.json()
  if (!run_id) return NextResponse.json({ error: 'run_id required' }, { status: 400 })

  const { data: run } = await supabaseAdmin.from('payroll_runs')
    .select('id, business_id, line_items').eq('id', run_id).maybeSingle()
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Verify the authenticated user owns this business
  const { data: biz } = await supabase.from('businesses')
    .select('id').eq('id', run.business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Update run status
  await supabaseAdmin.from('payroll_runs').update({
    status: 'approved',
    approved_by: user.email,
    approved_at: new Date().toISOString(),
  }).eq('id', run_id)

  // Update YTD figures for each staff member
  const lines = (run.line_items ?? []) as Array<{
    staff_member_id: string | null
    gross_pay_cents: number
    tax_withheld_cents: number
    super_cents: number
  }>

  for (const line of lines) {
    if (!line.staff_member_id) continue
    const { data: sm } = await supabaseAdmin.from('staff_members')
      .select('ytd_gross_cents, ytd_tax_cents, ytd_super_cents')
      .eq('id', line.staff_member_id).maybeSingle()

    await supabaseAdmin.from('staff_members').update({
      ytd_gross_cents: (Number(sm?.ytd_gross_cents) || 0) + line.gross_pay_cents,
      ytd_tax_cents: (Number(sm?.ytd_tax_cents) || 0) + line.tax_withheld_cents,
      ytd_super_cents: (Number(sm?.ytd_super_cents) || 0) + line.super_cents,
    }).eq('id', line.staff_member_id)
  }

  return NextResponse.json({ ok: true, status: 'approved' })
}
