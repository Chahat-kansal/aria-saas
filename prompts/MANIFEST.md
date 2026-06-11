# Aria OS — Sprint MANIFEST
Locked build order. Update STATUS field as you execute.
Generated: 2026-06-10 from roadmap-audit-2026-06-10.md

## Status legend
- `DONE` — shipped & audit-verified; prompt is a verify-only checklist
- `PARTIAL` — shipped but gaps remain; prompt lists exact missing pieces
- `ABSENT` — designed, not yet built; prompt is a full implementation spec
- `BLOCKED` — cannot run until founder provides a credential or makes a decision
- `READY` — pre-conditions met, not yet executed (for new sprints)
- `IN-PROGRESS` — currently executing
- `AWAITING-VERIFY` — code pushed, founder verification outstanding

## Mode legend
- `MODE: SOLO` — touches DB schema/writes, money, auth, crons, Stripe, payroll, or Aria brain.
  **One sprint per invocation. Stop BEFORE push. Founder verifies before pushing.**
- `MODE: BATCH` — UI polish, renderers, docs, client-only work. Zero new DB writes.
  **Run consecutive BATCH sprints until hitting SOLO or BLOCKED.**

---

## Group A — Core Platform

| # | Sprint File | Name | Status | Mode |
|---|---|---|---|---|
| 1 | [S01-platform-setup.md](S01-platform-setup.md) | Platform Setup & Onboarding | DONE | BATCH |
| 2 | [S02-service-pos.md](S02-service-pos.md) | Service Business POS | DONE | BATCH |
| 3 | [S03-seo-suite.md](S03-seo-suite.md) | SEO Suite (crawler + dashboard + local) | DONE | BATCH |
| 4 | [S04-pos-performance.md](S04-pos-performance.md) | POS Performance & Terminal | DONE | BATCH |
| 5 | [S05-customer-management.md](S05-customer-management.md) | Customer Management | DONE | BATCH |
| 6 | [S06-invoice-builder.md](S06-invoice-builder.md) | Invoice Builder | PARTIAL | SOLO |
| 7 | [S07-recipe-management.md](S07-recipe-management.md) | Recipe Management | PARTIAL | SOLO |
| 8 | [S08-weekly-shift-reports.md](S08-weekly-shift-reports.md) | Weekly & Shift Reports | PARTIAL | SOLO |
| 9 | [S09-roster-intelligence.md](S09-roster-intelligence.md) | Roster & Staff Intelligence | DONE | BATCH |
| 10 | [S10-pos-layout.md](S10-pos-layout.md) | POS Layout Customisation | DONE | BATCH |

## Group B — AI & Intelligence

| # | Sprint File | Name | Status | Mode |
|---|---|---|---|---|
| 11 | [S11-aria-council.md](S11-aria-council.md) | Aria Council Multi-Brain | DONE | SOLO |
| 12 | [S12-context-brain.md](S12-context-brain.md) | Context Brain & Memory | DONE | SOLO |
| 13 | [S13-agentic-layer.md](S13-agentic-layer.md) | Agentic Action Layer | DONE | SOLO |
| 14 | [S14-briefing-system.md](S14-briefing-system.md) | Daily Briefing System | DONE ✅ c0fbb7f7 | SOLO |
| 15 | [S15-3d-avatar.md](S15-3d-avatar.md) | 3D Talking Avatar | DONE ✅ c0fbb7f7 | BATCH |
| 16 | [S16-security-phase1.md](S16-security-phase1.md) | Security Phase 1 | DONE | SOLO |
| 17 | [S17-privacy.md](S17-privacy.md) | Privacy Sprint | DONE | BATCH |
| 18 | [S18-xero.md](S18-xero.md) | Xero Integration | DONE | SOLO |
| 19 | [S19-live-pos-intelligence.md](S19-live-pos-intelligence.md) | Live POS Intelligence | DONE | SOLO |
| 20 | [S20-market-price.md](S20-market-price.md) | Market Price Intelligence | DONE | SOLO |

## Group C — Feature Depth

| # | Sprint File | Name | Status | Mode |
|---|---|---|---|---|
| 21 | [S21-reviews-pro.md](S21-reviews-pro.md) | Reviews BirdEye-level | PARTIAL | BATCH |
| 22 | [S22-winback-pro.md](S22-winback-pro.md) | Winback Klaviyo-level | PARTIAL | SOLO |
| 23 | [S23-compliance-pro.md](S23-compliance-pro.md) | Compliance Pro | PARTIAL | SOLO |
| 24 | [S24-profit-leaks-pro.md](S24-profit-leaks-pro.md) | Profit Leaks Pro | PARTIAL | SOLO |
| 25 | [S25-churn-slow-days.md](S25-churn-slow-days.md) | Churn & Slow Days | PARTIAL | SOLO |
| 26 | [S26-bookings-pro.md](S26-bookings-pro.md) | Bookings Calendly-level | PARTIAL | SOLO |
| 27 | [S27-quotes-pro.md](S27-quotes-pro.md) | Quotes PandaDoc-level | ABSENT | SOLO |
| 28 | [S28-recipes-pro.md](S28-recipes-pro.md) | Recipes Recime-level | ABSENT | SOLO |
| 29 | [S29-competitors-pro.md](S29-competitors-pro.md) | Competitors SpyFu-level | DONE | BATCH |
| 30 | [S30-social-pro.md](S30-social-pro.md) | Social Hootsuite-level | DONE | BATCH |
| 31 | [S31-loyalty-pro.md](S31-loyalty-pro.md) | Loyalty LoyaltyLion-level | DONE | SOLO |
| 32 | [S32-parcel-tracking.md](S32-parcel-tracking.md) | Parcel Tracking AfterShip-level | DONE | BATCH |
| 33 | [S33-shift-reports-pro.md](S33-shift-reports-pro.md) | Shift Reports Deputy-level | DONE | BATCH |
| 34 | [S34-weekly-reports-pro.md](S34-weekly-reports-pro.md) | Weekly Reports Databox-level | PARTIAL | BATCH |
| 35 | [S35-intelligence-centre.md](S35-intelligence-centre.md) | Intelligence Centre Pro | PARTIAL | SOLO |
| 36 | [S36-variance-audit-pro.md](S36-variance-audit-pro.md) | Variance Audit Pro | PARTIAL | SOLO |
| 37 | [S37-inventory-pro.md](S37-inventory-pro.md) | Inventory Pro | PARTIAL | SOLO |
| 38 | [S38-gemini-contexts.md](S38-gemini-contexts.md) | Gemini Context 5 Use-Cases | ABSENT | SOLO |
| 39 | [S39-landing-page.md](S39-landing-page.md) | Landing Page | DONE | BATCH |
| 40 | [S40-product-variants.md](S40-product-variants.md) | Product Variants | DONE | BATCH |
| 41 | [S41-multi-outlet.md](S41-multi-outlet.md) | Multi-Outlet POS | DONE | SOLO |
| 42 | [S42-shopify.md](S42-shopify.md) | Shopify Integration | BLOCKED — Shopify Partner creds required | SOLO |
| 43 | [S43-google-ads.md](S43-google-ads.md) | Google Ads Integration | BLOCKED — Google Ads Manager account required | SOLO |
| 44 | [S44-tiktok.md](S44-tiktok.md) | TikTok Integration | ABSENT | SOLO |
| 45 | [S45-basiq.md](S45-basiq.md) | Basiq Bank Feed | PARTIAL | SOLO |
| 46 | [S46-instore-kiosk.md](S46-instore-kiosk.md) | In-Store Kiosk | DONE | BATCH |

## Group D — Platform Sprints

| # | Sprint File | Name | Status | Mode |
|---|---|---|---|---|
| 47 | [WIRE-2-briefing-consolidation.md](WIRE-2-briefing-consolidation.md) | Briefing Table Consolidation | READY | SOLO |
| 48 | [WIRE-3-aria-action-tables.md](WIRE-3-aria-action-tables.md) | Aria Action Canonical Tables | READY | SOLO |
| 49 | [SH-4-security-verify.md](SH-4-security-verify.md) | Security Hardening Verify | READY | SOLO |
| 50 | [DB-TYPES-1-type-correctness.md](DB-TYPES-1-type-correctness.md) | DB Type Correctness Audit | READY | SOLO |
| 51 | [LRN-1-outcome-tracking.md](LRN-1-outcome-tracking.md) | Learning & Outcome Tracking | READY | SOLO |
| 52 | [BRIEF-1-briefing-system.md](BRIEF-1-briefing-system.md) | BRIEF-1 (all parts) | DONE ✅ c0fbb7f7 | — |

---

## Execution order notes

1. **SH-4 runs before any feature sprint** — security baseline must be confirmed current
2. **DB-TYPES-1 runs before S42/S43/S45** — those integrations add new DB columns and need clean types
3. **WIRE-2 runs before LRN-1** — consolidating briefing tables first prevents writing to wrong table in outcome tracking
4. **WIRE-3 runs before S35/S36** — intelligence/variance features write to aria_actions; canonical enforcement prevents table drift
5. **S42 and S43 are BLOCKED** — cannot proceed until founder provides credentials; do not skip, do not stub
6. **BATCH runs**: S01→S05, S09→S10, S15, S17, S21, S29→S30, S32→S34, S39→S40, S46 can all run as one BATCH block after SH-4 passes verify
