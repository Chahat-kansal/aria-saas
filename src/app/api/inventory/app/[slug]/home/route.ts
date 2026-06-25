export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getActingStaff } from '@/lib/inventory/staff-session'
import { resolveOutletId } from '@/lib/inventory/outlet-stock'
import { computeStockValue } from '@/lib/inventory/stock-value'
import { computeParReadonly } from '@/lib/inventory/par-levels'
import { taskAndReviewCounts } from '@/lib/inventory/daily-tasks'
import { getVisibleTiles } from '@/lib/inventory/tile-manifest'

// INV-STAFF-APP-1 — Home data. Requires the acting-staff cookie (scoped to this business). Value hero
// reuses INV-COST-1; Order badge reuses INV-PAR-1; all live, GROUNDING (sold-today is the real count).

type Params = { params: Promise<{ slug: string }> }

async function _GET(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const acting = await getActingStaff(bid)
  if (!acting) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const outletId = await resolveOutletId(supabaseAdmin, bid, new URL(req.url).searchParams.get('outlet_id'))

  // Stock value (cost/retail/completeness) for this outlet.
  const sv = await computeStockValue(supabaseAdmin, bid, outletId)

  // Sold today (AEST) — real completed units.
  const todayAest = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const startIso = new Date(`${todayAest}T00:00:00+10:00`).toISOString()
  let soldToday = 0
  try {
    const { data: sales } = await supabaseAdmin.from('pos_sales').select('id').eq('business_id', bid).eq('status', 'completed').gte('created_at', startIso).limit(5000)
    const saleIds = (sales ?? []).map(s => s.id as string)
    if (saleIds.length) {
      const { data: items } = await supabaseAdmin.from('pos_sale_items').select('quantity, returned_quantity').in('sale_id', saleIds).limit(20000)
      soldToday = (items ?? []).reduce((s, i) => s + ((Number(i.quantity) || 0) - (Number(i.returned_quantity) || 0)), 0)
    }
  } catch { /* non-fatal */ }

  // Order badge — products below reorder point (INV-PAR-1).
  let belowReorder = 0
  try { belowReorder = (await computeParReadonly(supabaseAdmin, bid)).below_count } catch { /* non-fatal */ }

  // Receive badge — POs sent and awaiting receipt (INV-SUPPLY-TILES).
  let receive = 0
  try {
    const { count } = await supabaseAdmin.from('pos_purchase_orders').select('id', { count: 'exact', head: true }).eq('business_id', bid).eq('status', 'sent')
    receive = count ?? 0
  } catch { /* non-fatal */ }

  // Expiring badge — tracked batches with stock expiring within 14 days (AEST), incl. already-expired.
  let expiring = 0
  try {
    const todayAest = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date())
    const cutoff = new Date(`${todayAest}T00:00:00+10:00`)
    cutoff.setDate(cutoff.getDate() + 14)
    const cutoffDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(cutoff)
    const { count } = await supabaseAdmin.from('pos_product_batches').select('id', { count: 'exact', head: true })
      .eq('business_id', bid).eq('expiry_tracked', true).gt('quantity_remaining', 0).lte('expiry_date', cutoffDate)
    expiring = count ?? 0
  } catch { /* table absent → 0 */ }

  // Open tasks + review queue (INV-STAFF-APP-2).
  const tr = await taskAndReviewCounts(supabaseAdmin, bid)

  // INV-1 — industry/capability-gated visible tiles (the manifest decides WHICH tiles render).
  let visible_tiles: Array<{ id: string; label: string; sublabel: string; icon: string; route: string; badge?: string }> = []
  let tile_industry = ''
  try {
    const vt = await getVisibleTiles(bid)
    tile_industry = vt.industry
    visible_tiles = vt.tiles.map(t => ({ id: t.id, label: t.label, sublabel: t.sublabel, icon: t.icon, route: t.route, badge: t.badge }))
  } catch { /* manifest non-fatal — page falls back to its built-in tiles */ }

  return NextResponse.json({
    staff: { id: acting.staff_id, name: acting.staff_name },
    visible_tiles,
    tile_industry,
    value_hero: {
      at_cost: sv.at_cost, at_retail: sv.at_retail, margin_pct: sv.margin_pct,
      products_valued: sv.products_valued, products_total: sv.products_total, uncosted: sv.products_unknown_cost,
    },
    mini_stats: { sold_today: soldToday, tasks_open: tr.open_tasks, to_review: tr.open_reviews },
    tile_badges: { order: belowReorder, expiring, receive },
  })
}

export const GET = withErrorCapture('inventory/app/home', _GET)
