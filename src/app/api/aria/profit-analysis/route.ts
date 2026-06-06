export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { ariaInvoke } from '@/lib/aria/invoke'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [{ data: leaks }, { data: history }] = await Promise.all([
    supabaseAdmin
      .from('profit_leaks')
      .select('id,title,category,description,monthly_loss,estimated_loss,recommendation,fix_suggestion,status,detected_at')
      .eq('business_id', business_id)
      .order('monthly_loss', { ascending: false }),
    supabaseAdmin
      .from('profit_leak_history')
      .select('run_at,total_leak_cents,fixed_count')
      .eq('business_id', business_id)
      .order('run_at', { ascending: false })
      .limit(30),
  ])

  const last_run_at = (history ?? [])[0]?.run_at ?? null
  return NextResponse.json({ leaks: leaks ?? [], history: history ?? [], last_run_at })
}

async function _POST(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ leaks: [], history: [], total_monthly_impact_cents: 0, reason: 'No business' })

  let ai_summary = ''
  try {
    const result = await ariaInvoke('ops_narrative', bid, { includeWeather: false })
    ai_summary = result.recommendation?.description ?? ''
  } catch (e) { console.error('[non-fatal]', e) }

  const { data: leaks } = await supabaseAdmin
    .from('profit_leaks')
    .select('id,title,category,description,monthly_loss,estimated_loss,recommendation,fix_suggestion,status')
    .eq('business_id', bid)
    .order('monthly_loss', { ascending: false })

  const activeLeaks = (leaks ?? []).filter((l: Record<string, unknown>) => l.status !== 'fixed')
  const fixedCount = (leaks ?? []).filter((l: Record<string, unknown>) => l.status === 'fixed').length
  const totalLossDollars = activeLeaks.reduce((s: number, l: Record<string, unknown>) => s + (Number(l.monthly_loss) || 0), 0)
  const totalLeakCents = Math.round(totalLossDollars * 100)

  await supabaseAdmin.from('profit_leak_history').insert({
    business_id: bid,
    total_leak_cents: totalLeakCents,
    leaks: leaks ?? [],
    fixed_count: fixedCount,
  })

  const { data: fullHistory } = await supabaseAdmin
    .from('profit_leak_history')
    .select('run_at,total_leak_cents,fixed_count')
    .eq('business_id', bid)
    .order('run_at', { ascending: false })
    .limit(30)

  return NextResponse.json({ leaks: leaks ?? [], history: fullHistory ?? [], ai_summary, total_monthly_impact_cents: totalLeakCents })
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { id, business_id } = body
  if (!id || !business_id) return NextResponse.json({ error: 'id and business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabaseAdmin.from('profit_leaks').update({ status: 'fixed' }).eq('id', id).eq('business_id', business_id)

  if (business_id) {
    const { data: latest } = await supabaseAdmin
      .from('profit_leak_history')
      .select('id,fixed_count')
      .eq('business_id', business_id)
      .order('run_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (latest?.id) {
      await supabaseAdmin.from('profit_leak_history')
        .update({ fixed_count: (Number(latest.fixed_count) || 0) + 1 })
        .eq('id', String(latest.id))
    }
  }

  return NextResponse.json({ ok: true })
}

export const GET  = withErrorCapture('aria/profit-analysis', _GET)
export const POST = withErrorCapture('aria/profit-analysis', _POST)
export const PATCH = withErrorCapture('aria/profit-analysis', _PATCH)
