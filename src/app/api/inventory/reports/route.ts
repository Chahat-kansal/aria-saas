export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveOutletId } from '@/lib/inventory/outlet-stock'
import { generateReport, REPORT_LIBRARY, visibleReportLibrary, type ReportType, type Period } from '@/lib/inventory/reports'
import { renderReportHtml, generateReportPdf } from '@/lib/inventory/report-pdf'

// INV-REPORTS — owner/dashboard report endpoint. GET = report JSON / PDF / list schedules. POST = schedule an
// inventory report onto the EXISTING scheduled_pdf_reports rail (page_path encodes type+period; the
// send-scheduled-reports cron renders the inventory PDF + emails it). DELETE = remove a schedule.

const TYPES = new Set(REPORT_LIBRARY.map(r => r.type))

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

function computeNextSend(frequency: string, dayOfWeek: number | null, hourAest: number): string {
  const now = new Date()
  const hourUtc = (hourAest - 10 + 24) % 24
  const next = new Date(now); next.setUTCHours(hourUtc, 0, 0, 0)
  if (frequency === 'weekly' && dayOfWeek != null) {
    const daysUntil = (dayOfWeek - now.getUTCDay() + 7) % 7 || 7
    next.setUTCDate(next.getUTCDate() + daysUntil)
  } else if (next <= now) next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString()
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const sp = new URL(req.url).searchParams
  if (sp.get('schedules') === '1') {
    const { data } = await supabaseAdmin.from('scheduled_pdf_reports')
      .select('id, label, page_path, frequency, day_of_week, send_hour_aest, recipients, is_active, last_sent_at, next_send_at')
      .eq('business_id', bid).ilike('page_path', '/inventory/reports%').order('created_at', { ascending: false })
    return NextResponse.json({ schedules: data ?? [], library: await visibleReportLibrary(bid) })
  }

  const type = (TYPES.has(sp.get('type') as ReportType) ? sp.get('type') : 'sold_vs_stock') as ReportType
  const period = (sp.get('period') === 'weekly' ? 'weekly' : 'daily') as Period
  const outletId = await resolveOutletId(supabaseAdmin, bid, sp.get('outlet_id'))
  const data = await generateReport(supabaseAdmin, bid, type, period, outletId)

  if (sp.get('format') === 'pdf') {
    const pdf = await generateReportPdf(renderReportHtml(data))
    return new Response(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="aria-${type}-${period}.pdf"` } })
  }
  return NextResponse.json({ library: await visibleReportLibrary(bid), report: data })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as { type?: string; period?: string; frequency?: string; day_of_week?: number; send_hour_aest?: number; recipients?: Array<{ name?: string; email: string }> | string[] }
  if (!TYPES.has(body.type as ReportType)) return NextResponse.json({ error: 'valid report type required' }, { status: 400 })
  const recipientsRaw = body.recipients ?? []
  const recipients = recipientsRaw.map(r => typeof r === 'string' ? { name: 'Recipient', email: r } : { name: r.name ?? 'Recipient', email: r.email }).filter(r => r.email)
  if (recipients.length === 0) return NextResponse.json({ error: 'at least one recipient email required' }, { status: 400 })

  const type = body.type as ReportType
  const period = (body.period === 'weekly' ? 'weekly' : 'daily') as Period
  const frequency = period === 'weekly' ? 'weekly' : 'daily'
  const dayOfWeek = frequency === 'weekly' ? (body.day_of_week ?? 1) : null // default Monday
  const hourAest = Number(body.send_hour_aest ?? 8)
  const title = REPORT_LIBRARY.find(r => r.type === type)?.title ?? type

  const { data, error } = await supabaseAdmin.from('scheduled_pdf_reports').insert({
    business_id: bid, created_by: user.id,
    label: `${title} (${frequency})`,
    page_path: `/inventory/reports?type=${type}&period=${period}`,
    frequency, day_of_week: dayOfWeek, send_hour_aest: hourAest,
    recipients, include_share_link: false, is_active: true,
    next_send_at: computeNextSend(frequency, dayOfWeek, hourAest),
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data?.id })
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabaseAdmin.from('scheduled_pdf_reports').delete().eq('id', id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('inventory/reports', _GET)
export const POST = withErrorCapture('inventory/reports', _POST)
export const DELETE = withErrorCapture('inventory/reports', _DELETE)
