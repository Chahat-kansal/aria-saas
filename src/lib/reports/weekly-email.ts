import { supabaseAdmin } from '@/lib/supabase-admin'
import type { WeeklyReportData } from './weekly-data'
import type { WeeklyNarrative, BusinessRow } from './weekly-ai'

function formatWeekRange(weekStart: Date): string {
  const end = new Date(weekStart.getTime() + 6 * 86400_000)
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }
  return weekStart.toLocaleDateString('en-AU', opts) + ' – ' + end.toLocaleDateString('en-AU', opts)
}

function buildEmailHtml(
  biz: BusinessRow,
  narrative: WeeklyNarrative,
  weekStart: Date,
  pdfUrl: string | null,
): string {
  const weekRange = formatWeekRange(weekStart)
  const ownerName = biz.trading_name ?? biz.name ?? 'there'
  const btnStyle = 'display:inline-block;background:#2D5240;color:#fff;font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:600;padding:14px 28px;border-radius:8px;text-decoration:none;margin:20px 0'
  const summaryLines = narrative.executive_summary.split('\n').filter(Boolean)
  const summaryHtml = summaryLines.map(l => `<p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:#374151">${l}</p>`).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Inter,Arial,sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">

    <!-- Header -->
    <div style="background:#0E1611;padding:28px 32px">
      <div style="font-family:Georgia,serif;font-style:italic;font-size:22px;color:#7FB897;letter-spacing:1px">Aria OS</div>
      <div style="color:#9ca3af;font-size:12px;margin-top:4px">Weekly Business Intelligence Report</div>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px">
      <p style="margin:0 0 16px;font-size:15px;color:#111827">Good morning, ${ownerName.split(' ')[0]},</p>
      <p style="margin:0 0 20px;font-size:14px;color:#374151">Your weekly business report for <strong>${weekRange}</strong> is ready.</p>

      <!-- Executive summary -->
      <div style="background:#f8faf9;border-left:3px solid #2D5240;padding:16px 18px;border-radius:0 6px 6px 0;margin-bottom:24px">
        <p style="margin:0 0 10px;font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:#6b7280">Aria's summary</p>
        ${summaryHtml}
      </div>

      <!-- CTA button -->
      ${pdfUrl ? `<div style="text-align:center"><a href="${pdfUrl}" style="${btnStyle}">View your report →</a></div>` : ''}

      <!-- Footer note -->
      <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px">
        This report was generated automatically by Aria OS every Monday morning. The PDF is also attached to this email for offline reading.
      </p>
    </div>

    <!-- Footer bar -->
    <div style="background:#f9fafb;padding:14px 32px;text-align:center;border-top:1px solid #e5e7eb">
      <p style="margin:0;font-size:11px;color:#9ca3af">Aria OS · ariaos.site · Confidential</p>
    </div>
  </div>
</body>
</html>`
}

export async function sendWeeklyReportEmail(
  biz: BusinessRow,
  narrative: WeeklyNarrative,
  data: WeeklyReportData,
  weekStart: Date,
  pdfBuffer: Buffer,
  pdfUrl: string | null,
): Promise<boolean> {
  if (!biz.email) return false
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) { console.warn('[weekly-email] RESEND_API_KEY not set — skipping email'); return false }

  const weekRange = formatWeekRange(weekStart)
  const html = buildEmailHtml(biz, narrative, weekStart, pdfUrl)
  const b64 = pdfBuffer.toString('base64')
  const subject = `Your weekly Aria report — week of ${weekStart.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })}`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Aria <aria@ariaos.site>',
        to: biz.email,
        subject,
        html,
        attachments: [{ content: b64, filename: 'aria-weekly-report.pdf', type: 'application/pdf', disposition: 'attachment' }],
      }),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText)
      console.error('[weekly-email] Resend error:', err)
      return false
    }
    return true
  } catch (e) {
    console.error('[weekly-email] send failed:', (e as Error).message)
    return false
  }
}

export async function saveWeeklyReportRecord(
  businessId: string,
  weekStart: Date,
  data: WeeklyReportData,
  pdfUrl: string | null,
  emailSent: boolean,
): Promise<void> {
  try {
    const weekEnd = new Date(weekStart.getTime() + 6 * 86400_000)
    await supabaseAdmin.from('weekly_report_records').insert({
      business_id: businessId,
      week_start: weekStart.toISOString().slice(0, 10),
      week_end: weekEnd.toISOString().slice(0, 10),
      pdf_url: pdfUrl,
      email_sent: emailSent,
      email_sent_at: emailSent ? new Date().toISOString() : null,
      suspicious_count: data.suspiciousTransactions.length,
      total_revenue: data.totalRevenue,
    })
  } catch (e) {
    console.error('[weekly-email] DB record insert failed:', (e as Error).message)
  }
}
