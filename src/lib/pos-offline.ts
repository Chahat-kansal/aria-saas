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
