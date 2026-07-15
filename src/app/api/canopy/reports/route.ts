export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { saveReport, listSavedReports, type ReportSourceKind, type ReportGrounding } from '@/lib/aria/canopy-reports'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

const VALID_KINDS: ReportSourceKind[] = ['ask_aria_deliverable', 'weekly_report', 'daily_briefing', 'profit_leaks']
const VALID_GROUNDING: ReportGrounding[] = ['verified', 'derived', 'estimated']

// CANOPY-REPORTS-AS-FILES-1 — the Save-to-Files action every report/deliverable surface calls, and
// the list endpoint Canopy's Files app reads. business_id is ALWAYS derived server-side from the
// authenticated session (getBid), never trusted from the request body — same discipline as every
// pos/* route this session (SECURITY-CRITICAL-1/2).
export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 404 })

  const body = await req.json() as {
    source_kind?: string; source_id?: string; title?: string; grounding?: string; html?: string
  }
  if (!body.source_kind || !VALID_KINDS.includes(body.source_kind as ReportSourceKind)) {
    return NextResponse.json({ error: 'source_kind must be one of ' + VALID_KINDS.join(', ') }, { status: 400 })
  }
  if (!body.title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 })
  const grounding = (body.grounding && VALID_GROUNDING.includes(body.grounding as ReportGrounding))
    ? body.grounding as ReportGrounding
    : 'derived'

  try {
    const saved = await saveReport({
      businessId: bid,
      sourceKind: body.source_kind as ReportSourceKind,
      sourceId: body.source_id ?? null,
      title: body.title.trim(),
      grounding,
      html: body.html ?? null,
    })
    return NextResponse.json({ report: saved })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ reports: [] })

  const reports = await listSavedReports(bid)
  return NextResponse.json({ reports })
}
