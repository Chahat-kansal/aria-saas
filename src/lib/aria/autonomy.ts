/**
 * THE AUTONOMY CONTROL ("how much rope").
 *
 * WHAT IT IS WIRED TO: `agent_settings.mode` — real, per-business, per-agent-type, already read by
 * the agents that act (clv-agent, council, flash-revenue and friends). Not local state, not a cookie.
 *
 * MS16B PHASE 4 — CO-PILOT IS NOW REAL. The CHECK constraint was widened on 24 Aug and verified
 * live on 25 Aug before this file changed:
 *
 *   agent_settings_mode_check  CHECK (mode = ANY (ARRAY['suggest','copilot','auto']))
 *
 * All three modes now persist and read back. The "cannot be saved" messaging is gone because it is
 * no longer true.
 *
 * ── WHAT CO-PILOT DOES **NOT** DO, WHICH IS THE POINT ────────────────────────────────────────────
 *
 * Co-pilot must not widen any money, messaging or authorisation path. It doesn't — and the reason is
 * structural rather than lucky, so it is written down here where the next person will look.
 *
 * Every gate in the agent layer is a POSITIVE test for auto:
 *
 *   clv-agent.ts:670          if (mode === 'auto')  → sends SMS to customers
 *   council.ts:453            if (mode === 'auto')  → executes approved proposals
 *   flash-revenue-agent.ts:241 if (mode === 'auto') → executes interventions
 *   flash-revenue-agent.ts:286 status: mode === 'auto' ? 'executed' : 'pending'
 *
 * A positive test means an unrecognised or new value falls to the SAFE branch. Had any of them been
 * written the other way round — `mode !== 'suggest'` — introducing a third value would have silently
 * promoted every business on Co-pilot to full execution, including the ones that send SMS and spend
 * money. A repo-wide sweep found ZERO negative-form checks (see ax-1.test.ts, which fails if one is
 * ever introduced).
 *
 * So: Co-pilot behaves exactly like Suggest for every gated action, and differs only in what Aria
 * offers unprompted. `mayActWithoutAsking()` below is the canonical predicate; use it rather than
 * hand-rolling another comparison.
 */

export type AutonomyMode = 'suggest' | 'copilot' | 'auto'

/** Every mode the database will accept — verified against the live CHECK constraint. */
export const PERSISTABLE_MODES: readonly AutonomyMode[] = ['suggest', 'copilot', 'auto']

/**
 * How much rope each mode grants, least to most. Used to resolve a mixed per-agent state DOWN to
 * the least-permissive value; never up.
 */
const ROPE: Record<AutonomyMode, number> = { suggest: 0, copilot: 1, auto: 2 }

export interface AutonomyState {
  mode: AutonomyMode
  /** True when `mode` came from the database rather than from the propose-approve default. */
  persisted: boolean
  /** How many agent_settings rows this resolved from — the control is per-business, the column isn't. */
  agentTypes: number
  /** True when the agents disagree and the answer was resolved down to the least-permissive. */
  mixed?: boolean
}

export const MODE_EXPLANATION: Record<AutonomyMode, string> = {
  suggest: 'Aria tells you what she’d do and waits. Nothing happens without you asking for it.',
  copilot: 'Aria drafts the work — orders, rosters, replies — and you approve or edit before anything is real. Nothing is sent or spent without you.',
  auto: 'Aria acts on the routine things within your limits, and still asks before anything that spends, sends or deletes.',
}

/**
 * THE ONE PREDICATE THAT DECIDES WHETHER ARIA MAY ACT UNPROMPTED.
 *
 * Only 'auto' returns true. Co-pilot drafts and waits, exactly like Suggest, for anything gated.
 * Written as a positive test on purpose: if a fourth mode is ever added, it lands on the safe side
 * by default rather than inheriting permission it was never granted.
 */
export function mayActWithoutAsking(mode: string | null | undefined): boolean {
  return mode === 'auto'
}

function isMode(v: string | null | undefined): v is AutonomyMode {
  return v === 'suggest' || v === 'copilot' || v === 'auto'
}

/**
 * Resolve the business's autonomy mode from its agent_settings rows.
 *
 * The column is per-agent-type and the control is per-business, so the rule is stated rather than
 * assumed: the business sits at the LEAST-permissive mode any enabled agent is on. A mixed state
 * resolves DOWN, never up — reading a half-automated business as fully automated would overstate
 * what Aria is allowed to do, which is the direction that hurts.
 */
export function resolveAutonomy(
  rows: Array<{ agent_type: string; mode: string | null; enabled: boolean | null }> | null | undefined,
): AutonomyState {
  const enabled = (rows ?? []).filter(r => r.enabled !== false)
  if (enabled.length === 0) {
    // No stored preference at all — the truthful answer is Ask Aria's actual behaviour today:
    // it drafts and waits for you.
    return { mode: 'copilot', persisted: false, agentTypes: 0 }
  }

  // An unrecognised stored value is treated as the least rope, never the most.
  const modes = enabled.map(r => (isMode(r.mode) ? r.mode : 'suggest'))
  let lowest: AutonomyMode = 'auto'
  for (const m of modes) if (ROPE[m] < ROPE[lowest]) lowest = m

  return {
    mode: lowest,
    persisted: true,
    agentTypes: enabled.length,
    mixed: modes.some(m => m !== modes[0]),
  }
}

/** Is this a mode the database will accept? Unknown values are still refused. */
export function isPersistable(mode: string): mode is AutonomyMode {
  return (PERSISTABLE_MODES as readonly string[]).includes(mode)
}
