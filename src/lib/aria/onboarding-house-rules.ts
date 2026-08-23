/**
 * MS14 PHASE 5 — ONBOARDING ASKS, AND ARIA READS IT BACK.
 *
 * Self-serve onboarding is table stakes. Onboarding whose OUTPUT is Aria already knowing how the
 * venue runs is not — and the switching cost starts on day one, because these answers are the one
 * thing a competitor cannot import.
 *
 * PURE MODULE ON PURPOSE. Deriving the rules must be testable to the character, because the
 * content is the OWNER'S, not Aria's: for free-text answers the stored rule is the owner's exact
 * words; for the one numeric answer it is their number in a plain sentence. Nothing here calls a
 * model, and nothing here supplies a default — an unanswered question yields NO rule at all. A
 * rule nobody stated is not a rule.
 */

export interface HouseRuleQuestion {
  /** step_data key — additive; existing keys are untouched, so an existing business is never forced back. */
  id: string
  /** What Aria asks. Plain language, one thing at a time. */
  prompt: string
  /** The example that shows the shape of a good answer without putting words in their mouth. */
  placeholder: string
  topic: string
  /** Turns the owner's raw answer into the stored rule. Keeps their words; never invents. */
  toRule: (answer: string) => string
}

export const HOUSE_RULE_QUESTIONS: readonly HouseRuleQuestion[] = [
  {
    id: 'hr_margin_target',
    prompt: 'What gross margin are you aiming for?',
    placeholder: 'e.g. 68%',
    topic: 'pricing',
    toRule: a => `Target gross margin is ${a}`,
  },
  {
    id: 'hr_never_discount',
    prompt: 'Is there anything you never discount?',
    placeholder: 'e.g. coffee — never discount coffee',
    topic: 'pricing',
    toRule: a => a,
  },
  {
    id: 'hr_peak_times',
    prompt: 'When are you busiest?',
    placeholder: 'e.g. Saturday 9–12 is our peak',
    topic: 'operations',
    toRule: a => a,
  },
  {
    id: 'hr_pricing_style',
    prompt: 'Any rules about how you set prices?',
    placeholder: 'e.g. we round prices to $0.10',
    topic: 'pricing',
    toRule: a => a,
  },
  {
    id: 'hr_non_negotiable',
    prompt: 'Anything else Aria should always know about how you run the place?',
    placeholder: 'e.g. we never run out of oat milk',
    topic: 'operations',
    toRule: a => a,
  },
] as const

export interface DerivedHouseRule { content: string; topic: string; question_id: string }

/**
 * Onboarding answers → house rules. Absent, blank or whitespace answers produce NOTHING: no
 * default, no guess, no placeholder-as-answer. Skipping a question is a valid outcome.
 */
export function deriveHouseRules(stepData: Record<string, unknown> | null | undefined): DerivedHouseRule[] {
  if (!stepData) return []
  const out: DerivedHouseRule[] = []
  for (const q of HOUSE_RULE_QUESTIONS) {
    const raw = stepData[q.id]
    if (typeof raw !== 'string') continue
    const answer = raw.trim()
    if (!answer) continue
    // A placeholder echoed back verbatim is not an answer — it is the example we showed them.
    if (answer.toLowerCase() === q.placeholder.toLowerCase()) continue
    const content = q.toRule(answer).trim().slice(0, 500)
    if (content) out.push({ content, topic: q.topic, question_id: q.id })
  }
  return out
}

/**
 * Aria states what it now knows, in its own voice — the first moment the product feels like it
 * understands this specific business. It reads back ONLY what the owner actually said; with no
 * answers it says so honestly rather than inventing a warm summary of nothing.
 */
export function buildReadback(businessName: string, rules: DerivedHouseRule[]): string {
  const name = (businessName ?? '').trim() || 'your business'
  if (rules.length === 0) {
    return `I haven't been told any house rules for ${name} yet. You can add them any time — things like "target GP 68%" or "never discount coffee" — and I'll apply them everywhere.`
  }
  const lines = rules.map(r => `• ${r.content}`)
  return [
    `Here's what I now know about how ${name} runs:`,
    ...lines,
    '',
    `I'll apply ${rules.length === 1 ? 'this' : 'these'} everywhere — in your briefings, in anything I suggest, and in anything I'd otherwise propose that breaks ${rules.length === 1 ? 'it' : 'one of them'}. You can change or add to ${rules.length === 1 ? 'it' : 'them'} whenever you like.`,
  ].join('\n')
}
