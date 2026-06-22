import { supabaseAdmin } from '@/lib/supabase-admin'
import { normalisePhone } from '@/lib/clicksend'

// LOY-REFERRALS — wires the existing loyalty_referrals scaffold into a real invite→track→reward loop.
// Capture records a 'pending' row at signup; the reward fires on the referee's FIRST real purchase
// (anti-farming) and credits BOTH parties through the EXISTING loyalty ledger (no parallel currency).
// The pending→rewarded flip is atomic, so exactly one reward is ever paid per referral.

export interface RefereeContext {
  customer_id: string
  identity_id: string
  email: string | null
  phone: string | null
}

function normCode(raw: string | null | undefined): string {
  return (raw ?? '').trim().toUpperCase()
}

/** Ensure the membership has a shareable referral code (per-business, on pos_customers.referral_code). */
export async function getOrCreateReferralCode(customerId: string, name: string | null): Promise<string | null> {
  const { data: cust } = await supabaseAdmin.from('pos_customers').select('id, referral_code, name').eq('id', customerId).maybeSingle()
  if (!cust?.id) return null
  if (cust.referral_code) return cust.referral_code as string
  const base = (name ?? (cust.name as string) ?? 'FRIEND').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 6) || 'FRIEND'
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
  const code = `${base}${suffix}`
  await supabaseAdmin.from('pos_customers').update({ referral_code: code }).eq('id', customerId)
  return code
}

/** Award points through the EXISTING earn ledger (same path as challenges/member-pricing). */
async function awardLedgerPoints(customerId: string, businessId: string, points: number): Promise<void> {
  if (points <= 0) return
  await supabaseAdmin.rpc('increment_loyalty_points', { customer_id: customerId, points })
  await supabaseAdmin.rpc('increment_numeric', { p_table: 'pos_customers', p_id: customerId, p_column: 'points_balance', p_amount: points })
  await supabaseAdmin.from('pos_loyalty_transactions').insert({
    business_id: businessId, customer_id: customerId, sale_id: null, type: 'earn', points_delta: points, created_at: new Date().toISOString(),
  })
}

export type CaptureResult = { ok: true } | { ok: false; reason: string }

/**
 * Record a pending referral when a NEW member signs up via a referral code. Anti-abuse guards:
 * invalid code, self-referral (same membership / identity / email / phone), already-referred (unique
 * index), and existing (non-new) members. No reward here — that waits for the first real purchase.
 */
export async function captureReferral(businessId: string, refCodeRaw: string, referee: RefereeContext): Promise<CaptureResult> {
  const refCode = normCode(refCodeRaw)
  if (!refCode) return { ok: false, reason: 'no_code' }

  // Resolve the referrer's membership at THIS business by their shareable code.
  const { data: referrer } = await supabaseAdmin.from('pos_customers')
    .select('id, loyalty_identity_id, email, phone').eq('business_id', businessId).eq('referral_code', refCode).maybeSingle()
  if (!referrer?.id) return { ok: false, reason: 'invalid_code' }

  // Self-referral: same membership, same identity, or same contact details.
  if (referrer.id === referee.customer_id) return { ok: false, reason: 'self_membership' }
  if (referrer.loyalty_identity_id && referrer.loyalty_identity_id === referee.identity_id) return { ok: false, reason: 'self_identity' }
  const refereeEmail = (referee.email ?? '').trim().toLowerCase()
  const refereePhone = referee.phone ? normalisePhone(referee.phone) : ''
  if (referrer.loyalty_identity_id) {
    const { data: refIdent } = await supabaseAdmin.from('loyalty_identity').select('email, phone').eq('id', referrer.loyalty_identity_id).maybeSingle()
    const refEmail = (refIdent?.email as string | null ?? '').trim().toLowerCase()
    const refPhone = refIdent?.phone ? normalisePhone(refIdent.phone as string) : ''
    if (refereeEmail && refEmail && refereeEmail === refEmail) return { ok: false, reason: 'self_email' }
    if (refereePhone && refPhone && refereePhone === refPhone) return { ok: false, reason: 'self_phone' }
  }

  // Already referred (idempotent; the unique index is the hard guard).
  const { data: existing } = await supabaseAdmin.from('loyalty_referrals').select('id').eq('referred_customer_id', referee.customer_id).maybeSingle()
  if (existing?.id) return { ok: false, reason: 'already_referred' }

  // Only brand-new members can be referred — an existing customer can't retroactively apply a code.
  const { count: priorSales } = await supabaseAdmin.from('pos_sales')
    .select('id', { count: 'exact', head: true }).eq('customer_id', referee.customer_id).eq('business_id', businessId).neq('status', 'voided')
  if ((priorSales ?? 0) > 0) return { ok: false, reason: 'not_new' }

  const { error } = await supabaseAdmin.from('loyalty_referrals').insert({
    business_id: businessId, referrer_customer_id: referrer.id, referred_customer_id: referee.customer_id,
    referral_code: refCode, status: 'pending', referrer_points_awarded: 0, referred_points_awarded: 0,
  })
  if (error && !/duplicate|unique/i.test(error.message)) return { ok: false, reason: 'insert_failed' }
  return { ok: true }
}

/**
 * On the referee's FIRST qualifying purchase, atomically flip pending→rewarded and credit BOTH parties
 * through the existing ledger. Called from the sale-evaluation waitUntil (the sale already exists, so a
 * real purchase is guaranteed). Idempotent: only the single active→rewarded transition pays out.
 */
export async function evaluateReferrals(refereeCustomerId: string, businessId: string): Promise<void> {
  const { data: ref } = await supabaseAdmin.from('loyalty_referrals')
    .select('id, referrer_customer_id, referred_customer_id')
    .eq('referred_customer_id', refereeCustomerId).eq('business_id', businessId).eq('status', 'pending').maybeSingle()
  if (!ref?.id || !ref.referrer_customer_id) return

  // Reward only when the owner has referrals enabled.
  const { data: cfg } = await supabaseAdmin.from('pos_loyalty_config')
    .select('referrals_enabled, referral_bonus_points, referee_bonus_points').eq('business_id', businessId).maybeSingle()
  if (!cfg?.referrals_enabled) return
  const referrerBonus = Math.max(0, Math.round(Number(cfg.referral_bonus_points ?? 100)))
  const refereeBonus = Math.max(0, Math.round(Number(cfg.referee_bonus_points ?? 50)))

  // Confirm a real, non-voided purchase exists (defensive — the sale hook already guarantees one).
  const { count: sales } = await supabaseAdmin.from('pos_sales')
    .select('id', { count: 'exact', head: true }).eq('customer_id', refereeCustomerId).eq('business_id', businessId).neq('status', 'voided')
  if ((sales ?? 0) < 1) return

  // Atomic claim: exactly one pending→rewarded transition pays out (idempotent under concurrent sales).
  const { data: claimed } = await supabaseAdmin.from('loyalty_referrals')
    .update({ status: 'rewarded', rewarded_at: new Date().toISOString(), referrer_points_awarded: referrerBonus, referred_points_awarded: refereeBonus })
    .eq('id', ref.id).eq('status', 'pending').select('id').maybeSingle()
  if (!claimed?.id) return

  await awardLedgerPoints(ref.referrer_customer_id as string, businessId, referrerBonus)
  await awardLedgerPoints(refereeCustomerId, businessId, refereeBonus)
}
