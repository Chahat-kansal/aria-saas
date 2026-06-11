export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCurrentQuarter } from '@/lib/agents/bas-agent'
import { upsertAriaAction } from '@/lib/aria/upsert-aria-action'
import { withErrorCapture } from '@/lib/api/with-error-capture'

function getPriorQuarter() {
  const now = new Date()
  // Go back 3 months to get prior quarter's midpoint, then call getCurrentQuarter logic
  const priorMid = new Date(now.getFullYear(), now.getMonth() - 3, 15)
  const FY = priorMid.getFullYear()
  const FY1 = FY + 1
  const m = priorMid.getMonth()
  if (m >= 6 && m <= 8)  return { quarter: 'Q1 FY' + FY1, period_start: new Date(FY + '-07-01'),  period_end: new Date(FY + '-09-30'),  due_date: new Date(FY + '-10-28') }
  if (m >= 9 && m <= 11) return { quarter: 'Q2 FY' + FY1, period_start: new Date(FY + '-10-01'),  period_end: new Date(FY + '-12-31'),  due_date: new Date(FY1 + '-02-28') }
  if (m >= 0 && m <= 2)  return { quarter: 'Q3 FY' + FY,  period_start: new Date(FY + '-01-01'),  period_end: new Date(FY + '-03-31'),  due_date: new Date(FY + '-04-28') }
  return                          { quarter: 'Q4 FY' + FY,  period_start: new Date(FY + '-04-01'),  period_end: new Date(FY + '-06-30'),  due_date: new Date(FY + '-07-28') }
}

function getAuTaxCalendar(): Array<{ label: string; type: string; date: string; days_until: number }> {
  const now = new Date()
  const DATES: Array<{ label: string; type: string; month: number; day: number }> = [
    { label: 'BAS/PAYG Q2 due',   type: 'bas',   month: 1,  day: 28 },
    { label: 'Super Q3 due',       type: 'super', month: 0,  day: 28 },
    { label: 'BAS/PAYG Q3 due',   type: 'bas',   month: 3,  day: 28 },
    { label: 'Super Q4 due',       type: 'super', month: 3,  day: 28 },
    { label: 'BAS/PAYG Q4 due',   type: 'bas',   month: 6,  day: 28 },
    { label: 'Super Q1 due',       type: 'super', month: 9,  day: 28 },
    { label: 'BAS/PAYG Q1 due',   type: 'bas',   month: 9,  day: 28 },
    { label: 'Super Q2 due',       type: 'super', month: 0,  day: 28 },
  ]
  const upcoming: Array<{ label: string; type: string; date: string; days_until: number }> = []
  for (let yearOffset = 0; yearOffset <= 1; yearOffset++) {
    const yr = now.getFullYear() + yearOffset
    for (const d of DATES) {
      const dt = new Date(yr, d.month, d.day)
      const days = Math.ceil((dt.getTime() - now.getTime()) / 86400000)
      if (days >= -7) {
        upcoming.push({ label: d.label, type: d.type, date: dt.toISOString().slice(0, 10), days_until: days })
      }
    }
  }
  upcoming.sort((a, b) => a.days_until - b.days_until)
  return upcoming.slice(0, 8)
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses')
    .select('id, name, gst_registered_from')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const q = getCurrentQuarter()
  const pq = getPriorQuarter()
  const now = new Date()
  const daysUntilDue = Math.ceil((q.due_date.getTime() - now.getTime()) / 86400000)

  // Fetch current quarter BAS draft (populated by bas-agent cron)
  const { data: draft } = await supabaseAdmin
    .from('bas_drafts')
    .select('id,quarter,period_start,period_end,due_date,status,g1_total_sales,field_1a_gst_on_sales,field_1b_gst_credits,net_gst,w1_total_salary_wages,w2_amounts_withheld,total_super,total_payable,notes')
    .eq('business_id', business_id)
    .eq('period_start', q.period_start.toISOString().slice(0, 10))
    .maybeSingle()

  // Fetch business_expenses for 1B GST credits (sum * 0.1 = GST paid on expenses)
  const { data: expenses } = await supabaseAdmin
    .from('business_expenses')
    .select('amount')
    .eq('business_id', business_id)

  const totalExpenses = (expenses ?? []).reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const gstOnExpenses = +(totalExpenses * 0.1).toFixed(2)

  // Merge: if draft has field_1b_gst_credits use it, otherwise derive from expenses
  const field1b = draft?.field_1b_gst_credits ?? gstOnExpenses

  // Fetch prior quarter for GST spike comparison
  const { data: priorDraft } = await supabaseAdmin
    .from('bas_drafts')
    .select('field_1a_gst_on_sales,net_gst')
    .eq('business_id', business_id)
    .eq('period_start', pq.period_start.toISOString().slice(0, 10))
    .maybeSingle()

  // Aria Intelligence: 14-day reminder
  if (daysUntilDue >= 1 && daysUntilDue <= 14 && draft && draft.status !== 'lodged') {
    upsertAriaAction({
      business_id,
      category: 'compliance',
      priority: 'high',
      title: `BAS ${q.quarter} due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}`,
      recommendation: `Lodge your BAS for ${q.quarter} by ${q.due_date.toLocaleDateString('en-AU')}. Net GST: $${(draft.net_gst ?? 0).toFixed(0)}`,
      reason: 'ATO quarterly lodgement deadline approaching',
      source: 'compliance_page',
    }).catch(() => null)
  }

  // Aria Intelligence: GST spike > 20% vs prior quarter
  if (draft && priorDraft) {
    const cur = draft.field_1a_gst_on_sales ?? 0
    const prev = priorDraft.field_1a_gst_on_sales ?? 0
    if (prev > 0 && (cur - prev) / prev > 0.2) {
      upsertAriaAction({
        business_id,
        category: 'compliance',
        priority: 'high',
        title: `GST spike detected — ${q.quarter}`,
        recommendation: `GST collected is ${Math.round(((cur - prev) / prev) * 100)}% higher than prior quarter. Review before lodging.`,
        reason: `Prior: $${prev.toFixed(0)}, Current: $${cur.toFixed(0)}`,
        source: 'compliance_page',
      }).catch(() => null)
    }
  }

  return NextResponse.json({
    quarter: q.quarter,
    period_start: q.period_start.toISOString().slice(0, 10),
    period_end: q.period_end.toISOString().slice(0, 10),
    due_date: q.due_date.toISOString().slice(0, 10),
    days_until_due: daysUntilDue,
    draft: draft ? { ...draft, field_1b_gst_credits: field1b } : null,
    total_expenses: +totalExpenses.toFixed(2),
    gst_on_expenses: gstOnExpenses,
    prior_gst: priorDraft?.field_1a_gst_on_sales ?? null,
    tax_calendar: getAuTaxCalendar(),
  })
}

export const GET = withErrorCapture('compliance/bas', _GET)
