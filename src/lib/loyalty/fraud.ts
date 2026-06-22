import { supabaseAdmin } from '@/lib/supabase-admin'

// LOY-FRAUD — rules-based abuse detection across the now-complete earn surface (base earn, challenges,
// referrals, reward-rules, tier-perks, lifecycle — all land in pos_loyalty_transactions). Every signal is
// computed from REAL ledger / referral / customer data. Detections only WRITE a flag for owner review
// (resolved=false) — they NEVER silently block. De-dupe: an unresolved flag of the same (customer,type)
// is never re-created, so re-running a scan is idempotent. Optional auto-hold (owner-enabled) only
// annotates details.auto_held — it does not block redemption here.

interface Candidate { customer_id: string; flag_type: string; details: Record<string, unknown> }

// Thresholds tuned to avoid false-positives on normal trading.
const VELOCITY_WINDOW_MIN = 60      // earns within this window…
const VELOCITY_MAX_EARNS = 10       // …above this count = suspicious
const POINT_SPIKE_DELTA = 2000      // a single earn larger than this = suspicious
const FREQUENT_REDEEM_WEEK = 3      // >3 redemptions in 7 days
const BALANCE_SPIKE_WEEK = 5000     // >5000 points earned in 7 days
const REFERRAL_RING_24H = 5         // a referrer rewarded this many times in 24h
const SHARED_IDENTITY_MIN = 3       // same contact across this many memberships

interface TxnRow { customer_id: string | null; type: string; points_delta: number | null; created_at: string }

async function detectLedgerSignals(businessId: string): Promise<Candidate[]> {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const { data: txns } = await supabaseAdmin.from('pos_loyalty_transactions')
    .select('customer_id, type, points_delta, created_at')
    .eq('business_id', businessId).gte('created_at', weekAgo).limit(5000)

  const velocityCutoff = Date.now() - VELOCITY_WINDOW_MIN * 60000
  const per: Record<string, { redeems: number; earned: number; recentEarns: number; maxDelta: number }> = {}
  for (const t of (txns ?? []) as TxnRow[]) {
    const cid = t.customer_id
    if (!cid) continue
    if (!per[cid]) per[cid] = { redeems: 0, earned: 0, recentEarns: 0, maxDelta: 0 }
    const delta = Number(t.points_delta ?? 0)
    if (t.type === 'redeem') per[cid].redeems++
    if (delta > 0) {
      per[cid].earned += delta
      per[cid].maxDelta = Math.max(per[cid].maxDelta, delta)
      if (new Date(t.created_at).getTime() >= velocityCutoff) per[cid].recentEarns++
    }
  }

  const out: Candidate[] = []
  for (const [cid, v] of Object.entries(per)) {
    if (v.recentEarns > VELOCITY_MAX_EARNS) out.push({ customer_id: cid, flag_type: 'velocity_earn', details: { earns: v.recentEarns, window_minutes: VELOCITY_WINDOW_MIN } })
    if (v.maxDelta > POINT_SPIKE_DELTA) out.push({ customer_id: cid, flag_type: 'point_spike', details: { max_single_earn: v.maxDelta } })
    if (v.redeems > FREQUENT_REDEEM_WEEK) out.push({ customer_id: cid, flag_type: 'frequent_redeem', details: { redeems_this_week: v.redeems } })
    if (v.earned > BALANCE_SPIKE_WEEK) out.push({ customer_id: cid, flag_type: 'balance_spike', details: { points_earned_this_week: v.earned } })
  }
  return out
}

async function detectReferralRings(businessId: string): Promise<Candidate[]> {
  const dayAgo = new Date(Date.now() - 86400000).toISOString()
  const { data: refs } = await supabaseAdmin.from('loyalty_referrals')
    .select('referrer_customer_id, referral_date').eq('business_id', businessId).gte('referral_date', dayAgo).limit(5000)
  const counts: Record<string, number> = {}
  for (const r of refs ?? []) {
    const rid = r.referrer_customer_id as string | null
    if (rid) counts[rid] = (counts[rid] ?? 0) + 1
  }
  return Object.entries(counts).filter(([, n]) => n >= REFERRAL_RING_24H)
    .map(([rid, n]) => ({ customer_id: rid, flag_type: 'referral_ring', details: { referrals_24h: n } }))
}

async function detectSharedIdentity(businessId: string): Promise<Candidate[]> {
  const { data: custs } = await supabaseAdmin.from('pos_customers')
    .select('id, email, phone').eq('business_id', businessId).limit(20000)
  const byContact: Record<string, string[]> = {}
  for (const c of custs ?? []) {
    for (const key of [c.email ? `e:${String(c.email).toLowerCase()}` : null, c.phone ? `p:${c.phone}` : null]) {
      if (!key) continue
      ;(byContact[key] ??= []).push(c.id as string)
    }
  }
  const out: Candidate[] = []
  for (const [key, ids] of Object.entries(byContact)) {
    const uniq = [...new Set(ids)]
    if (uniq.length >= SHARED_IDENTITY_MIN) {
      // Flag the cluster against its first membership (evidence lists the rest).
      out.push({ customer_id: uniq[0], flag_type: 'shared_identity', details: { contact: key.startsWith('e:') ? 'email' : 'phone', membership_count: uniq.length, membership_ids: uniq.slice(0, 20) } })
    }
  }
  return out
}

/** Run all detections for a business, persisting NEW flags only (de-dup against open flags). Returns count created. */
export async function detectFraud(businessId: string): Promise<{ created: number; flag_types: string[] }> {
  const candidates = [
    ...(await detectLedgerSignals(businessId)),
    ...(await detectReferralRings(businessId)),
    ...(await detectSharedIdentity(businessId)),
  ]
  if (candidates.length === 0) return { created: 0, flag_types: [] }

  // Optional auto-hold annotation (owner-enabled; never blocks here).
  const { data: cfg } = await supabaseAdmin.from('pos_loyalty_config').select('fraud_auto_hold').eq('business_id', businessId).maybeSingle()
  const autoHold = !!cfg?.fraud_auto_hold

  // De-dup: skip a candidate if an UNRESOLVED flag of the same (customer, type) already exists.
  const { data: open } = await supabaseAdmin.from('loyalty_fraud_flags')
    .select('customer_id, flag_type').eq('business_id', businessId).eq('resolved', false).limit(5000)
  const openSet = new Set((open ?? []).map(f => `${f.customer_id}|${f.flag_type}`))

  const toInsert = candidates
    .filter(c => !openSet.has(`${c.customer_id}|${c.flag_type}`))
    .map(c => ({ business_id: businessId, customer_id: c.customer_id, flag_type: c.flag_type, details: { ...c.details, ...(autoHold ? { auto_held: true } : {}) }, resolved: false }))

  if (toInsert.length === 0) return { created: 0, flag_types: [] }
  const { error } = await supabaseAdmin.from('loyalty_fraud_flags').insert(toInsert)
  if (error) { console.error('[fraud] insert failed:', error.message); return { created: 0, flag_types: [] } }
  return { created: toInsert.length, flag_types: [...new Set(toInsert.map(f => f.flag_type))] }
}
