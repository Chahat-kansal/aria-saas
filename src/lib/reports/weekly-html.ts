import type { WeeklyAggregate } from './weekly-aggregate'

// WBI-2 — render a pos_weekly_reports row (report_data = WBI-1's WeeklyAggregate) into a clean,
// shareable HTML report. Pure formatting: every figure comes from report_data — no new queries, no
// invented numbers. Aria tokens: forest #2D5240 / sage #7FB897, Cormorant (headings/totals) + Outfit
// (body). No dependencies.

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const money = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = (n: number) => (Number(n) || 0).toLocaleString('en-AU')

function weekRange(weekStart: string, weekEnd: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }
  const s = new Date(weekStart + 'T00:00:00Z').toLocaleDateString('en-AU', { ...opts, timeZone: 'UTC' })
  const e = new Date(weekEnd + 'T00:00:00Z').toLocaleDateString('en-AU', { ...opts, timeZone: 'UTC' })
  return `${s} – ${e}`
}

// Direction-coloured change chip (up = sage, down = muted red). null = no prior-week baseline.
function changeChip(pct: number | null): string {
  if (pct == null) return `<span style="color:#9aa6a0;font-size:13px;">no prior-week baseline</span>`
  const up = pct >= 0
  const colour = up ? '#2D5240' : '#B4513F'
  const bg = up ? 'rgba(127,184,151,0.18)' : 'rgba(180,81,63,0.12)'
  return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${bg};color:${colour};font-size:13px;font-weight:600;">${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}% vs prior week</span>`
}

function kpiCard(label: string, value: string, sub = ''): string {
  return `<div style="flex:1;min-width:150px;background:#fff;border:1px solid #e6ece8;border-radius:14px;padding:18px 20px;">
    <div style="font-family:'Outfit',sans-serif;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#7a8a82;">${esc(label)}</div>
    <div style="font-family:'Cormorant',Georgia,serif;font-size:34px;font-weight:600;color:#2D5240;line-height:1.1;margin-top:4px;">${value}</div>
    ${sub ? `<div style="font-family:'Outfit',sans-serif;margin-top:6px;">${sub}</div>` : ''}
  </div>`
}

export function renderWeeklyReportHtml(report: WeeklyAggregate, businessName: string): string {
  const topRows = (report.top_products ?? []).slice(0, 10).map((p, i) => `
    <tr style="border-bottom:1px solid #eef2f0;">
      <td style="padding:10px 12px;color:#9aa6a0;font-family:'Outfit',sans-serif;">${i + 1}</td>
      <td style="padding:10px 12px;color:#26312c;font-family:'Outfit',sans-serif;">${esc(p.name)}</td>
      <td style="padding:10px 12px;text-align:right;color:#26312c;font-family:'Outfit',sans-serif;">${num(p.units)}</td>
      <td style="padding:10px 12px;text-align:right;color:#2D5240;font-weight:600;font-family:'Outfit',sans-serif;">${money(p.revenue)}</td>
    </tr>`).join('')

  const labourStr = report.labour_pct == null ? '—' : `${report.labour_pct.toFixed(1)}%`
  const labourNote = report.labour_pct == null
    ? 'No revenue this week to compute labour %.'
    : `${money(report.labour_cost)} of wages${report.labour_pct > 35 ? ' · above the 25–35% benchmark' : report.labour_pct < 20 ? ' · below benchmark' : ' · within the healthy 25–35% range'}`

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Weekly report — ${esc(businessName)} — ${esc(weekRange(report.week_start, report.week_end))}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant:wght@500;600;700&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;background:#f3f6f4;font-family:'Outfit',-apple-system,sans-serif;color:#26312c;">
<div style="max-width:760px;margin:0 auto;padding:36px 24px;">

  <header style="border-bottom:2px solid #2D5240;padding-bottom:18px;margin-bottom:24px;">
    <div style="font-family:'Outfit',sans-serif;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#7FB897;font-weight:600;">Weekly Business Report</div>
    <h1 style="font-family:'Cormorant',Georgia,serif;font-size:40px;font-weight:700;color:#2D5240;margin:6px 0 2px;">${esc(businessName)}</h1>
    <div style="font-family:'Outfit',sans-serif;font-size:15px;color:#5b6a62;">${esc(weekRange(report.week_start, report.week_end))}</div>
  </header>

  <section style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:14px;">
    ${kpiCard('Revenue', money(report.revenue), changeChip(report.revenue_change_pct))}
    ${kpiCard('Transactions', num(report.transactions), `<span style="font-family:'Outfit',sans-serif;color:#7a8a82;font-size:13px;">avg ticket ${money(report.avg_ticket)}</span>`)}
  </section>

  <section style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:26px;">
    ${kpiCard('Labour % of revenue', labourStr, `<span style="font-family:'Outfit',sans-serif;color:#7a8a82;font-size:13px;">${esc(labourNote)}</span>`)}
    ${kpiCard('Customers', num(report.active_customers), `<span style="font-family:'Outfit',sans-serif;color:#7a8a82;font-size:13px;">${num(report.new_customers)} new this week</span>`)}
  </section>

  <section style="background:#fff;border:1px solid #e6ece8;border-radius:14px;padding:6px 4px;margin-bottom:26px;">
    <h2 style="font-family:'Cormorant',Georgia,serif;font-size:24px;font-weight:600;color:#2D5240;margin:16px 16px 4px;">Top products</h2>
    ${report.top_products?.length ? `<table style="width:100%;border-collapse:collapse;">
      <thead><tr style="text-align:left;">
        <th style="padding:8px 12px;font-family:'Outfit',sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#7a8a82;font-weight:500;">#</th>
        <th style="padding:8px 12px;font-family:'Outfit',sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#7a8a82;font-weight:500;">Product</th>
        <th style="padding:8px 12px;text-align:right;font-family:'Outfit',sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#7a8a82;font-weight:500;">Units</th>
        <th style="padding:8px 12px;text-align:right;font-family:'Outfit',sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#7a8a82;font-weight:500;">Revenue</th>
      </tr></thead><tbody>${topRows}</tbody></table>`
      : `<p style="padding:0 16px 16px;color:#7a8a82;font-family:'Outfit',sans-serif;">No itemised product sales recorded this week.</p>`}
  </section>

  <footer style="text-align:center;color:#9aa6a0;font-size:12px;font-family:'Outfit',sans-serif;margin-top:8px;">
    Generated ${esc(new Date(report.generated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }))} · figures from verified point-of-sale data · Powered by Aria OS
  </footer>

</div></body></html>`
}
