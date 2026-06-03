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

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

  const { data: logs, error } = await supabaseAdmin
    .from('waste_log')
    .select('id,product_id,waste_date,units_wasted,cost_per_unit,total_waste_value,reason,prevented_by_agent,notes,logged_by,created_at,pos_products(name)')
    .eq('business_id', biz.id)
    .gte('waste_date', thirtyDaysAgo)
    .order('waste_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Group by product
  const byProduct: Record<string, { product_id: string; product_name: string; total_waste_value: number; total_units_wasted: number; entries: number }> = {}
  for (const log of logs ?? []) {
    const pid = log.product_id
    const name = (log.pos_products as { name?: string } | null)?.name ?? pid
    if (!byProduct[pid]) byProduct[pid] = { product_id: pid, product_name: name, total_waste_value: 0, total_units_wasted: 0, entries: 0 }
    byProduct[pid].total_waste_value += Number(log.total_waste_value ?? 0)
    byProduct[pid].total_units_wasted += Number(log.units_wasted ?? 0)
    byProduct[pid].entries++
  }

  return NextResponse.json({
    logs: logs ?? [],
    by_product: Object.values(byProduct).sort((a, b) => b.total_waste_value - a.total_waste_value),
  })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const body = await req.json().catch(() => null) as {
    product_id?: string; units_wasted?: number; cost_per_unit?: number; reason?: string; notes?: string
  } | null
  if (!body?.product_id || !body?.units_wasted) {
    return NextResponse.json({ error: 'product_id and units_wasted required' }, { status: 400 })
  }

  const totalWasteValue = Number(body.units_wasted) * Number(body.cost_per_unit ?? 0)

  const { data, error } = await supabaseAdmin
    .from('waste_log')
    .insert({
      business_id: biz.id,
      product_id: body.product_id,
      units_wasted: body.units_wasted,
      cost_per_unit: body.cost_per_unit ?? 0,
      total_waste_value: totalWasteValue,
      reason: body.reason ?? 'other',
      notes: body.notes ?? null,
      logged_by: 'owner',
    })
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, log: data })
}

export const GET = withErrorCapture('agents/waste/log', _GET)
export const POST = withErrorCapture('agents/waste/log', _POST)
