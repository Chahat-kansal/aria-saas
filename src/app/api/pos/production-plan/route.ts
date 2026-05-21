export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: a } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (a?.business_id) return a.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ plans: [] })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ plans: [] })
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') ?? new Date().toISOString().split('T')[0]
  const { data } = await supabase.from('pos_production_plans')
    .select('*').eq('business_id', bid).eq('plan_date', date).order('product_name')
  return NextResponse.json({ plans: data ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  const body = await req.json()

  // If generating AI plan — get sales velocity for each product
  if (body.ai_generate) {
    const date = body.date ?? new Date().toISOString().split('T')[0]
    const dayOfWeek = new Date(date).toLocaleDateString('en-AU', { weekday: 'long' })

    // Get last 4 weeks same-day sales
    const dow = new Date(date).getDay()
    const { data: sales } = await supabaseAdmin
      .from('pos_sale_items')
      .select('product_id, product_name, quantity')
      .eq('business_id', bid)
    
    // Group by product, calculate avg
    const totals: Record<string, { name: string; total: number; count: number }> = {}
    for (const s of (sales ?? [])) {
      if (!totals[s.product_id]) totals[s.product_id] = { name: s.product_name, total: 0, count: 0 }
      totals[s.product_id].total += s.quantity
      totals[s.product_id].count += 1
    }

    const plans = Object.entries(totals)
      .map(([product_id, v]) => ({
        business_id: bid,
        plan_date: date,
        product_id,
        product_name: v.name,
        planned_qty: Math.ceil((v.total / Math.max(v.count, 1)) * 1.2), // 20% buffer
        notes: `AI estimate for ${dayOfWeek} based on sales history`,
      }))
      .filter(p => p.planned_qty > 0)
      .slice(0, 30)

    if (plans.length > 0) {
      await supabaseAdmin.from('pos_production_plans').upsert(plans, { onConflict: 'business_id,plan_date,product_id' })
    }
    return NextResponse.json({ plans, ai: true, day: dayOfWeek })
  }

  // Manual add/update single item
  const { data, error } = await supabaseAdmin.from('pos_production_plans').upsert({
    business_id: bid,
    plan_date: body.plan_date,
    product_id: body.product_id,
    product_name: body.product_name,
    planned_qty: Number(body.planned_qty ?? 0),
    actual_qty: body.actual_qty != null ? Number(body.actual_qty) : null,
    notes: body.notes ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'business_id,plan_date,product_id' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plan: data })
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  await supabaseAdmin.from('pos_production_plans').update({ actual_qty: body.actual_qty, notes: body.notes, updated_at: new Date().toISOString() }).eq('id', body.id)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('pos/production-plan', _GET)
export const POST = withErrorCapture('pos/production-plan', _POST)
export const PATCH = withErrorCapture('pos/production-plan', _PATCH)
