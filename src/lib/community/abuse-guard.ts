/**
 * Abuse + spam guard for Aria Community chat. Sits alongside the PII privacy
 * guard. Four layers:
 *   1. Profanity / slur / threat / harassment regex (cheap, server-side)
 *   2. Haiku second-pass when the sender already has a flagged history (3+ in 24h)
 *   3. Rate limits per session_token (5/min/business, 20/hr across all businesses)
 *   4. Block-list — a business can block a session_token; blocked visitors get 403
 *
 * Layers 3 + 4 + the flagged-history check use the community_message_log and
 * community_blocked_visitors tables.
 */
import { supabaseAdmin } from '@/lib/supabase-admin'

// ── Layer 1 — regex ──────────────────────────────────────────────────
// Profanity + slurs. Conservative seed list; matched as whole words.
const PROFANITY = [
  'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bullshit', 'bitch', 'bastard',
  'cunt', 'dickhead', 'asshole', 'arsehole', 'wanker', 'prick', 'piss off', 'slut', 'whore',
]
// Slurs — racial / sexual / ableist. Kept deliberately short; matched as words.
const SLURS = [
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'retarded', 'tranny', 'kike', 'spic', 'chink', 'wetback', 'coon', 'paki',
]

// Threats — verb + object pattern (NOT bare verb). "kill the music" passes,
// "kill you" / "kill your family" does not.
const THREAT_RE = new RegExp(
  String.raw`\b(kill|bash|stab|shoot|hurt|harm|bury|destroy|ruin|burn down|burn|find)\b\s+(you|u|ya|your|yer|ur|the (owner|staff|shop|store)|this (shop|store|place|business))\b`,
  'i',
)
const THREAT_FIND_RE = /\bi(?:'?ll| will)\s+(?:find|come (?:for|after)|get)\s+(?:you|u|ya)\b/i

// Harassment — anger + accusation. Require an accusation word; a single neutral
// "is this a scam?" should pass, but "you scamming thieves" / "fucking fraud" hits.
const HARASS_RE = /\b(scam(?:mer|ming)?|thief|thieves|thieving|fraud(?:ster)?|crook|con artist|rip[- ]?off (?:merchant|artist))\b/i
const HARASS_INTENSIFIER = /\b(fucking|bloody|absolute|total|disgusting|filthy|you (?:are|r)|ur|you'?re)\b/i

function hasWord(text: string, words: string[]): string | null {
  for (const w of words) {
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    if (re.test(text)) return w
  }
  return null
}

export interface AbuseResult {
  blocked: boolean
  reason?: string       // user-facing
  rule?: string         // internal — which layer fired
  flagged?: boolean     // counts toward the flagged-history threshold even if not hard-blocked
}

const BLOCKED_MSG = 'This message was flagged as abusive. If this is a mistake, contact support.'

/** Layer 1 — synchronous regex scan. */
export function checkAbuseRegex(text: string): AbuseResult {
  if (!text) return { blocked: false }
  const t = text.toLowerCase()

  const slur = hasWord(t, SLURS)
  if (slur) return { blocked: true, reason: BLOCKED_MSG, rule: 'slur', flagged: true }

  if (THREAT_RE.test(t) || THREAT_FIND_RE.test(t)) return { blocked: true, reason: BLOCKED_MSG, rule: 'threat', flagged: true }

  const prof = hasWord(t, PROFANITY)
  if (prof) return { blocked: true, reason: BLOCKED_MSG, rule: 'profanity', flagged: true }

  if (HARASS_RE.test(t) && HARASS_INTENSIFIER.test(t)) return { blocked: true, reason: BLOCKED_MSG, rule: 'harassment', flagged: true }

  return { blocked: false }
}

/** Layer 4 — is this session_token blocked by this business? */
export async function isBlocked(business_id: string, session_token: string | null): Promise<boolean> {
  if (!session_token) return false
  const { data } = await supabaseAdmin.from('community_blocked_visitors')
    .select('id').eq('business_id', business_id).eq('session_token', session_token).maybeSingle()
  return !!data
}

/** Layer 3 — rate limits. Returns the wait seconds if exceeded, else null. */
export async function checkRateLimit(business_id: string, session_token: string | null): Promise<{ exceeded: boolean; retryAfter?: number }> {
  if (!session_token) return { exceeded: false }
  const now = Date.now()
  const oneMinAgo = new Date(now - 60_000).toISOString()
  const oneHrAgo = new Date(now - 3_600_000).toISOString()

  // 5 / minute / business
  const { count: perMin } = await supabaseAdmin.from('community_message_log')
    .select('id', { count: 'exact', head: true })
    .eq('session_token', session_token).eq('business_id', business_id).gte('created_at', oneMinAgo)
  if ((perMin ?? 0) >= 5) return { exceeded: true, retryAfter: 60 }

  // 20 / hour / all businesses
  const { count: perHr } = await supabaseAdmin.from('community_message_log')
    .select('id', { count: 'exact', head: true })
    .eq('session_token', session_token).gte('created_at', oneHrAgo)
  if ((perHr ?? 0) >= 20) return { exceeded: true, retryAfter: 600 }

  return { exceeded: false }
}

/** Count flagged messages from this sender to this business in the last 24h. */
async function flaggedHistoryCount(business_id: string, session_token: string | null): Promise<number> {
  if (!session_token) return 0
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString()
  const { count } = await supabaseAdmin.from('community_message_log')
    .select('id', { count: 'exact', head: true })
    .eq('session_token', session_token).eq('business_id', business_id).eq('flagged', true).gte('created_at', dayAgo)
  return count ?? 0
}

/** Layer 2 — Haiku second pass for coded abuse the regex missed. */
async function checkAbuseLLM(text: string): Promise<boolean> {
  if (!process.env.ANTHROPIC_API_KEY) return false
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 5,
      system: 'You judge whether a short chat message is harassing or threatening toward a small business or person. Reply with ONLY one word: YES or NO.',
      messages: [{ role: 'user', content: text.slice(0, 500) }],
    })
    const out = resp.content[0]?.type === 'text' ? resp.content[0].text.trim().toUpperCase() : 'NO'
    return out.startsWith('YES')
  } catch {
    return false
  }
}

/**
 * Record a message in the rate-limit ledger. Call AFTER a message is accepted
 * (or flagged). `flagged` marks regex/LLM hits so the history threshold works.
 */
export async function logMessage(business_id: string, session_token: string | null, flagged: boolean) {
  if (!session_token) return
  await supabaseAdmin.from('community_message_log').insert({ session_token, business_id, flagged }).then(undefined, () => null)
}

/**
 * Full abuse check used by the chat routes. Order:
 *   block-list → rate-limit → regex → (history-gated) Haiku.
 * Does NOT log — the caller logs via logMessage() so it can record the verdict.
 */
export async function checkAbuseFull(
  business_id: string,
  session_token: string | null,
  text: string,
): Promise<AbuseResult & { rateLimited?: boolean; retryAfter?: number }> {
  // Layer 4 — block list
  if (await isBlocked(business_id, session_token)) {
    return { blocked: true, reason: BLOCKED_MSG, rule: 'blocked_visitor' }
  }

  // Layer 3 — rate limit
  const rl = await checkRateLimit(business_id, session_token)
  if (rl.exceeded) {
    return { blocked: true, rateLimited: true, retryAfter: rl.retryAfter, reason: `Slow down — try again in ${rl.retryAfter}s.`, rule: 'rate_limit' }
  }

  // Layer 1 — regex
  const regex = checkAbuseRegex(text)
  if (regex.blocked) return regex

  // Layer 2 — Haiku, only if sender already has a flagged history with this business
  const history = await flaggedHistoryCount(business_id, session_token)
  if (history >= 3) {
    const bad = await checkAbuseLLM(text)
    if (bad) return { blocked: true, reason: BLOCKED_MSG, rule: 'llm_harassment', flagged: true }
  }

  return { blocked: false }
}
