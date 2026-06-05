import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase-admin'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 })

export type DeliverableKind = 'dashboard' | 'comparison' | 'ranked_list' | 'scorecard'

export interface DeliverableResult {
  outputId: string
  html: string
  kind: DeliverableKind
  title: string
  data_snapshot: Record<string, unknown>
}

// ─── Kind classifier ──────────────────────────────────────────────────────────
export function classifyDeliverableKind(message: string): DeliverableKind | null {
  const m = message.toLowerCase()
  if (/\b(show me|build|create|give me|dashboard|overview chart|visuali[sz]e)\b/.test(m)) return 'dashboard'
  if (/\b(compare|vs|versus|side.by.side|against|benchmark)\b/.test(m)) return 'comparison'
  if (/\b(rank|top \d+|best|worst|highest|lowest|list of)\b/.test(m)) return 'ranked_list'
  if (/\b(scorecard|kpi|performance card|how (am|are) (i|we) (doing|performing))\b/.test(m)) return 'scorecard'
  return null
}

// ─── Data fetcher ─────────────────────────────────────────────────────────────
async function fetchDashboardData(businessId: string) {
  const since7d = new Date(Date.now() - 7 * 86400000).toISOString()
  const since30d = new Date(Date.now() - 30 * 86400000).toISOString()
  const [txn7, txn30, saleItems, stock] = await Promise.allSettled([
    supabaseAdmin.from('pos_sales').select('total_amount, created_at').eq('business_id', businessId).neq('status', 'voided').gte('created_at', since7d),
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId).neq('status', 'voided').gte('created_at', since30d),
    supabaseAdmin.from('pos_sale_items').select('product_name, quantity, unit_price').eq('business_id', businessId).gte('created_at', since7d),
    supabaseAdmin.from('pos_products').select('name, stock_quantity, reorder_point').eq('business_id', businessId).eq('is_active', true).not('stock_quantity', 'is', null),
  ])
  const txn7Data = txn7.status === 'fulfilled' ? (txn7.value.data ?? []) : []
  const txn30Data = txn30.status === 'fulfilled' ? (txn30.value.data ?? []) : []
  const itemsData = saleItems.status === 'fulfilled' ? (saleItems.value.data ?? []) : []
  const stockData = stock.status === 'fulfilled' ? (stock.value.data ?? []) : []

  const rev7 = txn7Data.reduce((s: number, r: { total_amount: number }) => s + Number(r.total_amount || 0), 0)
  const rev30 = txn30Data.reduce((s: number, r: { total_amount: number }) => s + Number(r.total_amount || 0), 0)

  const byDay: Record<string, number> = {}
  for (const t of txn7Data) {
    const day = (t as { created_at?: string }).created_at?.slice(0, 10) ?? ''
    byDay[day] = (byDay[day] || 0) + Number((t as { total_amount?: number }).total_amount || 0)
  }

  const prodTotals: Record<string, number> = {}
  for (const item of itemsData) {
    const name = String((item as { product_name?: string }).product_name ?? 'Unknown')
    prodTotals[name] = (prodTotals[name] || 0) + Number((item as { quantity?: number }).quantity || 1) * Number((item as { unit_price?: number }).unit_price || 0)
  }
  const topProducts = Object.entries(prodTotals).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const lowStock = stockData.filter((p: { stock_quantity: number; reorder_point: number }) => Number(p.stock_quantity) <= Number(p.reorder_point)).length

  return { rev7, rev30, byDay, topProducts, lowStock, txCount7: txn7Data.length }
}

type DashboardData = Awaited<ReturnType<typeof fetchDashboardData>>

// ─── HTML generators ──────────────────────────────────────────────────────────
function generateDashboardHTML(data: DashboardData, title: string): string {
  const dayEntries = Object.entries(data.byDay).sort()
  const maxRev = Math.max(...dayEntries.map(([, v]) => v), 1)

  const bars = dayEntries.map(([day, rev]) => {
    const pct = (rev / maxRev * 100).toFixed(1)
    const label = new Date(day).toLocaleDateString('en-AU', { weekday: 'short' })
    return '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1">'
      + '<div style="font-size:10px;color:#9da3aa">$' + rev.toFixed(0) + '</div>'
      + '<div style="height:' + pct + '%;min-height:4px;width:70%;background:#7FB897;border-radius:3px 3px 0 0"></div>'
      + '<div style="font-size:10px;color:#9da3aa">' + label + '</div>'
      + '</div>'
  }).join('')

  const topProdRows = data.topProducts.map(([name, rev]) =>
    '<tr><td style="padding:6px 4px;color:#e8ecf4;font-size:12px">' + name + '</td>'
    + '<td style="padding:6px 4px;text-align:right;color:#7FB897;font-size:12px;font-variant-numeric:tabular-nums">$' + rev.toFixed(2) + '</td></tr>'
  ).join('')

  return '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<style>*{box-sizing:border-box;margin:0;padding:0;font-family:Inter,sans-serif}'
    + 'body{background:#0d1117;color:#e8ecf4;padding:16px}'
    + '.card{background:#161b22;border:0.5px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;margin-bottom:12px}'
    + '.label{font-size:10px;color:#8b949e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}'
    + '.value{font-size:22px;font-weight:600;color:#7FB897}'
    + '.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}'
    + 'table{width:100%;border-collapse:collapse}'
    + 'th{font-size:10px;color:#8b949e;text-align:left;padding:6px 4px;border-bottom:0.5px solid rgba(255,255,255,0.08)}'
    + '</style></head><body>'
    + '<div style="font-size:14px;font-weight:600;color:#f0f0f4;margin-bottom:12px">' + title + '</div>'
    + '<div class="grid">'
    + '<div class="card"><div class="label">7-day revenue</div><div class="value">$' + data.rev7.toFixed(2) + '</div></div>'
    + '<div class="card"><div class="label">30-day revenue</div><div class="value">$' + data.rev30.toFixed(2) + '</div></div>'
    + '<div class="card"><div class="label">Transactions (7d)</div><div class="value">' + data.txCount7 + '</div></div>'
    + '</div>'
    + '<div class="card"><div class="label" style="margin-bottom:10px">Revenue by day (last 7 days)</div>'
    + '<div style="display:flex;align-items:flex-end;height:100px;gap:4px">' + bars + '</div></div>'
    + '<div class="card"><div class="label" style="margin-bottom:8px">Top products (7d)</div>'
    + '<table><tr><th>Product</th><th style="text-align:right">Revenue</th></tr>' + topProdRows + '</table></div>'
    + (data.lowStock > 0 ? '<div class="card" style="border-color:rgba(224,159,62,0.4)"><div class="label" style="color:#e09f3e">Low stock alert</div><div style="font-size:13px;color:#e8ecf4;margin-top:4px">' + data.lowStock + ' product' + (data.lowStock > 1 ? 's' : '') + ' at or below reorder point</div></div>' : '')
    + '<div style="font-size:10px;color:#4a5568;margin-top:8px;text-align:right">Generated by Aria OS · ' + new Date().toLocaleDateString('en-AU') + '</div>'
    + '</body></html>'
}

function generateRankedListHTML(data: DashboardData, title: string): string {
  const rows = data.topProducts.map(([name, rev], i) =>
    '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:0.5px solid rgba(255,255,255,0.06)">'
    + '<div style="width:24px;height:24px;border-radius:50%;background:' + (i === 0 ? '#7FB897' : i === 1 ? '#2D5240' : '#1a1f2a') + ';display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:' + (i < 2 ? '#0d1117' : '#9da3aa') + ';flex-shrink:0">' + (i + 1) + '</div>'
    + '<div style="flex:1;font-size:13px;color:#e8ecf4">' + name + '</div>'
    + '<div style="font-size:13px;font-weight:600;color:#7FB897;font-variant-numeric:tabular-nums">$' + rev.toFixed(2) + '</div>'
    + '</div>'
  ).join('')

  return '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<style>*{box-sizing:border-box;margin:0;padding:0;font-family:Inter,sans-serif}body{background:#0d1117;color:#e8ecf4;padding:16px}</style>'
    + '</head><body>'
    + '<div style="font-size:14px;font-weight:600;color:#f0f0f4;margin-bottom:14px">' + title + '</div>'
    + '<div style="background:#161b22;border:0.5px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px">'
    + (rows || '<div style="color:#8b949e;font-size:13px">No product data available for this period.</div>')
    + '</div>'
    + '<div style="font-size:10px;color:#4a5568;margin-top:8px;text-align:right">Generated by Aria OS · ' + new Date().toLocaleDateString('en-AU') + '</div>'
    + '</body></html>'
}

function generateScorecardHTML(data: DashboardData, title: string): string {
  const avgTx = data.txCount7 > 0 ? data.rev7 / data.txCount7 : 0
  const metrics = [
    { label: 'Revenue (7d)', value: '$' + data.rev7.toFixed(2), status: data.rev7 > 0 ? 'OK' : '—', color: '#7FB897' },
    { label: 'Transactions', value: String(data.txCount7), status: data.txCount7 > 0 ? 'OK' : '—', color: '#7FB897' },
    { label: 'Avg ticket', value: '$' + avgTx.toFixed(2), status: avgTx > 15 ? 'OK' : 'Low', color: avgTx > 15 ? '#7FB897' : '#e09f3e' },
    { label: 'Low stock items', value: String(data.lowStock), status: data.lowStock === 0 ? 'OK' : 'Alert', color: data.lowStock === 0 ? '#7FB897' : '#e09f3e' },
  ]
  const cards = metrics.map(m =>
    '<div style="background:#161b22;border:0.5px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start">'
    + '<div><div style="font-size:10px;color:#8b949e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">' + m.label + '</div>'
    + '<div style="font-size:20px;font-weight:600;color:' + m.color + '">' + m.value + '</div></div>'
    + '<div style="font-size:11px;font-weight:600;color:' + m.color + ';margin-top:2px">' + m.status + '</div>'
    + '</div></div>'
  ).join('')

  return '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<style>*{box-sizing:border-box;margin:0;padding:0;font-family:Inter,sans-serif}body{background:#0d1117;padding:16px}</style>'
    + '</head><body>'
    + '<div style="font-size:14px;font-weight:600;color:#f0f0f4;margin-bottom:12px">' + title + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' + cards + '</div>'
    + '<div style="font-size:10px;color:#4a5568;margin-top:8px;text-align:right">Generated by Aria OS · ' + new Date().toLocaleDateString('en-AU') + '</div>'
    + '</body></html>'
}

function generateComparisonHTML(data: DashboardData, title: string): string {
  const weekly = data.rev7
  const monthlyAvgWeek = data.rev30 / 4.3
  const delta = monthlyAvgWeek > 0 ? ((weekly - monthlyAvgWeek) / monthlyAvgWeek * 100).toFixed(1) : '0'
  const positive = Number(delta) >= 0

  return '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<style>*{box-sizing:border-box;margin:0;padding:0;font-family:Inter,sans-serif}body{background:#0d1117;color:#e8ecf4;padding:16px}'
    + '.col{background:#161b22;border:0.5px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;flex:1}'
    + '.label{font-size:10px;color:#8b949e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}'
    + '.val{font-size:20px;font-weight:600;color:#7FB897}</style>'
    + '</head><body>'
    + '<div style="font-size:14px;font-weight:600;color:#f0f0f4;margin-bottom:12px">' + title + '</div>'
    + '<div style="display:flex;gap:10px;margin-bottom:10px">'
    + '<div class="col"><div class="label">This week</div><div class="val">$' + weekly.toFixed(2) + '</div></div>'
    + '<div class="col"><div class="label">Avg week (30d)</div><div class="val">$' + monthlyAvgWeek.toFixed(2) + '</div></div>'
    + '</div>'
    + '<div style="background:#161b22;border:0.5px solid ' + (positive ? 'rgba(127,184,151,0.35)' : 'rgba(224,159,62,0.35)') + ';border-radius:10px;padding:14px;text-align:center">'
    + '<div style="font-size:11px;color:#8b949e;margin-bottom:4px">vs 30-day weekly average</div>'
    + '<div style="font-size:28px;font-weight:700;color:' + (positive ? '#7FB897' : '#e09f3e') + '">' + (positive ? '+' : '') + delta + '%</div>'
    + '</div>'
    + '<div style="font-size:10px;color:#4a5568;margin-top:8px;text-align:right">Generated by Aria OS · ' + new Date().toLocaleDateString('en-AU') + '</div>'
    + '</body></html>'
}

// ─── Main entry point ─────────────────────────────────────────────────────────
export async function generateDeliverable(
  businessId: string,
  conversationId: string | null,
  taskPrompt: string,
  kind: DeliverableKind,
  _industry: string = 'retail',
): Promise<DeliverableResult> {
  const start = Date.now()

  const data = await fetchDashboardData(businessId)

  const titleRes = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 60,
    messages: [{ role: 'user', content: 'Write a short 4-6 word title for this deliverable. Task: "' + taskPrompt + '". Kind: ' + kind + '. Return only the title, no quotes.' }],
  })
  const title = titleRes.content[0].type === 'text' ? titleRes.content[0].text.trim() : 'Business Overview'

  let html = ''
  switch (kind) {
    case 'dashboard':   html = generateDashboardHTML(data, title); break
    case 'ranked_list': html = generateRankedListHTML(data, title); break
    case 'scorecard':   html = generateScorecardHTML(data, title); break
    case 'comparison':  html = generateComparisonHTML(data, title); break
  }

  const { data: inserted, error } = await supabaseAdmin.from('aria_task_outputs').insert({
    business_id: businessId,
    conversation_id: conversationId,
    title,
    task_prompt: taskPrompt,
    output_kind: kind,
    render_html: html,
    data_snapshot: data as unknown as Record<string, unknown>,
    status: 'ready',
  }).select('id').single()

  if (error || !inserted) {
    throw new Error('Failed to persist deliverable: ' + (error?.message ?? 'no id returned'))
  }

  await supabaseAdmin.from('aria_ai_calls').insert({
    business_id: businessId,
    agent_key: 'deliverable',
    provider: 'anthropic',
    model_id: 'claude-haiku-4-5-20251001',
    model_provider: 'anthropic',
    role: 'analysis',
    input_tokens: titleRes.usage?.input_tokens ?? 0,
    output_tokens: titleRes.usage?.output_tokens ?? 0,
    cost_usd_cents: 1,
    latency_ms: Date.now() - start,
    success: true,
    request_summary: 'deliverable/' + kind,
    response_summary: title,
  })

  return { outputId: (inserted as { id: string }).id, html, kind, title, data_snapshot: data as unknown as Record<string, unknown> }
}
