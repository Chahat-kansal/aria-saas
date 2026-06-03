import { supabaseAdmin } from '@/lib/supabase-admin'
import { gatherWeeklyData, computeWeekStart } from './weekly-data'
import { generateWeeklyNarrative, type BusinessRow } from './weekly-ai'
import { generateWeeklyPDF } from './weekly-pdf'
import { sendWeeklyReportEmail, saveWeeklyReportRecord } from './weekly-email'

export async function runWeeklyReport(businessId: string): Promise<void> {
  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id, name, trading_name, email, weekly_report_email, timezone, industry, city, user_id')
    .eq('id', businessId)
    .single()

  if (!biz) {
    console.error(`[weekly-report] business ${businessId} not found`)
    return
  }

  const business = biz as BusinessRow & { weekly_report_email?: string | null; user_id?: string }
  const tz = business.timezone ?? 'Australia/Melbourne'
  const bizName = business.trading_name ?? business.name ?? businessId

  // Resolve the best available email:
  // 1. weekly_report_email (owner explicitly set this for reports)
  // 2. business.email (the account email)
  // 3. auth user email (fallback if business.email is placeholder/invalid)
  let resolvedEmail: string | null = null

  const weeklyEmail = (business as { weekly_report_email?: string | null }).weekly_report_email
  if (weeklyEmail && weeklyEmail.includes('@') && weeklyEmail.includes('.')) {
    resolvedEmail = weeklyEmail
  } else if (business.email && business.email.includes('@') && business.email.includes('.')) {
    resolvedEmail = business.email
  } else if ((business as { user_id?: string }).user_id) {
    // Fall back to auth email
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(
      (business as { user_id?: string }).user_id!
    )
    if (authUser?.user?.email) resolvedEmail = authUser.user.email
  }

  if (!resolvedEmail) {
    console.warn(`[weekly-report] ${bizName}: skipped (no valid email)`)
    return
  }

  // Inject resolved email into business object for the email sender
  const businessWithEmail = { ...business, email: resolvedEmail } as BusinessRow

  const weekStart = computeWeekStart(tz)
  const data = await gatherWeeklyData(businessId, weekStart, tz)

  if (data.totalRevenue === 0 && data.totalTransactions === 0) {
    console.log(`[weekly-report] ${bizName}: skipped (no transactions this week)`)
    return
  }

  const narrative = await generateWeeklyNarrative(data, businessWithEmail)
  const pdfBuffer = await generateWeeklyPDF(data, narrative, businessWithEmail, weekStart)

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

  const emailSent = await sendWeeklyReportEmail(businessWithEmail, narrative, data, weekStart, pdfBuffer, pdfUrl)
  await saveWeeklyReportRecord(businessId, weekStart, data, pdfUrl, emailSent, narrative)

  console.log(`[weekly-report] ${bizName}: done — email=${resolvedEmail} pdf_url=${pdfUrl ?? 'none'} email_sent=${emailSent}`)
}
