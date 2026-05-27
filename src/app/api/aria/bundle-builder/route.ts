export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import Anthropic from '@anthropic-ai/sdk'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { parseLLMJsonOr } from '@/lib/ai-json'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

// ── GET — list bundles (active + pending)
async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { searchParams } = new URL(req.url)

  // Public mode: business_id query param + no auth = active bundles only (for kiosk)
  const publicBid = searchParams.get('business_id')
  if (publicBid) {
    const { data } = await supabaseAdmin.from('product_bundles')
      .select('id, bundle_name, bundle_pitch, bundle_price, individual_total, product_ids, times_sold')
      .eq('business_id', publicBid)
      .eq('status', 'active')
      .limit(20)
    return NextResponse.json({ bundles: data ?? [] })
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data } = await supabaseAdmin.from('product_bundles')
    .select('*').eq('business_id', bid).order('created_at', { ascending: false }).limit(200)

  return NextResponse.json({ bundles: data ?? [] })
}

// ── POST — analyse baskets, generate bundle suggestions (status=pending)
async function _POST() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  // Clear existing pending suggestions from Aria
  await supabaseAdmin.from('product_bundles').delete().eq('business_id', bid).eq('status', 'pending').eq('source', 'aria')

  // ── Pull last 60d of basket items ───────────────────────────────────
  const since = new Date(Date.now() - 60 * 86400_000).toISOString()
  const { data: items } = await supabaseAdmin.from('pos_sale_items')
    .select('sale_id, product_id, pos_sales!inner(business_id, created_at, status)')
    .eq('pos_sales.business_id', bid)
    .neq('pos_sales.status', 'voided')
    .gte('pos_sales.created_at', since)
    .limit(20000)

  type Row = { sale_id: string | null; product_id: string | null }
  const bySale: Record<string, string[]> = {}
  for (const r of (items ?? []) as unknown as Row[]) {
    if (!r.sale_id || !r.product_id) continue
    if (!bySale[r.sale_id]) bySale[r.sale_id] = []
    bySale[r.sale_id].push(r.product_id)
  }

  // Count pairs + triples
  const pairCount: Record<string, number> = {}
  const tripleCount: Record<string, number> = {}
  for (const items of Object.values(bySale)) {
    const uniq = Array.from(new Set(items))
    for (let i = 0; i < uniq.length; i++) {
      for (let j = i + 1; j < uniq.length; j++) {
        const key = [uniq[i], uniq[j]].sort().join('|')
        pairCount[key] = (pairCount[key] ?? 0) + 1
        for (let k = j + 1; k < uniq.length; k++) {
          const tkey = [uniq[i], uniq[j], uniq[k]].sort().join('|')
          tripleCount[tkey] = (tripleCount[tkey] ?? 0) + 1
        }
      }
    }
  }

  // Take top combinations with >= 3 co-occurrences
  const topPairs = Object.entries(pairCount).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 12)
  const topTriples = Object.entries(tripleCount).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 6)

  const productIds = new Set<string>()
  for (const [k] of topPairs) k.split('|').forEach(id => productIds.add(id))
  for (const [k] of topTriples) k.split('|').forEach(id => productIds.add(id))

  if (productIds.size === 0) return NextResponse.json({ generated: 0 })

  // ── Load product details for math + naming ─────────────────────────
  const { data: prods } = await supabaseAdmin.from('pos_products')
    .select('id, name, price, cost_price')
    .in('id', Array.from(productIds))

  type Prod = { id: string; name: string; price: number | null; cost_price: number | null }
  const pMap: Record<string, Prod> = {}
  for (const p of (prods ?? []) as Prod[]) pMap[p.id] = p

  type Candidate = {
    product_ids: string[]
    product_names: string[]
    individual_total: number
    total_cost: number
    co_occurrences: number
  }

  const candidates: Candidate[] = []
  const allCombos: Array<[string, number]> = [...topTriples, ...topPairs]
  for (const [key, count] of allCombos) {
    const ids = key.split('|')
    const products = ids.map(id => pMap[id]).filter(Boolean)
    if (products.length !== ids.length) continue
    const totalIndividual = products.reduce((s, p) => s + Number(p.price ?? 0), 0)
    const totalCost = products.reduce((s, p) => s + Number(p.cost_price ?? 0), 0)
    if (totalIndividual <= 0 || totalCost <= 0) continue
    candidates.push({
      product_ids: ids,
      product_names: products.map(p => p.name),
      individual_total: totalIndividual,
      total_cost: totalCost,
      co_occurrences: count,
    })
  }

  // ── Compute safe bundle price: discount 8-12%, never below 25% margin
  type Suggestion = Candidate & { bundle_price: number; margin_at_bundle: number; perceived_discount_pct: number }
  const suggestions: Suggestion[] = []
  for (const c of candidates) {
    let discountPct = 10
    let bundlePrice = Math.round((c.individual_total * (1 - discountPct / 100)) * 100) / 100
    let margin = (bundlePrice - c.total_cost) / bundlePrice
    // If margin < 25%, shrink the discount until 25% is met OR cap at 0% discount
    while (margin < 0.25 && discountPct > 0) {
      discountPct -= 1
      bundlePrice = Math.round((c.individual_total * (1 - discountPct / 100)) * 100) / 100
      margin = (bundlePrice - c.total_cost) / bundlePrice
    }
    if (margin < 0.25) continue // skip — can't make a healthy bundle
    if (discountPct < 3) continue // skip — not enough discount to feel like a bundle
    suggestions.push({
      ...c,
      bundle_price: bundlePrice,
      margin_at_bundle: margin,
      perceived_discount_pct: discountPct,
    })
  }

  if (suggestions.length === 0) return NextResponse.json({ generated: 0 })

  // ── Have Haiku name + pitch the bundles ──────────────────────────
  const top = suggestions.slice(0, 10)
  let named: Array<{ name: string; pitch: string }> = top.map(s => ({
    name: s.product_names.slice(0, 3).join(' + '),
    pitch: `Save A$${(s.individual_total - s.bundle_price).toFixed(2)} when bought as a bundle.`,
  }))

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const compact = top.map((s, i) => ({ i, products: s.product_names, price: s.bundle_price, saving: Math.round(s.individual_total - s.bundle_price) }))
      const resp = await trackAICall(
        { route: 'aria/bundle-builder', model: 'claude-haiku-4-5-20251001', businessId: bid, purpose: 'bundle-naming' },
        () => anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          system: 'You write appealing Australian bundle names and one-line pitches. Names: 2-5 words, no jargon. Pitches: warm, specific, under 14 words, include the saving in A$. Return JSON: [{"i":INDEX,"name":"...","pitch":"..."}].',
          messages: [{ role: 'user', content: 'Name and pitch these bundles: ' + JSON.stringify(compact) }],
        })
      )
      const text = resp.content[0].type === 'text' ? resp.content[0].text : ''
      const parsed = parseLLMJsonOr<Array<{ i: number; name: string; pitch: string }>>(text.match(/\[[\s\S]*\]/)?.[0] ?? '[]', [], 'bundle-naming')
      for (const item of parsed) {
        if (named[item.i]) named[item.i] = { name: item.name ?? named[item.i].name, pitch: item.pitch ?? named[item.i].pitch }
      }
    } catch { /* keep defaults */ }
  }

  await supabaseAdmin.from('product_bundles').insert(top.map((s, i) => ({
    business_id: bid,
    bundle_name: named[i].name,
    bundle_pitch: named[i].pitch,
    product_ids: s.product_ids,
    bundle_price: s.bundle_price,
    individual_total: s.individual_total,
    total_cost: s.total_cost,
    margin_at_bundle: s.margin_at_bundle,
    status: 'pending',
    source: 'aria',
  })))

  return NextResponse.json({ generated: top.length })
}

// ── PATCH — approve / reject / archive
async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { id, action, bundle_name, bundle_pitch, bundle_price } = await req.json() as {
    id?: string
    action?: 'approve' | 'reject' | 'archive'
    bundle_name?: string
    bundle_pitch?: string
    bundle_price?: number
  }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (action === 'approve') patch.status = 'active'
  else if (action === 'reject') patch.status = 'rejected'
  else if (action === 'archive') patch.status = 'archived'

  if (bundle_name !== undefined) patch.bundle_name = bundle_name
  if (bundle_pitch !== undefined) patch.bundle_pitch = bundle_pitch
  if (bundle_price !== undefined) patch.bundle_price = bundle_price

  await supabaseAdmin.from('product_bundles').update(patch).eq('id', id).eq('business_id', bid)
  return NextResponse.json({ ok: true })
}

// ── DELETE
async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await supabaseAdmin.from('product_bundles').delete().eq('id', id).eq('business_id', bid)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('aria/bundle-builder', _GET)
export const POST = withErrorCapture('aria/bundle-builder', _POST)
export const PATCH = withErrorCapture('aria/bundle-builder', _PATCH)
export const DELETE = withErrorCapture('aria/bundle-builder', _DELETE)
