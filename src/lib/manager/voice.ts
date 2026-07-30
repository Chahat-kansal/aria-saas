import type { SupabaseClient } from '@supabase/supabase-js'

// MANAGER-AGENT-1 — the manager's VOICE on the owner's Aria tab.
//
// The owner talks to the Store Manager, and it answers for the whole team, because it already
// holds what the team produced. This is implemented as CONTEXT handed to the EXISTING grounded
// brain (/api/aria/ask) — deliberately NOT a second reasoning engine, and not a second grounding
// path. The brain keeps doing the reasoning; this just tells it what its team has been doing.
//
// GROUNDING-TEETH: every line below is read from a real row (manager_reviews, aria_autopilot_actions,
// autonomy_ledger). Nothing is asserted that isn't in the database. If there is nothing to report,
// the context says so plainly rather than manufacturing activity.
export async function buildManagerContext(supabase: SupabaseClient, business_id: string): Promise<string | null> {
  const since = new Date(Date.now() - 7 * 86400000).toISOString()

  const [waitingRes, reviewRes, autonomyRes] = await Promise.all([
    supabase.from('aria_autopilot_actions')
      .select('title, domain').eq('business_id', business_id).eq('status', 'pending')
      .order('created_at', { ascending: false }).limit(10),
    supabase.from('manager_reviews')
      .select('agent_type, proposal_title, verdict, reason_code, reason_detail')
      .eq('business_id', business_id).gte('created_at', since)
      .order('created_at', { ascending: false }).limit(20),
    supabase.from('autonomy_ledger')
      .select('action_kind, summary').eq('business_id', business_id).gte('created_at', since)
      .order('created_at', { ascending: false }).limit(10),
  ])

  const waiting = waitingRes.data ?? []
  const reviews = reviewRes.data ?? []
  const autonomy = autonomyRes.data ?? []
  if (waiting.length === 0 && reviews.length === 0 && autonomy.length === 0) return null

  const parts: string[] = [
    'YOU ARE THE STORE MANAGER. You speak for the whole agent team to the owner (the CEO). You',
    'assign work to the domain agents, review what they produce, send back what is wrong, and bring',
    'the owner only what genuinely needs their authority. Speak as "I" for your own review work and',
    '"the team" for the agents. Never invent a figure — if you do not have it, say so.',
    '',
  ]

  if (waiting.length > 0) {
    parts.push('AWAITING THE OWNER\'S CALL (' + waiting.length + '):')
    for (const w of waiting) parts.push('- [' + (w.domain ?? 'general') + '] ' + w.title)
  } else {
    parts.push('AWAITING THE OWNER\'S CALL: nothing right now.')
  }

  const rejected = reviews.filter(r => r.verdict === 'rejected')
  if (rejected.length > 0) {
    parts.push('')
    parts.push('I SENT THESE BACK to the team (last 7d) — the owner never saw them:')
    for (const r of rejected) parts.push('- ' + r.agent_type + ': ' + (r.reason_detail ?? r.reason_code))
  }

  if (autonomy.length > 0) {
    parts.push('')
    parts.push('I HANDLED THESE MYSELF (invisible, reversible, no cost, nothing customer/roster/money):')
    for (const a of autonomy) parts.push('- ' + a.summary)
  }

  parts.push('')
  parts.push('AUTHORITY RULE you must respect in every answer: you never commit anything involving')
  parts.push('money, customers, rostering, or anything irreversible. Those always wait for the')
  parts.push('owner\'s tap in Decisions. Do not tell the owner you have done such a thing.')

  return parts.join('\n')
}
