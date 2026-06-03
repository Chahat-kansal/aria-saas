export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { BasAgent } from '@/lib/agents/bas-agent'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const { data: drafts, error } = await supabaseAdmin
    .from('bas_drafts')
    .select('*')
    .eq('business_id', biz.id)
    .order('period_end', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ drafts: drafts ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const body = await req.json().catch(() => null) as { period_start?: string; period_end?: string } | null

  let periodStart: Date
  let periodEnd: Date

  if (body?.period_start && body?.period_end) {
    periodStart = new Date(body.period_start)
    periodEnd = new Date(body.period_end)
  } else {
    const { getCurrentQuarter } = await import('@/lib/agents/bas-agent')
    const q = getCurrentQuarter()
    periodStart = q.period_start
    periodEnd = q.period_end
  }

  const agent = new BasAgent()
  await agent.generateBasDraft(biz.id, periodStart, periodEnd)

  const { data: draft } = await supabaseAdmin
    .from('bas_drafts')
    .select('*')
    .eq('business_id', biz.id)
    .eq('period_start', periodStart.toISOString().slice(0, 10))
    .maybeSingle()

  return NextResponse.json({ ok: true, draft })
}

export const GET = withErrorCapture('agents/bas/draft', _GET)
export const POST = withErrorCapture('agents/bas/draft', _POST)
