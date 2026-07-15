// BRIEF-INTEGRITY-1 — hard backstop between briefing generation and storage/display. Every write
// path that upserts aria_daily_briefings.content must route the text through safeBriefingContent()
// first, no exceptions — this is what makes "raw prompt scaffolding reaches a real business owner"
// structurally impossible regardless of which pipeline (parallel / batch_api / gemini_fallback)
// produced the text.
//
// AI-OUTPUT-INTEGRITY-1 — the underlying empty/scaffold-check-then-fallback logic is now the
// generic src/lib/aria/ai-output-guard.ts (safeAIOutput/hasScaffoldMarkers), so every other AI
// write/return path in the app gets the same guard, not just this one table. This file keeps its
// own exports (SCAFFOLD_MARKERS, hasScaffoldMarkers, safeBriefingContent) unchanged for existing
// callers — they now delegate to the generic guard with the briefing-specific marker set.
import { safeAIOutput, hasScaffoldMarkers as hasGenericScaffoldMarkers } from './ai-output-guard'

// The exact scaffold markers confirmed leaking in production (BRIEF-INTEGRITY-1 diagnosis).
export const SCAFFOLD_MARKERS = ['DO NOT open', 'max 1)', 'prior briefings']

export function hasScaffoldMarkers(text: string): boolean {
  return hasGenericScaffoldMarkers(text, SCAFFOLD_MARKERS)
}

export const BRIEFING_FALLBACK =
  "Aria wasn't able to generate today's briefing. Your dashboard numbers are live and unaffected — check back shortly, or open AriaOS for real-time figures."

// Never returns raw/empty/scaffold-contaminated text — the fallback line, or nothing else.
export function safeBriefingContent(text: string | null | undefined): string {
  return safeAIOutput(text, BRIEFING_FALLBACK, { markers: SCAFFOLD_MARKERS, label: 'briefing' })
}

// Common upbeat/encouraging closing phrases. Checked only against the final 1-2 sentences (a
// briefing can mention e.g. "keep up the good work on X" mid-body about something unrelated to the
// alert — only the CLOSING tone matters for single-narrative consistency).
const UPBEAT_CLOSER_PATTERNS = [
  /you'?re just getting started/i,
  /keep (up )?the (great|good|awesome) work/i,
  /onwards and upwards/i,
  /exciting (times|things) (ahead|to come)/i,
  /the future('s| is) (bright|looking bright)/i,
  /you'?ve got this/i,
  /great things (ahead|are coming|coming)/i,
  /things are looking up/i,
  /momentum is building/i,
  /you'?re on the right track/i,
  /keep pushing/i,
  /stay positive/i,
  /don'?t worry,? (things|it) will (turn around|improve|get better)/i,
  /here'?s to a (great|fantastic|brilliant) (day|week)/i,
]

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter(Boolean)
}

// BRIEF-INTEGRITY-1 part 4 — single-narrative check. When a [HIGH] data-integrity alert is present
// in the same briefing, an upbeat/encouraging closing line creates a real grounding contradiction
// (confirmed shipped: a "revenue collapsed 90%, POS disconnected" alert next to "you're just
// getting started"). Strips the offending closing sentence(s) rather than inventing a replacement —
// the model is also instructed not to do this (MERGE_SYSTEM rule 8) so this is defense-in-depth.
export function suppressUpbeatCloser(text: string, hasHighAlert: boolean): string {
  if (!hasHighAlert || !text) return text
  const sentences = splitSentences(text)
  while (sentences.length > 0 && UPBEAT_CLOSER_PATTERNS.some((p) => p.test(sentences[sentences.length - 1]))) {
    sentences.pop()
  }
  return sentences.join(' ').trim() || text
}

// BRIEF-INTEGRITY-2 — aria_daily_briefings can now hold up to 3 rows per (business_id,
// briefing_date), one per writing pipeline (migration 20260716000001_brief_integrity_2_pipeline_
// discriminator.sql — was a single silently-overwritten row before this). This is the ONE place
// that decides which row is canonical when more than one exists for the same day, so every read
// site (the dashboard cache-gate API route, the briefing history list) agrees with the others
// instead of each guessing independently.
//
// Precedence: parallel (generate-briefings.ts) is the richer, per-business-timezone-triggered
// pipeline — real business context (stock, movers, weekly labour, weather, AU news) plus the full
// BRIEF-INTEGRITY-1 guard chain and canonical revenue snapshot. batch (the Batch API pipeline,
// including its Gemini/template fallbacks) is a simpler single-prompt narrative — still real and
// guarded, second preference. onboarding is a one-time placeholder welcome message — lowest
// preference, only relevant before either real pipeline has produced anything for that business.
export type BriefingPipeline = 'parallel' | 'batch' | 'onboarding'
export const PIPELINE_PRECEDENCE: BriefingPipeline[] = ['parallel', 'batch', 'onboarding']

export function pickCanonicalBriefing<T extends { pipeline: string }>(rows: T[]): T | null {
  for (const p of PIPELINE_PRECEDENCE) {
    const row = rows.find((r) => r.pipeline === p)
    if (row) return row
  }
  return rows[0] ?? null
}
