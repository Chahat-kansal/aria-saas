export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { computePar, computeParReadonly, getOrSeedReorderSettings, setProductPar } from '@/lib/inventory/par-levels'

// INV-PAR-1 — owner reorder surface. GET reads par + below-reorder (bootstraps a compute on first use);
// POST { action } recomputes, saves settings, or applies a per-product override. getBid-scoped.

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  // If no par computed yet (all zero), bootstrap a compute; else read stored.
  const { count: anyPar } = await supabaseAdmin.from('pos_products').select('id', { count: 'exact', head: true }).eq('business_id', bid).gt('reorder_point', 0)
  const result = (anyPar ?? 0) > 0 ? await computeParReadonly(supabaseAdmin, bid) : await computePar(supabaseAdmin, bid)
  return NextResponse.json(result)
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  const body = await req.json().catch(() => ({})) as { action?: string; lead_time_days?: number; buffer_weeks?: number; review_cycle_days?: number; default_reorder_qty?: number; product_id?: string; reorder_point?: number; target_stock?: number; reorder_qty?: number }

  if (body.action === 'settings') {
    await getOrSeedReorderSettings(supabaseAdmin, bid) // ensure the row exists
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.lead_time_days != null) patch.lead_time_days = Math.max(0, Number(body.lead_time_days))
    if (body.buffer_weeks != null) patch.buffer_weeks = Math.max(0, Number(body.buffer_weeks))
    if (body.review_cycle_days != null) patch.review_cycle_days = Math.max(0, Number(body.review_cycle_days))
    if (body.default_reorder_qty != null) patch.default_reorder_qty = Math.max(1, Math.round(Number(body.default_reorder_qty)))
    await supabaseAdmin.from('reorder_settings').update(patch).eq('business_id', bid)
    const result = await computePar(supabaseAdmin, bid) // re-derive with the new knobs
    return NextResponse.json({ ok: true, ...result })
  }

  if (body.action === 'override' && body.product_id) {
    await setProductPar(supabaseAdmin, bid, body.product_id, { reorder_point: body.reorder_point, target_stock: body.target_stock, reorder_qty: body.reorder_qty })
    return NextResponse.json({ ok: true })
  }

  // default: recompute
  const result = await computePar(supabaseAdmin, bid)
  return NextResponse.json({ ok: true, ...result })
}

export const GET = withErrorCapture('pos/inventory/reorder:get', _GET)
export const POST = withErrorCapture('pos/inventory/reorder:post', _POST)
