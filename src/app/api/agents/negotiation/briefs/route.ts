export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { SupplierNegotiationAgent } from '@/lib/agents/supplier-negotiation-agent'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  let query = supabaseAdmin
    .from('supplier_negotiation_briefs')
    .select('*')
    .eq('business_id', biz.id)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data: briefs, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const wonSavings = (briefs ?? [])
    .filter(b => b.status === 'won')
    .reduce((s, b) => s + Number(b.actual_saving_achieved ?? b.annual_saving_if_successful ?? 0), 0)

  const totalPotential = (briefs ?? [])
    .filter(b => b.status === 'pending' || b.status === 'in_progress')
    .reduce((s, b) => s + Number(b.annual_saving_if_successful ?? 0), 0)

  return NextResponse.json({
    briefs: briefs ?? [],
    won_savings_this_year: Math.round(wonSavings * 100) / 100,
    total_potential_saving: Math.round(totalPotential * 100) / 100,
  })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const agent = new SupplierNegotiationAgent()
  await agent.run(biz.id)

  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('agents/negotiation/briefs', _GET)
export const POST = withErrorCapture('agents/negotiation/briefs', _POST)
