export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import Anthropic from '@anthropic-ai/sdk'
import { toAESTStart, toAESTEnd } from '@/lib/date-au'
import { guardOutput, numbersIn } from '@/lib/aria/ground-guard'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
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
  if (!bid) return NextResponse.json({ reports: [] })
  const { data } = await supabase.from('pos_weekly_reports').select('*').eq('business_id', bid).order('week_start', { ascending: false }).limit(12)
  return NextResponse.json({ reports: data ?? [] })
}

async function _POST(req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const body = await req.json() as { week_start?: string }
  const now = new Date()
  const dow = now.getDay(); const daysToMon = dow === 0 ? 6 : dow - 1
  const thisMon = new Date(now); thisMon.setDate(now.getDate() - daysToMon)
  const lastMon = new Date(thisMon); lastMon.setDate(thisMon.getDate() - 7)

  const weekStart = body.week_start ?? lastMon.toISOString().slice(0, 10)
  const weekEnd = new Date(new Date(weekStart).getTime() + 6 * 86400_000).toISOString().slice(0, 10)
  const prevStart = new Date(new Date(weekStart).getTime() - 7 * 86400_000).toISOString().slice(0, 10)

  // INTEL-COMPUTE-3 — both sales queries used neq('voided') (admitted draft/refunded) with a
  // hardcoded UTC boundary. status='completed' + toAESTStart/toAESTEnd matches
  // getRevenueSnapshot()'s canonical rule.
  const [salesQ, prevQ, lowQ, custQ, auditQ, bizQ] = await Promise.all([
    supabaseAdmin.from('pos_sales').select('total_amount,payment_method,served_by,pos_sale_items(quantity,unit_price,pos_products(name))').eq('business_id', bid).gte('created_at', toAESTStart(weekStart)).lte('created_at', toAESTEnd(weekEnd)).eq('status', 'completed'),
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', bid).gte('created_at', toAESTStart(prevStart)).lt('created_at', toAESTStart(weekStart)).eq('status', 'completed'),
    supabaseAdmin.from('pos_products').select('name,stock_quantity').eq('business_id', bid).eq('track_stock', true).lt('stock_quantity', 5).limit(10),
    supabaseAdmin.from('pos_customers').select('id').eq('business_id', bid).gte('created_at', weekStart + 'T00:00:00Z').lte('created_at', weekEnd + 'T23:59:59Z'),
    supabaseAdmin.from('pos_shift_audits').select('total_checks,passed_checks,flagged_items').eq('business_id', bid).gte('shift_date', weekStart).lte('shift_date', weekEnd),
    supabaseAdmin.from('businesses').select('name,industry,owner_name').eq('id', bid).maybeSingle(),
  ])

  const sales = salesQ.data ?? []; const prevSales = prevQ.data ?? []
  const thisRev = sales.reduce((s: number, x: any) => s + Number(x.total_amount ?? 0), 0)
  const prevRev = prevSales.reduce((s: number, x: any) => s + Number(x.total_amount ?? 0), 0)
  const changePct = prevRev > 0 ? +((thisRev - prevRev) / prevRev * 100).toFixed(1) : null

  const prodMap: Record<string, { name: string; qty: number; revenue: number }> = {}
  for (const s of sales) {
    for (const item of (s.pos_sale_items ?? []) as any[]) {
      const name = item.pos_products?.name ?? 'Unknown'
      if (!prodMap[name]) prodMap[name] = { name, qty: 0, revenue: 0 }
      prodMap[name].qty += Number(item.quantity ?? 1)
      prodMap[name].revenue += Number(item.quantity ?? 1) * Number(item.unit_price ?? 0)
    }
  }
  const topProducts = Object.values(prodMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5)

  const staffMap: Record<string, number> = {}
  for (const s of sales) { const n = String(s.served_by ?? 'Unknown'); staffMap[n] = (staffMap[n] ?? 0) + Number(s.total_amount ?? 0) }
  const staffLeaderboard = Object.entries(staffMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, revenue]) => ({ name, revenue: +revenue.toFixed(2) }))

  const audits = auditQ.data ?? []
  const totalAudit = audits.reduce((s: number, a: any) => s + (a.total_checks ?? 0), 0)
  const passedAudit = audits.reduce((s: number, a: any) => s + (a.passed_checks ?? 0), 0)
  const flaggedAudit = audits.flatMap((a: any) => a.flagged_items ?? [])

  const reportData = {
    week_start: weekStart, week_end: weekEnd, business_name: bizQ.data?.name ?? '',
    revenue: { this_week: +thisRev.toFixed(2), prev_week: +prevRev.toFixed(2), change_pct: changePct },
    transactions: { count: sales.length }, avg_basket: sales.length > 0 ? +(thisRev / sales.length).toFixed(2) : 0,
    top_products: topProducts, staff_leaderboard: staffLeaderboard,
    new_customers: custQ.data?.length ?? 0, low_stock_products: lowQ.data ?? [],
    audit_summary: { total: totalAudit, passed: passedAudit, flagged: flaggedAudit.slice(0, 10) },
    narrative: '',
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 300,
      system: 'You are Aria. Write a warm specific weekly business summary for an Australian SMB owner. 3-4 sentences, concrete numbers.',
      messages: [{ role: 'user', content: 'Week ' + weekStart + ' to ' + weekEnd + '. Revenue A$' + thisRev.toFixed(2) + ' (' + (changePct !== null ? (changePct >= 0 ? '+' : '') + changePct + '% vs last week' : 'first week') + '). Transactions: ' + sales.length + '. Top product: ' + (topProducts[0]?.name ?? 'none') + '. New customers: ' + (custQ.data?.length ?? 0) + '. Failed audits: ' + flaggedAudit.length + '.' }],
    })
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
    // INTEL-COMPUTE-3 — bypasses grounded.ts entirely (direct Anthropic SDK), zero guard on the
    // narrative shown on this dashboard preview. Redact any $/%/count not grounded in the real
    // figures already given to the model in the prompt above.
    const allowed = numbersIn(thisRev.toFixed(2) + ' ' + (changePct ?? '') + ' ' + sales.length + ' ' + (custQ.data?.length ?? 0) + ' ' + flaggedAudit.length)
    reportData.narrative = raw ? (await guardOutput(raw, allowed, { mode: 'redact', businessId: bid, surface: 'weekly-report/narrative' })).text : ''
  } catch { reportData.narrative = 'Your business generated A$' + thisRev.toFixed(2) + ' this week across ' + sales.length + ' transactions.' }

  const { data: report, error } = await supabaseAdmin.from('pos_weekly_reports').upsert({
    business_id: bid, week_start: weekStart, week_end: weekEnd, report_data: reportData, send_status: 'generated',
  }, { onConflict: 'business_id,week_start' }).select().single()

  // Table may not yet exist in all envs — non-fatal: report data is in the response regardless
  if (error && error.code !== '42P01') return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ report: report ?? null, report_data: reportData, ok: true })
}

export const GET = withErrorCapture('aria/weekly-report', _GET)
export const POST = withBusinessContext('aria/weekly-report', _POST)
