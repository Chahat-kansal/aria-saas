import { ARIA_POS_TOOLS } from '@/lib/aria-tools'

// PROMPT-CACHE-1 §1 — the slim (data-lookup) prompt + tool subset, extracted VERBATIM from
// ask/route.ts:2013-2032 so it can be measured without a network call.
//
// WHY IT IS OUT HERE: prompt caching on ask_aria produced 117 reads / 64 writes in June, then went
// to ZERO reads AND ZERO writes on 25 Jun and stayed there across 118 successful calls. Anthropic
// does not error when a prefix is too short to cache — it silently processes it uncached — so the
// only way to know is to measure the assembled prefix and compare it to the documented minimum.
// A behaviour with no error path needs a test, or it regresses in silence. It already did.
//
// This is an EXTRACTION, not a rewrite: the strings, the tool names and the order are byte-identical
// to what the route sent before. The route imports these instead of declaring them inline.

/**
 * The read-only tool subset sent for a direct data lookup. Order matters — it is part of the cached
 * prefix, and a reordered tools array is a different prefix and therefore a cache miss.
 */
export const READ_TOOL_NAMES: ReadonlySet<string> = new Set([
  'query_sales', 'query_customers', 'query_inventory', 'compare_periods', 'query_bookings',
  'query_online_orders', 'query_business_data', 'get_hourly_sales', 'get_product_sales_detail',
  'get_cashier_performance', 'query_bank_balance', 'get_business_profile', 'get_top', 'get_summary',
  'get_reviews', 'get_profit_leaks', 'run_calculation',
])

/** The tool array for the slim path. Filtered from ARIA_POS_TOOLS, preserving its declaration order. */
export function slimTools(): typeof ARIA_POS_TOOLS {
  return ARIA_POS_TOOLS.filter(t => READ_TOOL_NAMES.has((t as { name: string }).name)) as typeof ARIA_POS_TOOLS
}

/**
 * The slim system prompt.
 *
 * `businessName` is interpolated at the very START of the string, which means the cached prefix is
 * per-business rather than global. That is not a bug — a café's cache is not shared with another
 * café's anyway — but it is the reason two businesses never share a cache entry, and it is asserted
 * deliberately in the test rather than left as an accident of string order.
 */
export function slimSystemPrompt(businessName?: string | null): string {
  return `You are Aria, the AI business assistant for ${businessName ?? 'this business'} — an Australian small business. The owner asked a DIRECT DATA LOOKUP.

YOU MUST CALL A DATA TOOL to answer — NEVER reply "I don't have data" or "I can't determine that" without FIRST calling the relevant tool. Map the question to a tool:
- best/top customer, who spends most, customer spend → call get_top (e.g. {"metric":"customers"}) or query_customers
- top seller / best-selling / most popular product → call get_top (e.g. {"metric":"products"}) or get_product_sales_detail
- revenue / sales / takings (today, this week, this month) → call get_summary or query_sales
- what's low / stock / on hand → call query_inventory
- reviews / rating → call get_reviews
- anything else about the business → call query_business_data or the closest read tool
Call the tool, read its result, then answer.

ANSWER CONCISELY: the name/number they asked for + at most ONE short sentence of context. No advisory, no recommendations, no "what this means"/"next move", no campaign/strategy suggestions unless they explicitly ask for advice. Lead with the answer.

GROUNDING (absolute): every number, name, ranking or count MUST come from a tool result in THIS turn — never invent, estimate, or round. Currency A$ (never USD). Australian spelling. Only say you don't have the data if the tool genuinely returned nothing.`
}

// ── THE CACHED PREFIX ────────────────────────────────────────────────────────────────────────────
// Anthropic caches "the entire prompt — tools, system, and messages (in that order) up to and
// including the block designated with cache_control", i.e. the prefix is CUMULATIVE FROM THE START
// OF THE REQUEST. providers/anthropic.ts places two breakpoints: one on the LAST tool (~:258) and
// one on the system block (~:267). So the two candidate segments are:
//   segment 1 = tools
//   segment 2 = tools + system
// Neither is "the system prompt alone" — which is why measuring the 1,436-character slim prompt on
// its own would have given the wrong answer.
// Source: https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching

/** Serialise the cached prefix exactly as the SDK sends it, for measurement. */
export function cachedPrefixText(tools: unknown[], systemPrompt: string): string {
  return JSON.stringify(tools) + JSON.stringify([{ type: 'text', text: systemPrompt }])
}
