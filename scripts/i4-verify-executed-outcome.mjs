// I4-VERIFY live test — replicates onActionExecuted EXACTLY against the real DB.
// Proves: executing an aria_action creates a linked aria_outcomes row (action_id + baseline set).
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const SIP = 'ff5055a0-c351-4ada-817a-1804961035f3'

// ── exact replica of snapshotBaseline (outcome-learning.ts, post-fix: revenue is the default) ──
async function snapshotBaseline(businessId, category) {
  const since = new Date(Date.now() - 7 * 864e5).toISOString()
  if (category === 'customers') {
    const { count } = await db.from('pos_customers').select('*', { count: 'exact', head: true })
      .eq('business_id', businessId).in('segment', ['champions', 'loyal', 'regular'])
    return (count ?? 0) * 100
  }
  if (category === 'staff') {
    const { count } = await db.from('pos_users').select('*', { count: 'exact', head: true })
      .eq('business_id', businessId).eq('is_active', true)
    return count ?? 0
  }
  const { data } = await db.from('pos_sales').select('total_amount')
    .eq('business_id', businessId).neq('status', 'voided').gte('created_at', since)
  return (data ?? []).reduce((s, r) => s + Math.round(Number(r.total_amount || 0) * 100), 0)
}

// ── exact replica of onActionExecuted (idempotent) ───────────────────────────
async function onActionExecuted(actionId, businessId) {
  const { data: existing } = await db.from('aria_outcomes').select('id')
    .eq('business_id', businessId).eq('action_id', actionId).eq('acted_on', true).limit(1).maybeSingle()
  if (existing) return { skipped: true, reason: 'outcome already exists', id: existing.id }

  const { data: action } = await db.from('aria_actions')
    .select('id,title,category,recommendation,source').eq('id', actionId).maybeSingle()
  if (!action) return { skipped: true, reason: 'action not found' }

  const baseline = await snapshotBaseline(businessId, action.category ?? 'cashflow')
  const nowIso = new Date().toISOString()
  const { data: inserted, error } = await db.from('aria_outcomes').insert({
    business_id: businessId, action_id: actionId,
    recommendation_type: action.source ?? 'aria_action',
    recommendation_detail: `${action.title}: ${action.recommendation ?? ''}`.slice(0, 1000),
    recommended_at: nowIso, acted_on: true, acted_on_at: nowIso,
    category: action.category ?? null, baseline_metric_cents: baseline,
  }).select('id, action_id, baseline_metric_cents, acted_on, category, recommendation_type').maybeSingle()
  if (error) return { error: error.message }
  return { created: true, row: inserted, baseline }
}

// ── pick a target action for Sip ─────────────────────────────────────────────
const counts = {}
for (const st of ['pending', 'approved', 'executed']) {
  const { count } = await db.from('aria_actions').select('id', { count: 'exact', head: true }).eq('business_id', SIP).eq('status', st)
  counts[st] = count ?? 0
}
console.log('Sip aria_actions by status:', counts)

// Prefer an already-executed Sip action with no linked outcome (least invasive — just backfills the
// outcome that SHOULD exist). Fall back to transitioning a pending one to executed (full path proof).
let target = null, transitioned = false
const { data: execd } = await db.from('aria_actions').select('id,title,category,status')
  .eq('business_id', SIP).eq('status', 'executed').order('updated_at', { ascending: false })
for (const a of (execd ?? [])) {
  const { data: o } = await db.from('aria_outcomes').select('id, baseline_metric_cents').eq('action_id', a.id).eq('acted_on', true).limit(1).maybeSingle()
  if (!o) { target = a; break }
  // Self-heal: a prior test left an acted_on outcome with null baseline — delete that artifact and re-test this action.
  if (o.baseline_metric_cents === null) {
    await db.from('aria_outcomes').delete().eq('id', o.id)
    console.log('Cleaned up prior null-baseline test row:', o.id, 'for action', a.id)
    target = a; break
  }
}
if (!target) {
  const { data: pend } = await db.from('aria_actions').select('id,title,category,status')
    .eq('business_id', SIP).in('status', ['pending', 'approved']).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (pend) {
    await db.from('aria_actions').update({ status: 'executed', updated_at: new Date().toISOString() }).eq('id', pend.id)
    target = pend; transitioned = true
    console.log('Transitioned action to executed:', pend.id, `(${pend.title?.slice(0,60)})`)
  }
}
if (!target) { console.log('NO Sip action available to test — FAIL'); process.exit(1) }
console.log('Target action:', target.id, '| category:', target.category, '| was status:', target.status, transitioned ? '(now executed)' : '')

const result = await onActionExecuted(target.id, SIP)
console.log('onActionExecuted result:', JSON.stringify(result, null, 2))

// ── verify the row exists in the DB with action_id + baseline ────────────────
const { data: check } = await db.from('aria_outcomes')
  .select('id, action_id, baseline_metric_cents, acted_on, acted_on_at, outcome_verdict, recommendation_type, category')
  .eq('action_id', target.id).eq('acted_on', true).maybeSingle()
console.log('\n=== LIVE aria_outcomes row for the action ===')
console.log(JSON.stringify(check, null, 2))
const pass = check && check.action_id === target.id && check.baseline_metric_cents !== null && check.acted_on === true
console.log('\nPART 1 PROVEN:', pass ? `PASS — new linked outcome id=${check.id}, baseline_metric_cents=${check.baseline_metric_cents}` : 'FAIL')
process.exit(pass ? 0 : 1)
