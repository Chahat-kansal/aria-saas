import type { WeeklyReportData } from './weekly-data'
import type { WeeklyNarrative, BusinessRow } from './weekly-ai'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function fmt2(n: number) { return (Number(n) || 0).toFixed(2) }
function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }

function formatWeekRange(weekStart: Date): string {
  const end = new Date(weekStart.getTime() + 6 * 86400_000)
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }
  return weekStart.toLocaleDateString('en-AU', opts) + ' – ' + end.toLocaleDateString('en-AU', opts)
}

// ── SVG Revenue bar chart ─────────────────────────────────────────────────────
function revenueBarChart(data: WeeklyReportData): string {
  const days = data.revenueByDay
  const maxRev = Math.max(...days.map(d => d.revenue), 1)
  const priorMax = Math.max(data.priorWeekRevenue / 7, 1)
  const W = 560, H = 200, padL = 40, padB = 40, padT = 20, barW = 54, gap = 20
  const chartW = days.length * (barW + gap)
  const bestIdx = days.reduce((bi, d, i) => d.revenue > days[bi].revenue ? i : bi, 0)

  const barsSvg = days.map((d, i) => {
    const barH = Math.max((d.revenue / maxRev) * (H - padT - padB), 2)
    const x = padL + i * (barW + gap)
    const y = H - padB - barH
    const fill = i === bestIdx ? '#7FB897' : '#2D5240'
    const label = DAY_NAMES[d.dayOfWeek]
    const amt = '$' + fmt2(d.revenue)
    return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="4" fill="${fill}"/>
<text x="${x + barW / 2}" y="${H - padB + 14}" text-anchor="middle" font-size="11" fill="#9ca3af">${esc(label)}</text>
<text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" font-size="10" fill="#F5F3EC">${esc(amt)}</text>`
  }).join('\n')

  // Dotted prior-week average line
  const priorLineY = H - padB - Math.max((data.priorWeekRevenue / 7 / Math.max(maxRev, priorMax)) * (H - padT - padB), 2)
  const lineX1 = padL - 5
  const lineX2 = padL + days.length * (barW + gap) - gap + 5

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${barsSvg}
<line x1="${lineX1}" y1="${priorLineY}" x2="${lineX2}" y2="${priorLineY}" stroke="#4b5563" stroke-width="1.5" stroke-dasharray="4 3"/>
<text x="${lineX2 + 4}" y="${priorLineY + 4}" font-size="9" fill="#6b7280">Prior avg</text>
</svg>`
}

// ── SVG Payment breakdown horizontal bar ─────────────────────────────────────
function paymentBarChart(data: WeeklyReportData): string {
  const total = data.paymentMethods.reduce((s, p) => s + p.count, 1)
  const W = 500, H = 44
  const colors = ['#7FB897', '#2D5240', '#4b7c65', '#6b9b7e']
  let x = 0
  const rects = data.paymentMethods.map((p, i) => {
    const w = Math.max((p.count / total) * W, 2)
    const rect = `<rect x="${x}" y="0" width="${w}" height="${H}" fill="${colors[i % colors.length]}"/>`
    const label = `${p.method} ${((p.count / total) * 100).toFixed(0)}%`
    const textEl = w > 50
      ? `<text x="${x + w / 2}" y="${H / 2 + 5}" text-anchor="middle" font-size="12" fill="#F5F3EC" font-weight="600">${esc(label)}</text>`
      : ''
    x += w
    return rect + textEl
  }).join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="border-radius:8px;overflow:hidden">
${rects}
</svg>`
}

// ── Peak time heatmap ─────────────────────────────────────────────────────────
function peakHeatmap(data: WeeklyReportData): string {
  const maxTx = Math.max(...data.hourlyBuckets.map(b => b.transactions), 1)
  const bucketMap = new Map<string, number>()
  for (const b of data.hourlyBuckets) bucketMap.set(`${b.dayOfWeek}-${b.hour}`, b.transactions)

  const cellW = 22, cellH = 28, labelW = 36, hours = Array.from({ length: 24 }, (_, i) => i)
  const W = labelW + hours.length * cellW + 20
  const H = 12 + 7 * cellH + 20

  const rows = DAY_NAMES.map((day, d) => {
    const cells = hours.map(h => {
      const tx = bucketMap.get(`${d}-${h}`) ?? 0
      const alpha = tx > 0 ? 0.15 + (tx / maxTx) * 0.85 : 0
      const fill = `rgba(127,184,151,${alpha.toFixed(2)})`
      const x = labelW + h * cellW
      const y = 12 + d * cellH
      return `<rect x="${x}" y="${y}" width="${cellW - 2}" height="${cellH - 2}" rx="2" fill="${fill}"/>`
    }).join('')
    const y = 12 + d * cellH + cellH / 2 + 4
    return `<text x="2" y="${y}" font-size="10" fill="#9ca3af">${esc(day)}</text>` + cells
  }).join('\n')

  const hourLabels = [6, 9, 12, 15, 18, 21].map(h => {
    const x = labelW + h * cellW + cellW / 2
    return `<text x="${x}" y="${H - 4}" text-anchor="middle" font-size="9" fill="#6b7280">${h}:00</text>`
  }).join('\n')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${rows}
${hourLabels}
</svg>`
}

function htmlSection(title: string, content: string): string {
  return `<div class="section">
    <h2 class="section-title">${esc(title)}</h2>
    ${content}
  </div>`
}

function buildHTML(data: WeeklyReportData, narrative: WeeklyNarrative, business: BusinessRow, weekStart: Date): string {
  const bizName = esc(business.trading_name ?? business.name ?? 'Your Business')
  const weekRange = esc(formatWeekRange(weekStart))
  const generated = new Date().toLocaleString('en-AU', { timeZone: business.timezone ?? 'Australia/Melbourne' })

  const changeSign = data.revenueChangePercent != null && data.revenueChangePercent > 0 ? '+' : ''
  const changeStr = data.revenueChangePercent != null ? `${changeSign}${data.revenueChangePercent.toFixed(1)}%` : 'n/a'
  const changeColor = (data.revenueChangePercent ?? 0) >= 0 ? '#7FB897' : '#ef4444'

  // Section 2: Executive summary
  const insightsHtml = narrative.high_confidence_insights.map(i =>
    `<div class="insight-item"><span class="check">✓</span><span>${esc(i)}</span></div>`
  ).join('')
  const splitHtml = narrative.split_decisions.map(sd =>
    `<div class="split-item"><div class="split-topic">⚡ ${esc(sd.topic)}</div>
      <div class="split-views">
        <span class="view-label">Growth:</span> ${esc(sd.optimist_view)}<br>
        <span class="view-label">Risk:</span> ${esc(sd.critic_view)}<br>
        <span class="view-label">Strategy:</span> ${esc(sd.strategist_view)}
      </div></div>`
  ).join('')

  // Section 3: Revenue bar chart
  const bestDay = [...data.revenueByDay].sort((a, b) => b.revenue - a.revenue)[0]
  const revStats = `<div class="stat-row">
    <div class="stat-card"><div class="stat-val">$${fmt2(data.totalRevenue)}</div><div class="stat-lbl">Total revenue</div></div>
    <div class="stat-card"><div class="stat-val">${data.totalTransactions}</div><div class="stat-lbl">Transactions</div></div>
    <div class="stat-card"><div class="stat-val">$${fmt2(data.avgBasket)}</div><div class="stat-lbl">Avg basket</div></div>
    <div class="stat-card"><div class="stat-val" style="color:${changeColor}">${changeStr}</div><div class="stat-lbl">vs prior week</div></div>
    ${bestDay ? `<div class="stat-card"><div class="stat-val">${DAY_FULL[bestDay.dayOfWeek]}</div><div class="stat-lbl">Best day</div></div>` : ''}
  </div>`

  // Section 5: Top products
  const topRevHtml = data.topProductsByRevenue.slice(0, 10).map((p, i) =>
    `<div class="product-row"><span class="product-num">${i + 1}</span><span class="product-name">${esc(p.productName)}</span><span class="product-val">$${fmt2(p.revenue)}</span></div>`
  ).join('')
  const topVolHtml = data.topProductsByUnits.slice(0, 10).map((p, i) =>
    `<div class="product-row"><span class="product-num">${i + 1}</span><span class="product-name">${esc(p.productName)}</span><span class="product-val">${p.quantitySold} units</span></div>`
  ).join('')

  // Section 6: Hero products
  const hero1 = data.topProductsByRevenue[0]
  const hero2 = data.topProductsByUnits[0]

  // Section 7: Promos
  const promosHtml = narrative.promo_recommendations.map(p =>
    `<div class="promo-card">
      <div class="promo-title">${esc(p.title)}</div>
      <div class="promo-mechanic">${esc(p.mechanic)}</div>
      <div class="promo-meta"><span class="promo-timing">⏰ ${esc(p.timing)}</span><span class="promo-impact">📈 ${esc(p.expected_impact)}</span></div>
      <div class="urgency-badge urgency-${esc((p.urgency || 'low').toLowerCase())}">${esc((p.urgency || 'low').toUpperCase())}</div>
    </div>`
  ).join('')

  // Section 8: Suspicious
  let suspiciousSection = ''
  if (data.suspiciousTransactions.length === 0) {
    suspiciousSection = `<div class="ok-card">✓ No suspicious activity detected this week</div>`
  } else {
    const rows = data.suspiciousTransactions.map(f => {
      const localTime = new Date(f.createdAt).toLocaleString('en-AU', { timeZone: business.timezone ?? 'Australia/Melbourne' })
      return `<tr><td>${esc(localTime)}</td><td>$${fmt2(f.totalAmount)}</td><td>${esc(f.paymentMethod)}</td><td>${esc(f.servedBy ?? '—')}</td><td><span class="flag-tag">${esc(f.flagReason)}</span></td><td class="explanation">${esc(f.explanation)}</td></tr>`
    }).join('')
    suspiciousSection = `<table class="data-table"><thead><tr><th>Time</th><th>Amount</th><th>Method</th><th>Staff</th><th>Flag</th><th>Explanation</th></tr></thead><tbody>${rows}</tbody></table>
    ${narrative.suspicious_summary ? `<p class="suspicious-summary">${esc(narrative.suspicious_summary)}</p>` : ''}`
  }

  // Section 9: Register closures
  const shiftRows = data.shiftClosures.map(s => {
    const varAmt = (Math.abs(s.varianceCents) / 100).toFixed(2)
    const varColor = Math.abs(s.varianceCents) > 1000 ? '#f59e0b' : '#F5F3EC'
    return `<tr><td>${esc(s.cashierName)}</td><td>${esc(s.shiftStart ? new Date(s.shiftStart).toLocaleString('en-AU', { timeZone: business.timezone ?? 'Australia/Melbourne' }) : '—')}</td><td>$${fmt2(s.openingFloat)}</td><td>$${fmt2(s.closingFloat)}</td><td style="color:${varColor}">$${varAmt}</td><td>${s.totalVoids}</td><td>${s.totalRefunds}</td></tr>`
  }).join('')
  const shiftSection = shiftRows.length > 0
    ? `<table class="data-table"><thead><tr><th>Cashier</th><th>Shift start</th><th>Opening</th><th>Closing</th><th>Variance</th><th>Voids</th><th>Refunds</th></tr></thead><tbody>${shiftRows}</tbody></table>`
    : `<p style="color:#6b7280">No shift closures this week.</p>`

  // Section 11: Recommendations
  const recsHtml = [
    ...narrative.high_confidence_insights.slice(0, 4),
    ...narrative.split_decisions.slice(0, 2).map(sd => sd.strategist_view),
  ].map((item, i) => `<div class="rec-item"><span class="rec-num">${i + 1}</span><span>${esc(item)}</span></div>`).join('')

  const marginLine = data.estimatedGrossMarginPercent != null
    ? `<div class="stat-card"><div class="stat-val">${data.estimatedGrossMarginPercent.toFixed(1)}%</div><div class="stat-lbl">Est. gross margin</div></div>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0E1611; color: #F5F3EC; font-family: system-ui, -apple-system, sans-serif; font-size: 13px; line-height: 1.5; }
  .page { max-width: 750px; margin: 0 auto; padding: 0 8px; }

  /* Cover */
  .cover { text-align: center; padding: 48px 24px 40px; border-bottom: 1px solid rgba(127,184,151,0.2); margin-bottom: 32px; }
  .aria-logo { font-family: Georgia, serif; font-style: italic; font-size: 28px; color: #7FB897; letter-spacing: 1px; margin-bottom: 8px; }
  .cover h1 { font-size: 22px; font-weight: 700; color: #F5F3EC; margin-bottom: 6px; }
  .cover .biz-name { font-family: Georgia, serif; font-style: italic; font-size: 18px; color: #7FB897; margin-bottom: 6px; }
  .cover .week-range { font-size: 14px; color: #9ca3af; margin-bottom: 6px; }
  .cover .generated { font-size: 11px; color: #4b5563; }

  /* Sections */
  .section { margin-bottom: 36px; page-break-inside: avoid; }
  .section-title { font-family: Georgia, serif; font-style: italic; font-size: 17px; color: #7FB897; border-bottom: 1px solid rgba(127,184,151,0.15); padding-bottom: 6px; margin-bottom: 14px; }

  /* Exec summary */
  .summary-card { background: rgba(45,82,64,0.2); border: 1px solid rgba(127,184,151,0.25); border-radius: 10px; padding: 18px 20px; margin-bottom: 16px; font-size: 13px; color: #e5e7eb; line-height: 1.7; white-space: pre-wrap; }
  .insight-item { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 8px; font-size: 12px; color: #d1d5db; }
  .check { color: #7FB897; font-size: 14px; flex-shrink: 0; }
  .split-item { background: rgba(245,158,11,0.06); border: 1px solid rgba(245,158,11,0.2); border-radius: 8px; padding: 10px 14px; margin-bottom: 8px; font-size: 12px; }
  .split-topic { color: #f59e0b; font-weight: 600; margin-bottom: 6px; }
  .split-views { color: #d1d5db; line-height: 1.7; }
  .view-label { font-weight: 600; color: #9ca3af; }

  /* Stats */
  .stat-row { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
  .stat-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07); border-radius: 8px; padding: 10px 14px; min-width: 90px; }
  .stat-val { font-size: 18px; font-weight: 700; color: #F5F3EC; }
  .stat-lbl { font-size: 10px; color: #6b7280; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }

  /* Charts */
  .chart-wrap { background: rgba(255,255,255,0.02); border-radius: 8px; padding: 12px; overflow: hidden; }

  /* Products */
  .products-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .products-col h4 { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .product-row { display: flex; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 12px; }
  .product-num { width: 18px; font-size: 10px; color: #4b5563; flex-shrink: 0; }
  .product-name { flex: 1; color: #d1d5db; }
  .product-val { color: #7FB897; font-weight: 600; flex-shrink: 0; }

  /* Hero */
  .hero-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .hero-card { background: rgba(45,82,64,0.15); border: 1px solid rgba(127,184,151,0.3); border-radius: 10px; padding: 16px; }
  .hero-label { font-size: 10px; color: #7FB897; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
  .hero-name { font-family: Georgia, serif; font-style: italic; font-size: 16px; color: #F5F3EC; margin-bottom: 4px; }
  .hero-val { font-size: 13px; color: #9ca3af; }

  /* Promos */
  .promos-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .promo-card { background: rgba(45,82,64,0.15); border: 1px solid rgba(127,184,151,0.2); border-radius: 10px; padding: 14px; position: relative; }
  .promo-title { font-weight: 700; font-size: 13px; color: #F5F3EC; margin-bottom: 6px; }
  .promo-mechanic { font-size: 12px; color: #d1d5db; margin-bottom: 8px; line-height: 1.5; }
  .promo-meta { font-size: 11px; color: #9ca3af; margin-bottom: 6px; display: flex; flex-direction: column; gap: 2px; }
  .urgency-badge { display: inline-block; font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px; letter-spacing: 0.5px; }
  .urgency-high { background: rgba(239,68,68,0.15); color: #ef4444; }
  .urgency-medium { background: rgba(245,158,11,0.15); color: #f59e0b; }
  .urgency-low { background: rgba(127,184,151,0.15); color: #7FB897; }

  /* Suspicious */
  .ok-card { background: rgba(127,184,151,0.08); border: 1px solid rgba(127,184,151,0.25); border-radius: 8px; padding: 14px 18px; color: #7FB897; font-weight: 600; }
  .flag-tag { background: rgba(239,68,68,0.15); color: #ef4444; font-size: 10px; padding: 1px 5px; border-radius: 4px; font-weight: 600; white-space: nowrap; }
  .explanation { font-size: 11px; color: #9ca3af; }
  .suspicious-summary { margin-top: 10px; font-size: 12px; color: #d1d5db; line-height: 1.6; }

  /* Tables */
  .data-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .data-table th { text-align: left; padding: 6px 8px; font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(255,255,255,0.07); }
  .data-table td { padding: 7px 8px; border-bottom: 1px solid rgba(255,255,255,0.04); color: #d1d5db; vertical-align: top; }

  /* Recommendations */
  .rec-item { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 10px; font-size: 12px; color: #d1d5db; }
  .rec-num { background: rgba(127,184,151,0.2); color: #7FB897; font-weight: 700; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; }

  /* Footer */
  .footer { text-align: center; padding: 24px 0 16px; border-top: 1px solid rgba(255,255,255,0.06); margin-top: 32px; font-size: 11px; color: #4b5563; }
</style>
</head>
<body>
<div class="page">

  <!-- 1. Cover -->
  <div class="cover">
    <div class="aria-logo">Aria OS</div>
    <div class="biz-name">${bizName}</div>
    <h1>Weekly Business Report</h1>
    <div class="week-range">${weekRange}</div>
    <div class="generated">Generated ${esc(generated)}</div>
  </div>

  <!-- 2. Executive Summary -->
  ${htmlSection('Executive Summary', `
    <div class="summary-card">${esc(narrative.executive_summary)}</div>
    ${insightsHtml ? `<div style="margin-top:12px">${insightsHtml}</div>` : ''}
    ${splitHtml ? `<div style="margin-top:12px">${splitHtml}</div>` : ''}
  `)}

  <!-- 3. Revenue at a Glance -->
  ${htmlSection('Revenue at a Glance', `
    ${revStats}
    ${marginLine}
    <div class="chart-wrap">${revenueBarChart(data)}</div>
  `)}

  <!-- 4. Peak Time Heatmap -->
  ${htmlSection('When Your Customers Come In', `
    <p style="font-size:11px;color:#6b7280;margin-bottom:10px">Transaction count by day and hour. Darker = busier.</p>
    <div class="chart-wrap">${peakHeatmap(data)}</div>
  `)}

  <!-- 5. Top Products -->
  ${htmlSection('Top Products', `
    <div class="products-grid">
      <div class="products-col"><h4>By Revenue</h4>${topRevHtml}</div>
      <div class="products-col"><h4>By Units Sold</h4>${topVolHtml}</div>
    </div>
  `)}

  <!-- 6. Hero Products -->
  ${hero1 || hero2 ? htmlSection("Your Best Performers This Week", `
    <div class="hero-grid">
      ${hero1 ? `<div class="hero-card"><div class="hero-label">Top by Revenue</div><div class="hero-name">${esc(hero1.productName)}</div><div class="hero-val">$${fmt2(hero1.revenue)} — ${hero1.quantitySold} units</div></div>` : ''}
      ${hero2 ? `<div class="hero-card"><div class="hero-label">Top by Volume</div><div class="hero-name">${esc(hero2.productName)}</div><div class="hero-val">${hero2.quantitySold} units — $${fmt2(hero2.revenue)}</div></div>` : ''}
    </div>
  `) : ''}

  <!-- 7. Promo Recommendations -->
  ${narrative.promo_recommendations.length > 0 ? htmlSection("Aria's Promotions to Try", `
    <div class="promos-grid">${promosHtml}</div>
  `) : ''}

  <!-- 8. Suspicious Transactions -->
  ${htmlSection('Suspicious Transactions', suspiciousSection)}

  <!-- 9. Register Closures -->
  ${htmlSection('Register Closures', shiftSection)}

  <!-- 10. Payment Breakdown -->
  ${data.paymentMethods.length > 0 ? htmlSection('Payment Breakdown', `
    <div class="chart-wrap">${paymentBarChart(data)}</div>
    <div class="stat-row" style="margin-top:10px">
      ${data.paymentMethods.map(p => `<div class="stat-card"><div class="stat-val">${p.count}</div><div class="stat-lbl">${esc(p.method)}</div></div>`).join('')}
    </div>
  `) : ''}

  <!-- 11. Recommendations -->
  ${recsHtml ? htmlSection("Aria's Recommendations", recsHtml) : ''}

  <!-- 12. Footer -->
  <div class="footer">Generated by Aria OS · ariaos.site · Confidential</div>

</div>
</body>
</html>`
}

export async function generateWeeklyPDF(
  data: WeeklyReportData,
  narrative: WeeklyNarrative,
  business: BusinessRow,
  weekStart: Date,
): Promise<Buffer> {
  const html = buildHTML(data, narrative, business, weekStart)

  const puppeteer = await import('puppeteer')
  const browser = await puppeteer.default.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  try {
    const page = await browser.newPage()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.setContent(html, { waitUntil: 'networkidle0' as any })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
