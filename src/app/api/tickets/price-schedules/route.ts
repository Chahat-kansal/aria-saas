export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ schedules: [], suggestions: [] })

  const suggest = new URL(req.url).searchParams.get('suggest') === '1'
  const { data: schedules } = await supabaseAdmin
    .from('pos_scheduled_price_changes')
    .select('*, pos_products(name, price)')
    .eq('business_id', bid)
    .in('status', ['scheduled', 'active'])
    .order('created_at', { ascending: false })

  if (!suggest) return NextResponse.json({ schedules: schedules ?? [] })

  const { data: prods } = await supabaseAdmin.from('pos_products').select('id,name,price').eq('business_id', bid).eq('is_active', true).order('name').limit(30)
  const { data: biz } = await supabase.from('businesses').select('trading_name,name').eq('id', bid).maybeSingle()
  const bizName = (biz as { trading_name?: string; name?: string } | null)?.trading_name ?? (biz as { name?: string } | null)?.name ?? 'Business'

  type Suggestion = { product_name: string; promo_price: number; starts: string; ends: string; label: string; rationale: string }
  let suggestions: Suggestion[] = []
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const prodList = (prods ?? []).map(p => `${p.name}: $${(Number(p.price) || 0).toFixed(2)}`).join(', ')
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 800,
      messages: [{ role: 'user', content: `You are Aria, an AI business advisor for Australian small businesses.\nBusiness: ${bizName}\nProducts and prices: ${prodList}\nActive schedules: ${(schedules ?? []).length} already scheduled\n\nSuggest 3 specific timed price promotions for this week. For each, return JSON:\n{ product_name, promo_price, starts, ends, label, rationale }\nFocus on: products that sell well, weekend timing, clearing slow stock.\nReturn ONLY a JSON array of 3 objects, no other text.` }],
    })
    const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '[]'
    suggestions = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim())
  } catch {
    suggestions = [{ product_name: (prods?.[0] as { name: string } | undefined)?.name ?? 'Top product', promo_price: 0, starts: '', ends: '', label: 'Weekend Sale', rationale: 'Drive weekend foot traffic with a limited-time offer.' }]
  }
  return NextResponse.json({ schedules: schedules ?? [], suggestions })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json() as { productId: string; promoPrice: number; startsAt: string; endsAt?: string; label?: string; printTicket?: boolean }
  const { productId, promoPrice, startsAt, endsAt, label, printTicket } = body
  if (!productId || !promoPrice || promoPrice <= 0 || !startsAt) return NextResponse.json({ error: 'productId, promoPrice (>0), startsAt required' }, { status: 400 })
  if (endsAt && endsAt <= startsAt) return NextResponse.json({ error: 'endsAt must be after startsAt' }, { status: 400 })

  const { data: prod } = await supabaseAdmin.from('pos_products').select('id,price').eq('id', productId).eq('business_id', bid).maybeSingle()
  if (!prod) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const originalPrice = Number(prod.price) || 0
  const effectiveDate = startsAt.split('T')[0]
  const isImmediate = effectiveDate <= new Date().toISOString().split('T')[0]
  if (isImmediate) await supabaseAdmin.from('pos_products').update({ price: promoPrice, updated_at: new Date().toISOString() }).eq('id', productId)

  const { data, error } = await supabaseAdmin.from('pos_scheduled_price_changes').insert({
    business_id: bid, product_id: productId, new_price: promoPrice,
    effective_date: effectiveDate, ends_at: endsAt ?? null,
    original_price: originalPrice, label: label ?? null,
    print_ticket: printTicket ?? false,
    status: isImmediate ? 'active' : 'scheduled',
    applied: isImmediate, applied_at: isImmediate ? new Date().toISOString() : null,
  }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ schedule: data }, { status: 201 })
}

export const GET = withErrorCapture('tickets/price-schedules', _GET)
export const POST = withErrorCapture('tickets/price-schedules', _POST)
