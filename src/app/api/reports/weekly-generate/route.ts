export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { gatherWeeklyData, computeWeekStart } from '@/lib/reports/weekly-data'
import { generateWeeklyNarrative, type BusinessRow } from '@/lib/reports/weekly-ai'
import { generateWeeklyPDF } from '@/lib/reports/weekly-pdf'
import { sendWeeklyReportEmail, saveWeeklyReportRecord } from '@/lib/reports/weekly-email'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const log = (step: string, extra?: Record<string, unknown>) =>
  console.log('[weekly-generate]', step, extra ? JSON.stringify(extra) : '')

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
  const weekStartStr = weekStart.toISOString().slice(0, 10)

  // Idempotent: a report for this week generated in the last hour is returned as-is,
  // so a double-click (or the reported "tried 3 times") doesn't re-bill Anthropic.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data: cached } = await supabaseAdmin
    .from('weekly_report_records')
    .select('pdf_url, narrative, report_data, email_sent, created_at')
    .eq('business_id', business_id)
    .eq('week_starting', weekStartStr)
    .gte('created_at', oneHourAgo)
    .not('pdf_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (cached?.pdf_url) {
    log('cache-hit', { weekStartStr })
    const susp = (cached.report_data as { suspiciousTransactions?: unknown[] } | null)?.suspiciousTransactions ?? []
    const narr = cached.narrative as { executive_summary?: string } | null
    return NextResponse.json({
      pdf_url: cached.pdf_url,
      executive_summary: narr?.executive_summary ?? '',
      suspicious_count: Array.isArray(susp) ? susp.length : 0,
      email_sent: !!cached.email_sent,
      email: business.email ?? null,
      from_cache: true,
    })
  }

  log('gather-data', { business_id, weekStartStr })
  const data = await gatherWeeklyData(business_id, weekStart, tz)

  // Data-prereq guard: no sales in the reporting week → nothing meaningful to report.
  if (data.totalTransactions === 0) {
    log('not-enough-data', { weekStartStr })
    return NextResponse.json({
      not_enough_data: true,
      message: 'Not enough sales data for this week yet — generate a report once you have a few days of trading.',
    })
  }

  log('generate-narrative', { transactions: data.totalTransactions })
  const narrative = await generateWeeklyNarrative(data, business)

  log('render-pdf')
  const pdfBuffer = await generateWeeklyPDF(data, narrative, business, weekStart)

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'Storage not configured' }, { status: 503 })
  }

  log('upload-pdf', { bytes: pdfBuffer.length })
  const { put } = await import('@vercel/blob')
  const filename = `aria-reports/weekly-${business_id}-${weekStartStr}.pdf`
  const blob = await put(filename, pdfBuffer, { access: 'public', contentType: 'application/pdf' })
  const pdfUrl = blob.url

  log('send-email')
  const emailSent = await sendWeeklyReportEmail(business, narrative, data, weekStart, pdfBuffer, pdfUrl)
  await saveWeeklyReportRecord(business_id, weekStart, data, pdfUrl, emailSent, narrative)
  log('done', { pdfUrl, emailSent })

  return NextResponse.json({
    pdf_url: pdfUrl,
    executive_summary: narrative.executive_summary,
    suspicious_count: data.suspiciousTransactions.length,
    email_sent: emailSent,
    email: business.email ?? null,
  })
}

export const POST = withErrorCapture('reports/weekly-generate', _POST)
