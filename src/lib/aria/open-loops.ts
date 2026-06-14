import { supabaseAdmin } from '@/lib/supabase-admin'

// PLAN-PERSISTENCE-1 (I5) — Open-loop detection.
// An "open loop" is an action the owner EXECUTED but Aria has never followed up on: there is no
// acted-on aria_outcomes row tracking it (the I4 cron only tracks owner-APPROVED actions, so
// auto-executed/plan-executed actions fall through). Surfacing these lets Aria ask "you tried X last
// week — how did it go?" naturally, which both makes the owner feel seen AND captures the outcome
// data point the learning loop would otherwise miss.

export interface OpenLoop {
  action_id: string
  title: string
  category: string | null
  executed_at: string            // aria_actions.updated_at (no executed_at column — updated_at = when status→executed)
  days_since_executed: number
  baseline_revenue: number       // dollars, 7d window BEFORE executed_at
  current_revenue: number        // dollars, 7d window AFTER executed_at (or executed_at→now if < 7d elapsed)
  observed_delta: number         // current_revenue - baseline_revenue (dollars)
  outcome_status: 'too_soon' | 'ready_to_review' | 'closed'
}

const DAY = 86400000

export async function getOpenLoops(businessId: string): Promise<OpenLoop[]> {
  try {
    const sixtyDaysAgo = new Date(Date.now() - 60 * DAY).toISOString()

    // Executed, owner-attributed, not-rolled-back actions in the last 60 days.
    const { data: actions } = await supabaseAdmin
      .from('aria_actions')
      .select('id, title, category, updated_at')
      .eq('business_id', businessId)
      .eq('status', 'executed')
      .not('executed_by_user_id', 'is', null)
      .is('rolled_back_at', null)
      .gt('updated_at', sixtyDaysAgo)
      .order('updated_at', { ascending: false })

    if (!actions || actions.length === 0) return []

    // Exclude any action already tracked by an acted-on outcome (the I4 cron path) — those are not
    // "open"; Aria/cron is already following up. This is the `id NOT IN (... acted_on=true)` filter.
    const { data: tracked } = await supabaseAdmin
      .from('aria_outcomes')
      .select('action_id')
      .eq('business_id', businessId)
      .eq('acted_on', true)
      .not('action_id', 'is', null)
    const trackedIds = new Set(((tracked ?? []) as Array<{ action_id: string | null }>).map(t => t.action_id))

    const openActions = (actions as Array<{ id: string; title: string; category: string | null; updated_at: string | null }>)
      .filter(a => a.updated_at && !trackedIds.has(a.id))
    if (openActions.length === 0) return []

    // One sales query covering every relevant window: from (oldest executed_at − 7d) to now. Bucket in JS.
    const oldestExecuted = Math.min(...openActions.map(a => new Date(a.updated_at as string).getTime()))
    const salesFrom = new Date(oldestExecuted - 7 * DAY).toISOString()
    const { data: sales } = await supabaseAdmin
      .from('pos_sales')
      .select('total_amount, created_at')
      .eq('business_id', businessId)
      .neq('status', 'voided')
      .gte('created_at', salesFrom)
    const saleRows = (sales ?? []) as Array<{ total_amount: number | null; created_at: string }>

    const sumBetween = (startMs: number, endMs: number): number => {
      let s = 0
      for (const r of saleRows) {
        const t = new Date(r.created_at).getTime()
        if (t >= startMs && t < endMs) s += Number(r.total_amount ?? 0)
      }
      return +s.toFixed(2)
    }

    const now = Date.now()
    return openActions.map(a => {
      const execMs = new Date(a.updated_at as string).getTime()
      const daysSince = Math.floor((now - execMs) / DAY)
      const baseline = sumBetween(execMs - 7 * DAY, execMs)
      const currentEnd = daysSince >= 7 ? execMs + 7 * DAY : now
      const current = sumBetween(execMs, currentEnd)
      const status: OpenLoop['outcome_status'] = daysSince < 7 ? 'too_soon' : 'ready_to_review'
      return {
        action_id: a.id,
        title: a.title,
        category: a.category,
        executed_at: a.updated_at as string,
        days_since_executed: daysSince,
        baseline_revenue: baseline,
        current_revenue: current,
        observed_delta: +(current - baseline).toFixed(2),
        outcome_status: status,
      }
    })
  } catch (e) {
    console.error('[open-loops] getOpenLoops failed:', (e as Error).message)
    return []
  }
}
