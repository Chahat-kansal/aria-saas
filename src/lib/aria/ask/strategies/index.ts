/**
 * M17 · BRAIN-1 PHASE 3 — THE REGISTRY. Every lane, in the order `_POST` evaluates them.
 *
 * ⚠️ THE ORDER IN `decide()` IS THE BEHAVIOUR; THIS MAP IS JUST THE LOOKUP. Reordering the keys here
 * changes nothing. Reordering `decide()` changes which lane answers a message, which is the single
 * most dangerous edit anyone can make in this pipeline.
 *
 * ⚠️ SEVEN LANES ARE NOT KEYS HERE BECAUSE THEY ARE NOT SEPARATELY DISPATCHED:
 *   · five admission gates — `rate_limited_user`, `bad_request`, `cost_guard_blocked`,
 *     `rate_limited_minute`, `cost_ceiling` — run as stage 0 (`pipeline/admission.ts`), before the
 *     classifiers, because a rate-limited request must not pay for two model calls to be refused.
 *   · `image`, `stopped` and `total_outage` are sub-exits of `main`, which returns a TurnResult
 *     naming whichever exit it took.
 *
 * They are still `LaneName`s — they are exit identities, and the turn record names them — so
 * `assertRegistryComplete()` is called against `DISPATCHED_LANES`, not `LANE_NAMES`.
 */
import type { LaneName } from '../pipeline/types'
import type { StrategyRegistry } from '../pipeline/run-turn'

import { savePlanStrategy } from './save-plan'
import { pendingActionStrategy } from './pending-action'
import { agentComposerStrategy } from './agent-composer'
import { actionPlannerStrategy } from './action-planner'
import { inventoryAgentStrategy } from './inventory-agent'
import { navFastpathStrategy } from './nav-fastpath'
import { generalStrategy } from './general'
import { multiDomainStrategy } from './multi-domain'
import { deliverableStrategy } from './deliverable'
import { backgroundTaskStrategy } from './background-task'
// ⚠️ NOT './council'. M13B phase 2 retired that specifier and guards it — src/lib/aria/council.ts
// was renamed, and  is forbidden repo-wide so an old import cannot creep back.
// The guard fired on this line and it was RIGHT to: the rule is about the specifier, not the
// directory. Renamed rather than loosened, and the new name is the better one — this lane wraps
// runAriaCouncil() from lib/aria/answer-council.ts.
import { councilStrategy } from './answer-council'
import { mainStrategy } from './main'

/** The lanes `decide()` can offer. See the note above for the seven that are not here. */
export const DISPATCHED_LANES: readonly LaneName[] = [
  'save_plan',
  'pending_action',
  'agent_composer',
  'action_planner',
  'inventory_agent',
  'nav_fastpath',
  'general',
  'multi_domain',
  'deliverable',
  'background_task',
  'council',
  'main',
]

export const STRATEGIES: StrategyRegistry = {
  save_plan: savePlanStrategy,
  pending_action: pendingActionStrategy,
  agent_composer: agentComposerStrategy,
  action_planner: actionPlannerStrategy,
  inventory_agent: inventoryAgentStrategy,
  nav_fastpath: navFastpathStrategy,
  general: generalStrategy,
  multi_domain: multiDomainStrategy,
  deliverable: deliverableStrategy,
  background_task: backgroundTaskStrategy,
  council: councilStrategy,
  main: mainStrategy,
}
