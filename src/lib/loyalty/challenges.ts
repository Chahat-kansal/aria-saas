import { supabaseAdmin } from '@/lib/supabase-admin'
import { runActionPlanner } from '@/lib/aria/grounded'

// LOY-CHALLENGES — AI-personalised loyalty missions from REAL purchase history.
// GROUNDING-TEETH: every "buy N more X" challenge targets a product the customer ACTUALLY buys. The AI
// proposes (constrained to the customer's real top items); the CODE validates every target against the
// real list before persisting; thin history → a safe generic visit challenge (never fabricated specifics).
// Completion credits points through the EXISTING earn ledger (increment_loyalty_points + points_balance
// + pos_loyalty_transactions), never a parallel currency.

const MODEL = 'claude-haiku-4-5-20251001'
const WEEK_MS = 7 * 86400000
const THIN_HISTORY = 3 // fewer than this many total items bought → generic challenge only

interface TopItem { name: string; qty: number }

// ── progress is always recomputed from real pos_sale_items (the single source of truth) ──
async function computeMetric(customerId: string, businessId: string, metric: string, item: string | null, sinceISO: string): Promise<number> {
  if (metric === 'item_count' && item) {
    const { data } = await supabaseAdmin.from('pos_sale_items')
      .select('quantity').eq('customer_id', customerId).eq('business_id', businessId)
      .ilike('product_name', item).gte('created_at', sinceISO)
    return (data ?? []).reduce((s, r) => s + (Number(r.quantity) || 0), 0)
  }
  if (metric === 'visit_count') {
    const { data } = await supabaseAdmin.from('pos_sale_items')
      .select('sale_id').eq('customer_id', customerId).eq('business_id', businessId).gte('created_at', sinceISO)
    return new Set((data ?? []).map(r => r.sale_id as string)).size
  }
  if (metric === 'spend') {
    const { data } = await supabaseAdmin.from('pos_sale_items')
      .select('line_total').eq('customer_id', customerId).eq('business_id', businessId).gte('created_at', sinceISO)
    return Math.round((data ?? []).reduce((s, r) => s + (Number(r.line_total) || 0), 0))
  }
  return 0
}

async function topItems(customerId: string, businessId: string, limit = 5): Promise<TopItem[]> {
  const { data } = await supabaseAdmin.from('pos_sale_items')
    .select('product_name, quantity').eq('customer_id', customerId).eq('business_id', businessId)
    .not('product_name', 'is', null)
  const tally: Record<string, number> = {}
  for (const r of data ?? []) {
    const n = (r.product_name as string | null)?.trim()
    if (n) tally[n] = (tally[n] ?? 0) + (Number(r.quantity) || 0)
  }
  return Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, qty]) => ({ name, qty }))
}

// The AI proposes which REAL items to challenge (constrained to the provided list).
// AI-GROUNDING-1 — was a raw `new Anthropic()` call with its own hand-rolled JSON parse and a manual
// logAICallSafe() call — bypassed the shared circuit breaker/Gemini failover, and a genuinely down
// Anthropic meant every business with challenges enabled got zero missions with no fallback. Routed
// through the canonical autonomous-action entry point (this output gets persisted and later
// auto-awards real points via evaluateChallenges, with no human review — the exact "autonomous
// decision" case runActionPlanner exists for).
async function aiProposeChallenges(businessId: string, items: TopItem[], reward: number): Promise<Array<{ item: string; count: number }>> {
  const list = items.map(i => `- ${i.name} (bought ${i.qty}x)`).join('\n')
  const resp = await runActionPlanner<{ challenges: Array<{ item: string; count: number }> }>({
    model: 'haiku',
    agentKey: 'generic',
    role: 'analysis',
    businessId,
    maxTokens: 400,
    fallback: { challenges: [] },
    systemPrompt: 'You design personalised loyalty challenges for a cafe/retail regular. Use ONLY products from the provided purchase history — NEVER invent a product. Return JSON only, no prose.',
    userPrompt: `Customer's real purchase history:\n${list}\n\nPropose 1-2 "buy N more X" challenges using ONLY these exact product names. Each rewards ${reward} points. Return JSON: {"challenges":[{"item":"<exact product name from the list>","count":<1-3>}]}`,
  })
  return Array.isArray(resp.data.challenges)
    ? resp.data.challenges.map(c => ({ item: String(c.item ?? ''), count: Number(c.count) || 2 }))
    : []
}

/** Generate 1-3 grounded challenges for a member. Skips if they already have active ones. */
export async function generateChallengesForMember(customerId: string, businessId: string, identityId: string | null, rewardPoints: number): Promise<{ created: number; reason?: string }> {
  const { count } = await supabaseAdmin.from('loyalty_challenges')
    .select('id', { count: 'exact', head: true }).eq('customer_id', customerId).eq('status', 'active')
  if ((count ?? 0) > 0) return { created: 0, reason: 'has_active' }

  const reward = Math.max(10, Math.min(500, Math.round(rewardPoints) || 50))
  const items = await topItems(customerId, businessId, 5)
  const totalQty = items.reduce((s, i) => s + i.qty, 0)
  const now = new Date()
  const expires = new Date(now.getTime() + WEEK_MS).toISOString()

  const built: Array<{ metric: string; item: string | null; count: number; title: string; description: string }> = []

  if (totalQty < THIN_HISTORY || items.length === 0) {
    // Thin history → safe generic challenge, NEVER a fabricated specific product.
    built.push({ metric: 'visit_count', item: null, count: 2, title: 'Visit twice this week', description: `Pop in 2 more times this week to earn ${reward} bonus points.` })
  } else {
    const realNames = new Set(items.map(i => i.name.toLowerCase()))
    const aiProposed = (await aiProposeChallenges(businessId, items, reward))
      .filter(p => p.item && realNames.has(p.item.toLowerCase())) // CODE validation: real items only
      .slice(0, 2)
    for (const p of aiProposed) {
      // Use the exact real product name (canonical casing from history), not the AI's echo.
      const real = items.find(i => i.name.toLowerCase() === p.item.toLowerCase())!
      const n = Math.max(1, Math.min(5, Math.round(p.count) || 2))
      built.push({ metric: 'item_count', item: real.name, count: n, title: `Buy ${n} more ${real.name}`, description: `Order ${n} more ${real.name} this week for ${reward} bonus points.` })
    }
    // Fallback if the AI proposed nothing valid → the customer's #1 real item.
    if (built.length === 0) {
      const top = items[0]
      built.push({ metric: 'item_count', item: top.name, count: 2, title: `Buy 2 more ${top.name}`, description: `Order 2 more ${top.name} this week for ${reward} bonus points.` })
    }
    // Always include a safe visit challenge alongside.
    if (built.length < 3) built.push({ metric: 'visit_count', item: null, count: 2, title: 'Visit twice this week', description: `Pop in 2 more times this week to earn ${reward} bonus points.` })
  }

  const rows = built.slice(0, 3).map(c => ({
    business_id: businessId, customer_id: customerId, loyalty_identity_id: identityId ?? null,
    title: c.title, description: c.description, target_metric: c.metric, target_item: c.item, target_count: c.count,
    progress: 0, reward_points: reward, status: 'active', starts_at: now.toISOString(), expires_at: expires,
  }))
  if (rows.length === 0) return { created: 0, reason: 'none' }
  await supabaseAdmin.from('loyalty_challenges').insert(rows)
  return { created: rows.length }
}

/** Award challenge points through the EXISTING earn ledger path (no parallel currency). */
async function awardChallengePoints(customerId: string, businessId: string, points: number): Promise<void> {
  if (points <= 0) return
  await supabaseAdmin.rpc('increment_loyalty_points', { customer_id: customerId, points })
  await supabaseAdmin.rpc('increment_numeric', { p_table: 'pos_customers', p_id: customerId, p_column: 'points_balance', p_amount: points })
  await supabaseAdmin.from('pos_loyalty_transactions').insert({
    business_id: businessId, customer_id: customerId, sale_id: null, type: 'earn', points_delta: points, created_at: new Date().toISOString(),
  })
}

/** Recompute progress from real sales; complete + award (idempotent, atomic claim) when target reached. */
export async function evaluateChallenges(customerId: string, businessId: string): Promise<void> {
  const { data: challenges } = await supabaseAdmin.from('loyalty_challenges')
    .select('id, target_metric, target_item, target_count, starts_at, expires_at, reward_points')
    .eq('customer_id', customerId).eq('business_id', businessId).eq('status', 'active')
  const now = new Date()
  for (const ch of challenges ?? []) {
    if (ch.expires_at && new Date(ch.expires_at as string) < now) {
      await supabaseAdmin.from('loyalty_challenges').update({ status: 'expired' }).eq('id', ch.id).eq('status', 'active')
      continue
    }
    const cur = await computeMetric(customerId, businessId, ch.target_metric as string, (ch.target_item as string | null), ch.starts_at as string)
    const target = Number(ch.target_count) || 0
    await supabaseAdmin.from('loyalty_challenges').update({ progress: Math.min(cur, target) }).eq('id', ch.id).eq('status', 'active')
    if (cur >= target && target > 0) {
      // Atomic claim: only one transition active→completed credits points (idempotent under concurrent sales).
      const { data: claimed } = await supabaseAdmin.from('loyalty_challenges')
        .update({ status: 'completed', progress: target, completed_at: now.toISOString() })
        .eq('id', ch.id).eq('status', 'active').select('id').maybeSingle()
      if (claimed?.id) {
        await awardChallengePoints(customerId, businessId, Number(ch.reward_points) || 0)
        await supabaseAdmin.from('loyalty_challenges').update({ status: 'claimed' }).eq('id', ch.id)
      }
    }
  }
}
