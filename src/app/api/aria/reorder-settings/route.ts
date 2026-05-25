export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: a } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (a?.business_id) return a.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

// GET — load settings + per-product overrides
async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const [{ data: settings }, { data: products }] = await Promise.all([
    supabaseAdmin.from('reorder_settings').select('*').eq('business_id', bid).maybeSingle(),
    supabaseAdmin.from('pos_products')
      .select('id, name, sku, stock_quantity, reorder_point, reorder_qty, target_stock, reorder_notes, low_stock_threshold, pos_categories(name)')
      .eq('business_id', bid).eq('is_active', true).eq('track_stock', true).order('name'),
  ])

  return NextResponse.json({ settings, products: products ?? [] })
}

// POST — upsert settings + bulk product overrides
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json()
  const { settings, product_overrides } = body

  // Upsert business settings
  if (settings) {
    await supabaseAdmin.from('reorder_settings').upsert({
      business_id: bid,
      default_reorder_qty: Number(settings.default_reorder_qty) || 12,
      buffer_weeks: Number(settings.buffer_weeks) || 2,
      min_velocity_per_day: Number(settings.min_velocity_per_day) || 0,
      max_stock_trigger: Number(settings.max_stock_trigger) || 0,
      velocity_period: settings.velocity_period || 'day',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'business_id' })
  }

  // Apply per-product overrides
  if (product_overrides && Array.isArray(product_overrides)) {
    for (const ov of product_overrides) {
      await supabaseAdmin.from('pos_products').update({
        reorder_qty: ov.reorder_qty != null ? Number(ov.reorder_qty) : null,
        reorder_point: ov.reorder_point != null ? Number(ov.reorder_point) : null,
        target_stock: ov.target_stock != null ? Number(ov.target_stock) : null,
        reorder_notes: ov.reorder_notes || null,
      }).eq('id', ov.id).eq('business_id', bid)
    }
  }

  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('aria/reorder-settings', _GET)
export const POST = withErrorCapture('aria/reorder-settings', _POST)
