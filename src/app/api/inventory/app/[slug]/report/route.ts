export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getActingStaff } from '@/lib/inventory/staff-session'
import { resolveOutletId } from '@/lib/inventory/outlet-stock'
import { generateReport, REPORT_LIBRARY, type ReportType, type Period } from '@/lib/inventory/reports'
import { renderReportHtml, generateReportPdf } from '@/lib/inventory/report-pdf'

// INV-REPORTS — staff-app report endpoint. JSON (for the Reports screen: KPIs + the requested report + the
// 10-report library) and PDF export. All data is the deterministic generators — no fabricated numbers.

type Params = { params: Promise<{ slug: string }> }
const TYPES = new Set(REPORT_LIBRARY.map(r => r.type))

async function _GET(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const acting = await getActingStaff(bid)
  if (!acting) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const type = (TYPES.has(sp.get('type') as ReportType) ? sp.get('type') : 'sold_vs_stock') as ReportType
  const period = (sp.get('period') === 'weekly' ? 'weekly' : 'daily') as Period
  const outletId = await resolveOutletId(supabaseAdmin, bid, sp.get('outlet_id'))
  const data = await generateReport(supabaseAdmin, bid, type, period, outletId)

  if (sp.get('format') === 'pdf') {
    const pdf = await generateReportPdf(renderReportHtml(data))
    return new Response(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="aria-${type}-${period}.pdf"` } })
  }
  return NextResponse.json({ acting: { id: acting.staff_id, name: acting.staff_name }, library: REPORT_LIBRARY, report: data })
}

export const GET = withErrorCapture('inventory/app/report', _GET)
