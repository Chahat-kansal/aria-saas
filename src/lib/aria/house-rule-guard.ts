import type { PromoSuggestion } from '@/lib/aria/business-rules'

/**
 * MS14 PHASE 6 — HOUSE RULES ENFORCED, NOT MERELY PROMPTED.
 *
 * An owner who said "never discount coffee" should never see a card proposing a coffee discount.
 * Putting the rule in a prompt makes that LIKELY; this makes it TRUE. The guard is deterministic
 * and pure: same rule, same proposal, same verdict, with no model in the loop — which is also the
 * only way it can be tested honestly in a repo whose model provider is currently credit-blocked.
 *
 * SCOPE, deliberately narrow: this catches the never-discount class of rule, because that is the
 * class that maps cleanly onto an action the system actually proposes. It does NOT try to parse
 * every possible English rule into a machine check — a guard that silently half-understands a
 * rule is worse than one with a stated edge, since the owner would believe they were covered.
 * Everything else reaches the model as context (formatHouseRulesBlock) and is honoured there.
 */

/** "never discount coffee" / "don't discount the beans" / "no discounts on wine". */
const NEVER_DISCOUNT_RE = /\b(?:never|no|don'?t|do not|dont)\b[^.;\n]{0,24}\bdiscount(?:s|ing|ed)?\b(?:\s+(?:on|for|the)\b)?\s*([^.;\n]{0,60})/i

/** Words that carry no product meaning, so they never become a match term. */
const STOPWORDS = new Set(['the', 'a', 'an', 'any', 'our', 'my', 'all', 'ever', 'at', 'in', 'on', 'of', 'for', 'and', 'or', 'to', 'is', 'are', 'we', 'us', 'please', 'items', 'item', 'products', 'product'])

export interface HouseRuleLike { content: string }

/** The subjects an owner has forbidden discounting on, lower-cased and de-duplicated. */
export function neverDiscountSubjects(rules: HouseRuleLike[] | null | undefined): string[] {
  const subjects = new Set<string>()
  for (const rule of rules ?? []) {
    const m = String(rule?.content ?? '').match(NEVER_DISCOUNT_RE)
    if (!m) continue
    for (const word of String(m[1] ?? '').toLowerCase().split(/[^a-z0-9']+/)) {
      const w = word.trim()
      if (w.length < 3 || STOPWORDS.has(w)) continue
      subjects.add(w)
    }
  }
  return [...subjects]
}

const DISCOUNTING_TYPES = new Set<PromoSuggestion['type']>(['bogo', 'percent_off', 'fixed_off', 'happy_hour', 'tiered', 'free_item', 'bundle'])

/**
 * Does this proposal break a stated house rule?
 *
 * `productText` is whatever names the thing being discounted (product name, category, or the
 * proposal's own rationale). A `none` proposal — Aria declining to suggest anything — is never a
 * conflict.
 */
export function conflictsWithHouseRules(args: {
  suggestion: Pick<PromoSuggestion, 'type' | 'rationale'>
  productText: string
  rules: HouseRuleLike[] | null | undefined
}): { conflict: false } | { conflict: true; rule: string; subject: string } {
  if (!args.suggestion || !DISCOUNTING_TYPES.has(args.suggestion.type)) return { conflict: false }

  const haystack = `${args.productText ?? ''} ${args.suggestion.rationale ?? ''}`.toLowerCase()
  for (const rule of args.rules ?? []) {
    const subjects = neverDiscountSubjects([rule])
    for (const subject of subjects) {
      // Word-boundary match so "coffee" does not fire on "coffee table" being absent, and
      // "wine" does not match "winery" — the rule must actually be about this thing.
      if (new RegExp(`\\b${subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i').test(haystack)) {
        return { conflict: true, rule: rule.content, subject }
      }
    }
  }
  return { conflict: false }
}

/** The refusal an owner reads. Names THEIR rule back to them, in their words. */
export function houseRuleRefusal(rule: string): string {
  return `Not suggesting this — it breaks a house rule you set: "${rule}". Change the rule in Aria's memory if it no longer applies.`
}
