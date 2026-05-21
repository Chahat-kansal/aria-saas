/**
 * Shared web search tool config for Anthropic API calls.
 * Add to any route that benefits from live market data.
 *
 * Routes that SHOULD use web search:
 * - price-check, price-intelligence → live competitor pricing
 * - supplier-insights → current market conditions
 * - daily-briefing → industry news, benchmarks
 * - reorder-forecast → supply chain conditions
 * - pos-chat, business-chat → live AU business info
 * - draft-review-reply → competitor review context
 * - customer-intel → live demographic/market data
 * - roster → AU award rates updates
 * - staff-visa-insight → current immigration rules
 */
export const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305' as const,
  name: 'web_search',
} as const

export const WEB_SEARCH_TOOLS = [WEB_SEARCH_TOOL]

// With max_uses limit for routes that should use it sparingly
export const WEB_SEARCH_TOOLS_LIMITED = [{ ...WEB_SEARCH_TOOL, max_uses: 3 }]
export const WEB_SEARCH_TOOLS_FULL = [{ ...WEB_SEARCH_TOOL, max_uses: 8 }]
