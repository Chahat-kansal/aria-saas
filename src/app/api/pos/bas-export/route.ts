export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  const { searchParams } = new URL(req.url)
  const startsAt = searchParams.get('starts_at')
  const endsAt = searchParams.get('ends_at')
  if (!startsAt || !endsAt) return NextResponse.json({ error: 'starts_at + ends_at required' }, { status: 400 })

  const { data: sales } = await supabase.from('pos_sales')
    .select('id, total_amount, subtotal, tax_amount, tax_breakdown, created_at, status')
    .eq('business_id', bid)
    .eq('status', 'completed')
    .gte('created_at', startsAt)
    .lte('created_at', endsAt)
    .limit(10000)

  let totalSales = 0
  let totalGst = 0
  let totalWet = 0
  let totalLct = 0
  let totalOther = 0
  let gstFreeSales = 0

  for (const s of sales ?? []) {
    totalSales += Number(s.total_amount) || 0
    const breakdown = (Array.isArray(s.tax_breakdown) ? s.tax_breakdown : []) as Array<{ code?: string; tax_amount?: number; taxable_amount?: number }>
    if (breakdown.length === 0) {
      totalGst += Number(s.tax_amount) || 0
      continue
    }
    let lineHadGst = false
    for (const b of breakdown) {
      const amount = Number(b.tax_amount) || 0
      if (b.code === 'GST') { totalGst += amount; lineHadGst = true }
      else if (b.code === 'WET') totalWet += amount
      else if (b.code === 'LCT') totalLct += amount
      else if (b.code === 'GST_FREE' || b.code === 'EXPORT' || b.code === 'INPUT_TAXED') gstFreeSales += Number(b.taxable_amount) || 0
      else totalOther += amount
    }
    if (!lineHadGst && breakdown.every(b => b.code === 'GST_FREE' || b.code === 'EXPORT' || b.code === 'INPUT_TAXED')) {
      gstFreeSales += Number(s.subtotal) || 0
    }
  }

  return NextResponse.json({
    period: { starts_at: startsAt, ends_at: endsAt },
    sales_count: (sales ?? []).length,
    total_sales: +totalSales.toFixed(2),
    total_gst_collected: +totalGst.toFixed(2),
    total_wet_collected: +totalWet.toFixed(2),
    total_lct_collected: +totalLct.toFixed(2),
    total_other_tax: +totalOther.toFixed(2),
    gst_free_sales: +gstFreeSales.toFixed(2),
    bas_g1: +totalSales.toFixed(2),
    bas_1a: +(totalGst + totalWet + totalLct + totalOther).toFixed(2),
    bas_g3: +gstFreeSales.toFixed(2),
  })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  const body = await req.json()
  if (!body.period_starts_at || !body.period_ends_at) return NextResponse.json({ error: 'period_starts_at + period_ends_at required' }, { status: 400 })
  const { data, error } = await supabase.from('pos_bas_exports').insert({
    business_id: bid,
    period_starts_at: body.period_starts_at,
    period_ends_at: body.period_ends_at,
    total_sales: Number(body.total_sales) || 0,
    total_gst_collected: Number(body.total_gst_collected) || 0,
    total_wet_collected: Number(body.total_wet_collected) || 0,
    total_lct_collected: Number(body.total_lct_collected) || 0,
    total_other_tax: Number(body.total_other_tax) || 0,
    gst_free_sales: Number(body.gst_free_sales) || 0,
    export_format: body.export_format ?? 'csv',
    breakdown_jsonb: body.breakdown_jsonb ?? {},
    generated_by: user.id,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ export: data })
}

export const GET = withErrorCapture('pos/bas-export', _GET)
export const POST = withErrorCapture('pos/bas-export', _POST)
