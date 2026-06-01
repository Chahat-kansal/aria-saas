export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

async function verifyBiz(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string, bid: string) {
  const { data } = await supabase.from('businesses').select('id').eq('id', bid).eq('user_id', userId).single()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  const weekStartParam = searchParams.get('week_start')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })
  if (!await verifyBiz(supabase, user.id, business_id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Determine week start (Mon=0 in our system)
  let weekStart: Date
  if (weekStartParam) {
    weekStart = new Date(weekStartParam)
  } else {
    weekStart = new Date()
    const dow = (weekStart.getDay() + 6) % 7 // Mon=0
    weekStart.setDate(weekStart.getDate() - dow)
  }
  weekStart.setHours(0, 0, 0, 0)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Fetch all suppliers with delivery schedules
  const { data: suppliers } = await supabaseAdmin
    .from('pos_suppliers')
    .select('id, name, short_code, delivery_days, order_cutoff_days, lead_time_days')
    .eq('business_id', business_id)
    .eq('is_active', true)

  // Fetch products with low stock for urgent alerts
  const { data: products } = await supabaseAdmin
    .from('pos_products')
    .select('id, name, stock_quantity, supplier_id')
    .eq('business_id', business_id)
    .eq('is_active', true)
    .eq('track_stock', true)
    .gt('stock_quantity', 0)
    .limit(500)

  // 30d sales velocity
  const cutoff30 = new Date(Date.now() - 30 * 86400000).toISOString()
  const { data: sales30 } = await supabaseAdmin
    .from('pos_sales')
    .select('id')
    .eq('business_id', business_id)
    .neq('status', 'voided')
    .gte('created_at', cutoff30)
    .limit(3000)

  const saleIds30 = (sales30 ?? []).map(s => s.id)
  const sold30Map = new Map<string, number>()
  if (saleIds30.length && products?.length) {
    const { data: items } = await supabaseAdmin
      .from('pos_sale_items')
      .select('product_id, quantity')
      .in('sale_id', saleIds30)
      .in('product_id', products.map(p => p.id))
      .limit(10000)
    for (const i of items ?? []) {
      sold30Map.set(i.product_id, (sold30Map.get(i.product_id) ?? 0) + i.quantity)
    }
  }

  const supplierMap = new Map((suppliers ?? []).map(s => [s.id, s]))

  // Build 7-day week grid
  interface DayEntry {
    date: string; day: string; is_today: boolean;
    deliveries: Array<{ supplier_id: string; short_code: string | null; name: string }>;
    cutoffs: Array<{ supplier_id: string; short_code: string | null; name: string; delivers_on: string }>;
  }
  const week: DayEntry[] = []

  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart)
    day.setDate(day.getDate() + i)
    const dow = i // Mon=0
    const dateStr = day.toISOString().split('T')[0]
    const isToday = day.getTime() === today.getTime()

    const deliveries: DayEntry['deliveries'] = []
    const cutoffs: DayEntry['cutoffs'] = []

    for (const s of suppliers ?? []) {
      const delivDays: number[] = s.delivery_days ?? []
      const cutoffDays: number[] = s.order_cutoff_days ?? []

      if (delivDays.includes(dow)) {
        deliveries.push({ supplier_id: s.id, short_code: s.short_code, name: s.name })
      }
      if (cutoffDays.includes(dow)) {
        // Find the next delivery day after this cutoff
        let nextDelivDay = ''
        for (let d = 1; d <= 7; d++) {
          const nextDow = (dow + d) % 7
          if (delivDays.includes(nextDow)) {
            nextDelivDay = DAY_NAMES[nextDow]
            break
          }
        }
        cutoffs.push({ supplier_id: s.id, short_code: s.short_code, name: s.name, delivers_on: nextDelivDay })
      }
    }

    week.push({ date: dateStr, day: DAY_NAMES[dow], is_today: isToday, deliveries, cutoffs })
  }

  // Build urgent alerts
  interface UrgentItem {
    supplier_id: string; name: string; product_name: string; stock_days: number; must_order_by: string
  }
  const urgent: UrgentItem[] = []

  for (const p of products ?? []) {
    const avgDaily = (sold30Map.get(p.id) ?? 0) / 30
    if (avgDaily < 0.05) continue
    const stockDays = avgDaily > 0 ? Number(p.stock_quantity ?? 0) / avgDaily : 999
    const supplier = p.supplier_id ? supplierMap.get(p.supplier_id) : null
    if (!supplier) continue
    const leadDays = supplier.lead_time_days ?? 5

    if (stockDays <= leadDays + 1) {
      // Find next cutoff day from today
      const todayDow = (today.getDay() + 6) % 7
      const cutoffDays: number[] = supplier.order_cutoff_days ?? []
      let mustOrderBy = 'ASAP'
      for (let d = 0; d <= 7; d++) {
        const checkDow = (todayDow + d) % 7
        if (cutoffDays.includes(checkDow)) {
          mustOrderBy = d === 0 ? 'Today' : DAY_NAMES[checkDow]
          break
        }
      }
      urgent.push({ supplier_id: supplier.id, name: supplier.name, product_name: p.name, stock_days: Math.round(stockDays * 10) / 10, must_order_by: mustOrderBy })
    }
  }

  urgent.sort((a, b) => a.stock_days - b.stock_days)

  return NextResponse.json({ week, urgent })
}

export const GET = withErrorCapture('warehouse/delivery-schedule', _GET)
