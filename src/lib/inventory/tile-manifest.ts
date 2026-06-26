import { supabaseAdmin } from '@/lib/supabase-admin'

// INV-1 — Inventory tile manifest: the SINGLE SOURCE OF TRUTH for which inventory tiles render, gated by
// industry + capability flags. The 45 inventory functions are DATA — adding a tile later is one entry here,
// no routing rewrite. getVisibleTiles(businessId) resolves the business's industry + capabilities and returns
// the ordered visible subset (café ≈ 20, grocery ≈ 35, supermarket = 45). Reuses lib/industry/registry.ts.

// Resolved inventory-industry kind (broader than the raw businesses.industry enum — folds in subtype so a
// retail+grocery store resolves to 'grocery', a large multi-outlet grocery to 'supermarket').
export type InvIndustry =
  | 'retail' | 'cafe' | 'bakery' | 'restaurant' | 'grocery' | 'convenience'
  | 'liquor' | 'fashion' | 'pharmacy' | 'warehouse' | 'supermarket'

export type InvCapability = 'multiOutlet' | 'perishable' | 'weighed' | 'onlineOrders'

export interface InvCapabilities {
  multiOutlet: boolean
  perishable: boolean
  weighed: boolean
  onlineOrders: boolean
}

export interface TileEntry {
  id: string
  label: string
  /** Short sub-label / stat hint shown under the label (the live stat is filled by the home route). */
  sublabel: string
  /** Semantic icon key — the Pipel skin (CX-UI-POLISH) maps this to an SVG; functional build uses a fallback. */
  icon: string
  /** Tile key the staff-app routes on (matches existing screens where implemented, else a "soon" stub). */
  route: string
  /** Industries that see this tile. 'supermarket' is the superset → it appears on ALL entries. */
  industries: InvIndustry[]
  /** ALL of these capabilities must be present for the tile to show (AND). [] = no capability gate. */
  capabilities: InvCapability[]
  /** Optional live-badge key the home route fills (e.g. 'order', 'expiring', 'receive'). */
  badge?: string
}

// Industry groups (every group includes 'supermarket' so the supermarket superset = all 45).
const ALL: InvIndustry[] = ['retail', 'cafe', 'bakery', 'restaurant', 'grocery', 'convenience', 'liquor', 'fashion', 'pharmacy', 'warehouse', 'supermarket']
const CAFE = ['cafe', 'bakery', 'restaurant', 'grocery', 'convenience', 'supermarket'] as InvIndustry[]      // food/perishable-facing, café included
const FOOD_BIG = ['bakery', 'restaurant', 'grocery', 'convenience', 'supermarket'] as InvIndustry[]           // perishable but NOT café-scale
const RETAILY = ['retail', 'grocery', 'convenience', 'liquor', 'fashion', 'pharmacy', 'warehouse', 'supermarket'] as InvIndustry[]
const GROCERY_UP = ['grocery', 'supermarket'] as InvIndustry[]                                                // grocery + supermarket
const SUPER_ONLY = ['supermarket'] as InvIndustry[]                                                           // supermarket-scale advanced ops

// The 45 inventory functions. Order = display order.
export const INVENTORY_TILES: TileEntry[] = [
  // ── Core (every industry; café sees all of these) ──
  { id: 'scan', label: 'Scan', sublabel: 'look up an item', icon: 'scan', route: 'scan', industries: ALL, capabilities: [] },
  { id: 'count', label: 'Stock count', sublabel: 'count on hand', icon: 'check-square', route: 'stocktake', industries: ALL, capabilities: [] },
  { id: 'price_check', label: 'Price check', sublabel: 'scan a price', icon: 'tag', route: 'scan', industries: ALL, capabilities: [] },
  { id: 'locate', label: 'Locate stock', sublabel: 'find where it is', icon: 'map-pin', route: 'scan', industries: ALL, capabilities: [] },
  { id: 'receive', label: 'Receive', sublabel: 'log a delivery', icon: 'truck', route: 'receive', industries: ALL, capabilities: [], badge: 'receive' },
  { id: 'adjust', label: 'Adjust', sublabel: 'fix a count', icon: 'edit', route: 'adjust', industries: ALL, capabilities: [] },
  { id: 'waste', label: 'Waste', sublabel: 'log spoilage', icon: 'trash', route: 'waste', industries: ALL, capabilities: [] },
  { id: 'order', label: 'Reorder', sublabel: 'reorder needs', icon: 'shopping-cart', route: 'order', industries: ALL, capabilities: [], badge: 'order' },
  { id: 'low_stock', label: 'Low stock', sublabel: 'below reorder', icon: 'alert-triangle', route: 'order', industries: ALL, capabilities: [], badge: 'order' },
  { id: 'stock_value', label: 'Stock value', sublabel: 'on-hand value', icon: 'dollar-sign', route: 'home', industries: ALL, capabilities: [] },
  { id: 'reports', label: 'Reports', sublabel: 'inventory reports', icon: 'bar-chart', route: 'reports', industries: ALL, capabilities: [] },
  { id: 'tasks', label: 'Tasks', sublabel: 'today\'s list', icon: 'list', route: 'tasks', industries: ALL, capabilities: [] },
  { id: 'review', label: 'Review', sublabel: 'owner review', icon: 'shield', route: 'review', industries: ALL, capabilities: [] },
  { id: 'recall', label: 'Recall', sublabel: 'on-hold & loss', icon: 'alert-triangle', route: 'loss', industries: ALL, capabilities: [] },
  { id: 'movement_audit', label: 'Movement audit', sublabel: 'stock ledger', icon: 'activity', route: 'reports', industries: ALL, capabilities: [] },

  // ── Perishable (café sees the first four; bigger food retailers add the rest) ──
  { id: 'production', label: 'Production', sublabel: 'prep & recipes', icon: 'layers', route: 'fresh', industries: CAFE, capabilities: ['perishable'] },
  { id: 'expiring', label: 'Expiring', sublabel: 'near expiry', icon: 'clock', route: 'expiring', industries: CAFE, capabilities: ['perishable'], badge: 'expiring' },
  { id: 'fefo', label: 'FEFO', sublabel: 'first-expiry first-out', icon: 'sort-asc', route: 'expiring', industries: CAFE, capabilities: ['perishable'] },
  { id: 'batches', label: 'Batches', sublabel: 'batch tracking', icon: 'layers', route: 'expiring', industries: CAFE, capabilities: ['perishable'] },
  { id: 'markdown', label: 'Markdown', sublabel: 'clear expiring', icon: 'percent', route: 'expiring', industries: CAFE, capabilities: ['perishable'] },
  { id: 'shelf_life', label: 'Shelf life', sublabel: 'use-by monitor', icon: 'calendar', route: 'expiring', industries: FOOD_BIG, capabilities: ['perishable'] },
  { id: 'waste_expiry', label: 'Expiry waste', sublabel: 'expired write-off', icon: 'trash-2', route: 'waste', industries: FOOD_BIG, capabilities: ['perishable'] },

  // ── Multi-outlet (café with >1 outlet sees Transfer + its history) ──
  { id: 'transfer', label: 'Transfer', sublabel: 'between outlets', icon: 'repeat', route: 'transfer', industries: ALL, capabilities: ['multiOutlet'] },
  { id: 'transfer_history', label: 'Transfer log', sublabel: 'past transfers', icon: 'git-branch', route: 'transfer', industries: ALL, capabilities: ['multiOutlet'] },
  { id: 'outlet_compare', label: 'Outlet compare', sublabel: 'stock by outlet', icon: 'columns', route: 'home', industries: GROCERY_UP, capabilities: ['multiOutlet'] },
  { id: 'central_stock', label: 'Central stock', sublabel: 'all outlets', icon: 'database', route: 'home', industries: SUPER_ONLY, capabilities: ['multiOutlet'] },

  // ── Retail / grocery operations ──
  { id: 'tickets', label: 'Price tickets', sublabel: 'scan to print', icon: 'printer', route: 'tickets', industries: RETAILY, capabilities: [] },
  { id: 'count_history', label: 'Count history', sublabel: 'past counts', icon: 'clock-history', route: 'tasks', industries: RETAILY, capabilities: [] },
  { id: 'dead_stock', label: 'Dead stock', sublabel: 'no sales 90d', icon: 'archive', route: 'reports', industries: RETAILY, capabilities: [] },
  { id: 'suppliers', label: 'Suppliers', sublabel: 'supplier list', icon: 'users', route: 'order', industries: RETAILY, capabilities: [] },
  { id: 'purchase_orders', label: 'Purchase orders', sublabel: 'POs', icon: 'file-text', route: 'receive', industries: RETAILY, capabilities: [], badge: 'receive' },
  { id: 'cost_capture', label: 'Cost capture', sublabel: 'unit costs', icon: 'percent-circle', route: 'receive', industries: RETAILY, capabilities: [] },
  { id: 'shelf_capacity', label: 'Shelf capacity', sublabel: 'facings / shelf', icon: 'grid', route: 'home', industries: RETAILY, capabilities: [] },
  { id: 'backroom', label: 'Backroom', sublabel: 'back vs shelf', icon: 'box', route: 'home', industries: RETAILY, capabilities: [] },
  { id: 'age_restricted', label: 'Age-restricted', sublabel: 'restricted register', icon: 'lock', route: 'home', industries: GROCERY_UP, capabilities: [] },

  // ── Weighed (deli / produce / butcher) ──
  { id: 'weigh', label: 'Weigh & label', sublabel: 'weighed items', icon: 'scale', route: 'home', industries: GROCERY_UP, capabilities: ['weighed'] },
  { id: 'avg_weight', label: 'Avg weight', sublabel: 'piece weight', icon: 'sigma', route: 'reports', industries: GROCERY_UP, capabilities: ['weighed'] },
  { id: 'shrink_trim', label: 'Trim shrink', sublabel: 'prep loss', icon: 'scissors', route: 'waste', industries: GROCERY_UP, capabilities: ['weighed'] },
  { id: 'scale_link', label: 'Scale link', sublabel: 'scale integration', icon: 'cpu', route: 'home', industries: SUPER_ONLY, capabilities: ['weighed'] },

  // ── Online orders (pick/pack, OOS sync) ──
  { id: 'pick_pack', label: 'Pick & pack', sublabel: 'online orders', icon: 'package', route: 'home', industries: GROCERY_UP, capabilities: ['onlineOrders'] },
  { id: 'oos_sync', label: 'Out-of-stock sync', sublabel: 'hide sold-out', icon: 'wifi-off', route: 'home', industries: SUPER_ONLY, capabilities: ['onlineOrders'] },
  { id: 'reserve_stock', label: 'Reserved stock', sublabel: 'held for orders', icon: 'bookmark', route: 'home', industries: SUPER_ONLY, capabilities: ['onlineOrders'] },

  // ── Supermarket-scale advanced ops ──
  { id: 'planogram', label: 'Planogram', sublabel: 'shelf layout', icon: 'layout', route: 'home', industries: SUPER_ONLY, capabilities: [] },
  { id: 'gap_scan', label: 'Gap scan', sublabel: 'on-shelf availability', icon: 'search', route: 'scan', industries: SUPER_ONLY, capabilities: [] },
  { id: 'abc_analysis', label: 'ABC analysis', sublabel: 'velocity class', icon: 'trending-up', route: 'reports', industries: SUPER_ONLY, capabilities: [] },
  { id: 'supplier_performance', label: 'Supplier scorecard', sublabel: 'fill / lead time', icon: 'award', route: 'reports', industries: SUPER_ONLY, capabilities: [] },
  { id: 'promo_stock', label: 'Promo readiness', sublabel: 'promo stock', icon: 'gift', route: 'home', industries: SUPER_ONLY, capabilities: [] },
]

/** Resolve businesses.industry + subtype + scale → the inventory-industry kind. */
export function resolveInvIndustry(industry: string | null | undefined, subtype: string | null | undefined, opts?: { multiOutlet?: boolean }): InvIndustry {
  const ind = (industry ?? '').toLowerCase()
  const sub = (subtype ?? '').toLowerCase()
  if (ind === 'cafe') return 'cafe'
  if (ind === 'bakery') return 'bakery'
  if (ind === 'restaurant') return 'restaurant'
  if (ind === 'pharmacy') return 'pharmacy'
  if (ind === 'warehouse') return 'warehouse'
  if (ind === 'retail') {
    if (sub === 'liquor') return 'liquor'
    if (sub === 'fashion') return 'fashion'
    if (sub === 'convenience') return 'convenience'
    // a grocery store is grocery; a multi-outlet grocery is treated as supermarket-scale (full tile set)
    if (sub === 'grocery') return opts?.multiOutlet ? 'supermarket' : 'grocery'
    return 'retail'
  }
  return 'retail'
}

/** Pure filter — the testable core of getVisibleTiles. */
export function filterTiles(industry: InvIndustry, caps: InvCapabilities): TileEntry[] {
  return INVENTORY_TILES.filter(t =>
    t.industries.includes(industry) &&
    t.capabilities.every(c => caps[c] === true),
  )
}

/**
 * Resolve a business's industry + live capability flags from the DB, then return the ordered visible tiles.
 * Per-outlet aware (multiOutlet from pos_outlets), perishable from industry, weighed from weight-based products,
 * onlineOrders from pos_online_settings. RLS-safe: reads via service role, scoped to the business id.
 */
export async function getVisibleTiles(businessId: string): Promise<{ industry: InvIndustry; capabilities: InvCapabilities; tiles: TileEntry[] }> {
  const [{ data: biz }, { count: outletCount }, { count: weighed }, { data: online }] = await Promise.all([
    supabaseAdmin.from('businesses').select('industry, industry_subtype').eq('id', businessId).maybeSingle(),
    supabaseAdmin.from('pos_outlets').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('is_active', true),
    supabaseAdmin.from('pos_products').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('is_weight_based', true).eq('is_active', true),
    supabaseAdmin.from('pos_online_settings').select('accept_orders').eq('business_id', businessId).maybeSingle(),
  ])

  const multiOutlet = (outletCount ?? 0) > 1
  const rawIndustry = (biz?.industry as string | null) ?? null
  const subtype = (biz?.industry_subtype as string | null) ?? null
  const industry = resolveInvIndustry(rawIndustry, subtype, { multiOutlet })

  const FOOD = new Set(['cafe', 'bakery', 'restaurant', 'grocery', 'convenience', 'supermarket'])
  const caps: InvCapabilities = {
    multiOutlet,
    perishable: FOOD.has(industry),
    weighed: (weighed ?? 0) > 0 || industry === 'grocery' || industry === 'supermarket',
    onlineOrders: (online?.accept_orders as boolean | null) === true,
  }

  return { industry, capabilities: caps, tiles: filterTiles(industry, caps) }
}
