export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getLoyaltyMembership } from '@/lib/loyalty/auth'
import { readPreloadConfig, getPreloadState } from '@/lib/loyalty/preload'

// LOY-PRELOAD — customer GET (own balance + history, identity-scoped) and owner GET/POST (config, getBid).

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const url = new URL(req.url)
  const owner = url.searchParams.get('owner') === '1'

  if (owner) {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const bid = await getBid(supabase, user.id)
    if (!bid) return NextResponse.json({ enabled: false })
    const cfg = await readPreloadConfig(bid)
    return NextResponse.json({ enabled: cfg.enabled, amounts: cfg.amounts, bonus_threshold: cfg.bonusThreshold, bonus_amount: cfg.bonusAmount })
  }

  // CUSTOMER: own balance + history at this business.
  const bidParam = url.searchParams.get('business_id')
  const realId = bidParam ? await resolveBusinessId(supabaseAdmin, bidParam) : null
  if (!realId) return NextResponse.json({ enabled: false, balance: 0, ledger: [] })
  const cfg = await readPreloadConfig(realId)
  const m = await getLoyaltyMembership(realId)
  if (!cfg.enabled || !m) return NextResponse.json({ enabled: cfg.enabled, balance: 0, ledger: [], amounts: cfg.amounts, bonus_threshold: cfg.bonusThreshold, bonus_amount: cfg.bonusAmount })
  const state = await getPreloadState(realId, m.customer_id)
  return NextResponse.json({
    enabled: true, balance: state.balance, ledger: state.ledger,
    amounts: cfg.amounts, bonus_threshold: cfg.bonusThreshold, bonus_amount: cfg.bonusAmount,
  })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  const body = await req.json().catch(() => ({})) as { enabled?: boolean; amounts?: number[]; bonus_threshold?: number; bonus_amount?: number }

  const patch: Record<string, unknown> = { business_id: bid, updated_at: new Date().toISOString() }
  if (body.enabled !== undefined) patch.preload_enabled = !!body.enabled
  if (Array.isArray(body.amounts)) patch.preload_amounts = body.amounts.map(n => Math.max(1, Math.round(Number(n) || 0))).filter(n => n > 0).slice(0, 8)
  if (body.bonus_threshold !== undefined) patch.preload_bonus_threshold = Math.max(0, Number(body.bonus_threshold) || 0)
  if (body.bonus_amount !== undefined) patch.preload_bonus_amount = Math.max(0, Number(body.bonus_amount) || 0)

  const { error } = await supabaseAdmin.from('pos_loyalty_config').upsert(patch, { onConflict: 'business_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const cfg = await readPreloadConfig(bid)
  return NextResponse.json({ ok: true, enabled: cfg.enabled, amounts: cfg.amounts, bonus_threshold: cfg.bonusThreshold, bonus_amount: cfg.bonusAmount })
}

export const GET = withErrorCapture('loyalty/preload:get', _GET)
export const POST = withErrorCapture('loyalty/preload:post', _POST)
