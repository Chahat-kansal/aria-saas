import type { PlannedAction } from '@/lib/aria/ask/action-planner'

/**
 * MS13 PHASE 4 — THE AGENT COMPOSER (deterministic, zero-LLM).
 *
 * describe → spec card → approve → row. The card is staged through the EXISTING pending_action
 * machinery (zero new engines, zero new chat routes): nothing persists until the owner confirms,
 * and reject/expiry clears the staged card without a write — asserted by test.
 *
 * The ALWAYS-TRUE box is part of every card: the guarantees that are not up to the agent, stated
 * to the owner before they approve. V5: sharing is closed — no share_token is read or written.
 */

export interface AgentSpec {
  name: string
  instructions: string
  card: string[]
}

const NAME_RE = /\b(?:called|named)\s+["']?([\w][\w &'-]{1,40}?)["']?(?=\s+(?:that|which|who|to)\b|\s*[.,!]|\s*$)/i
const STRIP_PREAMBLE = /^[\s\S]{0,60}?\b(?:an?\s+)?agent\b[,:\s]*(?:that|which|who|to)?\s*/i

export const ALWAYS_TRUE_BOX: readonly string[] = [
  'ALWAYS TRUE — not up to the agent:',
  '• Aria\u2019s grounding and anti-fabrication rules sit ABOVE this agent and always win',
  '• Any write it proposes lands as a decision card for YOUR approval — never an executed write',
  '• It reads only THIS business\u2019s data — the tenant is resolved server-side, never by the agent',
  '• Read-only tools unless you later grant more',
]

export function composeAgentSpec(message: string): AgentSpec {
  const nameMatch = message.match(NAME_RE)
  let instructions = message.replace(STRIP_PREAMBLE, '').trim()
  if (nameMatch) instructions = instructions.replace(nameMatch[0], '').trim()
  if (!instructions) instructions = message.trim()
  const name = (nameMatch?.[1] ?? deriveName(instructions)).trim().slice(0, 40)
  return {
    name,
    instructions: instructions.slice(0, 2000),
    card: [
      `Agent: ${name}`,
      `Instructions: ${instructions.slice(0, 160)}${instructions.length > 160 ? '\u2026' : ''}`,
      'Tools: read-only (the default — grant more later if needed)',
      ...ALWAYS_TRUE_BOX,
      'To revise: describe the change and I\u2019ll re-draft the card. Nothing exists until you confirm.',
    ],
  }
}

function deriveName(instructions: string): string {
  const words = instructions.split(/\s+/).filter(w => /^[a-z0-9]/i.test(w)).slice(0, 3)
  const base = words.join(' ') || 'Custom agent'
  return base.charAt(0).toUpperCase() + base.slice(1)
}

/** Build the staged PlannedAction for the composer card. */

export function planCreateAgent(message: string): PlannedAction {
  const spec = composeAgentSpec(message)
  return {
    type: 'create_agent',
    title: `Create agent \u201C${spec.name}\u201D`,
    description: spec.instructions.slice(0, 200),
    preview: spec.card,
    affected_count: 0,
    payload: { name: spec.name, instructions: spec.instructions, allowed_tools: [] },
    estimated_impact: 'none \u2014 creates a reusable agent, moves no money, sends nothing',
    reversible: true,
    risk: 'low',
    requires_confirmation: true,
  }
}
