import { supabaseAdmin } from '@/lib/supabase-admin'

// FAB-FIX-2 — reusable single-model GROUND GUARD. Mirrors the GROUNDING-TEETH-V2 number-strip logic
// (src/lib/aria/response-validator.ts → stripUngroundedNumbers / RISKY_NUMERIC_RE) but is STANDALONE and
// opt-in for ANY LLM surface, not just the Ask-Aria council path. Given an LLM output + the set of REAL
// figures the caller passes as ground truth, it removes/flags/redacts any $ or % figure that is NOT within
// 2% of an allowed value. Deterministic, never invents — it only deletes or flags ungrounded figures.
// Logs a `ground_guard` row to aria_ai_calls (provider/role 'other', valid post-LOGGING-AUDIT-3) when it fires.

// Same token shapes as GROUNDING-TEETH-V2's RISKY_NUMERIC_RE: $-currency, word-form dollars, percentages,
// multiplier comparisons, and bare count + data-noun (>=10).
const RISKY_NUMERIC_RE = /(\$\s?[\d,]+(?:\.\d+)?)|(\b\d[\d,]*(?:\.\d+)?\s?dollars?\b)|(\b\d{1,3}(?:\.\d+)?\s?%)|(\b\d+(?:\.\d+)?\s?[x×]\s?(?:higher|lower|more|less))|(\b\d{2,}(?:,\d{3})*\s?(?:customers?|sales|orders?|transactions?|bookings?|reviews?|visits?|sign[\s-]?ups?))/gi

const TOLERANCE = 0.02

export interface GuardResult {
  text: string         // healed output (strip removes ungrounded sentences; redact removes ungrounded tokens; flag = unchanged)
  ok: boolean          // true when NO ungrounded figure was found
  stripped: string[]   // sentences removed (strip) or flagged (flag)
  flagged: number[]    // the ungrounded numeric values detected
}

export interface GuardOptions {
  mode?: 'strip' | 'flag' | 'redact'  // strip = drop the offending sentence; redact = delete just the bad token; flag = report only
  ignorePercent?: boolean             // true → % tokens are allowed (e.g. an owner-chosen discount); only $/counts guarded
  businessId?: string
  surface?: string                    // identifies the call site in the guard log
  log?: boolean                       // default true when businessId present
}

function grounded(v: number, allowed: number[]): boolean {
  return allowed.some(n => n === v || (n > 0 && Math.abs(n - v) / n <= TOLERANCE))
}

function isPercentToken(token: string): boolean { return /%\s*$/.test(token.trim()) }

/** Extract every numeric literal from a string — for building an allowed-set out of ground-truth prose. */
export function numbersIn(corpus: string): number[] {
  const out: number[] = []
  for (const m of corpus.match(/\d[\d,]*(?:\.\d+)?/g) ?? []) {
    const v = parseFloat(m.replace(/,/g, ''))
    if (Number.isFinite(v)) out.push(v)
  }
  return out
}

async function logGuard(businessId: string, surface: string, mode: string, count: number, flagged: number[]): Promise<void> {
  try {
    await supabaseAdmin.from('aria_ai_calls').insert({
      business_id: businessId, agent_key: 'ground_guard', provider: 'other', model_id: 'none', role: 'other',
      success: true, request_summary: surface.slice(0, 200), response_summary: `${mode}:${count}`,
      learning_signal: `guard_fired:ground_guard:${surface}:${flagged.slice(0, 5).join(',')}`.slice(0, 300),
    })
  } catch { /* non-fatal */ }
}

/**
 * Validate `text` against the caller's REAL figures. Any $/% (or count) not within 2% of an allowed value
 * is ungrounded. `mode` decides the repair: drop the sentence ('strip'), delete just the token ('redact'),
 * or leave the text untouched and only report ('flag'). Never empties on 'strip' (returns original instead).
 */
export async function guardOutput(text: string, allowedValues: number[], opts: GuardOptions = {}): Promise<GuardResult> {
  const { mode = 'strip', ignorePercent = false, businessId, surface = 'ground_guard', log = true } = opts
  if (!text || !text.trim()) return { text, ok: true, stripped: [], flagged: [] }
  const allowed = (allowedValues ?? []).filter(n => Number.isFinite(n))
  const flagged: number[] = []

  // redact — remove only the ungrounded tokens, keep the surrounding text intact (best for short SMS/captions).
  if (mode === 'redact') {
    const healed = text.replace(RISKY_NUMERIC_RE, (tok) => {
      if (ignorePercent && isPercentToken(tok)) return tok
      const v = parseFloat(tok.replace(/[^0-9.]/g, ''))
      if (!Number.isFinite(v)) return tok
      if (grounded(v, allowed)) return tok
      flagged.push(v)
      return ''
    }).replace(/\s{2,}/g, ' ').replace(/\s+([.,!?])/g, '$1').trim()
    const ok = flagged.length === 0
    if (!ok && log && businessId) await logGuard(businessId, surface, 'redact', flagged.length, flagged)
    return { text: healed, ok, stripped: [], flagged }
  }

  // strip / flag — per-sentence.
  const sentences = text.split(/(?<=[.!?])\s+/)
  const kept: string[] = []
  const stripped: string[] = []
  for (const sentence of sentences) {
    const matches = sentence.match(RISKY_NUMERIC_RE) ?? []
    let bad = false
    for (const m of matches) {
      if (ignorePercent && isPercentToken(m)) continue
      const v = parseFloat(m.replace(/[^0-9.]/g, ''))
      if (!Number.isFinite(v)) continue
      if (!grounded(v, allowed)) { bad = true; flagged.push(v) }
    }
    if (bad) { stripped.push(sentence); if (mode === 'flag') kept.push(sentence) }
    else kept.push(sentence)
  }

  const ok = stripped.length === 0
  let healed = text
  if (mode === 'strip' && !ok) healed = kept.length > 0 ? kept.join(' ').trim() : text // safety: never empty
  if (!ok && log && businessId) await logGuard(businessId, surface, mode, stripped.length, flagged)
  return { text: healed, ok, stripped, flagged }
}
