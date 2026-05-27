import { supabaseAdmin } from '@/lib/supabase-admin'
import { gatherWeeklyData, computeWeekStart } from './weekly-data'
import { generateWeeklyNarrative, type BusinessRow } from './weekly-ai'
import { generateWeeklyPDF } from './weekly-pdf'
import { sendWeeklyReportEmail, saveWeeklyReportRecord } from './weekly-email'

export async function runWeeklyReport(businessId: string): Promise<void> {
  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id, name, trading_name, email, timezone, industry, city')
    .eq('id', businessId)
    .single()

  if (!biz) {
    console.error(`[weekly-report] business ${businessId} not found`)
    return
  }

  const business = biz as BusinessRow
  const tz = business.timezone ?? 'Australia/Melbourne'
  const bizName = business.trading_name ?? business.name ?? businessId
  const weekStart = computeWeekStart(tz)

  const data = await gatherWeeklyData(businessId, weekStart, tz)

  if (data.totalRevenue === 0 && data.totalTransactions === 0) {
    console.log(`[weekly-report] ${bizName}: skipped (no transactions this week)`)
    return
  }

  const narrative = await generateWeeklyNarrative(data, business)
  const pdfBuffer = await generateWeeklyPDF(data, narrative, business, weekStart)

  let pdfUrl: string | null = null
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { put } = await import('@vercel/blob')
      const filename = `aria-reports/weekly-${businessId}-${weekStart.toISOString().slice(0, 10)}.pdf`
      const blob = await put(filename, pdfBuffer, { access: 'public', contentType: 'application/pdf' })
      pdfUrl = blob.url
    } catch (e) {
      console.error(`[weekly-report] ${bizName}: blob upload failed:`, (e as Error).message)
    }
  }

  const emailSent = await sendWeeklyReportEmail(business, narrative, data, weekStart, pdfBuffer, pdfUrl)
  await saveWeeklyReportRecord(businessId, weekStart, data, pdfUrl, emailSent, narrative)

  console.log(`[weekly-report] ${bizName}: done — pdf_url=${pdfUrl ?? 'none'} email_sent=${emailSent}`)
}
