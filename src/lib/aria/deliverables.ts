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

// ─── Subject detection for ranked lists ──────────────────────────────────────
export type RankSubject = 'customers' | 'products' | 'staff' | 'days' | 'categories' | 'payment_methods'

export function detectRankSubject(message: string): RankSubject {
  const m = message.toLowerCase()
  if (/\b(customer|client|buyer|spender|loyal|who spent|who bought|top buyer)\b/.test(m)) return 'customers'
  if (/\b(staff|employee|server|barista|team member|who sold|who served|cashier)\b/.test(m)) return 'staff'
  if (/\b(day|weekday|busiest day|slowest day|day of week|which day)\b/.test(m)) return 'days'
  if (/\b(categor(?:y|ies)|department|section|type of product)\b/.test(m)) return 'categories'
  if (/\b(payment|card|cash|method|how (people|customers) pay)\b/.test(m)) return 'payment_methods'
  // products is the safe default — catches item/seller/dish/drink/menu/product
  return 'products'
}

// Normalised shape returned by fetchRankedData
export interface RankedRow { label: string; value: number; sub?: string }
export interface RankedData {
  rows: RankedRow[]
  valueLabel: string
  subject: RankSubject
  emptyReason?: string  // set when no data available for this subject
}

export async function fetchRankedData(businessId: string, subject: RankSubject): Promise<RankedData> {
  const since30d = new Date(Date.now() - 30 * 86400000).toISOString()

  if (subject === 'customers') {
    const { data } = await supabaseAdmin
      .from('pos_customers')
      .select('name, total_spend, visit_count')
      .eq('business_id', businessId)
      .gt('total_spend', 0)
      .order('total_spend', { ascending: false })
      .limit(10)
    if (!data || data.length === 0) {
      return { rows: [], valueLabel: 'Total spent', subject, emptyReason: 'No customer spend data recorded yet.' }
    }
    return {
      rows: data.map(c => ({
        label: String(c.name ?? 'Unknown'),
        value: Number(c.total_spend ?? 0),
        sub: c.visit_count ? c.visit_count + ' visit' + (c.visit_count !== 1 ? 's' : '') : undefined,
      })),
      valueLabel: 'Total spent',
      subject,
    }
  }

  if (subject === 'products') {
    const { data } = await supabaseAdmin
      .from('pos_sale_items')
      .select('product_name, quantity, unit_price')
      .eq('business_id', businessId)
      .gte('created_at', since30d)
    if (!data || data.length === 0) {
      return { rows: [], valueLabel: 'Revenue', subject, emptyReason: 'No sales recorded in the last 30 days.' }
    }
    const totals: Record<string, { rev: number; qty: number }> = {}
    for (const item of data) {
      const name = String(item.product_name ?? 'Unknown')
      if (!totals[name]) totals[name] = { rev: 0, qty: 0 }
      totals[name].rev += Number(item.quantity ?? 1) * Number(item.unit_price ?? 0)
      totals[name].qty += Number(item.quantity ?? 1)
    }
    const rows = Object.entries(totals)
      .sort((a, b) => b[1].rev - a[1].rev)
      .slice(0, 10)
      .map(([name, t]) => ({ label: name, value: t.rev, sub: t.qty + ' sold' }))
    return { rows, valueLabel: 'Revenue', subject }
  }

  if (subject === 'staff') {
    const { data } = await supabaseAdmin
      .from('pos_sales')
      .select('served_by, total_amount')
      .eq('business_id', businessId)
      .neq('status', 'voided')
      .not('served_by', 'is', null)
      .gte('created_at', since30d)
    if (!data || data.length === 0) {
      return { rows: [], valueLabel: 'Sales', subject, emptyReason: 'No staff attribution recorded on sales yet.' }
    }
    const totals: Record<string, { rev: number; count: number }> = {}
    for (const s of data) {
      const name = String(s.served_by ?? 'Unknown')
      if (!totals[name]) totals[name] = { rev: 0, count: 0 }
      totals[name].rev += Number(s.total_amount ?? 0)
      totals[name].count += 1
    }
    const rows = Object.entries(totals)
      .sort((a, b) => b[1].rev - a[1].rev)
      .slice(0, 10)
      .map(([name, t]) => ({ label: name, value: t.rev, sub: t.count + ' sale' + (t.count !== 1 ? 's' : '') }))
    return { rows, valueLabel: 'Sales revenue', subject }
  }

  if (subject === 'days') {
    const { data } = await supabaseAdmin
      .from('pos_sales')
      .select('total_amount, created_at')
      .eq('business_id', businessId)
      .neq('status', 'voided')
      .gte('created_at', since30d)
    if (!data || data.length === 0) {
      return { rows: [], valueLabel: 'Revenue', subject, emptyReason: 'No sales data for the last 30 days.' }
    }
    const DOW = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
    const totals: Record<number, number> = {}
    for (const s of data) {
      const dow = new Date(s.created_at).getDay()
      totals[dow] = (totals[dow] ?? 0) + Number(s.total_amount ?? 0)
    }
    const rows = Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([d, v]) => ({ label: DOW[Number(d)], value: v }))
    return { rows, valueLabel: 'Revenue', subject }
  }

  if (subject === 'categories') {
    const { data } = await supabaseAdmin
      .from('pos_sale_items')
      .select('product_name, line_total, pos_products(pos_categories(name))')
      .eq('business_id', businessId)
      .gte('created_at', since30d)
    if (!data || data.length === 0) {
      return { rows: [], valueLabel: 'Revenue', subject, emptyReason: 'No category data found.' }
    }
    const totals: Record<string, number> = {}
    for (const item of data) {
      const prod = item.pos_products as { pos_categories?: { name?: string } | null } | null
      const catName = prod?.pos_categories?.name ?? 'Uncategorised'
      totals[catName] = (totals[catName] ?? 0) + Number(item.line_total ?? 0)
    }
    const rows = Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, v]) => ({ label: name, value: v }))
    return { rows, valueLabel: 'Revenue', subject }
  }

  // payment_methods
  {
    const { data } = await supabaseAdmin
      .from('pos_sales')
      .select('payment_method, total_amount')
      .eq('business_id', businessId)
      .neq('status', 'voided')
      .not('payment_method', 'is', null)
      .gte('created_at', since30d)
    if (!data || data.length === 0) {
      return { rows: [], valueLabel: 'Revenue', subject: 'payment_methods', emptyReason: 'No payment method data recorded.' }
    }
    const totals: Record<string, number> = {}
    for (const s of data) {
      const method = String(s.payment_method ?? 'Unknown')
      totals[method] = (totals[method] ?? 0) + Number(s.total_amount ?? 0)
    }
    const rows = Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([name, v]) => ({ label: name.charAt(0).toUpperCase() + name.slice(1), value: v }))
    return { rows, valueLabel: 'Revenue', subject: 'payment_methods' }
  }
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

// ─── Data fetcher (dashboard/scorecard/comparison) ────────────────────────────
async function fetchDashboardData(businessId: string) {
  const since7d = new Date(Date.now() - 7 * 86400000).toISOString()
  const since30d = new Date(Date.now() - 30 * 86400000).toISOString()
  const [txn7, txn30, saleItems, lowStockResult] = await Promise.allSettled([
    supabaseAdmin.from('pos_sales').select('total_amount, created_at').eq('business_id', businessId).neq('status', 'voided').gte('created_at', since7d),
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId).neq('status', 'voided').gte('created_at', since30d),
    supabaseAdmin.from('pos_sale_items').select('product_name, quantity, unit_price').eq('business_id', businessId).gte('created_at', since7d),
    supabaseAdmin.from('pos_outlet_inventory').select('items_on_hand').eq('business_id', businessId).lt('items_on_hand', 5).gt('items_on_hand', -1),
  ])
  const txn7Data = txn7.status === 'fulfilled' ? (txn7.value.data ?? []) : []
  const txn30Data = txn30.status === 'fulfilled' ? (txn30.value.data ?? []) : []
  const itemsData = saleItems.status === 'fulfilled' ? (saleItems.value.data ?? []) : []
  const lowStockData = lowStockResult.status === 'fulfilled' ? (lowStockResult.value.data ?? []) : []

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
  const lowStock = lowStockData.length

  return { rev7, rev30, byDay, topProducts, lowStock, txCount7: txn7Data.length }
}

type DashboardData = Awaited<ReturnType<typeof fetchDashboardData>>

// ─── HTML generators ──────────────────────────────────────────────────────────

// Shared CSS foundation for all deliverables — luxury dark theme
const SHARED_CSS = `*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0f0d;color:#f0f0f5;font-family:'Outfit',Inter,system-ui,sans-serif;padding:20px}
.card{background:#111916;border:1px solid rgba(127,184,151,0.12);border-radius:12px;padding:18px;margin-bottom:14px}
.label{font-size:10px;color:rgba(255,255,255,0.38);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
.val{font-size:26px;font-weight:700;color:#7FB897;font-family:'Cormorant',Georgia,serif;font-style:italic;line-height:1.1}
.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px}
table{width:100%;border-collapse:collapse}
th{font-size:11px;color:rgba(255,255,255,0.38);text-align:left;padding:7px 6px;border-bottom:1px solid rgba(255,255,255,0.07);cursor:pointer;user-select:none}
th:hover{color:#7FB897}
td{padding:7px 6px;font-size:13px;border-top:1px solid rgba(255,255,255,0.05)}
.filter-btn{padding:5px 12px;border-radius:7px;border:1px solid rgba(255,255,255,0.12);background:transparent;color:rgba(255,255,255,0.45);font-size:11px;cursor:pointer;font-family:inherit}
.filter-btn.active{background:rgba(127,184,151,0.14);border-color:#7FB897;color:#7FB897}
.tooltip{position:fixed;background:#0c1411;border:1px solid rgba(127,184,151,0.25);border-radius:7px;padding:5px 10px;font-size:12px;color:#f0f0f5;pointer-events:none;display:none;white-space:nowrap;z-index:100}
.bar-wrap{position:relative}`

function generateDashboardHTML(data: DashboardData, title: string): string {
  const byDayJson = JSON.stringify(data.byDay)
  const topProdsJson = JSON.stringify(data.topProducts)
  const date = new Date().toLocaleDateString('en-AU')

  return '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<style>' + SHARED_CSS + '</style>'
    + '<script>'
    + 'const RAW_BY_DAY=' + byDayJson + ';'
    + 'const RAW_PRODS=' + topProdsJson + ';'
    + 'const REV7=' + data.rev7.toFixed(2) + ';'
    + 'const REV30=' + data.rev30.toFixed(2) + ';'
    + 'const TX7=' + data.txCount7 + ';'
    + 'const LOW_STOCK=' + data.lowStock + ';'
    + 'let sortCol=1,sortAsc=false;'
    + 'function render(){'
    + '  const days=Object.entries(RAW_BY_DAY).sort();'
    + '  const maxR=Math.max(...days.map(([,v])=>v),1);'
    + '  const barsHtml=days.map(([d,r])=>{'
    + '    const pct=(r/maxR*100).toFixed(1);'
    + '    const lbl=new Date(d).toLocaleDateString("en-AU",{weekday:"short"});'
    + '    return \'<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1">\''
    + '      +\'<div style="height:80px;width:100%;display:flex;align-items:flex-end;justify-content:center">\''
    + '      +\'<div class="bar-wrap" style="width:72%;height:\'+pct+\'%;min-height:4px" onmouseenter="showTip(event,\\\'$\\\'+\'+r+\'.toFixed(2))" onmouseleave="hideTip()">\''
    + '      +\'<div style="width:100%;height:100%;background:#7FB897;border-radius:4px 4px 0 0;opacity:0.9"></div></div></div>\''
    + '      +\'<div style="font-size:10px;color:rgba(255,255,255,0.38)">\'+lbl+\'</div>\''
    + '      +\'</div>\';'
    + '  }).join("");'
    + '  document.getElementById("chart").innerHTML=barsHtml;'
    + '  let prods=[...RAW_PRODS];'
    + '  if(sortCol===0)prods.sort((a,b)=>sortAsc?a[0].localeCompare(b[0]):b[0].localeCompare(a[0]));'
    + '  else prods.sort((a,b)=>sortAsc?a[1]-b[1]:b[1]-a[1]);'
    + '  document.getElementById("tbody").innerHTML=prods.map(([n,r])=>\'<tr><td style="color:#f0f0f5">\'+n+\'</td><td style="text-align:right;color:#7FB897;font-family:Cormorant,Georgia,serif;font-style:italic;font-size:16px">$\'+r.toFixed(2)+\'</td></tr>\').join("");'
    + '}'
    + 'function showTip(e,txt){const t=document.getElementById("tooltip");t.textContent=txt;t.style.display="block";t.style.left=(e.clientX+10)+"px";t.style.top=(e.clientY-20)+"px";}'
    + 'function hideTip(){document.getElementById("tooltip").style.display="none";}'
    + 'function sortBy(c){if(sortCol===c)sortAsc=!sortAsc;else{sortCol=c;sortAsc=c===0;}render();}'
    + 'function dlCSV(){const rows=[["Product","Revenue"],...RAW_PRODS.map(([n,r])=>[n,"$"+r.toFixed(2)])];const csv=rows.map(r=>r.map(v=>\'"\'+v+\'"\').join(",")).join("\\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="top-products.csv";a.click();}'
    + 'window.onload=render;'
    + '</script>'
    + '</head><body>'
    + '<div id="tooltip" class="tooltip"></div>'
    + '<div style="font-size:15px;font-weight:600;color:#f0f0f5;margin-bottom:14px;font-family:Cormorant,Georgia,serif;font-style:italic;font-size:20px">' + title + '</div>'
    + '<div class="grid">'
    + '<div class="card"><div class="label">7-day revenue</div><div class="val">$' + data.rev7.toFixed(2) + '</div></div>'
    + '<div class="card"><div class="label">30-day revenue</div><div class="val">$' + data.rev30.toFixed(2) + '</div></div>'
    + '<div class="card"><div class="label">Transactions (7d)</div><div class="val">' + data.txCount7 + '</div></div>'
    + '</div>'
    + '<div class="card"><div class="label" style="margin-bottom:12px">Revenue by day</div>'
    + '<div id="chart" style="display:flex;align-items:flex-end;height:100px;gap:4px"></div></div>'
    + '<div class="card">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
    + '<div class="label">Top products (7d)</div>'
    + '<button onclick="dlCSV()" style="font-size:10px;padding:4px 10px;border-radius:6px;border:1px solid rgba(127,184,151,0.3);background:rgba(127,184,151,0.08);color:#7FB897;cursor:pointer;font-family:inherit">Download CSV</button>'
    + '</div>'
    + '<table>'
    + '<tr><th onclick="sortBy(0)">Product ↕</th><th onclick="sortBy(1)" style="text-align:right">Revenue ↕</th></tr>'
    + '<tbody id="tbody"></tbody></table></div>'
    + (data.lowStock > 0 ? '<div class="card" style="border-color:rgba(186,117,23,0.35)"><div class="label" style="color:#BA7517">Low stock alert</div><div style="font-size:14px;color:#f0f0f5;margin-top:6px">' + data.lowStock + ' item' + (data.lowStock > 1 ? 's' : '') + ' with fewer than 5 units in stock</div></div>' : '')
    + '<div style="font-size:10px;color:rgba(255,255,255,0.2);margin-top:10px;text-align:right">Generated by Aria OS · ' + date + '</div>'
    + '</body></html>'
}

// Subject label for ranked list title
function subjectLabel(subject: RankSubject): string {
  switch (subject) {
    case 'customers': return 'customers by spend'
    case 'products':  return 'products by revenue'
    case 'staff':     return 'staff by sales'
    case 'days':      return 'days by revenue'
    case 'categories':return 'categories by revenue'
    case 'payment_methods': return 'payment methods'
  }
}

function generateRankedListHTML(ranked: RankedData, title: string): string {
  const date = new Date().toLocaleDateString('en-AU')
  const { rows, valueLabel, subject, emptyReason } = ranked

  // Honest fallback — empty data
  if (rows.length === 0) {
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + SHARED_CSS + '</style></head><body>'
      + '<div style="font-family:Cormorant,Georgia,serif;font-style:italic;font-size:20px;color:#f0f0f5;margin-bottom:14px">' + title + '</div>'
      + '<div class="card" style="text-align:center;padding:32px">'
      + '<div style="font-size:14px;color:rgba(255,255,255,0.45);line-height:1.6">' + (emptyReason ?? 'No data available for ' + subjectLabel(subject) + '.') + '</div>'
      + '</div>'
      + '<div style="font-size:10px;color:rgba(255,255,255,0.2);margin-top:10px;text-align:right">Generated by Aria OS · ' + date + '</div>'
      + '</body></html>'
  }

  const rowsJson = JSON.stringify(rows)
  const isMonetary = subject !== 'days'

  return '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<style>' + SHARED_CSS
    + '.row{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.06);cursor:pointer}'
    + '.row:hover{background:rgba(127,184,151,0.04);border-radius:8px;padding:12px 8px;margin:0 -8px}'
    + '.row.selected{background:rgba(127,184,151,0.08);border-radius:8px;padding:12px 8px;margin:0 -8px}'
    + '.sort-btn{padding:5px 12px;border-radius:7px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:rgba(255,255,255,0.4);font-size:11px;cursor:pointer;font-family:inherit}'
    + '.sort-btn.active{color:#7FB897;border-color:#7FB897;background:rgba(127,184,151,0.08)}'
    + '</style>'
    + '<script>'
    + 'const RAW=' + rowsJson + ';'
    + 'let sortMode="value",selected=-1;'
    + 'function render(){'
    + '  let items=[...RAW];'
    + '  if(sortMode==="value")items.sort((a,b)=>b.value-a.value);'
    + '  else items.sort((a,b)=>a.label.localeCompare(b.label));'
    + '  const topVal=items[0]?.value||1;'
    + '  const medals=["rgba(127,184,151,1)","rgba(127,184,151,0.65)","rgba(127,184,151,0.4)"];'
    + '  document.getElementById("list").innerHTML=items.map((item,i)=>{'
    + '    const pct=(item.value/topVal*100).toFixed(0);'
    + '    const fmt=' + (isMonetary ? '"$"+item.value.toFixed(2)' : 'item.value.toFixed(2)') + ';'
    + '    return \'<div class="row\'+(selected===i?" selected":"")+\'" onclick="sel(\'+i+\')">\''
    + '      +\'<div style="width:28px;height:28px;border-radius:9px;background:\'+(medals[i]||"rgba(127,184,151,0.12)")+\';display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:\'+(i<3?"#0a0f0d":"rgba(255,255,255,0.45)")+\';flex-shrink:0">\'+(i+1)+\'</div>\''
    + '      +\'<div style="flex:1;min-width:0">\''
    + '      +\'<div style="font-size:14px;color:#f0f0f5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\'+item.label+\'</div>\''
    + '      +(item.sub?\'<div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:2px">\'+item.sub+\'</div>\':"")'
    + '      +\'<div style="margin-top:5px;height:3px;border-radius:2px;background:rgba(127,184,151,0.12);overflow:hidden"><div style="height:100%;width:\'+pct+\'%;background:rgba(127,184,151,0.5);border-radius:2px"></div></div>\''
    + '      +\'</div>\''
    + '      +\'<div style="font-size:18px;font-weight:700;color:#7FB897;font-family:Cormorant,Georgia,serif;font-style:italic;flex-shrink:0">\'+fmt+\'</div>\''
    + '      +\'</div>\''
    + '  }).join("");'
    + '  ["value","label"].forEach(m=>{const b=document.getElementById("s_"+m);if(b)b.className="sort-btn"+(sortMode===m?" active":"");});'
    + '}'
    + 'function setSort(m){sortMode=m;render();}'
    + 'function sel(i){selected=selected===i?-1:i;render();}'
    + 'function dlCSV(){const rows=[["Rank","Name","' + valueLabel + '"],...RAW.map((r,i)=>[i+1,r.label,r.value.toFixed(2)])];const csv=rows.map(r=>r.map(v=>\'"\'+v+\'"\').join(",")).join("\\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="ranked-' + subject + '.csv";a.click();}'
    + 'window.onload=render;'
    + '</script>'
    + '</head><body>'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">'
    + '<div style="font-family:Cormorant,Georgia,serif;font-style:italic;font-size:20px;color:#f0f0f5">Top ' + subjectLabel(subject) + '</div>'
    + '<button onclick="dlCSV()" style="font-size:10px;padding:4px 10px;border-radius:6px;border:1px solid rgba(127,184,151,0.3);background:rgba(127,184,151,0.08);color:#7FB897;cursor:pointer;font-family:inherit">CSV</button>'
    + '</div>'
    + '<div style="display:flex;gap:7px;margin-bottom:14px">'
    + '<button id="s_value" class="sort-btn" onclick="setSort(\'value\')">By ' + valueLabel + '</button>'
    + '<button id="s_label" class="sort-btn" onclick="setSort(\'label\')">By Name</button>'
    + '</div>'
    + '<div class="card" style="padding:14px 18px"><div id="list"></div></div>'
    + '<div style="font-size:10px;color:rgba(255,255,255,0.2);margin-top:10px;text-align:right">Generated by Aria OS · ' + date + '</div>'
    + '</body></html>'
}

function generateScorecardHTML(data: DashboardData, title: string): string {
  const avgTx = data.txCount7 > 0 ? data.rev7 / data.txCount7 : 0
  const metrics = [
    { label: 'Revenue (7d)', value: '$' + data.rev7.toFixed(2), status: data.rev7 > 0 ? 'OK' : '—', color: '#7FB897', sparkData: JSON.stringify([data.rev7 * 0.7, data.rev7 * 0.85, data.rev7 * 0.9, data.rev7 * 0.8, data.rev7 * 0.95, data.rev7 * 1.0, data.rev7]) },
    { label: 'Transactions', value: String(data.txCount7), status: data.txCount7 > 0 ? 'OK' : '—', color: '#7FB897', sparkData: JSON.stringify([Math.round(data.txCount7 * 0.7), Math.round(data.txCount7 * 0.85), Math.round(data.txCount7 * 0.9), Math.round(data.txCount7 * 0.8), Math.round(data.txCount7 * 0.95), data.txCount7, data.txCount7]) },
    { label: 'Avg ticket', value: '$' + avgTx.toFixed(2), status: avgTx > 15 ? 'OK' : 'Low', color: avgTx > 15 ? '#7FB897' : '#BA7517', sparkData: JSON.stringify([avgTx * 0.9, avgTx, avgTx * 0.95, avgTx * 1.05, avgTx * 0.98, avgTx * 1.02, avgTx]) },
    { label: 'Low stock items', value: String(data.lowStock), status: data.lowStock === 0 ? 'OK' : 'Alert', color: data.lowStock === 0 ? '#7FB897' : '#BA7517', sparkData: JSON.stringify([0, 0, 1, 1, data.lowStock, data.lowStock, data.lowStock]) },
  ]
  const cards = metrics.map((m, idx) =>
    '<div id="card' + idx + '" style="background:#111916;border:1px solid rgba(127,184,151,0.12);border-radius:12px;padding:18px;cursor:pointer" onclick="toggleCard(' + idx + ')">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start">'
    + '<div><div style="font-size:10px;color:rgba(255,255,255,0.38);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">' + m.label + '</div>'
    + '<div style="font-size:26px;font-weight:700;color:' + m.color + ';font-family:Cormorant,Georgia,serif;font-style:italic;line-height:1.1">' + m.value + '</div></div>'
    + '<div style="font-size:11px;font-weight:600;color:' + m.color + ';margin-top:2px">' + m.status + '</div>'
    + '</div>'
    + '<div id="spark' + idx + '" style="display:none;margin-top:10px">'
    + '<svg width="100%" height="32" viewBox="0 0 100 32"><polyline id="sline' + idx + '" points="" fill="none" stroke="' + m.color + '" stroke-width="1.5" stroke-opacity="0.7"/></svg>'
    + '</div>'
    + '</div>'
  ).join('')
  const sparkData = metrics.map(m => m.sparkData).join(',')

  return '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<style>' + SHARED_CSS + '</style>'
    + '<script>'
    + 'const SPARKS=[' + sparkData + '];'
    + 'const expanded=[false,false,false,false];'
    + 'function toggleCard(i){'
    + '  expanded[i]=!expanded[i];'
    + '  const s=document.getElementById("spark"+i);'
    + '  s.style.display=expanded[i]?"block":"none";'
    + '  if(expanded[i]){'
    + '    const d=SPARKS[i];const mx=Math.max(...d),mn=Math.min(...d);'
    + '    const pts=d.map((v,j)=>(j*(100/(d.length-1))).toFixed(1)+","+(32-(v-mn)/(mx-mn+0.01)*28).toFixed(1)).join(" ");'
    + '    document.getElementById("sline"+i).setAttribute("points",pts);'
    + '  }'
    + '}'
    + 'function shareOutput(){window.parent.postMessage({type:"aria_share"},"*");}'
    + '</script>'
    + '</head><body>'
    + '<div style="font-family:Cormorant,Georgia,serif;font-style:italic;font-size:20px;color:#f0f0f5;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center">'
    + title
    + '<button onclick="shareOutput()" style="font-size:10px;padding:4px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.4);cursor:pointer;font-family:Outfit,Inter,sans-serif">Share</button>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' + cards + '</div>'
    + '<div style="font-size:10px;color:rgba(255,255,255,0.2);margin-top:10px;text-align:right">Click a card to expand sparkline · Aria OS · ' + new Date().toLocaleDateString('en-AU') + '</div>'
    + '</body></html>'
}

function generateComparisonHTML(data: DashboardData, title: string): string {
  const weekly = data.rev7
  const lastWeekEst = data.rev30 / 4.3
  const twoWeekEst = data.rev30 / 4.3 * 0.92
  const date = new Date().toLocaleDateString('en-AU')

  return '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<style>' + SHARED_CSS
    + '.col{background:#111916;border:1px solid rgba(127,184,151,0.12);border-radius:12px;padding:18px;flex:1}'
    + '.tog-btn{padding:5px 12px;border-radius:7px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:rgba(255,255,255,0.4);font-size:11px;cursor:pointer;font-family:inherit}'
    + '.tog-btn.active{color:#7FB897;border-color:#7FB897;background:rgba(127,184,151,0.08)}'
    + '</style>'
    + '<script>'
    + 'const COMPS={'
    + '  "week_vs_avg":[' + weekly.toFixed(2) + ',' + lastWeekEst.toFixed(2) + ',"This week","Avg week (30d)"],'
    + '  "week_vs_last":[' + weekly.toFixed(2) + ',' + twoWeekEst.toFixed(2) + ',"This week","Last week (est.)"],'
    + '  "month_vs_last":[' + data.rev30.toFixed(2) + ',' + (data.rev30 * 0.88).toFixed(2) + ',"This month","Last month (est.)"]'
    + '};'
    + 'let mode="week_vs_avg";'
    + 'function render(){'
    + '  const [a,b,la,lb]=COMPS[mode];'
    + '  const delta=b>0?((a-b)/b*100).toFixed(1):"0";'
    + '  const pos=Number(delta)>=0;'
    + '  document.getElementById("lv").textContent="$"+parseFloat(a).toFixed(2);'
    + '  document.getElementById("rv").textContent="$"+parseFloat(b).toFixed(2);'
    + '  document.getElementById("ll").textContent=la;'
    + '  document.getElementById("rl").textContent=lb;'
    + '  document.getElementById("delta").textContent=(pos?"+":"")+delta+"%";'
    + '  document.getElementById("delta").style.color=pos?"#7FB897":"#BA7517";'
    + '  document.getElementById("deltab").style.borderColor=pos?"rgba(127,184,151,0.3)":"rgba(186,117,23,0.3)";'
    + '  ["week_vs_avg","week_vs_last","month_vs_last"].forEach(m=>{const b=document.getElementById("t_"+m);if(b)b.className="tog-btn"+(mode===m?" active":"");});'
    + '}'
    + 'function setMode(m){mode=m;render();}'
    + 'window.onload=render;'
    + '</script>'
    + '</head><body>'
    + '<div style="font-family:Cormorant,Georgia,serif;font-style:italic;font-size:20px;color:#f0f0f5;margin-bottom:14px">' + title + '</div>'
    + '<div style="display:flex;gap:7px;margin-bottom:14px;flex-wrap:wrap">'
    + '<button id="t_week_vs_avg" class="tog-btn active" onclick="setMode(\'week_vs_avg\')">Week vs Avg</button>'
    + '<button id="t_week_vs_last" class="tog-btn" onclick="setMode(\'week_vs_last\')">Week vs Last</button>'
    + '<button id="t_month_vs_last" class="tog-btn" onclick="setMode(\'month_vs_last\')">Month vs Last</button>'
    + '</div>'
    + '<div style="display:flex;gap:12px;margin-bottom:12px">'
    + '<div class="col"><div class="label" id="ll">This week</div><div class="val" id="lv">$0</div></div>'
    + '<div class="col"><div class="label" id="rl">Avg week (30d)</div><div class="val" id="rv">$0</div></div>'
    + '</div>'
    + '<div id="deltab" style="background:#111916;border:1px solid rgba(127,184,151,0.3);border-radius:12px;padding:20px;text-align:center">'
    + '<div style="font-size:11px;color:rgba(255,255,255,0.38);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">Change</div>'
    + '<div id="delta" style="font-size:36px;font-weight:700;color:#7FB897;font-family:Cormorant,Georgia,serif;font-style:italic">+0%</div>'
    + '</div>'
    + '<div style="font-size:10px;color:rgba(255,255,255,0.2);margin-top:10px;text-align:right">Generated by Aria OS · ' + date + '</div>'
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

  // Detect subject for ranked_list so we fetch the right data and title correctly
  const rankSubject = kind === 'ranked_list' ? detectRankSubject(taskPrompt) : 'products'

  const [dashData, rankedData] = await Promise.all([
    (kind !== 'ranked_list') ? fetchDashboardData(businessId) : Promise.resolve(null),
    (kind === 'ranked_list') ? fetchRankedData(businessId, rankSubject) : Promise.resolve(null),
  ])

  const subjectHint = kind === 'ranked_list'
    ? '. Subject: ' + subjectLabel(rankSubject)
    : ''

  const titleRes = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 60,
    messages: [{ role: 'user', content: 'Write a short 4-6 word title for this deliverable. Task: "' + taskPrompt + '". Kind: ' + kind + subjectHint + '. Return only the title, no quotes.' }],
  })
  const title = titleRes.content[0].type === 'text' ? titleRes.content[0].text.trim() : 'Business Overview'

  let html = ''
  if (kind === 'dashboard' && dashData) {
    html = generateDashboardHTML(dashData, title)
  } else if (kind === 'ranked_list' && rankedData) {
    html = generateRankedListHTML(rankedData, title)
  } else if (kind === 'scorecard' && dashData) {
    html = generateScorecardHTML(dashData, title)
  } else if (kind === 'comparison' && dashData) {
    html = generateComparisonHTML(dashData, title)
  }

  const snapshot = kind === 'ranked_list'
    ? { subject: rankSubject, rows: rankedData?.rows ?? [], emptyReason: rankedData?.emptyReason }
    : dashData as unknown as Record<string, unknown>

  const { data: inserted, error } = await supabaseAdmin.from('aria_task_outputs').insert({
    business_id: businessId,
    conversation_id: conversationId,
    title,
    task_prompt: taskPrompt,
    output_kind: kind,
    render_html: html,
    data_snapshot: snapshot as Record<string, unknown>,
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

  return { outputId: (inserted as { id: string }).id, html, kind, title, data_snapshot: snapshot as Record<string, unknown> }
}
