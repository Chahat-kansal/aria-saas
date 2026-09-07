/**
 * WALL 8 (M13D phase 3) — ONLY A CRON MAY HAND AN AGENT THE SERVICE-ROLE CLIENT.
 *
 * ── WHY THIS RULE EXISTS ───────────────────────────────────────────────────────────────────────
 * `BaseAgent` used to build its own Supabase client from `createServerSupabaseClient()` — the anon
 * key plus request cookies. A cron has no cookies, RLS is on, and so every `agent_decisions` and
 * `agent_runs` write was rejected from 4 June 2026 until M13D phase 2. It was never a failing
 * insert; it was an unauthorised one.
 *
 * The obvious repair — default the field to `supabaseAdmin` — was refused, twice, and this rule is
 * what stops it being made one call site at a time instead. These agents are constructed from **ten
 * user-facing routes** as well as fifteen crons, and handing one a service-role client inside a
 * route makes that route bypass RLS for every read and write the agent performs. That trades a
 * silent failure for a silent authorisation hole, which is strictly worse than the bug.
 *
 * ── WHY IT LIVES HERE AND NOT INSIDE THE GUARD SCRIPT ──────────────────────────────────────────
 * `canon-rail-guard.ts` calls `main()` at module scope, so importing it runs the whole guard and a
 * test cannot drive one rule. The predicate lives here, the guard imports it, and the test CALLS
 * it — this sprint's standing rule is that a rail test exercises the function rather than asserting
 * a string is present in a file.
 */

/** Path prefixes entitled to construct an agent with a service-role client. */
export const AGENT_SERVICE_ROLE_HOMES = ['src/app/api/cron/']

/**
 * Files outside those homes that are still entitled, named one at a time and never by prefix.
 * A second entry here would mean the rule had been routed around rather than obeyed.
 */
export const AGENT_SERVICE_ROLE_ALLOWLIST = [
  // The nightly council. It lives in lib/ rather than under api/cron/ because it is the ENGINE, but
  // its only importer is src/app/api/cron/council-session/route.ts — verified, and the reason this
  // is an explicit entry rather than a widened path prefix.
  'src/lib/agents/proposal-council.ts',
]

/**
 * Matches an agent being handed the service-role client, in either shape the codebase uses:
 *   a `new` of any `*Agent` class whose FIRST argument is the service-role client, and
 *   a `runAgent(...)` call with the service-role client anywhere in its arguments.
 *
 * ⚠️ Deliberately DESCRIBED rather than quoted. The first version of this comment spelled both
 * shapes out literally and this file failed its own rule — the fourth time in this series that a
 * scan has matched its own prose. Split the literal, never loosen the guard; the exact shapes are
 * exercised in service-role-rule.test.ts, where a test file is exempt for good reason.
 */
export const AGENT_SERVICE_ROLE_PATTERN =
  /(?:new\s+[A-Z]\w*Agent\s*\(\s*supabaseAdmin|runAgent\s*\([^)]*\bsupabaseAdmin\b)/

/**
 * True when this line, in this file, hands an agent a service-role client somewhere it may not.
 *
 * Test files are exempt: a test that builds an agent with a fake or service-role client is
 * exercising the constructor, not granting production access.
 */
export function isAgentServiceRoleViolation(file: string, line: string): boolean {
  if (!file) return false
  if (/\.(test|spec)\.tsx?$/.test(file)) return false
  if (AGENT_SERVICE_ROLE_HOMES.some(h => file.startsWith(h))) return false
  if (AGENT_SERVICE_ROLE_ALLOWLIST.includes(file)) return false
  return AGENT_SERVICE_ROLE_PATTERN.test(line)
}
