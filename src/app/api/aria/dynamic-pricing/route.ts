export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import Anthropic from '@anthropic-ai/sdk'
import { trackAICall } from '@/lib/aria/ai-telemetry'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

type Product = {
  id: string
  name: string
  price: number | null
  cost_price: number | null
  stock_quantity: number | null
  track_stock: boolean | null
}

type Suggestion = {
  product_id: string
  product_name: string
  current_price: number
  suggested_price: number
  reason: string
  expected_margin_gain: number  // annual A$
  reason_code: 'competitor_higher' | 'low_margin' | 'slow_mover' | 'fast_mover'
}

// ── GET: list pending + recent suggestions
async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data: suggestions } = await supabaseAdmin.from('pricing_suggestions')
    .select('*, pos_products(name, stock_quantity)')
    .eq('business_id', bid)
    .order('created_at', { ascending: false })
    .limit(200)

  const pending = (suggestions ?? []).filter((s: { status: string }) => s.status === 'pending')
  const totalAnnualGain = pending.reduce((sum: number, s: { expected_margin_gain: number | null }) => sum + Number(s.expected_margin_gain ?? 0), 0)

  return NextResponse.json({ suggestions: suggestions ?? [], total_annual_gain_aud: totalAnnualGain })
}

// ── POST: run the engine, generate fresh suggestions
async function _POST() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  // Clear stale pending suggestions
  await supabaseAdmin.from('pricing_suggestions').delete().eq('business_id', bid).eq('status', 'pending')

  // ── Load products + sales velocity ─────────────────────────────────
  const { data: products } = await supabaseAdmin.from('pos_products')
    .select('id, name, price, cost_price, stock_quantity, track_stock')
    .eq('business_id', bid)
    .eq('is_active', true)
    .limit(500)

  const list = (products ?? []) as Product[]
  if (list.length === 0) return NextResponse.json({ suggestions: [], generated: 0 })

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
  const { data: sales } = await supabaseAdmin.from('pos_sale_items')
    .select('product_id, quantity, total, pos_sales!inner(business_id, created_at, status)')
    .eq('pos_sales.business_id', bid)
    .neq('pos_sales.status', 'voided')
    .gte('pos_sales.created_at', thirtyDaysAgo)
    .limit(10000)

  type SI = { product_id: string | null; quantity: number | null; total: number | null }
  const soldQty: Record<string, number> = {}
  for (const s of (sales ?? []) as unknown as SI[]) {
    if (!s.product_id) continue
    soldQty[s.product_id] = (soldQty[s.product_id] ?? 0) + Number(s.quantity ?? 0)
  }

  // ── Load competitor prices ────────────────────────────────────────
  type Comp = { product_name: string; competitor_price_cents: number }
  const { data: compPrices } = await supabaseAdmin.from('competitor_price_cache')
    .select('product_name, competitor_price_cents')
    .eq('business_id', bid)
    .limit(500)
  const compMap: Record<string, number> = {}
  for (const c of (compPrices ?? []) as Comp[]) {
    if (!c.product_name) continue
    const key = c.product_name.toLowerCase().trim()
    const dollars = Number(c.competitor_price_cents ?? 0) / 100
    if (!compMap[key] || compMap[key] > dollars) compMap[key] = dollars
  }

  const suggestions: Suggestion[] = []

  for (const p of list) {
    const price = Number(p.price ?? 0)
    const cost = Number(p.cost_price ?? 0)
    if (price <= 0) continue
    const margin = cost > 0 ? (price - cost) / price : null
    const sold30d = soldQty[p.id] ?? 0
    const annualUnits = sold30d * 12

    // 1. Competitor higher — raise modestly
    const compPrice = compMap[p.name.toLowerCase().trim()]
    if (compPrice && compPrice > price * 1.05 && cost > 0) {
      const target = Math.min(compPrice * 0.95, price * 1.08) // cap at 8% raise
      const newPrice = Math.round(target * 100) / 100
      if (newPrice > price) {
        const gain = (newPrice - price) * annualUnits
        if (gain >= 50) {
          suggestions.push({
            product_id: p.id, product_name: p.name,
            current_price: price, suggested_price: newPrice,
            reason: `Competitor is A$${compPrice.toFixed(2)} — you can lift A$${price.toFixed(2)} → A$${newPrice.toFixed(2)} and still be cheaper.`,
            expected_margin_gain: gain,
            reason_code: 'competitor_higher',
          })
          continue
        }
      }
    }

    // 2. Low margin — small raise
    if (margin != null && margin < 0.25 && cost > 0) {
      const targetMargin = 0.30
      const targetPrice = cost / (1 - targetMargin)
      const cappedRaise = Math.min(targetPrice, price * 1.07)
      const newPrice = Math.round(cappedRaise * 100) / 100
      if (newPrice > price) {
        const gain = (newPrice - price) * annualUnits
        if (gain >= 50) {
          suggestions.push({
            product_id: p.id, product_name: p.name,
            current_price: price, suggested_price: newPrice,
            reason: `Margin is ${(margin * 100).toFixed(0)}% — a small lift to A$${newPrice.toFixed(2)} brings it closer to 30%.`,
            expected_margin_gain: gain,
            reason_code: 'low_margin',
          })
          continue
        }
      }
    }

    // 3. Slow mover with stock — modest drop to move inventory
    const stock = Number(p.stock_quantity ?? 0)
    const tracked = p.track_stock !== false
    if (tracked && sold30d <= 1 && stock > 10 && margin != null && margin > 0.35) {
      const drop = price * 0.92 // 8% off
      const newPrice = Math.round(drop * 100) / 100
      const newMargin = cost > 0 ? (newPrice - cost) / newPrice : 0
      if (newMargin >= 0.20) {
        // Assume 8% drop moves 50% more units conservatively
        const gain = (newPrice - cost) * (annualUnits * 1.5) - (price - cost) * annualUnits
        if (gain >= 50) {
          suggestions.push({
            product_id: p.id, product_name: p.name,
            current_price: price, suggested_price: newPrice,
            reason: `Only ${sold30d} sold in 30 days but ${stock} in stock — an 8% drop should shift them while keeping margin healthy.`,
            expected_margin_gain: gain,
            reason_code: 'slow_mover',
          })
          continue
        }
      }
    }

    // 4. Fast mover with healthy margin — small raise (demand can absorb)
    if (sold30d >= 30 && margin != null && margin > 0.40) {
      const raise = price * 1.04 // 4% raise
      const newPrice = Math.round(raise * 100) / 100
      const gain = (newPrice - price) * annualUnits * 0.95 // small volume drag assumption
      if (gain >= 80) {
        suggestions.push({
          product_id: p.id, product_name: p.name,
          current_price: price, suggested_price: newPrice,
          reason: `${sold30d} sold in 30 days at ${(margin * 100).toFixed(0)}% margin — demand can absorb a 4% lift to A$${newPrice.toFixed(2)}.`,
          expected_margin_gain: gain,
          reason_code: 'fast_mover',
        })
      }
    }
  }

  // Sort by expected gain desc, cap at 30 to keep dashboard usable
  const top = suggestions.sort((a, b) => b.expected_margin_gain - a.expected_margin_gain).slice(0, 30)

  // Optional: have Haiku polish the reasons into nicer plain English
  if (top.length > 0 && process.env.ANTHROPIC_API_KEY) {
    try {
      const compact = top.map(s => ({ name: s.product_name, current: s.current_price, suggested: s.suggested_price, code: s.reason_code, raw_reason: s.reason }))
      const resp = await trackAICall(
        { route: 'aria/dynamic-pricing', model: 'claude-haiku-4-5-20251001', businessId: bid, purpose: 'pricing-reasons' },
        () => anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1200,
          system: 'You rewrite product pricing reasons into short, plain Australian English (max 18 words each). No jargon. No emoji. Return JSON: [{"i":INDEX,"r":"reason"}].',
          messages: [{ role: 'user', content: 'Rewrite each reason. Keep the numbers exact. Input: ' + JSON.stringify(compact) }],
        })
      )
      const text = resp.content[0].type === 'text' ? resp.content[0].text : ''
      const m = text.match(/\[[\s\S]*\]/)
      if (m) {
        const arr = JSON.parse(m[0]) as Array<{ i: number; r: string }>
        for (const item of arr) {
          if (top[item.i] && item.r) top[item.i].reason = item.r
        }
      }
    } catch { /* keep original reasons */ }
  }

  if (top.length > 0) {
    await supabaseAdmin.from('pricing_suggestions').insert(top.map(s => ({
      business_id: bid,
      product_id: s.product_id,
      current_price: s.current_price,
      suggested_price: s.suggested_price,
      reason: s.reason,
      expected_margin_gain: s.expected_margin_gain,
      status: 'pending',
    })))
  }

  return NextResponse.json({ generated: top.length })
}

// ── PATCH: approve or reject a suggestion
async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { id, action } = await req.json() as { id?: string; action?: 'approve' | 'reject' }
  if (!id || !action) return NextResponse.json({ error: 'id and action required' }, { status: 400 })

  const { data: sug } = await supabaseAdmin.from('pricing_suggestions')
    .select('id, product_id, suggested_price, status')
    .eq('id', id).eq('business_id', bid).maybeSingle()

  if (!sug) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (sug.status !== 'pending') return NextResponse.json({ error: 'Already actioned' }, { status: 400 })

  if (action === 'approve') {
    await supabaseAdmin.from('pos_products').update({ price: sug.suggested_price }).eq('id', sug.product_id).eq('business_id', bid)
    await supabaseAdmin.from('pricing_suggestions').update({ status: 'applied', applied_at: new Date().toISOString() }).eq('id', id)
  } else {
    await supabaseAdmin.from('pricing_suggestions').update({ status: 'rejected' }).eq('id', id)
  }
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('aria/dynamic-pricing', _GET)
export const POST = withErrorCapture('aria/dynamic-pricing', _POST)
export const PATCH = withErrorCapture('aria/dynamic-pricing', _PATCH)
