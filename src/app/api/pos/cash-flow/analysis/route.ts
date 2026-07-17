export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import Anthropic from '@anthropic-ai/sdk'

type Category = 'Rent' | 'Wages' | 'Stock' | 'Utilities' | 'Other'

function categorise(description: string | null, basiqCategory: string | null): Category {
  const desc = (description ?? '').toLowerCase()
  const cat = (basiqCategory ?? '').toLowerCase()

  if (/rent|lease|property/.test(desc) || /rent/.test(cat)) return 'Rent'
  if (/wage|payroll|salary|pay run|staff/.test(desc) || /wages|payroll|salary/.test(cat)) return 'Wages'
  if (/aldi|coles|woolworths|woolies|costco|supplier|wholesale|food service/.test(desc) || /groceries|food|wholesale/.test(cat)) return 'Stock'
  if (/electricity|power|water|gas|internet|phone|telstra|optus|origin|agl/.test(desc) || /utilities|energy/.test(cat)) return 'Utilities'
  return 'Other'
}

async function _GET(req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const { searchParams } = new URL(req.url)
  const periodParam = searchParams.get('period') ?? '30d'
  const periodDays = periodParam === '7d' ? 7 : periodParam === '90d' ? 90 : 30

  const now = new Date()
  const from = new Date(now)
  from.setDate(from.getDate() - periodDays)
  const fromStr = from.toISOString()

  // Bank transactions
  const { data: txns } = await supabaseAdmin
    .from('bank_transactions')
    .select('amount, direction, description, category, transaction_date, account_id')
    .eq('business_id', bid)
    .gte('transaction_date', fromStr.split('T')[0])
    .order('transaction_date', { ascending: false })

  // POS sales (credit inflow)
  const { data: sales } = await supabaseAdmin
    .from('pos_sales')
    .select('total_amount, created_at')
    .eq('business_id', bid)
    .neq('status', 'voided')
    .gte('created_at', fromStr)

  // Current balances across all bank accounts
  const { data: accounts } = await supabaseAdmin
    .from('bank_accounts')
    .select('id, balance, name, account_type')
    .eq('business_id', bid)

  const currentBalance = (accounts ?? []).reduce((s, a) => s + Number(a.balance ?? 0), 0)

  // Tally in/out from bank transactions
  let bankIn = 0, bankOut = 0
  const categoryBreakdown: Record<Category, number> = { Rent: 0, Wages: 0, Stock: 0, Utilities: 0, Other: 0 }

  for (const t of (txns ?? [])) {
    const amt = Math.abs(Number(t.amount ?? 0))
    if (t.direction === 'credit') {
      bankIn += amt
    } else {
      bankOut += amt
      const cat = categorise(t.description, t.category)
      categoryBreakdown[cat] += amt
    }
  }

  // POS sales add to total_in (avoid double-counting if also in bank feed)
  const posIn = (sales ?? []).reduce((s, x) => s + Number(x.total_amount ?? 0), 0)
  const totalIn = +(bankIn + posIn).toFixed(2)
  const totalOut = +bankOut.toFixed(2)
  const netCashFlow = +(totalIn - totalOut).toFixed(2)

  // Runway: current balance / avg daily outflow
  const avgDailyOut = periodDays > 0 ? totalOut / periodDays : 0
  const runwayDays = avgDailyOut > 0 ? Math.round(currentBalance / avgDailyOut) : null

  // Category percentages
  const categories = Object.entries(categoryBreakdown).map(([name, amount]) => ({
    name,
    amount: +amount.toFixed(2),
    pct: totalOut > 0 ? +((amount / totalOut) * 100).toFixed(1) : 0,
  })).sort((a, b) => b.amount - a.amount)

  // Weekly buckets for chart (most recent periodDays, by week)
  const weeklyMap: Record<string, { in: number; out: number }> = {}
  for (const t of (txns ?? [])) {
    if (!t.transaction_date) continue
    const d = new Date(t.transaction_date)
    const weekStart = new Date(d)
    weekStart.setDate(d.getDate() - d.getDay())
    const key = weekStart.toISOString().split('T')[0]
    if (!weeklyMap[key]) weeklyMap[key] = { in: 0, out: 0 }
    const amt = Math.abs(Number(t.amount ?? 0))
    if (t.direction === 'credit') weeklyMap[key].in += amt
    else weeklyMap[key].out += amt
  }
  const weekly = Object.entries(weeklyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, v]) => ({ week, in: +v.in.toFixed(2), out: +v.out.toFixed(2) }))

  // Recent transactions (last 20 debits)
  const recent = (txns ?? [])
    .filter(t => t.direction !== 'credit')
    .slice(0, 20)
    .map(t => ({
      date: t.transaction_date,
      description: t.description,
      amount: Math.abs(Number(t.amount ?? 0)),
      category: categorise(t.description, t.category),
    }))

  // AI insight
  let aiInsight = ''
  try {
    const topCat = categories[0]
    const runwayStr = runwayDays != null
      ? 'At this rate you have ' + runwayDays + ' days of runway.'
      : 'Runway could not be calculated — no outflow data.'
    const prompt = 'Period: ' + periodDays + ' days. Total in: $' + totalIn.toFixed(2) +
      ', total out: $' + totalOut.toFixed(2) +
      ', net: $' + netCashFlow.toFixed(2) +
      '. Current balance: $' + currentBalance.toFixed(2) +
      '. Biggest expense: ' + (topCat?.name ?? 'N/A') + ' at $' + (topCat?.amount.toFixed(2) ?? '0') + '.' +
      ' ' + runwayStr +
      ' Category split: ' + categories.map(c => c.name + ' ' + c.pct + '%').join(', ') + '.'
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      system: 'You are Aria, a financial assistant. Write 2-3 sharp sentences for a small business owner about their cash flow. Be specific, actionable, and warm. Under 60 words.',
      messages: [{ role: 'user', content: prompt }],
    })
    aiInsight = (msg.content[0] as { type: string; text: string }).text ?? ''
  } catch {
    // non-fatal
  }

  return NextResponse.json({
    period: periodParam,
    period_days: periodDays,
    total_in: totalIn,
    total_out: totalOut,
    net_cash_flow: netCashFlow,
    current_balance: +currentBalance.toFixed(2),
    runway_days: runwayDays,
    categories,
    weekly,
    recent,
    ai_insight: aiInsight,
  })
}

export const GET = withBusinessContext('pos/cash-flow/analysis', _GET)
