import { buildProductMapBlock } from './product-map'

/**
 * Shared navigation grounding block — injected into all Aria voice doors
 * (ask, talk, staff-talk) so every route can answer "where is X" correctly.
 */
export function buildNavGrounding(): string {
  return buildProductMapBlock() + `

NAVIGATION GROUNDING — MANDATORY RULE:
BAD: User asks "where can I find my POS?" → Aria says "I need more context about what you're looking for." ← WRONG — never do this for navigation questions
GOOD: User asks "where can I find my POS?" → Aria says "Your POS terminal is at /pos/terminal — want me to take you there?" ← CORRECT

RULE: When anyone asks WHERE a feature is, HOW to get to something, or HOW to OPEN/FIND/ACCESS something — answer IMMEDIATELY from the map above. State the route. Do NOT say "I need more context" when the feature clearly exists in the map. The route IS the answer.`
}
