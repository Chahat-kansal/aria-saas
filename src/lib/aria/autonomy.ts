/**
 * MS16 PHASE 3 — THE AUTONOMY CONTROL ("how much rope").
 *
 * WHAT IT IS ACTUALLY WIRED TO, stated plainly because the brief demands it:
 *
 *   `agent_settings.mode` is REAL, per-business, per-agent-type, already read by the agents that
 *   act (clv-agent, flash-revenue and friends). So the control is NOT local state and NOT inert —
 *   Suggest and Auto read and write that column for real.
 *
 *   BUT its CHECK constraint is `mode IN ('suggest','auto')` — TWO values, and the contract's
 *   control has THREE. **CO-PILOT CANNOT BE PERSISTED WITHOUT DDL, SO IT IS PARKED**:
 *
 *     ALTER TABLE public.agent_settings DROP CONSTRAINT agent_settings_mode_check;
 *     ALTER TABLE public.agent_settings ADD CONSTRAINT agent_settings_mode_check
 *       CHECK (mode IN ('suggest','copilot','auto'));
 *
 *   Until a founder applies that, Co-pilot is shown as what it actually is: Ask Aria's CURRENT
 *   behaviour (it drafts, you approve — the propose-approve flow MS13/MS14 hardened), described
 *   honestly and not selectable, rather than a button that silently fails to save. A control that
 *   looks like it persists and doesn't is the "exists, looks correct, does nothing" pattern
 *   wearing a nicer coat.
 */

export type AutonomyMode = 'suggest' | 'copilot' | 'auto'

/** The modes the database can actually store today. */
export const PERSISTABLE_MODES: readonly AutonomyMode[] = ['suggest', 'auto']

export const COPILOT_PARK_REASON =
  'Co-pilot is how Ask Aria already behaves — it drafts, you approve. It can’t be saved as a ' +
  'setting yet: agent_settings.mode only accepts “suggest” or “auto”. Changing that needs a ' +
  'schema change, so this option is shown but not selectable rather than pretending to save.'

export interface AutonomyState {
  /** What is stored (or, for copilot, what is effectively true today). */
  mode: AutonomyMode
  /** True when `mode` came from the database rather than from the propose-approve default. */
  persisted: boolean
  /** How many agent_settings rows carry this mode — the control is per-business, the column isn't. */
  agentTypes: number
}

export const MODE_EXPLANATION: Record<AutonomyMode, string> = {
  suggest: 'Aria tells you what she’d do and waits. Nothing happens without you asking for it.',
  copilot: 'Aria drafts the work — orders, rosters, replies — and you approve or edit before anything is real.',
  auto: 'Aria acts on the routine things within your limits, and still asks before anything that spends, sends or deletes.',
}

/**
 * Resolve the business's autonomy mode from its agent_settings rows.
 *
 * The column is per-agent-type and the control is per-business, so the resolution rule is stated
 * rather than assumed: if EVERY enabled agent is on 'auto', the business is on auto; otherwise it
 * is on 'suggest'. A mixed state resolves DOWN, never up — reading a half-automated business as
 * fully automated would overstate what Aria is allowed to do, which is the direction that hurts.
 */
export function resolveAutonomy(
  rows: Array<{ agent_type: string; mode: string | null; enabled: boolean | null }> | null | undefined,
): AutonomyState {
  const enabled = (rows ?? []).filter(r => r.enabled !== false)
  if (enabled.length === 0) {
    // No stored preference at all — the truthful answer is Ask Aria's actual behaviour today.
    return { mode: 'copilot', persisted: false, agentTypes: 0 }
  }
  const allAuto = enabled.every(r => (r.mode ?? 'suggest') === 'auto')
  return {
    mode: allAuto ? 'auto' : 'suggest',
    persisted: true,
    agentTypes: enabled.length,
  }
}

/** Is this mode one the database will accept? */
export function isPersistable(mode: string): mode is 'suggest' | 'auto' {
  return (PERSISTABLE_MODES as readonly string[]).includes(mode)
}
