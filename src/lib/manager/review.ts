import { numbersIn } from '@/lib/aria/ground-guard'
import { hasScaffoldMarkers } from '@/lib/aria/briefing-guard'
import type { HealthSignals } from '@/lib/aria/health-signals'

// MANAGER-AGENT-1 — the REVIEW step. This is the manager's actual job: read what each domain agent
// proposed and decide whether it is fit to reach the CEO. A rejected proposal is sent back /
// suppressed with a reason — never passed to the owner raw.
//
// Every failure class below is one that has ALREADY shipped to a real owner in this product's
// history (invented targets, catastrophising a dormant business, raw scaffolding, duplicate
// headlines). The manager is the layer that exists to prevent them, so the checks are concrete and
// named rather than a vague "quality score".
//
// Reuses the existing guards rather than reimplementing grounding: numbersIn() from ground-guard
// (the same figure extractor the AI output guard uses) and hasScaffoldMarkers() from
// briefing-guard. No second grounding engine.

export type RejectReason =
  | 'invented_figure' | 'dormant_not_broken' | 'contradictory'
  | 'stale_data' | 'scaffold_leak' | 'duplicate'

export interface ProposalUnderReview {
  agent_type: string
  title: string
  body: string
  /** Figures the proposal asserts are real. Anything here must be anchored in ground truth. */
  amount_cents?: number | null
  /** Severity the agent claims — used for the dormant-vs-broken check. */
  priority?: string | null
}

export interface ReviewVerdict {
  verdict: 'approved' | 'rejected'
  reason_code?: RejectReason
  reason_detail?: string
}

/** Tolerance for matching an asserted figure to an anchor — covers rounding/formatting drift. */
function matchesAnyAnchor(value: number, anchors: number[]): boolean {
  return anchors.some(a => Math.abs(a - value) < 0.01 || (a !== 0 && Math.abs((a - value) / a) < 0.02))
}

// Phrases that assert a crisis. Harmless in a busy shop; actively wrong in a shop that simply
// wasn't trading — the single most damaging briefing failure this product has shipped.
const ALARM_PATTERNS = [
  /collaps/i, /crash/i, /plummet/i, /emergency/i, /urgent(ly)? (action|attention)/i,
  /(revenue|sales) (is|are|has) down/i, /losing money/i, /bleeding/i, /critical/i,
]

/**
 * Judge one proposal. Ordered cheapest-first; the first failing check wins so the reason the owner
 * (or an auditor) sees is the most specific one.
 */
export function reviewProposal(
  p: ProposalUnderReview,
  ctx: { health: HealthSignals; anchors: number[]; seenTitles: Set<string> },
): ReviewVerdict {
  const text = (p.title + ' ' + p.body).trim()

  // ── 1. SCAFFOLD LEAK — raw prompt text reaching an owner (BRIEF-INTEGRITY-1's class) ─────────
  if (hasScaffoldMarkers(text)) {
    return { verdict: 'rejected', reason_code: 'scaffold_leak', reason_detail: 'Prompt scaffolding present in owner-facing text.' }
  }

  // ── 2. DUPLICATE — two agents proposing the same substance in one run ────────────────────────
  const norm = p.title.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
  if (ctx.seenTitles.has(norm)) {
    return { verdict: 'rejected', reason_code: 'duplicate', reason_detail: 'Same substance already proposed this run.' }
  }

  // ── 3. DORMANT-NOT-BROKEN — the discriminator health-signals exists to provide ────────────────
  // A shop with no sales this week isn't collapsing; it's shut, or quiet. INSUFFICIENT_SAMPLE means
  // the data literally cannot support an alarm claim. Asserting a crisis here is the failure class
  // that told a real owner their revenue had collapsed when they simply hadn't opened.
  const dormant = ctx.health.pos_health.status === 'INSUFFICIENT_SAMPLE' || ctx.health.pos_health.completed_sales_7d === 0
  if (dormant && ALARM_PATTERNS.some(re => re.test(text))) {
    return {
      verdict: 'rejected', reason_code: 'dormant_not_broken',
      reason_detail: 'Alarm language with completed_sales_7d=' + ctx.health.pos_health.completed_sales_7d +
        ' and pos_health=' + ctx.health.pos_health.status + ' — dormant, not broken. Cannot assert a crisis from absent data.',
    }
  }

  // ── 4. INVENTED FIGURE — a $/% with no anchor in real data (GROUNDING-TEETH) ──────────────────
  // Percentages and money in owner-facing prose must trace to a real computed value. Small integers
  // (counts, day numbers, "3 items") are excluded — they're not the fabrication class, and flagging
  // them would make the check noisy enough to be ignored.
  const asserted = numbersIn(text).filter(n => Math.abs(n) >= 100 || /%/.test(text))
  const unanchored = asserted.filter(n => Math.abs(n) >= 100 && !matchesAnyAnchor(n, ctx.anchors))
  if (unanchored.length > 0) {
    return {
      verdict: 'rejected', reason_code: 'invented_figure',
      reason_detail: 'Figure(s) ' + unanchored.slice(0, 3).join(', ') + ' have no anchor in ground truth.',
    }
  }

  // ── 5. STALE DATA — the agent built on data health-signals already flags as stale ─────────────
  if (ctx.health.data_freshness.stale_signals_count > 0 && /today|right now|currently/i.test(text) && dormant) {
    return {
      verdict: 'rejected', reason_code: 'stale_data',
      reason_detail: 'Present-tense claim on stale data (' + ctx.health.data_freshness.stale_signals_count + ' stale signals).',
    }
  }

  ctx.seenTitles.add(norm)
  return { verdict: 'approved' }
}
