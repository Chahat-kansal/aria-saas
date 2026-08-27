// Aria POS offline mode — localStorage persistence for resilience during network issues

const KEYS = {
  CART: 'aria_pos_cart',
  PRODUCTS: 'aria_pos_products_cache',
  SESSION: 'aria_pos_session_cache',
  OFFLINE_QUEUE: 'aria_pos_offline_queue',
  PRODUCTS_TS: 'aria_pos_products_cache_ts',
};

const PRODUCTS_TTL = 15 * 60 * 1000; // 15 minutes

export interface OfflineSale {
  id: string;
  items: any[];
  total_amount: number;
  payment_method: string;
  customer_id: string | null;
  created_at: string;
  queued_at: string;
}

function safeGet<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function safeSet(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage full or not available */ }
}

export function saveCartToStorage(cart: any[]): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(KEYS.CART, JSON.stringify(cart));
  } catch { /* session storage not available */ }
}

export function loadCartFromStorage(): any[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(KEYS.CART);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearCartFromStorage(): void {
  if (typeof window === 'undefined') return;
  try { sessionStorage.removeItem(KEYS.CART); } catch (e) { console.warn('[non-fatal]', e) }
}

export function saveProductsToCache(products: any[]): void {
  safeSet(KEYS.PRODUCTS, products);
  safeSet(KEYS.PRODUCTS_TS, Date.now());
}

export function loadProductsFromCache(): { products: any[]; stale: boolean } | null {
  const products = safeGet<any[]>(KEYS.PRODUCTS);
  if (!products) return null;
  const ts = safeGet<number>(KEYS.PRODUCTS_TS);
  const stale = !ts || (Date.now() - ts) > PRODUCTS_TTL;
  return { products, stale };
}

export function saveSessionToCache(session: any): void {
  safeSet(KEYS.SESSION, session);
}

export function loadSessionFromCache(): any | null {
  return safeGet(KEYS.SESSION);
}

export function clearSessionCache(): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(KEYS.SESSION); } catch (e) { console.warn('[non-fatal]', e) }
}

export function queueOfflineSale(sale: Omit<OfflineSale, 'queued_at'>): void {
  const queue = safeGet<OfflineSale[]>(KEYS.OFFLINE_QUEUE) ?? [];
  queue.push({ ...sale, queued_at: new Date().toISOString() });
  safeSet(KEYS.OFFLINE_QUEUE, queue);
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * POS-OFFLINE-1a — THE QUEUE, v2.
 *
 * The v1 shape above is KEPT (RULE 0) and still readable, because a real till may have v1 items in
 * localStorage right now that have never synced — see readQueue()'s legacy branch.
 *
 * WHAT CHANGED AND WHY, because the old design could not work:
 *
 *  1. THE QUEUED SHAPE DID NOT MATCH WHAT THE SERVER READ. queueOfflineSale() stored
 *     `total_amount` (dollars) and items with `unit_price`/`line_total`; sync-offline read
 *     `total_cents`, `subtotal_cents`, `tax_cents` and `unit_price_cents`. Every one of those was
 *     `undefined` on arrival, so `undefined / 100` produced NaN, which serialises to null, and
 *     pos_sales.total_amount is NOT NULL. Every offline sale failed its insert — which is exactly
 *     why `select count(*) from pos_sales where synced_from_offline = true` is 0 in production.
 *
 *  2. A QUEUED ITEM NOW CARRIES ITS OWN IDENTITY (`ref`). It is the idempotency key for the replay,
 *     so a sale that is retried after a partial batch failure cannot become a second charge.
 *     Retrying without this would be worse than the bug it fixes.
 *
 *  3. IT CARRIES `attempts`, so a poison pill stops being retried forever — but is NEVER dropped.
 *     An unsynced sale the owner can see beats a sale nobody knows existed.
 *
 * The stored `body` is deliberately the SAME payload the till failed to POST to /api/pos/sale.
 * Queue the request you could not send, replay it verbatim — no second serialisation format to
 * drift, and the server replays it through the same createSale() every online sale uses.
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The idempotency key for a replayed offline sale — the reason retrying is safe at all.
 *
 * It lives HERE, not in the route, for two reasons. Next.js route files may export only route
 * handlers and their config, so exporting it there is a `tsc` error (TS2344). And the queue is what
 * owns a sale's identity: the ref is minted when the sale is queued, so the key derived from it
 * belongs beside the queue, where a test can reach it without importing a route.
 */
export function offlineIdempotencyKey(businessId: string, ref: string): string {
  return 'sale-' + businessId + '-offline-' + ref
}

/** Stop retrying after this many failures. The item is KEPT and surfaced, never discarded. */
export const MAX_SYNC_ATTEMPTS = 5

export interface QueuedSaleBodyItem {
  product_id?: string | null
  product_name: string
  quantity: number
  unit_price: number
  line_total: number
  tax_rate?: number
  discount_percent?: number
}

/** Exactly the body /api/pos/sale accepts. */
export interface QueuedSaleBody {
  business_id?: string | null
  session_id?: string | null
  items: QueuedSaleBodyItem[]
  payment_method: string
  subtotal: number
  tax_amount: number
  discount_amount?: number
  total_amount: number
  cash_tendered?: number | null
  change_given?: number | null
  customer_id?: string | null
  outlet_id?: string | null
}

export interface QueuedSale {
  /** Stable identity, minted once when the sale is queued. The replay's idempotency key. */
  ref: string
  queued_at: string
  /** Failed sync attempts. Never causes a drop — only a pause. */
  attempts: number
  /** Set once attempts hits MAX_SYNC_ATTEMPTS, so the till can surface it to the owner. */
  stuck?: boolean
  last_error?: string | null
  body: QueuedSaleBody
}

function isV2(row: unknown): row is QueuedSale {
  return !!row && typeof row === 'object' && 'ref' in (row as object) && 'body' in (row as object)
}

/**
 * Converts a v1 queued sale into the v2 shape.
 *
 * ⚠️ TAX IS DERIVED, NOT INVENTED: `tax_amount = total_amount - subtotal`, where subtotal is the sum
 * of the recorded line totals. Both inputs are figures the till actually recorded, so this is
 * arithmetic, not a guess. It deliberately does NOT fall back to "10% GST" — a fabricated tax figure
 * on a real sale is exactly what GROUNDING-TEETH forbids, and it would flow straight into BAS.
 */
export function adaptLegacyQueuedSale(row: Record<string, unknown>): QueuedSale | null {
  const rawItems = Array.isArray(row.items) ? row.items as Array<Record<string, unknown>> : []
  if (rawItems.length === 0) return null

  const items: QueuedSaleBodyItem[] = rawItems.map(i => ({
    product_id: (i.product_id as string | undefined) ?? null,
    product_name: String(i.product_name ?? i.name ?? 'Unknown item'),
    quantity: Number(i.quantity) || 0,
    unit_price: Number(i.unit_price ?? (Number(i.unit_price_cents) || 0) / 100) || 0,
    line_total: Number(i.line_total ?? (Number(i.total_cents) || 0) / 100) || 0,
    tax_rate: Number(i.tax_rate) || 10,
    discount_percent: 0,
  }))

  const total = Number(row.total_amount ?? (Number(row.total_cents) || 0) / 100) || 0
  let subtotal = 0
  for (const i of items) subtotal += i.line_total
  subtotal = +subtotal.toFixed(2)
  const tax = +(total - subtotal).toFixed(2)

  return {
    ref: String(row.id ?? row.ref ?? ''),
    queued_at: String(row.queued_at ?? row.created_at ?? ''),
    attempts: Number(row.attempts) || 0,
    body: {
      items,
      payment_method: String(row.payment_method ?? 'cash'),
      subtotal,
      // Never negative: a malformed legacy row must not produce a negative tax figure.
      tax_amount: tax > 0 ? tax : 0,
      discount_amount: 0,
      total_amount: total,
      customer_id: (row.customer_id as string | undefined) ?? null,
      session_id: (row.session_id as string | undefined) ?? null,
    },
  }
}

/** Reads the queue, upgrading any v1 rows in place. Unreadable rows are dropped, never silently. */
export function readQueue(): QueuedSale[] {
  const raw = safeGet<unknown[]>(KEYS.OFFLINE_QUEUE) ?? []
  const out: QueuedSale[] = []
  for (const row of raw) {
    if (isV2(row)) { out.push(row); continue }
    const adapted = adaptLegacyQueuedSale((row ?? {}) as Record<string, unknown>)
    if (adapted && adapted.ref) out.push(adapted)
    else console.error('[pos-offline] unreadable queued sale dropped:', JSON.stringify(row))
  }
  return out
}

export function writeQueue(queue: QueuedSale[]): void {
  safeSet(KEYS.OFFLINE_QUEUE, queue)
}

/** Queues a sale in the v2 shape: the exact body that failed to POST, plus its identity. */
export function queueSaleV2(ref: string, body: QueuedSaleBody): void {
  const queue = readQueue()
  queue.push({ ref, queued_at: new Date().toISOString(), attempts: 0, body })
  writeQueue(queue)
}

/**
 * Applies a sync result. THE HEART OF THIS SPRINT.
 *
 * Only refs the SERVER CONFIRMED are removed. Everything else stays queued with its attempt count
 * incremented — because the previous behaviour ("if anything synced, clear the whole queue") turned
 * one bad row in a batch of ten into nine destroyed sales.
 */
export function applySyncResult(
  queue: QueuedSale[],
  synced: string[],
  failed: Array<{ ref: string; reason: string }>,
): QueuedSale[] {
  const confirmed = new Set(synced)
  const reasons = new Map(failed.map(f => [f.ref, f.reason]))
  const next: QueuedSale[] = []

  for (const item of queue) {
    if (confirmed.has(item.ref)) continue          // the ONLY reason a sale leaves the queue
    const reason = reasons.get(item.ref)
    if (reason === undefined) { next.push(item); continue }  // server never spoke about it
    const attempts = item.attempts + 1
    next.push({
      ...item,
      attempts,
      stuck: attempts >= MAX_SYNC_ATTEMPTS,
      last_error: reason,
    })
  }
  return next
}

/** Items the till should stop auto-retrying and show the owner instead. Still in the queue. */
export function stuckSales(queue: QueuedSale[]): QueuedSale[] {
  return queue.filter(s => s.attempts >= MAX_SYNC_ATTEMPTS)
}

/** What to send this round — everything not yet exhausted. */
export function syncableSales(queue: QueuedSale[]): QueuedSale[] {
  return queue.filter(s => s.attempts < MAX_SYNC_ATTEMPTS)
}

export function getOfflineQueue(): OfflineSale[] {
  return safeGet<OfflineSale[]>(KEYS.OFFLINE_QUEUE) ?? [];
}

export function clearOfflineQueue(): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(KEYS.OFFLINE_QUEUE); } catch (e) { console.warn('[non-fatal]', e) }
}

export function removeFromOfflineQueue(id: string): void {
  const queue = getOfflineQueue().filter(s => s.id !== id);
  safeSet(KEYS.OFFLINE_QUEUE, queue);
}

export function isOnline(): boolean {
  if (typeof window === 'undefined') return true;
  return navigator.onLine;
}
