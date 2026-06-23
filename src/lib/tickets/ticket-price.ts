import type { SupabaseClient } from '@supabase/supabase-js'

// TICKETS-FIX+BATCH-1 — resolve the price a ticket should print + any REAL active promo. GROUNDING: the promo
// is read from pos_promotions (the real source); if there is no active promo for the product, was_price is NULL
// and no label is invented. price_snapshot is what prints big; was_price_snapshot is the struck-through original.

export interface TicketPrice {
  price_snapshot: number
  was_price_snapshot: number | null
  promo_label: string | null
}

const r2 = (n: number) => Math.round(n * 100) / 100

interface PromoRow {
  name: string | null; type: string | null; promotion_type: string | null; discount_type: string | null
  value: number | null; discount_percent: number | null; discount_amount: number | null
  product_id: string | null; product_ids: unknown; applies_to: string | null
  is_active: boolean | null; active: boolean | null
  valid_from: string | null; valid_until: string | null; starts_at: string | null; ends_at: string | null
}

function activeNow(p: PromoRow): boolean {
  if (p.is_active === false || p.active === false) return false
  const now = Date.now()
  const from = p.valid_from ?? p.starts_at
  const until = p.valid_until ?? p.ends_at
  if (from && new Date(from).getTime() > now) return false
  if (until && new Date(until).getTime() < now) return false
  return true
}

function appliesTo(p: PromoRow, productId: string): boolean {
  if (p.product_id === productId) return true
  if (Array.isArray(p.product_ids) && (p.product_ids as string[]).includes(productId)) return true
  const scope = (p.applies_to ?? '').toLowerCase()
  return scope === 'all' || scope === 'everything' || scope === 'store'
}

/** Resolve one product's ticket price + real promo (or NULL — never a fabricated discount). */
export async function resolveTicketPrice(supabase: SupabaseClient, businessId: string, product: { id: string; price: number | null }): Promise<TicketPrice> {
  const regular = Number(product.price) || 0
  try {
    const { data } = await supabase.from('pos_promotions')
      .select('name, type, promotion_type, discount_type, value, discount_percent, discount_amount, product_id, product_ids, applies_to, is_active, active, valid_from, valid_until, starts_at, ends_at')
      .eq('business_id', businessId)
    for (const raw of (data ?? []) as PromoRow[]) {
      if (!activeNow(raw) || !appliesTo(raw, product.id)) continue
      const pct = Number(raw.discount_percent ?? ((raw.discount_type === 'percentage' || raw.type === 'percentage' || raw.promotion_type === 'percentage') ? raw.value : 0)) || 0
      const amt = Number(raw.discount_amount ?? ((raw.discount_type === 'fixed' || raw.type === 'fixed' || raw.promotion_type === 'fixed') ? raw.value : 0)) || 0
      let promoPrice: number | null = null
      if (pct > 0 && pct < 100) promoPrice = regular * (1 - pct / 100)
      else if (amt > 0) promoPrice = regular - amt
      if (promoPrice != null && promoPrice >= 0 && promoPrice < regular) {
        return { price_snapshot: r2(promoPrice), was_price_snapshot: r2(regular), promo_label: raw.name || 'Special' }
      }
    }
  } catch { /* no promo table / shape → fall through to regular price (grounded) */ }
  return { price_snapshot: r2(regular), was_price_snapshot: null, promo_label: null }
}
