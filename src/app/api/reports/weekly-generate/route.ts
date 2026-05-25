export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { gatherWeeklyData, computeWeekStart } from '@/lib/reports/weekly-data'
import { generateWeeklyNarrative, type BusinessRow } from '@/lib/reports/weekly-ai'
import { generateWeeklyPDF } from '@/lib/reports/weekly-pdf'
import { sendWeeklyReportEmail, saveWeeklyReportRecord } from '@/lib/reports/weekly-email'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { business_id, week_start } = body as { business_id?: string; week_start?: string }
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, name, trading_name, email, timezone, industry, city')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .single()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const business = biz as BusinessRow
  const tz = business.timezone ?? 'Australia/Melbourne'
  const weekStart = week_start ? new Date(week_start) : computeWeekStart(tz)

  const data = await gatherWeeklyData(business_id, weekStart, tz)
  const narrative = await generateWeeklyNarrative(data, business)
  const pdfBuffer = await generateWeeklyPDF(data, narrative, business, weekStart)

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'Storage not configured' }, { status: 503 })
  }

  const { put } = await import('@vercel/blob')
  const filename = `aria-reports/weekly-${business_id}-${weekStart.toISOString().slice(0, 10)}.pdf`
  const blob = await put(filename, pdfBuffer, { access: 'public', contentType: 'application/pdf' })
  const pdfUrl = blob.url

  const emailSent = await sendWeeklyReportEmail(business, narrative, data, weekStart, pdfBuffer, pdfUrl)
  await saveWeeklyReportRecord(business_id, weekStart, data, pdfUrl, emailSent)

  return NextResponse.json({
    pdf_url: pdfUrl,
    executive_summary: narrative.executive_summary,
    suspicious_count: data.suspiciousTransactions.length,
    email_sent: emailSent,
    email: business.email ?? null,
  })
}

export const POST = withErrorCapture('reports/weekly-generate', _POST)
