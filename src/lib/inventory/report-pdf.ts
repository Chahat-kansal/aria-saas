import type { ReportData, ReportSection } from '@/lib/inventory/reports'

// INV-REPORTS — branded, printable PDF for an inventory report. Dashboard palette (forest #2D5240 + sage
// #7FB897), Cormorant italic display + Outfit body. Renders the REAL computed sections (no raw dump): KPIs,
// per-section tables with honest empty states, period + business + generated-at. Reused by the export routes
// and the scheduled-email cron.

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
const money = (n: number) => `$${(Number(n) || 0).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

function sectionHtml(s: ReportSection): string {
  if (!s.rows.length) {
    return `<div class="section"><div class="sec-title">${esc(s.title)}</div><div class="empty">${esc(s.empty ?? 'No data for this period.')}</div></div>`
  }
  const head = s.columns.map((c, i) => `<th style="text-align:${i === 0 ? 'left' : 'right'}">${esc(c)}</th>`).join('')
  const body = s.rows.map(r => `<tr>${r.map((c, i) => `<td style="text-align:${i === 0 ? 'left' : 'right'}">${esc(c)}</td>`).join('')}</tr>`).join('')
  const totalRow = s.total_row ? `<tr class="total">${s.total_row.map((c, i) => `<td style="text-align:${i === 0 ? 'left' : 'right'}">${esc(c)}</td>`).join('')}</tr>` : ''
  return `<div class="section"><div class="sec-title">${esc(s.title)}</div><table><thead><tr>${head}</tr></thead><tbody>${body}${totalRow}</tbody></table></div>`
}

export function renderReportHtml(d: ReportData): string {
  const genAt = new Date(d.generated_at).toLocaleString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const periodLabel = d.period === 'daily' ? 'Daily' : 'Weekly'
  const kpis = d.kpis
  const kpiCards = kpis ? [
    ['Stock at cost', money(kpis.stock_at_cost)],
    ['Stock at retail', money(kpis.stock_at_retail)],
    ['Units sold', String(kpis.units_sold)],
    ['Shrinkage', money(kpis.shrinkage_dollars)],
  ].map(([l, v]) => `<div class="kpi"><div class="kpi-l">${esc(l)}</div><div class="kpi-v">${esc(v)}</div></div>`).join('') : ''
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@1,600&family=Outfit:wght@300;400;500;600;700&display=swap">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Outfit',system-ui,sans-serif;color:#1A2620;font-size:12px;line-height:1.5;background:#fff}
  .page{max-width:760px;margin:0 auto;padding:8px 4px}
  .header{background:linear-gradient(135deg,#2D5240,#244236);color:#fff;border-radius:14px;padding:22px 24px;margin-bottom:18px}
  .brand{font-family:'Cormorant',Georgia,serif;font-style:italic;font-size:22px;color:#7FB897}
  .biz{font-size:13px;color:#A9C3B4;margin-top:1px}
  h1{font-family:'Cormorant',Georgia,serif;font-style:italic;font-size:30px;font-weight:600;margin-top:12px}
  .sub{font-size:12px;color:#A9C3B4;margin-top:2px}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}
  .kpi{border:1px solid #ECEEF3;border-radius:12px;padding:12px 14px}
  .kpi-l{font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#8A93A2}
  .kpi-v{font-family:'Cormorant',Georgia,serif;font-style:italic;font-size:24px;font-weight:600;color:#2D5240;margin-top:3px}
  .section{margin-bottom:20px}
  .sec-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#5F6E63;margin-bottom:8px}
  table{width:100%;border-collapse:collapse;font-size:11.5px}
  th{font-size:9px;text-transform:uppercase;letter-spacing:.04em;color:#8A93A2;padding:7px 10px;border-bottom:1.5px solid #ECEEF3}
  td{padding:7px 10px;border-bottom:1px solid #F4F6F9}
  tr.total td{font-weight:700;color:#2D5240;border-top:1.5px solid #ECEEF3;border-bottom:none}
  .empty{font-style:italic;color:#8A93A2;padding:14px;background:#F4F6F9;border-radius:10px;font-size:12px}
  .note{font-size:10px;color:#8A93A2;border-top:1px solid #ECEEF3;padding-top:10px;margin-top:16px;line-height:1.5}
  .foot{text-align:center;font-size:10px;color:#B6BDC6;margin-top:18px}
</style></head><body><div class="page">
  <div class="header">
    <div class="brand">Aria OS</div><div class="biz">${esc(d.business_name)}</div>
    <h1>${esc(d.title)}</h1>
    <div class="sub">${periodLabel} report · ${esc(d.period_label)} · generated ${esc(genAt)}</div>
  </div>
  ${kpis ? `<div class="kpis">${kpiCards}</div>` : ''}
  ${d.sections.map(sectionHtml).join('')}
  ${d.note ? `<div class="note">${esc(d.note)} · All figures computed from live data — no estimates.</div>` : ''}
  <div class="foot">Aria OS · ariaos.site · Confidential — generated for ${esc(d.business_name)}</div>
</div></body></html>`
}

/** Render HTML → PDF buffer (puppeteer-core + @sparticuz/chromium), same path the report email uses. */
export async function generateReportPdf(html: string): Promise<Buffer> {
  const chromium = (await import('@sparticuz/chromium')).default
  const puppeteer = (await import('puppeteer-core')).default
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
    defaultViewport: { width: 1200, height: 1600 },
  })
  try {
    const page = await browser.newPage()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.setContent(html, { waitUntil: 'networkidle0' as any })
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' } })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
