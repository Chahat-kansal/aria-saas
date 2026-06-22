import { supabaseAdmin } from '@/lib/supabase-admin'

// LOY-PRELOAD — stored-value helpers. All balance mutations go through the money-safe SECURITY DEFINER
// RPCs (locking, append-only ledger, never-negative). This module only reads config/state and forwards
// to those RPCs — it never mutates a balance directly. Money (preload) is kept strictly separate from
// points (the loyalty ledger) — no cross-contamination.

export interface PreloadConfig { enabled: boolean; amounts: number[]; bonusThreshold: number; bonusAmount: number }

export async function readPreloadConfig(businessId: string): Promise<PreloadConfig> {
  const { data } = await supabaseAdmin.from('pos_loyalty_config')
    .select('preload_enabled, preload_amounts, preload_bonus_threshold, preload_bonus_amount').eq('business_id', businessId).maybeSingle()
  const amounts = Array.isArray(data?.preload_amounts) ? (data!.preload_amounts as unknown[]).map(n => Number(n)).filter(n => n > 0) : [20, 50, 100]
  return {
    enabled: !!data?.preload_enabled,
    amounts: amounts.length ? amounts : [20, 50, 100],
    bonusThreshold: Number(data?.preload_bonus_threshold ?? 0),
    bonusAmount: Number(data?.preload_bonus_amount ?? 0),
  }
}

/** The load-bonus a member earns for loading `amount` (server-computed; never trust the client). */
export function computeBonus(amount: number, cfg: PreloadConfig): number {
  if (cfg.bonusThreshold > 0 && cfg.bonusAmount > 0 && amount >= cfg.bonusThreshold) return cfg.bonusAmount
  return 0
}

export interface LedgerEntry { entry_type: string; amount: number; balance_after: number; note: string | null; created_at: string }

export async function getPreloadState(businessId: string, customerId: string): Promise<{ balance: number; ledger: LedgerEntry[] }> {
  const { data: acct } = await supabaseAdmin.from('loyalty_preload_accounts')
    .select('balance').eq('business_id', businessId).eq('customer_id', customerId).maybeSingle()
  const { data: ledger } = await supabaseAdmin.from('loyalty_preload_ledger')
    .select('entry_type, amount, balance_after, note, created_at')
    .eq('business_id', businessId).eq('customer_id', customerId)
    .order('created_at', { ascending: false }).limit(50)
  return { balance: Number(acct?.balance ?? 0), ledger: (ledger ?? []) as LedgerEntry[] }
}

/** Credit a successful Stripe load (+ optional bonus). Idempotent on payment_intent inside the RPC. */
export async function creditLoad(businessId: string, customerId: string, amount: number, bonus: number, paymentIntentId: string): Promise<number | null> {
  const { data, error } = await supabaseAdmin.rpc('loyalty_preload_load', {
    p_business: businessId, p_customer: customerId, p_amount: amount, p_bonus: bonus, p_pi: paymentIntentId,
  })
  if (error) { console.error('[preload] load rpc failed:', error.message); return null }
  return Number(data)
}

/** Spend from balance at checkout. Returns new balance, or throws on insufficient/no-account (atomic). */
export async function spendPreload(businessId: string, customerId: string, amount: number, saleId: string | null): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc('loyalty_preload_spend', {
    p_business: businessId, p_customer: customerId, p_amount: amount, p_sale: saleId,
  })
  if (error) throw new Error(error.message)
  return Number(data)
}

export async function refundPreload(businessId: string, customerId: string, amount: number, paymentIntentId: string | null, note: string): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc('loyalty_preload_refund', {
    p_business: businessId, p_customer: customerId, p_amount: amount, p_pi: paymentIntentId, p_note: note,
  })
  if (error) throw new Error(error.message)
  return Number(data)
}
