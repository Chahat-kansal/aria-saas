// INFRA-INNGEST-1 — extracted VERBATIM from src/app/api/cron/send-scheduled-reports/route.ts.
//
// Nothing here changed except its address: the helpers and the job body are byte-for-byte what the
// route already ran. The move was FORCED, not stylistic — Next.js only permits its own known
// exports (GET/POST/runtime/...) from a route.ts, so `runSendScheduledReports` could not live there
// and still be importable by the Inngest function (tsc: "Property 'runSendScheduledReports' is
// incompatible with index signature ... not assignable to type 'never'").
//
// The route now imports this and remains the authoritative Vercel cron path (dispatch/h20). The
// Inngest function imports the SAME symbol, so the two schedulers can never drift.

import { supabaseAdmin } from '@/lib/supabase-admin'
import { todayAEST, addDaysYmd, toAESTStart, toAESTEnd } from '@/lib/date-au'
import { REPORTABLE_STATUSES } from '@/lib/pos/revenue'

function computeNextSend(freq: string, dayOfWeek: number | null, dayOfMonth: number | null, hourAest: number): Date {
  const now = new Date()
  const hourUtc = (hourAest - 10 + 24) % 24

  if (freq === 'daily') {
    const next = new Date(now)
    next.setUTCHours(hourUtc, 0, 0, 0)
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1)
    return next
  }
  if (freq === 'weekly' && dayOfWeek !== null) {
    const next = new Date(now)
    next.setUTCHours(hourUtc, 0, 0, 0)
    const daysUntil = (dayOfWeek - now.getUTCDay() + 7) % 7 || 7
    next.setUTCDate(next.getUTCDate() + daysUntil)
    return next
  }
  if (freq === 'monthly' && dayOfMonth !== null) {
    const next = new Date(now)
    next.setUTCDate(Math.min(dayOfMonth, 28))
    next.setUTCHours(hourUtc, 0, 0, 0)
    if (next <= now) next.setUTCMonth(next.getUTCMonth() + 1)
    return next
  }
  return now
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildReportHtml(biz: { name: string | null; trading_name: string | null; city: string | null }, report: { label: string; pages_allowed: string[]; frequency: string }, metrics: { yesterday_revenue: number; monthly_revenue: number; yesterday_count: number }): string {
  const bizName = esc(biz.trading_name ?? biz.name ?? 'Your Business')
  const label = esc(report.label)
  const today = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const freqLabel = report.frequency === 'daily' ? 'Daily' : report.frequency === 'weekly' ? 'Weekly' : 'Monthly'

  const pagesHtml = report.pages_allowed.map(p =>
    `<span style="display:inline-block;padding:3px 10px;border-radius:99px;background:rgba(127,184,151,0.1);border:1px solid rgba(127,184,151,0.25);font-size:11px;color:#7FB897;margin:2px">${esc(p)}</span>`
  ).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0E1611; color: #F5F3EC; font-family: system-ui, -apple-system, sans-serif; font-size: 13px; line-height: 1.5; }
  .page { max-width: 750px; margin: 0 auto; padding: 32px 24px; }
  .header { text-align: center; padding-bottom: 28px; border-bottom: 1px solid rgba(127,184,151,0.2); margin-bottom: 32px; }
  .logo { font-family: Georgia,serif; font-style: italic; font-size: 26px; color: #7FB897; margin-bottom: 6px; }
  .biz-name { font-family: Georgia,serif; font-style: italic; font-size: 18px; color: #7FB897; margin-bottom: 4px; }
  h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
  .subtitle { font-size: 13px; color: #9ca3af; }
  .card-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 28px; }
  .card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 16px; }
  .card-label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .card-val { font-size: 24px; font-weight: 800; color: #7FB897; line-height: 1; }
  .card-sub { font-size: 11px; color: #6b7280; margin-top: 4px; }
  .section { margin-bottom: 24px; }
  .section-title { font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 10px; }
  .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.06); text-align: center; font-size: 11px; color: #4b5563; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="logo">Aria OS</div>
    <div class="biz-name">${bizName}</div>
    <h1>${label}</h1>
    <div class="subtitle">${freqLabel} Report · ${today}</div>
  </div>

  <div class="card-grid">
    <div class="card">
      <div class="card-label">Yesterday Revenue</div>
      <div class="card-val">A$${metrics.yesterday_revenue.toFixed(2)}</div>
      <div class="card-sub">${metrics.yesterday_count} transactions</div>
    </div>
    <div class="card">
      <div class="card-label">Last 30 Days</div>
      <div class="card-val">A$${metrics.monthly_revenue.toFixed(2)}</div>
      <div class="card-sub">Rolling 30-day total</div>
    </div>
    <div class="card">
      <div class="card-label">Daily Average</div>
      <div class="card-val">A$${(metrics.monthly_revenue / 30).toFixed(2)}</div>
      <div class="card-sub">Based on last 30 days</div>
    </div>
  </div>

  ${report.pages_allowed.length > 0 ? `
  <div class="section">
    <div class="section-title">Sections in this report</div>
    <div>${pagesHtml}</div>
  </div>` : ''}

  <div class="footer">
    ${esc(biz.city ? `${bizName} · ${esc(biz.city)}` : bizName)} · Generated by Aria OS · ariaos.site
  </div>
</div>
</body>
</html>`
}

function buildEmailHtml(bizName: string, label: string, frequency: string, shareUrl: string | null): string {
  const freqLabel = frequency === 'daily' ? 'daily' : frequency === 'weekly' ? 'weekly' : 'monthly'
  const month = new Date().toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
  const btn = 'display:inline-block;background:#2D5240;color:#fff;font-family:Inter,Arial,sans-serif;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0'

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Inter,Arial,sans-serif">
  <div style="max-width:540px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    <div style="background:#0E1611;padding:24px 28px">
      <div style="font-family:Georgia,serif;font-style:italic;font-size:20px;color:#7FB897">Aria OS</div>
      <div style="color:#9ca3af;font-size:12px;margin-top:3px">Scheduled ${freqLabel} report</div>
    </div>
    <div style="padding:24px 28px">
      <p style="margin:0 0 14px;font-size:15px;color:#111827;font-weight:600">${esc(bizName)}</p>
      <p style="margin:0 0 18px;font-size:14px;color:#374151">Your ${freqLabel} report <strong>${esc(label)}</strong> for ${month} is attached as a PDF.</p>
      ${shareUrl ? `<div style="text-align:center"><a href="${shareUrl}" style="${btn}">View live dashboard →</a></div>` : ''}
      <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:14px">
        This is an automated report from Aria OS. To stop receiving it, ask the business owner to remove your email from the schedule.
      </p>
    </div>
    <div style="background:#f9fafb;padding:12px 28px;text-align:center;border-top:1px solid #e5e7eb">
      <p style="margin:0;font-size:11px;color:#9ca3af">Aria OS · ariaos.site · Confidential</p>
    </div>
  </div>
</body>
</html>`
}

async function generatePDF(html: string): Promise<Buffer> {
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
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' } })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}

async function sendEmail(to: { name: string; email: string }[], subject: string, html: string, pdfBuffer: Buffer, filename: string): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) { console.warn('[send-scheduled-reports] RESEND_API_KEY not set'); return false }

  const toAddresses = to.map(r => r.email)
  const b64 = pdfBuffer.toString('base64')

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Aria <aria@ariaos.site>',
        to: toAddresses,
        subject,
        html,
        attachments: [{ content: b64, filename, type: 'application/pdf', disposition: 'attachment' }],
      }),
    })
    if (!res.ok) { console.error('[send-scheduled-reports] Resend error:', await res.text().catch(() => res.statusText)); return false }
    return true
  } catch (e) {
    console.error('[send-scheduled-reports] send failed:', (e as Error).message)
    return false
  }
}

/**
 * INFRA-INNGEST-1 — MINIMUM EXTRACTION, no behaviour change.
 *
 * The body below is byte-for-byte the work GET already did; only the two `NextResponse.json(x)`
 * returns became plain `x` returns, and GET now wraps the result. This exists so the Inngest
 * function can reuse the SAME logic instead of copy-pasting a second implementation that would
 * drift. The Vercel cron path (dispatch/h20 -> this GET) is untouched and still authoritative —
 * removing it is INFRA-INNGEST-2, once the Inngest version is verified firing.
 *
 * Auth stays on GET deliberately: verifyCronAuth() guards the PUBLIC HTTP surface. Inngest calls
 * this function in-process from an already-signature-verified request, so it needs no second gate.
 */
export async function runSendScheduledReports(): Promise<{ ok: true; sent: number; total?: number }> {
  const now = new Date()
  // INV-REPORTS — corrected column names (the table has send_hour_aest + page_path, NOT hour_aest/pages_allowed;
  // the prior select errored → this loop never ran). page_path drives whether it's an inventory report.
  const { data: due } = await supabaseAdmin
    .from('scheduled_pdf_reports')
    .select('id, business_id, label, frequency, day_of_week, day_of_month, send_hour_aest, recipients, page_path, include_share_link')
    .eq('is_active', true)
    .lt('next_send_at', now.toISOString())

  // Preserved EXACTLY as-is: this early return also skips the aria_scheduled_reports block
  // below. That is pre-existing behaviour and out of scope for INFRA-INNGEST-1 — not changed here.
  if (!due?.length) return { ok: true, sent: 0 }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ariaos.site'
  let sent = 0
  // INTEL-COMPUTE-3 — was server-local (UTC) yesterday, feeding both report loops below. Real
  // AEST calendar date via date-au.ts.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const yday = addDaysYmd(todayAEST(), -1)

  for (const report of due) {
    try {
      const [bizRes, ytdRes, monthRes] = await Promise.all([
        supabaseAdmin.from('businesses').select('id, name, trading_name, city').eq('id', report.business_id as string).maybeSingle(),
        // INTEL-COMPUTE-3 — was neq('voided') + hardcoded UTC boundary. status='completed' +
        // toAESTStart/toAESTEnd matches getRevenueSnapshot()'s canonical rule.
        supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', report.business_id as string).in('status', REPORTABLE_STATUSES).gte('created_at', toAESTStart(yday)).lte('created_at', toAESTEnd(yday)),
        supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', report.business_id as string).in('status', REPORTABLE_STATUSES).gte('created_at', thirtyDaysAgo),
      ])

      const biz = bizRes.data
      if (!biz) continue

      const ytdSales = ytdRes.data ?? []
      const monthSales = monthRes.data ?? []
      const yesterday_revenue = ytdSales.reduce((s: number, r: { total_amount?: unknown }) => s + Number(r.total_amount ?? 0), 0)
      const monthly_revenue = monthSales.reduce((s: number, r: { total_amount?: unknown }) => s + Number(r.total_amount ?? 0), 0)
      const yesterday_count = ytdSales.length

      // Get or create an internal share link for this business
      let shareUrl: string | null = null
      if (report.include_share_link) {
        const { data: existingLink } = await supabaseAdmin
          .from('dashboard_share_links')
          .select('token')
          .eq('business_id', report.business_id as string)
          .is('expires_at', null)
          .eq('is_active', true)
          .limit(1).maybeSingle()

        if (existingLink) {
          shareUrl = `${appUrl}/shared/${existingLink.token}`
        }
      }

      // INV-REPORTS — when the schedule points at an inventory report, render the REAL inventory PDF
      // (deterministic generators); otherwise fall back to the generic revenue summary.
      const pagePath = (report.page_path as string) ?? ''
      let pdfBuffer: Buffer
      if (pagePath.startsWith('/inventory/reports')) {
        const qs = new URLSearchParams(pagePath.split('?')[1] ?? '')
        const { generateReport } = await import('@/lib/inventory/reports')
        const { renderReportHtml, generateReportPdf } = await import('@/lib/inventory/report-pdf')
        const invData = await generateReport(supabaseAdmin, report.business_id as string, (qs.get('type') ?? 'sold_vs_stock') as Parameters<typeof generateReport>[2], (qs.get('period') === 'weekly' ? 'weekly' : 'daily'), null)
        pdfBuffer = await generateReportPdf(renderReportHtml(invData))
      } else {
        const html = buildReportHtml(biz as { name: string | null; trading_name: string | null; city: string | null }, { label: report.label as string, pages_allowed: [], frequency: report.frequency as string }, { yesterday_revenue, monthly_revenue, yesterday_count })
        pdfBuffer = await generatePDF(html)
      }

      const bizName = (biz.trading_name ?? biz.name) as string ?? 'Business'
      const month = now.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
      const subject = `${report.label} — ${month}`
      const emailHtml = buildEmailHtml(bizName, report.label as string, report.frequency as string, shareUrl)
      const filename = `aria-report-${(report.label as string).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`

      const recipients = (report.recipients as { name: string; email: string }[]) ?? []
      const ok = await sendEmail(recipients, subject, emailHtml, pdfBuffer, filename)

      const nextSend = computeNextSend(report.frequency as string, report.day_of_week as number | null, report.day_of_month as number | null, report.send_hour_aest as number ?? 8)
      await supabaseAdmin.from('scheduled_pdf_reports').update({
        last_sent_at: now.toISOString(),
        next_send_at: nextSend.toISOString(),
      }).eq('id', report.id)

      if (ok) sent++
    } catch (e) {
      console.error(`[send-scheduled-reports] Failed for report ${report.id}:`, (e as Error).message)
    }
  }

  // ── aria_scheduled_reports (scheduled by day-of-week/hour, not next_send_at) ──
  const todayStr = now.toISOString().slice(0, 10)
  const todayDow = now.getUTCDay() || 7 // 1=Mon … 7=Sun

  const { data: ariaSched } = await supabaseAdmin
    .from('aria_scheduled_reports')
    .select('id, business_id, name, report_type, frequency, send_on_days, recipients, last_sent_at')
    .eq('is_active', true)

  for (const sched of ariaSched ?? []) {
    try {
      // Skip if already sent today
      if (sched.last_sent_at && String(sched.last_sent_at).slice(0, 10) === todayStr) continue

      // Check day-of-week: send_on_days uses 1=Mon…7=Sun
      const sendOnDays = Array.isArray(sched.send_on_days)
        ? (sched.send_on_days as unknown[]).map(Number)
        : [1, 2, 3, 4, 5, 6, 7]
      if (!sendOnDays.includes(todayDow)) continue

      // For weekly/monthly, enforce minimum interval to prevent double-sends across crons
      if (sched.frequency === 'weekly' && sched.last_sent_at) {
        const daysSince = (now.getTime() - new Date(String(sched.last_sent_at)).getTime()) / 86400000
        if (daysSince < 7) continue
      }
      if (sched.frequency === 'monthly' && sched.last_sent_at) {
        const daysSince = (now.getTime() - new Date(String(sched.last_sent_at)).getTime()) / 86400000
        if (daysSince < 28) continue
      }

      const recipients = Array.isArray(sched.recipients)
        ? (sched.recipients as unknown[]).map(String).filter(Boolean)
        : []
      if (recipients.length === 0) continue

      const [bizRes, ytdRes, monthRes] = await Promise.all([
        supabaseAdmin.from('businesses').select('id, name, trading_name, city').eq('id', String(sched.business_id)).maybeSingle(),
        // INTEL-COMPUTE-3 — same fix as the scheduled_pdf_reports loop above.
        supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', String(sched.business_id)).in('status', REPORTABLE_STATUSES).gte('created_at', toAESTStart(yday)).lte('created_at', toAESTEnd(yday)),
        supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', String(sched.business_id)).in('status', REPORTABLE_STATUSES).gte('created_at', thirtyDaysAgo),
      ])

      const biz = bizRes.data
      if (!biz) continue

      const ytdSales2 = ytdRes.data ?? []
      const monthSales2 = monthRes.data ?? []
      const yrev = ytdSales2.reduce((s: number, r: { total_amount?: unknown }) => s + Number(r.total_amount ?? 0), 0)
      const mrev = monthSales2.reduce((s: number, r: { total_amount?: unknown }) => s + Number(r.total_amount ?? 0), 0)
      const ycnt = ytdSales2.length

      const reportLabel = String(sched.name)
      const reportFreq = String(sched.frequency ?? 'daily')

      const reportHtml = buildReportHtml(
        biz as { name: string | null; trading_name: string | null; city: string | null },
        { label: reportLabel, pages_allowed: [], frequency: reportFreq },
        { yesterday_revenue: yrev, monthly_revenue: mrev, yesterday_count: ycnt }
      )
      const pdfBuffer = await generatePDF(reportHtml)

      const bizName = (biz.trading_name ?? biz.name) as string ?? 'Business'
      const month = now.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
      const emailHtml = buildEmailHtml(bizName, reportLabel, reportFreq, null)
      const filename = 'aria-report-' + reportLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.pdf'
      const subject = reportLabel + ' — ' + month

      const recips = recipients.map((e: string) => ({ name: 'Report Recipient', email: e }))
      const ok = await sendEmail(recips, subject, emailHtml, pdfBuffer, filename)

      await supabaseAdmin.from('aria_scheduled_reports').update({
        last_sent_at: now.toISOString(),
      }).eq('id', String(sched.id))

      if (ok) sent++
    } catch (e) {
      console.error('[send-scheduled-reports] aria_sched ' + String(sched.id) + ':', (e as Error).message)
    }
  }

  return { ok: true, sent, total: due.length + (ariaSched?.length ?? 0) }
}
