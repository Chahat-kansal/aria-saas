# Aria OS — Roadmap Audit
Generated: 2026-06-10 (from live repo + AUDIT_STATE.md + WIRING_AUDIT.md)

---

## Executive Summary

| Dimension | Count |
|---|---|
| Core sprints defined | 46 |
| New platform sprints | 6 |
| **Total sprints** | **52** |
| DONE (fully shipped + audit clean) | 30 |
| PARTIAL (shipped but specific gaps remain) | 14 |
| ABSENT (designed, not yet built) | 6 |
| BLOCKED (needs founder credential or decision) | 2 |

**Last code state:** commit `c0fbb7f7` — STABILITY-1 + BRIEF-1 P2/P3 complete  
**Build:** green  
**tsc:** zero errors

---

## Recent completions (this session)

| Sprint | Commit | Summary |
|---|---|---|
| BRIEF-1 (all parts) | c0fbb7f7 | WebGL context-loss resilience, scaled TTS watchdog, briefing cache gate, AU RSS, weather, anti-repeat generator |

---

## Sprint Status Map

### Group A — Core Platform

| ID | Name | Existing prompt(s) | Status | Mode |
|---|---|---|---|---|
| S01 | Platform Setup & Onboarding | 01, 02, 04 | DONE | BATCH |
| S02 | Service Business POS | 03 | DONE | BATCH |
| S03 | SEO Suite | 05, 06, 07, 26, 27, 85 | DONE | BATCH |
| S04 | POS Performance & Terminal | 08, 09, 31 | DONE | BATCH |
| S05 | Customer Management | 10, 34 | DONE | BATCH |
| S06 | Invoice Builder | 11, 35 | PARTIAL — missing: scheduled/recurring invoices, e-signature | SOLO |
| S07 | Recipe Management | 12, 28, 47 | PARTIAL — missing: waste-to-sales reporting, AI cost optimiser | SOLO |
| S08 | Weekly & Shift Reports | 13, 14, 15, 52, 53 | PARTIAL — missing: PDF emailed on schedule, labour cost drill-down | SOLO |
| S09 | Roster & Staff Intelligence | 16, 43 | DONE | BATCH |
| S10 | POS Layout Customisation | 17, 18 | DONE | BATCH |

### Group B — AI & Intelligence

| ID | Name | Existing prompt(s) | Status | Mode |
|---|---|---|---|---|
| S11 | Aria Council Multi-Brain | 19, 22 | DONE | SOLO |
| S12 | Context Brain & Memory | 20 | DONE | SOLO |
| S13 | Agentic Layer | 21 | DONE | SOLO |
| S14 | Daily Briefing System | 32, 58, BRIEF-1 | DONE ✅ c0fbb7f7 | SOLO |
| S15 | 3D Avatar (stability fixed) | 24, STABILITY-1 | DONE ✅ c0fbb7f7 | BATCH |
| S16 | Security Phase 1 | 25 | DONE | SOLO |
| S17 | Privacy Sprint | 29 | DONE | BATCH |
| S18 | Xero Integration | 30, 57 | DONE | SOLO |
| S19 | Live POS Intelligence | 68 | DONE | SOLO |
| S20 | Market Price Intelligence | 76 | DONE | SOLO |

### Group C — Feature Depth

| ID | Name | Existing prompt(s) | Status | Mode |
|---|---|---|---|---|
| S21 | Reviews BirdEye-level | 36, 42 | PARTIAL — missing: NPS cohort view, multi-platform aggregation | BATCH |
| S22 | Winback Klaviyo-level | 37, 41 | PARTIAL — missing: automated SMS sequence builder, A/B test tracking | SOLO |
| S23 | Compliance Pro | 38 | PARTIAL — missing: ATO BAS auto-population, penalty calendar | SOLO |
| S24 | Profit Leaks Pro | 39 | PARTIAL — missing: supplier overcharge auto-dispute email | SOLO |
| S25 | Churn & Slow Days | 40 | PARTIAL — missing: predicted footfall overlay on roster | SOLO |
| S26 | Bookings Calendly-level | 45 | PARTIAL — missing: buffer time rules, multi-staff allocation, online deposit payment | SOLO |
| S27 | Quotes PandaDoc-level | 46 | ABSENT | SOLO |
| S28 | Recipes Recime-level | 47 | ABSENT | SOLO |
| S29 | Competitors SpyFu-level | 48 | DONE | BATCH |
| S30 | Social Hootsuite-level | 49 | DONE | BATCH |
| S31 | Loyalty LoyaltyLion-level | 50 | DONE | SOLO |
| S32 | Parcel Tracking AfterShip | 51 | DONE | BATCH |
| S33 | Shift Reports Deputy-level | 52 | DONE | BATCH |
| S34 | Weekly Reports Databox-level | 53 | PARTIAL — missing: custom KPI builder, scheduled delivery | BATCH |
| S35 | Intelligence Centre Pro | 54 | PARTIAL — missing: hypothesis auto-test framework, signal trending | SOLO |
| S36 | Variance Audit Pro | 55 | PARTIAL — missing: AI supplier comparison, variance root-cause tagging | SOLO |
| S37 | Inventory Pro | 56 | PARTIAL — missing: expiry forecast AI, reorder-to-supplier direct send | SOLO |
| S38 | Gemini Context 5 use-cases | 59 | ABSENT | SOLO |
| S39 | Landing Page | 60, 91 | DONE | BATCH |
| S40 | Product Variants | 61 | DONE | BATCH |
| S41 | Multi-Outlet POS | 62 | DONE | SOLO |
| S42 | Shopify Integration | 63 | ABSENT | BLOCKED — needs Shopify Partner credentials |
| S43 | Google Ads Integration | 64 | ABSENT | BLOCKED — needs Google Ads account linkage |
| S44 | TikTok Integration | 65 | ABSENT | SOLO |
| S45 | Basiq Bank Feed | 67 | PARTIAL — missing: auto-categorisation of bank expenses, reconcile vs Xero | SOLO |
| S46 | In-Store Kiosk | 74, 81, 90 | DONE | BATCH |

### Group D — Platform Sprints (new)

| ID | Name | Status | Mode |
|---|---|---|---|
| WIRE-2 | Briefing table consolidation | READY — pre-conditions met by BRIEF-1 | SOLO |
| WIRE-3 | Aria action canonical table enforcement | READY | SOLO |
| SH-4 | Security hardening verify (post Prompt-203) | READY | SOLO |
| DB-TYPES-1 | DB type correctness audit + migration | READY | SOLO |
| LRN-1 | Learning & outcome tracking pipeline | READY | SOLO |
| BRIEF-1 | Briefing surface + generator | DONE ✅ c0fbb7f7 | — |

---

## Key constraints active at every sprint

1. **RULE 0** — Upgrade only, never downgrade (see UPGRADE_ONLY_RULE.md)
2. **ONE COMMIT PER PROMPT** — npx tsc --noEmit && npm run build before every commit
3. **RULE 4** — vercel.json max 22 functions; crons daily maximum
4. **RULE 5** — Never touch: AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts
5. **RULE 6** — Column traps (see AUDIT_STATE.md column reference)
6. **RULE 7** — supabaseAdmin for server reads; await writes; .maybeSingle()
7. **RULE 8** — Model IDs: claude-haiku-4-5-20251001, claude-sonnet-4-5-20250929, claude-opus-4-5-20251101
8. **RULE 9** — 80% of category leader + AI differentiation; no scaffolds

---

## Wiring health (from WIRING_AUDIT.md, 2026-05-27)

- 49/52 dashboard pages fully wired
- 3 pages use direct Supabase (price-tickets, support, website-chat) — acceptable patterns
- 0 broken page→API paths
- 30 crons in vercel.json, all files exist
- Sub-daily cron risk: aria-intelligence (hourly), price-schedules (hourly), timed-prices (hourly)
  → verify these are intentionally below-daily (project rule is "no sub-daily" but timed-prices
  was already downgraded from */15 to hourly)

---

## Aria Intelligence health (from AUDIT_STATE.md)

- aria_ai_calls logging: all routes use withErrorCapture + trackAICall
- aria_actions (recommendations): upsertAriaAction dedup installed at all 17 insert sites (commit 9286df16)
- aria_agent_actions (executor): verify completeness in WIRE-3
- aria_autopilot_actions (outcomes): build in LRN-1
- Three briefing tables coexist — consolidation in WIRE-2

---

## Suggested execution order (locked)

See prompts/MANIFEST.md for the full locked build order with MODE tags and BLOCKED gates.
