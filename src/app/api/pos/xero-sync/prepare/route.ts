export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

interface JournalLine {
  description: string
  amount: number
  account_code: string
  type: 'debit' | 'credit'
}

interface PreviewPayload {
  sales_count: number
  total_revenue: number
  total_tax: number
  total_ex_gst: number
  by_method: Record<string, number>
  journal_lines: JournalLine[]
}

async function _POST(req: Request, _ctx: unknown, { businessId: bid }: BusinessContext) {
  const body = await req.json().catch(() => ({})) as { date?: string }
  const syncDate = body.date ?? new Date().toISOString().split('T')[0]

  if (!/^\d{4}-\d{2}-\d{2}$/.test(syncDate)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  }

  // Return existing pending preview if already prepared today
  const { data: existing } = await supabaseAdmin
    .from('xero_sync_previews')
    .select('*')
    .eq('business_id', bid)
    .eq('date', syncDate)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) return NextResponse.json({ preview: existing, cached: true })

  // Fetch day's sales
  const dayStart = syncDate + 'T00:00:00.000Z'
  const dayEnd   = syncDate + 'T23:59:59.999Z'

  const { data: sales } = await supabaseAdmin
    .from('pos_sales')
    .select('id, total_amount, tax_total, subtotal, payment_method, status')
    .eq('business_id', bid)
    .neq('status', 'voided')
    .gte('created_at', dayStart)
    .lte('created_at', dayEnd)

  if (!sales?.length) {
    return NextResponse.json({ preview: null, message: 'No sales for ' + syncDate })
  }

  const totalRevenue = sales.reduce((s, x) => s + Number(x.total_amount ?? 0), 0)
  const totalTax     = sales.reduce((s, x) => s + Number(x.tax_total ?? 0), 0)
  const totalEx      = +(totalRevenue - totalTax).toFixed(2)
  const byMethod: Record<string, number> = {}
  for (const s of sales) {
    const m = String(s.payment_method ?? 'other')
    byMethod[m] = +((byMethod[m] ?? 0) + Number(s.total_amount ?? 0)).toFixed(2)
  }

  const journalLines: JournalLine[] = [
    // Debit: cash / card clearing accounts
    ...Object.entries(byMethod).map(([method, amount]) => ({
      description: method.toUpperCase() + ' receipts — ' + syncDate,
      amount: +amount.toFixed(2),
      account_code: method === 'cash' ? '090' : '091',
      type: 'debit' as const,
    })),
    // Credit: sales revenue (ex GST)
    {
      description: 'Daily sales revenue — ' + syncDate + ' (' + sales.length + ' transactions)',
      amount: +totalEx.toFixed(2),
      account_code: '200',
      type: 'credit' as const,
    },
    // Credit: GST collected
    ...(totalTax > 0 ? [{
      description: 'GST collected — ' + syncDate,
      amount: +totalTax.toFixed(2),
      account_code: '820',
      type: 'credit' as const,
    }] : []),
  ]

  const payload: PreviewPayload = {
    sales_count: sales.length,
    total_revenue: +totalRevenue.toFixed(2),
    total_tax: +totalTax.toFixed(2),
    total_ex_gst: totalEx,
    by_method: byMethod,
    journal_lines: journalLines,
  }

  const { data: preview, error: insertErr } = await supabaseAdmin
    .from('xero_sync_previews')
    .insert({ business_id: bid, date: syncDate, status: 'pending', payload })
    .select()
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({ preview }, { status: 201 })
}

export const POST = withBusinessContext('pos/xero-sync/prepare', _POST)
