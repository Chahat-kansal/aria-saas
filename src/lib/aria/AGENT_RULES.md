# Aria Intelligence Layer v2 — Architecture Reference

## Overview

The Aria Intelligence Layer is a 4-layer pipeline that turns raw business data
into validated, cost-controlled, industry-aware recommendations.

```
Layer 1: Context (context.ts)      — build BusinessContext from DB + signals
Layer 2: Agents (agents.ts)        — specialist LLM calls (promo, pricing, …)
Layer 3: Judge (judge.ts)          — 3-pass validation (deterministic → Opus → GPT-5)
Layer 4: Router (router.ts)        — orchestrates layers, rate-limits, persists
Public:  invoke.ts                 — single entry point for all callers
```

## Cost Controls

- **Prompt caching** (Anthropic): system prompts marked `cache_control: ephemeral`.
  Cached reads cost 10% of base input rate (60% savings per repeated call).
- **Rate limiting** (`rate-limit.ts`): in-memory token bucket per business.
  Default: 30 calls/minute. Set `ARIA_RATE_LIMIT_PER_MIN` to override.
- **Deterministic pre-filter** (`validators.ts` + `business-rules.ts`): catches
  obvious errors before paying for Opus. Most rejections happen here — free.
- **GPT-5 second opinion**: only fires when `isAnyHighStakes()` is true AND
  Opus already passed. Not triggered for routine suggestions.

## 3-Pass Judge

1. **Pass A — Deterministic** (free):
   - Promo rules: BOGO restrictions, margin floor, alcohol/RSA compliance
   - Pricing rules: ≤10% per-step, never below cost
   - Inventory rules: shelf-life cap, over-stocked check
   - Semantic dismissal: embedding similarity >0.85 against past dismissals

2. **Pass B — Opus 4.5 LLM judge** (always, ~$0.003/call with cache):
   - Adversarial critic. Scores 0–100. pass=70+, soft_fail=40-69, hard_fail<40
   - Returns rewrite for soft_fail where possible

3. **Pass C — GPT-5 second opinion** (high-stakes only):
   - Triggers: alcohol promo, price delta >10%, restock >$5k, BAS-impacting compliance
   - If GPT-5 says reject/rewrite while Opus said pass, GPT-5 wins
   - Disagreement (>30pt gap) logged in `judges_disagreed` field

## Signals

| Signal | Source | Cache TTL | Fallback |
|--------|--------|-----------|---------|
| Weather | Open-Meteo (free, no key) | none (fresh each call) | null |
| Geocode | Geoapify (3K/day free) | 365 days | Open-Meteo geocoding |
| Barcode | Go-UPC → UPCitemDB | 30 days | null |
| Web/competitor | Perplexity Sonar | 4 hours | null |
| Dismissal embeddings | OpenAI text-embedding-3-small | none (live DB) | plain-text fallback in prompt |

## Adding a New Agent

1. Add `AgentKey` type to `types.ts`
2. Add system prompt + schema in `agents.ts` `schemas` map
3. Add model tier in `agents.ts` `modelByAgent` map
4. Add category mapping in `router.ts` `agentToCategory`
5. Create a route in `src/app/api/aria/<name>/route.ts` that calls `ariaInvoke()`

## DB Tables Used

- `aria_ai_calls`: logs every LLM call with cost, latency, success
- `aria_signal_cache`: caches geocode, barcode, web signals
- `aria_actions`: persists recommendations (pending → dismissed/auto_rejected/applied)
- `pos_products`, `pos_sale_items`, `pos_sales`, `pos_outlets`: data sources
- `aria_tracking_preferences`: per-category opt-out

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API for all Claude calls |
| `OPENAI_API_KEY` | Optional | Enables GPT-5 judge + embeddings |
| `ARIA_USE_OPENAI_JUDGE` | Optional | Set `false` to disable GPT-5 judge |
| `GEOAPIFY_API_KEY` | Optional | Better geocoding (3K/day free tier) |
| `GO_UPC_API_KEY` | Optional | Barcode lookups |
| `PERPLEXITY_API_KEY` | Optional | Web/competitor intelligence |
| `ARIA_RATE_LIMIT_PER_MIN` | Optional | Rate limit per business (default: 30) |
