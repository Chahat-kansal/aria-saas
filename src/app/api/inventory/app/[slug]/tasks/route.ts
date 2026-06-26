export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getActingStaff } from '@/lib/inventory/staff-session'
import { resolveOutletId } from '@/lib/inventory/outlet-stock'
import { generateDailyTasks, getTodayTasks } from '@/lib/inventory/daily-tasks'
import { generateGuidanceTasks, completeTask } from '@/lib/inventory/guidance'

// INV-STAFF-APP-2 / INV-6 — today's tasks for the acting staff. Generates (idempotently) the base par/cycle/expiry
// set PLUS the INV-6 velocity/weather signals, enriches count tasks with the live "expected" (items_on_hand) for
// the count card, and computes the staff's real habit pills. POST completes a non-count task (attributed).

type Params = { params: Promise<{ slug: string }> }

async function _GET(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const acting = await getActingStaff(bid)
  if (!acting) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const outletId = await resolveOutletId(supabaseAdmin, bid, new URL(req.url).searchParams.get('outlet_id'))
  await generateDailyTasks(supabaseAdmin, bid, outletId)        // base: par / cycle / expiry
  await generateGuidanceTasks(supabaseAdmin, bid, outletId)     // INV-6: velocity / weather (idempotent, once/day)
  const tasks = await getTodayTasks(supabaseAdmin, bid, outletId)

  // Enrich count/cycle_count tasks with the product's name/sku + live expected (items_on_hand).
  const productIds = Array.from(new Set(tasks.filter(t => t.product_id).map(t => t.product_id as string)))
  const nameMap = new Map<string, { name: string; sku: string | null }>()
  const onHandMap = new Map<string, number>()
  if (productIds.length) {
    const [{ data: prods }, { data: invs }] = await Promise.all([
      supabaseAdmin.from('pos_products').select('id, name, sku').in('id', productIds),
      outletId ? supabaseAdmin.from('pos_outlet_inventory').select('product_id, items_on_hand').eq('business_id', bid).eq('outlet_id', outletId).in('product_id', productIds) : Promise.resolve({ data: [] }),
    ])
    for (const p of prods ?? []) nameMap.set(p.id as string, { name: (p.name as string) ?? 'Item', sku: (p.sku as string | null) ?? null })
    for (const r of (invs ?? []) as Array<{ product_id: string; items_on_hand: number }>) onHandMap.set(r.product_id, Number(r.items_on_hand) || 0)
  }

  const enriched = tasks.map(t => ({
    ...t,
    product_name: t.product_id ? (nameMap.get(t.product_id)?.name ?? null) : null,
    product_sku: t.product_id ? (nameMap.get(t.product_id)?.sku ?? null) : null,
    expected: t.product_id && onHandMap.has(t.product_id) ? onHandMap.get(t.product_id)! : null,
  }))

  // Habit pills — count accuracy from THIS staff's own stock-take history.
  const { data: takes } = await supabaseAdmin.from('pos_stock_takes')
    .select('items_counted, items_with_variance, completed_at').eq('business_id', bid).eq('started_by', acting.staff_id).limit(2000)
  const counted = (takes ?? []).reduce((s, t) => s + (Number(t.items_counted) || 0), 0)
  const variances = (takes ?? []).reduce((s, t) => s + (Number(t.items_with_variance) || 0), 0)
  const accuracy = counted > 0 ? Math.round((1 - variances / counted) * 100) : null
  // Streak: consecutive days (ending today, AEST) with ≥1 task this staff completed.
  const { data: doneTasks } = await supabaseAdmin.from('inventory_tasks')
    .select('completed_at').eq('business_id', bid).eq('completed_by', acting.staff_id).not('completed_at', 'is', null).order('completed_at', { ascending: false }).limit(120)
  const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(d)
  const doneDays = new Set((doneTasks ?? []).map(t => dayKey(new Date(t.completed_at as string))))
  let streak = 0
  for (let i = 0; i < 60; i++) { const d = new Date(Date.now() - i * 86400000); if (doneDays.has(dayKey(d))) streak++; else if (i > 0) break; else break }
  const leftToday = enriched.filter(t => t.status === 'open').length

  return NextResponse.json({
    acting: { id: acting.staff_id, name: acting.staff_name },
    tasks: enriched,
    pills: { accuracy, streak, left_today: leftToday },
  })
}

// POST — complete a non-count task (velocity/weather/expiring/receive), attributed. count/cycle_count tasks
// complete through the INV-4 count flow (/count claims the task) — this never duplicates that path.
async function _POST(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const acting = await getActingStaff(bid)
  if (!acting) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const body = await req.json().catch(() => ({})) as { action?: string; task_id?: string }
  if (body.action !== 'complete' || !body.task_id) return NextResponse.json({ error: 'action=complete and task_id required' }, { status: 400 })
  const res = await completeTask(supabaseAdmin, bid, body.task_id, acting.staff_id)
  return NextResponse.json({ ...res, by: acting.staff_name })
}

export const GET = withErrorCapture('inventory/app/tasks', _GET)
export const POST = withErrorCapture('inventory/app/tasks:post', _POST)
