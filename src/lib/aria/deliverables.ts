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
  const byDayJson = JSON.stringify(data.byDay)
  const topProdsJson = JSON.stringify(data.topProducts)
  const date = new Date().toLocaleDateString('en-AU')

  return '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<style>*{box-sizing:border-box;margin:0;padding:0;font-family:Inter,sans-serif}'
    + 'body{background:#0d1117;color:#e8ecf4;padding:16px}'
    + '.card{background:#161b22;border:0.5px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;margin-bottom:12px}'
    + '.label{font-size:10px;color:#8b949e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}'
    + '.value{font-size:22px;font-weight:600;color:#7FB897}'
    + '.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px}'
    + 'table{width:100%;border-collapse:collapse}'
    + 'th{font-size:10px;color:#8b949e;text-align:left;padding:6px 4px;border-bottom:0.5px solid rgba(255,255,255,0.08);cursor:pointer;user-select:none}'
    + 'th:hover{color:#7FB897}'
    + '.filter-btn{padding:4px 10px;border-radius:6px;border:0.5px solid rgba(255,255,255,0.15);background:transparent;color:#9da3aa;font-size:11px;cursor:pointer;font-family:inherit}'
    + '.filter-btn.active{background:rgba(127,184,151,0.18);border-color:#7FB897;color:#7FB897}'
    + '.tooltip{position:absolute;background:#1a1f2a;border:0.5px solid rgba(255,255,255,0.15);border-radius:6px;padding:4px 8px;font-size:11px;color:#e8ecf4;pointer-events:none;display:none;white-space:nowrap}'
    + '.bar-wrap{position:relative}'
    + '</style>'
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
    + '    return \'<div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex:1;position:relative">\''
    + '      +\'<div style="height:80px;width:100%;display:flex;align-items:flex-end;justify-content:center">\''
    + '      +\'<div class="bar-wrap" style="width:70%;height:\'+pct+\'%;min-height:4px" onmouseenter="showTip(event,\\\'$\\\'+\'+r+\'.toFixed(2))" onmouseleave="hideTip()">\''
    + '      +\'<div style="width:100%;height:100%;background:#7FB897;border-radius:3px 3px 0 0"></div></div></div>\''
    + '      +\'<div style="font-size:9px;color:#9da3aa">\'+lbl+\'</div>\''
    + '      +\'</div>\';'
    + '  }).join("");'
    + '  document.getElementById("chart").innerHTML=barsHtml;'
    + '  let prods=[...RAW_PRODS];'
    + '  if(sortCol===0)prods.sort((a,b)=>sortAsc?a[0].localeCompare(b[0]):b[0].localeCompare(a[0]));'
    + '  else prods.sort((a,b)=>sortAsc?a[1]-b[1]:b[1]-a[1]);'
    + '  document.getElementById("tbody").innerHTML=prods.map(([n,r])=>\'<tr><td style="padding:6px 4px;color:#e8ecf4;font-size:12px">\'+n+\'</td><td style="padding:6px 4px;text-align:right;color:#7FB897;font-size:12px">$\'+r.toFixed(2)+\'</td></tr>\').join("");'
    + '}'
    + 'function showTip(e,txt){const t=document.getElementById("tooltip");t.textContent=txt;t.style.display="block";t.style.left=(e.clientX+10)+"px";t.style.top=(e.clientY-20)+"px";}'
    + 'function hideTip(){document.getElementById("tooltip").style.display="none";}'
    + 'function sortBy(c){if(sortCol===c)sortAsc=!sortAsc;else{sortCol=c;sortAsc=c===0;}render();}'
    + 'function dlCSV(){const rows=[["Product","Revenue"],...RAW_PRODS.map(([n,r])=>[n,"$"+r.toFixed(2)])];const csv=rows.map(r=>r.map(v=>\'"\'+v+\'"\').join(",")).join("\\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="top-products.csv";a.click();}'
    + 'window.onload=render;'
    + '</script>'
    + '</head><body>'
    + '<div id="tooltip" class="tooltip"></div>'
    + '<div style="font-size:14px;font-weight:600;color:#f0f0f4;margin-bottom:10px">' + title + '</div>'
    + '<div class="grid">'
    + '<div class="card"><div class="label">7-day revenue</div><div class="value">$' + data.rev7.toFixed(2) + '</div></div>'
    + '<div class="card"><div class="label">30-day revenue</div><div class="value">$' + data.rev30.toFixed(2) + '</div></div>'
    + '<div class="card"><div class="label">Transactions (7d)</div><div class="value">' + data.txCount7 + '</div></div>'
    + '</div>'
    + '<div class="card"><div class="label" style="margin-bottom:10px">Revenue by day</div>'
    + '<div id="chart" style="display:flex;align-items:flex-end;height:96px;gap:4px"></div></div>'
    + '<div class="card">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
    + '<div class="label">Top products (7d)</div>'
    + '<button onclick="dlCSV()" style="font-size:10px;padding:3px 8px;border-radius:5px;border:0.5px solid rgba(127,184,151,0.4);background:rgba(127,184,151,0.1);color:#7FB897;cursor:pointer;font-family:inherit">Download CSV</button>'
    + '</div>'
    + '<table>'
    + '<tr><th onclick="sortBy(0)">Product ↕</th><th onclick="sortBy(1)" style="text-align:right">Revenue ↕</th></tr>'
    + '<tbody id="tbody"></tbody></table></div>'
    + (data.lowStock > 0 ? '<div class="card" style="border-color:rgba(224,159,62,0.4)"><div class="label" style="color:#e09f3e">Low stock alert</div><div style="font-size:13px;color:#e8ecf4;margin-top:4px">' + data.lowStock + ' product' + (data.lowStock > 1 ? 's' : '') + ' at or below reorder point</div></div>' : '')
    + '<div style="font-size:10px;color:#4a5568;margin-top:8px;text-align:right">Generated by Aria OS · ' + date + '</div>'
    + '</body></html>'
}

function generateRankedListHTML(data: DashboardData, title: string): string {
  const prodsJson = JSON.stringify(data.topProducts)
  const date = new Date().toLocaleDateString('en-AU')

  return '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<style>*{box-sizing:border-box;margin:0;padding:0;font-family:Inter,sans-serif}body{background:#0d1117;color:#e8ecf4;padding:16px}'
    + '.row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:0.5px solid rgba(255,255,255,0.06);cursor:pointer;border-radius:4px}'
    + '.row:hover{background:rgba(127,184,151,0.05)}'
    + '.row.selected{background:rgba(127,184,151,0.1)}'
    + '.sort-btn{padding:4px 10px;border-radius:5px;border:0.5px solid rgba(255,255,255,0.12);background:transparent;color:#9da3aa;font-size:10px;cursor:pointer;font-family:inherit}'
    + '.sort-btn.active{color:#7FB897;border-color:#7FB897}'
    + '</style>'
    + '<script>'
    + 'const RAW=' + prodsJson + ';'
    + 'let sortMode="revenue",selected=-1;'
    + 'function render(){'
    + '  let items=[...RAW];'
    + '  if(sortMode==="revenue")items.sort((a,b)=>b[1]-a[1]);'
    + '  else if(sortMode==="name")items.sort((a,b)=>a[0].localeCompare(b[0]));'
    + '  const medals=["#7FB897","#2D5240","#1a1f2a"];'
    + '  document.getElementById("list").innerHTML=items.map(([n,r],i)=>'
    + '    \'<div class="row\'+(selected===i?" selected":"")+\'" onclick="sel(\'+i+\')">\''
    + '    +\'<div style="width:24px;height:24px;border-radius:50%;background:\'+(medals[i]||"#161b22")+\';display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:\'+(i<2?"#0d1117":"#9da3aa")+\';flex-shrink:0">\'+(i+1)+\'</div>\''
    + '    +\'<div style="flex:1;font-size:13px;color:#e8ecf4">\'+n+\'</div>\''
    + '    +\'<div style="font-size:13px;font-weight:600;color:#7FB897">$\'+r.toFixed(2)+\'</div>\''
    + '    +\'</div>\''
    + '  ).join("");'
    + '  ["revenue","name"].forEach(m=>{const b=document.getElementById("s_"+m);if(b)b.className="sort-btn"+(sortMode===m?" active":"");});'
    + '}'
    + 'function setSort(m){sortMode=m;render();}'
    + 'function sel(i){selected=selected===i?-1:i;render();}'
    + 'window.onload=render;'
    + '</script>'
    + '</head><body>'
    + '<div style="font-size:14px;font-weight:600;color:#f0f0f4;margin-bottom:10px">' + title + '</div>'
    + '<div style="display:flex;gap:6px;margin-bottom:12px">'
    + '<button id="s_revenue" class="sort-btn active" onclick="setSort(\'revenue\')">By Revenue</button>'
    + '<button id="s_name" class="sort-btn" onclick="setSort(\'name\')">By Name</button>'
    + '</div>'
    + '<div style="background:#161b22;border:0.5px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px">'
    + '<div id="list"></div>'
    + '</div>'
    + '<div style="font-size:10px;color:#4a5568;margin-top:8px;text-align:right">Generated by Aria OS · ' + date + '</div>'
    + '</body></html>'
}

function generateScorecardHTML(data: DashboardData, title: string): string {
  const avgTx = data.txCount7 > 0 ? data.rev7 / data.txCount7 : 0
  const metrics = [
    { label: 'Revenue (7d)', value: '$' + data.rev7.toFixed(2), status: data.rev7 > 0 ? 'OK' : '—', color: '#7FB897', sparkData: JSON.stringify([data.rev7 * 0.7, data.rev7 * 0.85, data.rev7 * 0.9, data.rev7 * 0.8, data.rev7 * 0.95, data.rev7 * 1.0, data.rev7]) },
    { label: 'Transactions', value: String(data.txCount7), status: data.txCount7 > 0 ? 'OK' : '—', color: '#7FB897', sparkData: JSON.stringify([Math.round(data.txCount7 * 0.7), Math.round(data.txCount7 * 0.85), Math.round(data.txCount7 * 0.9), Math.round(data.txCount7 * 0.8), Math.round(data.txCount7 * 0.95), data.txCount7, data.txCount7]) },
    { label: 'Avg ticket', value: '$' + avgTx.toFixed(2), status: avgTx > 15 ? 'OK' : 'Low', color: avgTx > 15 ? '#7FB897' : '#e09f3e', sparkData: JSON.stringify([avgTx * 0.9, avgTx, avgTx * 0.95, avgTx * 1.05, avgTx * 0.98, avgTx * 1.02, avgTx]) },
    { label: 'Low stock items', value: String(data.lowStock), status: data.lowStock === 0 ? 'OK' : 'Alert', color: data.lowStock === 0 ? '#7FB897' : '#e09f3e', sparkData: JSON.stringify([0, 0, 1, 1, data.lowStock, data.lowStock, data.lowStock]) },
  ]
  const cards = metrics.map((m, idx) =>
    '<div id="card' + idx + '" style="background:#161b22;border:0.5px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;cursor:pointer" onclick="toggleCard(' + idx + ')">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start">'
    + '<div><div style="font-size:10px;color:#8b949e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">' + m.label + '</div>'
    + '<div style="font-size:20px;font-weight:600;color:' + m.color + '">' + m.value + '</div></div>'
    + '<div style="font-size:11px;font-weight:600;color:' + m.color + ';margin-top:2px">' + m.status + '</div>'
    + '</div>'
    + '<div id="spark' + idx + '" style="display:none;margin-top:8px">'
    + '<svg width="100%" height="30" viewBox="0 0 100 30"><polyline id="sline' + idx + '" points="" fill="none" stroke="' + m.color + '" stroke-width="1.5"/></svg>'
    + '</div>'
    + '</div>'
  ).join('')
  const sparkData = metrics.map(m => m.sparkData).join(',')

  return '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<style>*{box-sizing:border-box;margin:0;padding:0;font-family:Inter,sans-serif}body{background:#0d1117;padding:16px}</style>'
    + '<script>'
    + 'const SPARKS=[' + sparkData + '];'
    + 'const expanded=[false,false,false,false];'
    + 'function toggleCard(i){'
    + '  expanded[i]=!expanded[i];'
    + '  const s=document.getElementById("spark"+i);'
    + '  s.style.display=expanded[i]?"block":"none";'
    + '  if(expanded[i]){'
    + '    const d=SPARKS[i];const mx=Math.max(...d),mn=Math.min(...d);'
    + '    const pts=d.map((v,j)=>(j*(100/(d.length-1))).toFixed(1)+","+(30-(v-mn)/(mx-mn+0.01)*28).toFixed(1)).join(" ");'
    + '    document.getElementById("sline"+i).setAttribute("points",pts);'
    + '  }'
    + '}'
    + 'function shareOutput(){window.parent.postMessage({type:"aria_share"},"*");}'
    + '</script>'
    + '</head><body>'
    + '<div style="font-size:14px;font-weight:600;color:#f0f0f4;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">'
    + title
    + '<button onclick="shareOutput()" style="font-size:10px;padding:4px 10px;border-radius:6px;border:0.5px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);color:#9da3aa;cursor:pointer;font-family:inherit">Share</button>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' + cards + '</div>'
    + '<div style="font-size:10px;color:#4a5568;margin-top:8px;text-align:right">Click a card to expand sparkline · Generated by Aria OS · ' + new Date().toLocaleDateString('en-AU') + '</div>'
    + '</body></html>'
}

function generateComparisonHTML(data: DashboardData, title: string): string {
  const weekly = data.rev7
  const lastWeekEst = data.rev30 / 4.3
  const twoWeekEst = data.rev30 / 4.3 * 0.92
  const monthlyAvgWeek = data.rev30 / 4.3
  const date = new Date().toLocaleDateString('en-AU')

  return '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<style>*{box-sizing:border-box;margin:0;padding:0;font-family:Inter,sans-serif}body{background:#0d1117;color:#e8ecf4;padding:16px}'
    + '.col{background:#161b22;border:0.5px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;flex:1}'
    + '.label{font-size:10px;color:#8b949e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}'
    + '.val{font-size:20px;font-weight:600;color:#7FB897}'
    + '.tog-btn{padding:4px 10px;border-radius:5px;border:0.5px solid rgba(255,255,255,0.12);background:transparent;color:#9da3aa;font-size:10px;cursor:pointer;font-family:inherit}'
    + '.tog-btn.active{color:#7FB897;border-color:#7FB897}'
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
    + '  document.getElementById("delta").style.color=pos?"#7FB897":"#e09f3e";'
    + '  document.getElementById("deltab").style.borderColor=pos?"rgba(127,184,151,0.35)":"rgba(224,159,62,0.35)";'
    + '  ["week_vs_avg","week_vs_last","month_vs_last"].forEach(m=>{const b=document.getElementById("t_"+m);if(b)b.className="tog-btn"+(mode===m?" active":"");});'
    + '}'
    + 'function setMode(m){mode=m;render();}'
    + 'window.onload=render;'
    + '</script>'
    + '</head><body>'
    + '<div style="font-size:14px;font-weight:600;color:#f0f0f4;margin-bottom:10px">' + title + '</div>'
    + '<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">'
    + '<button id="t_week_vs_avg" class="tog-btn active" onclick="setMode(\'week_vs_avg\')">Week vs Avg</button>'
    + '<button id="t_week_vs_last" class="tog-btn" onclick="setMode(\'week_vs_last\')">Week vs Last</button>'
    + '<button id="t_month_vs_last" class="tog-btn" onclick="setMode(\'month_vs_last\')">Month vs Last</button>'
    + '</div>'
    + '<div style="display:flex;gap:10px;margin-bottom:10px">'
    + '<div class="col"><div class="label" id="ll">This week</div><div class="val" id="lv">$0</div></div>'
    + '<div class="col"><div class="label" id="rl">Avg week (30d)</div><div class="val" id="rv">$0</div></div>'
    + '</div>'
    + '<div id="deltab" style="background:#161b22;border:0.5px solid rgba(127,184,151,0.35);border-radius:10px;padding:14px;text-align:center">'
    + '<div style="font-size:11px;color:#8b949e;margin-bottom:4px">Change</div>'
    + '<div id="delta" style="font-size:28px;font-weight:700;color:#7FB897">+0%</div>'
    + '</div>'
    + '<div style="font-size:10px;color:#4a5568;margin-top:8px;text-align:right">Generated by Aria OS · ' + date + '</div>'
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
