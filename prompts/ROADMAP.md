# Aria OS — Master Sprint Roadmap
> Single source of truth · **v2 (research-grounded)** · last updated 14 Jun 2026 · Chahat / ariaos.site
> Use this in fresh chats: "Read prompts/ROADMAP.md and prompts/intelligence-12-sprints.html, then prepare the next sprint prompt per the locked build order."

---

## 🔬 What changed in v2 (read once)
Live web verification of external dependencies, applied as annotations below:
1. **Approvals are multi-week, not instant** — IG (Meta App Review) + TikTok (Content Posting audit, 2–6 wks each) gate Reels R6. **New LEAD task filed in T2/T3** so they clear before R6 runs.
2. **R2 music** — Pixabay/FMA forbid serving the raw track file; music must be **baked into the export only** (no standalone download). Annotated on R2.
3. **In-browser AI is Chrome-only + heavy** — R4/R5/FA-2.6 need a graceful fallback path. Annotated on those rows.
4. **Prompt count corrected** — CX P1–P5 and Reels R2–R11 HTML prompts confirmed to exist → **26 detailed prompts written**, not 11.
5. **Model IDs corrected** in Hard Constants (Sonnet 4.5→4.6, Opus 4.5→4.8).
6. **Conversational UI direction has a home** — the intent-surface + plan-preview pattern is the **front-end for I7 (tool-use) + I9 (deep-reasoning)**, not a separate tier. See note under T1.

---

## ⚡ DO FIRST (blocks everything)
Two local commits await push:
- `dd87b298` — GROUNDING-TEETH-V2 (V2 advisor strip + Check 6)
- `4c2d1a7f` — HEALTH-SIGNALS-1 (diagnostic facts in groundTruth)

```bash
cd C:\Users\kansa\aria-saas-audit && git push origin main && git log origin/main..HEAD
```

Verify after deploy:
```sql
select agent_key, count(*) from aria_ai_calls 
where business_id='ff5055a0-c351-4ada-817a-1804961035f3'
  and created_at > now() - interval '15 minutes'
  and agent_key in ('advisor_guard','heal','health_signals','council_synthesis')
group by 1;
-- PASS: all four agent_keys present
```

---

## Status snapshot
| | Count | Detail |
|---|---|---|
| ✅ Complete | 19 | 18 brain quality + I1 HEALTH-SIGNALS |
| 🟡 Awaiting push | 2 | dd87b298 + 4c2d1a7f |
| 📝 Detailed prompts written (HTML) | **26** | I2–I12 (`intelligence-12-sprints.html`) + CX P1–P5 (written) + Reels R2–R11 (`reels-R2-R11.html`) |
| 🔨 Specs/names only — prompt yet to write | ~60 | See tiers 1b, 2, 4, 7–9 below |
| **Total queued** | **~86** | |

---

## Locked build order
**T0** Push → **T1** Intelligence I2–I12 + brain backlog → **T2** Security x4 *(+ file IG/TikTok approvals)* → **T3** 2-week soft launch → **T4** SEO 2/3/4 + Recipe + Customer/Invoice + Weekly BI → **T5** CX Community P1-P5 → **T6** Reels R2-R11 → **T7** Free AI + Polish features → **T8** 46-sprint long tail → **T9** Warehouse/Finance/AR/TB depth.

Never skip ahead. Never run two new sprints in parallel.

---

## T1 — Intelligence 12 (HTML prompts exist)

All detailed prompts live in `prompts/intelligence-12-sprints.html`. Audited against live DB 14 Jun 2026 — most are WIRING, not building, because the infrastructure exists but the loops were never closed.

| # | Sprint | New table? | Status | Key insight from audit |
|---|---|---|---|---|
| I1 | HEALTH-SIGNALS | No | ✅ **DONE** `4c2d1a7f` | Uses wh_payments_coverage RPC (AUTOPILOT-FIX-1 fixed) + 56d dow baseline + known_unknowns. weather_history doesn't exist yet → `{available:false}` |
| I2 | GOAL-AWARE | No | Queued (next) | `businesses.weekly_revenue_target` ALREADY exists, just unsurfaced |
| I3 | PATTERN-MEMORY | No | Queued | Add `'pattern'` to `aria_business_memory.kind` CHECK + weekly detection cron |
| I4 | OUTCOME-LOOP | No | Queued | `aria_outcomes` (6 rows, 0 acted_on) + `aria_advice_weights` (0 rows) + `outcome-check` cron (27 runs, 0 success) — WIRE the existing |
| I5 | PLAN-PERSISTENCE | No | Queued | Follow-up on executed `aria_actions` (434 rows); writes outcomes to I4 |
| I6 | INDUSTRY-KNOWLEDGE | No | Queued | 12 `aria_skills` personas all `enabled=false` — enable by industry match |
| I7 | TOOL-USE | No | Queued | Anthropic tool_use mode + 5 read-only tools (query_pos_sales/products/customers/inventory/calendar) |
| I8 | SELF-VERIFY | No | Queued | `ask_aria_verifier` agent_key exists, fired ONCE (Jun 7) — wire as pre-emission check |
| I9 | DEEP-REASONING | No | Queued | plan→verify→conclude per advisor + `agent_council_proposals.conflicts_with` column unused |
| I10 | BENCHMARK | **YES** | Queued | NEW `industry_benchmarks` table, privacy floor `sample_size>=5` |
| I11 | COUNTERFACTUAL | No | Queued | 1,653 `aria_hypotheses` rows exist with ZERO accepted — surface interactive |
| I12 | CAUSAL | No | Queued | `intelligence_events` (48 rows) is event timeline base — extend + correlate |

> **🎨 Conversational-UI note (v2):** the "intent-surface + plan-preview + binary-confidence + explain-on-demand" UI direction is the **front-end for I7 and I9** — not a separate feature. Plan-preview-before-action *is* the UX for agentic tool-use (I7); the morphing intent surface *is* I9's plan→verify→conclude made visible. Build I7/I9 with this surface as their interface. Mockups: `aria-intent-surface.html`. Binary confidence (Confident / Check this) beats % chips per testing. Each "talk" line + confidence value must derive from the live action/grounding score, never hardcoded (else it's the fabricated-number class GROUNDING-TEETH-V2 kills).

---

## T1b — Brain Quality Backlog (10 sprints, prompts unwritten)

These are the cherry-on-top brain hardening sprints. Each is ~30-60 min focused work. Write the detailed prompt only when reaching the sprint in queue.

| # | Sprint | Scope |
|---|---|---|
| BQ-1 | LOGGING-AUDIT-4 | Tighten `AgentRole` types, route remaining ad-hoc `.insert()` through `logAICallSafe`. Audit any agent_key still bypassing typed helper. |
| BQ-2 | WAITUNTIL-COLUMN-FIX | Find legacy column names referenced in awaitable code paths (grep for old name patterns). Replace with current schema. |
| BQ-3 | CACHE-EPOCH-2 | Deploy-time cache invalidation — bust `council_cache` + `aria_signal_cache` on commit SHA change so new deploys don't serve stale data. |
| BQ-4 | CRON-1 | Census of 54 cron entries vs 22 vercel.json function configs. Reconcile. Document each cron's purpose, owner, expected frequency. |
| BQ-5 | COMMAND-PORT-1 | Port BREVITY + GROUNDING + RICH-1 logic into AriaCommandBar component (today they only apply to /ask chat surface). |
| BQ-6 | TZ-2-LIB-FIX | `date-au.ts` has a 10h-late bug somewhere — audit every consumer. AEST = UTC+10, AEDT = UTC+11; common confusion point. |
| BQ-7 | MEMORY-DEDUPE-1 | `aria_business_memory` has duplicates from re-extractions. Add dedup by (business_id, content_hash, kind) + nightly compaction. |
| BQ-8 | MONITOR-1 | Sentry tunnel + cron failure alerting + AI failure rate threshold (already tracked, surface to Discord/email). |
| BQ-9 | RICH-2 / RICH-3 | Continuation of RICH-1 rich response format. RICH-2: structured visual blocks. RICH-3: interactive proposal cards. *(Note: RICH-3 interactive cards overlap the intent-surface UI — build together.)* |
| BQ-10 | SPELLS-1 | 22-pattern Design Spells animation library — micro-animations applied per surface. Aria's design polish. |

---

## T2 — Security x4 (MUST ship pre-launch, prompts to write)

Real data-leak risks. Cannot soft-launch with these open.

| # | Sprint | The hole | Fix |
|---|---|---|---|
| SEC-1 | Cron auth | Square sync cron + others bypass auth via User-Agent spoofing | `CRON_SECRET` env var checked on every `/api/cron/*` route |
| SEC-2 | POS stubs | Unauthenticated `/api/pos/*` stub routes exist | `verifyBusinessAccess(userId, businessId)` middleware on every route |
| SEC-3 | Square ownership | Square OAuth flow doesn't bind connection to current business | Add ownership check on `square_connections.business_id` writes |
| SEC-4 | PII encryption | `pos_customers.phone`, `pos_customers.email`, `staff_members.phone` stored plaintext | `pgcrypto` encrypt-at-rest + admin audit log + data export/deletion routes |

> **⏱️ LEAD task (v2) — file during T2, runs in background through T3:** Submit **Meta App Review** (`instagram_content_publish`, Business account + FB Page link) and apply for the **TikTok Content Posting API audit**. Both take 2–6 weeks and **block Reels R6**. Filing here means they're approved before R6 reaches the front of the queue. No code — paperwork. Owner: Chahat. YouTube Data API + FB are lighter but confirm scopes while you're in there.

---

## T3 — 2-week soft launch (operational, no new code)

Find ONE real Australian cafe willing to run Aria for 30 days (Chahat's standing TODO). During: daily Sentry check, daily DB health check (use "morning audit"/"night audit" trigger phrases). No new features ship during soft launch. *(Confirm IG/TikTok approvals from T2 are progressing.)*

---

## T4 — Post-launch must-haves (prompts to write)

| # | Sprint | Scope |
|---|---|---|
| SEO-2 | Crawler + audit | Site crawler (sitemap-aware), audit against 12 SEO checks, write to `seo_issues` |
| SEO-3 | AI fix route | For each `seo_issues` row, AI generates a fix with copy buttons (Aria never writes to customer site) |
| SEO-4 | Dashboard | `/dashboard/seo` page surfaces audits + issues + keyword rank + local SEO |
| RI-1 | Recipe Import | Paste IG/web link → AI extracts title/ingredients/steps from caption. Two actions: Add as product OR Compare to existing recipe |
| CMI-1 | Customer Management | Non-POS customer CSV import with AI column-mapping + Aria customer summaries |
| CMI-2 | AI Invoice Builder | AI drafts invoice from plain language. Deterministic GST math + PDF gen. Send via existing email/SMS |
| WBI-1 | Weekly BI Report (data) | Monday 8am AEST cron generates report bundle: revenue charts, peak time graphs, hero products, suspicious tx, register closures, P&L est |
| WBI-2 | Weekly BI Report (AI) | AI executive summary + promo recs + action recs from the data bundle |
| WBI-3 | Weekly BI Report (PDF) | Puppeteer renders beautiful PDF, emails to owner |

---

## T5 — CX Community (P1-P5, prompts WRITTEN ✅, theme-guarded)

Detailed prompts drafted & confirmed present. Aria tokens (NOT prototype purple). Use prototype as LAYOUT reference only.

| # | Sprint | Scope |
|---|---|---|
| CX-1-P1 | Identity + follows + privacy + chat | Dual identity model (owner vs visitor). `community_members` already exists |
| CX-1-P2 | Feed + stories + POS-signal chips | POS chips (busy-now, fresh-batch, scheduled-promo, live order rate) = the moat vs Instagram |
| CX-1-P3 | Profile + post detail + grounded Aria comments | AI replies must cite real POS data |
| CX-1-P4 | Reels via Bunny + FREE live room | FREE Realtime presence+chat+POS pulse, NO video streaming |
| CX-1-P5 | Settings + accounts + create FAB + push | Web push notifications (`community_push_subscriptions` exists) |

---

## T6 — Reels R2-R11 (10 sprints, prompts WRITTEN ✅ · strategy = PARITY NOT DOMINATION)

Goal: owner never reaches for CapCut/Buffer/Sintra/Submagic. Every capability is FREE ($0 ongoing cost). Detailed prompts in `prompts/reels-R2-R11.html`.

> **Strategy refinement (v2):** don't chase CapCut's effect library (ByteDance wins that forever). Win on the two axes it can't cross — **conversational/AI-as-interface editing** and **POS-grounded auto-generation** (only editor that knows what actually sold). That's already what R8–R11 do; lead with them in positioning.

**Parity sprints (close the gap):**
| # | Scope |
|---|---|
| R2 | Editor MVP: timeline + trim + music + text + stickers/filters · **⚠️ music BAKED INTO EXPORT only — never serve a raw-track download (Pixabay/FMA license)** |
| R3 | Editor full: speed + transitions + ratios + waveform + multi-track |
| R4 | AI essentials: captions + beat-sync + bg-removal · **⚠️ in-browser (Whisper/WebGPU) — ship a server/Chrome-only fallback; don't assume Nano present** |
| R5 | AI useful: face-zoom + B-roll + thumbnail + Aria narrator + music + translate · **⚠️ same in-browser fallback rule** |
| R6 | Scheduling: IG + TikTok + YT + FB + time predictor + hashtags · **🚫 BLOCKED until Meta App Review + TikTok audit clear (filed in T2). IG has NO native Reels scheduling — own-timer cron + container poll + OAuth refresh. 25 posts/24h cap.** |
| R7 | Social-ops: calendar + A/B + analytics + auto-reply + recurring + cross-platform + brand voice |

**Moat sprints (Aria-only, POS-driven):**
| # | Scope |
|---|---|
| R8 | POS caption engine: caption-ideas-from-sales + reel-of-the-week + launch-detect |
| R9 | Sales-spike trigger + trend matching to viral audio |
| R10 | POS-CTA + Aria narrator with real numbers + inventory + segments |
| R11 | Aria differentiation: script + Veo + community link + dashboard repurpose + feedback loop |

DROPPED: eye-contact correction (Captions.ai pitch), paid music libs.

---

## T7 — Free AI 7 (zero-cost AI features, prompts to write)

| # | Sprint | Scope |
|---|---|---|
| FA-1.1 | Whisper transcription | In-browser via `@xenova/transformers`. Voice notes for owners |
| FA-1.2 | pgvector semantic search | Enable pgvector extension + embed `aria_business_memory` + semantic recall |
| FA-1.3 | OCR | Tesseract.js in browser. Receipt scanning for `receipt_ocr_scans` (already in Sprint A) |
| FA-2.4 | Background removal | `@imgly/background-removal` in browser. Product photo enhancement |
| FA-2.5 | Content moderation | In-browser NSFW.js for user uploads (community + reels) |
| FA-2.6 | Gemini Nano on-device | Chrome's built-in `window.ai` for quick local suggestions · **⚠️ Chrome 148+ only, needs 16GB RAM / 4GB VRAM — autocomplete-class quality. Always ship a fallback; never gate a feature on Nano presence.** |
| FA-3.7 | Forecasting v1 | Browser Prophet or simple SMA/EMA on revenue. Used by COUNTERFACTUAL (I11) and CAUSAL (I12) |

---

## T7b — Avatar + Animations + Loyalty + Staff Training + Aria Memory + Agentic (specs exist, prompts to write)

| Group | Count | Status |
|---|---|---|
| AVATAR (V/M/L + transparent-canvas polish) | 4 | Prompt V in flight; M, L, polish to write |
| Phase AN (Prompts A/B/C/D/E = 22 micro-animations) | 5 | Names only |
| LV (Loyalty: toggle/accrual/display) | 3 | Names only; `pos_loyalty_config` exists |
| ST (Staff Training: item/authoring/completion/data) | 4 | Names only; `staff_recipe_training` exists |
| AM (Aria Memory: owner patterns/visitor patterns/signal gate) | 3 | Names only |
| AG (Agentic: orchestration / task-outputs / multi-format) | 3 | **Specs written**, `aria_task_outputs` (26 rows) exists |
| WIRE (DB wiring 1/2/3) | 3 | Names only |

---

## T8 — 46-sprint roadmap remaining (Blocks 7-9, names only)

Letter codes from original 46-sprint plan. Each is a category-leader-parity feature in a specific domain. Status per the 14 May audit: 9 built, 16 partial, 6 not-built, plus Blocks 7-9 fully unbuilt.

| Block | Sprints | Domain |
|---|---|---|
| 7 | PP, QQ, RR | Warehouse depth (procurement, returns, supplier perf) |
| 8 | LL, MM, NN, OO | Finance depth (P&L, BAS prep, bank rec, cash flow) |
| 9 | SS, TT, UU, VV, WW, XX, YY | Polish: workforce, deliveries, multi-outlet, gift cards, reporting |

Partial (need finishing): 16 sprints. Not built: X, Y, AF, AK, AL, AM. P, AE, S, W are multi-week builds.

---

## T9 — Long-tail polish (named, prompts to write)

| # | Scope |
|---|---|
| AR | Augmented reality polish / dashboard surfaces |
| TB | Table booking depth |
| WH polish ×3 | Warehouse 18-route polish (NOT full new feature builds — finishing) |
| FIN | Financing opportunities surface (`financing_opportunities` has 48 rows already) |

---

# HOW TO WRITE A NEW SPRINT PROMPT (template for fresh chats)

When the next sprint reaches the front of the queue, the fresh chat should:

1. Read this ROADMAP.md + `prompts/intelligence-12-sprints.html` if relevant
2. Use Supabase MCP to audit the live DB for tables/columns/CHECKs the sprint touches
3. Write the prompt using this exact template:

```markdown
# <SPRINT-ID> — <short title>

CODE ONLY. SOLO. RULE 0 UPGRADE_ONLY.
DEPENDENCY: <prior sprints that must be live>

## Why (from audit)
<1 paragraph: what's broken/missing, why it matters>

## Audit findings
- Table X exists with Y rows
- Column Z has CHECK constraint = [...]
- Cron K runs daily / not at all
- Concrete state evidence from Supabase queries

## Pre-flight (mandatory verbatim quotes in report)
1. pwd confirms C:\Users\kansa\aria-saas-audit
2. Read <file path> — quote <function> verbatim
3. grep -rn "<pattern>" src — paste matches
4. Verify <constraint/RPC/cron> via Supabase tool
5. <any sprint-specific verification>

## Build (additive only)

### Part 1 — <File path or migration>
<exact thing to add, with file path and shape>

### Part 2 — <integration point>
<exact thing to wire>

### Part 3 — Logging
logAICallSafe agent_key='<agent_key>' role='<analysis|data|other>' provider='<anthropic|other>'

### Part 4 — Anchor values for V2 (if numeric)
push every $/% the response will cite into _anchor_values

## Build gate
- npx tsc --noEmit → 0 errors
- npm run build → PASS
- function count ≤22
- daily-max cron
- ONE commit: feat(<sprint-id>): <one line>
- STOP before push. Report includes verbatim pre-flight quotes + sample output + RULE 0 confirmation.

## Verify post-deploy
1. <fresh chat question>
2. SQL: <verification query>
3. PASS criteria: <what should appear>

## DO NOT
- <thing 1>
- <thing 2>
- No prompt rules — only facts (RULE 9)
- No new npm dependencies
- No new tables unless explicitly approved
```

## Constitutional rules (always apply, never list these in the sprint — they're constants)

1. RULE 0 UPGRADE_ONLY — extend, never remove working function/fields/flows
2. Theme: `#7FB897` / `#2D5240` / `#C9A37A` / `#BA7517` / `#E24B4A` + Cormorant + Outfit
3. Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts
4. Worktree `c:\Users\kansa\Downloads\aria-saas-main\repo-worktree` NEVER touched by Claude Code
5. `agent_key` in aria_ai_calls is source of truth, not function names
6. Grep patterns must include negative terms (the absence is as informative as the presence)
7. Validating against poisoned ground truth amplifies lies — verify the source itself first
8. Data layer poison persists across prompt fixes — clean DB sources first
9. Small-sample baselines required (e.g. <10 sales != POS broken)
10. CHECK constraints must be verified in `pg_constraint` before claiming "proven by precedent"
11. `.insert()` returns `{error}` without throwing — use `logAICallSafe` typed helper or `.throwOnError()`
12. **RULE 9** — The model becomes intelligent through richer ground truth, not prompt rules. If you find yourself writing "NEVER say X, ALWAYS say Y", extract the missing FACT and surface it instead.

## Hard constants

- Supabase project: `nxfzippunqvqsvkmwtjv`
- Sip Café business_id: `ff5055a0-c351-4ada-817a-1804961035f3`
- Sentry org: `aria-3r`
- Vercel project: `prj_ttjBzoTEUmYGnhhim8mX23GiJth7` · team: `team_oaGssQvAGB4fZAcZPhncT3bf`
- Repo canonical path: `C:\Users\kansa\aria-saas-audit`
- Model IDs (corrected v2): `claude-haiku-4-5-20251001` / `claude-sonnet-4-6` / `claude-opus-4-8`
  *(prior `claude-sonnet-4-5-20250929` / `claude-opus-4-5-20251101` superseded — verify exact dated strings in Anthropic docs before swapping in code)*
- DB conventions: revenue from `pos_sales.total_amount WHERE status='completed'`, in dollars (numeric, not cents); `pos_customers` canonical (not `customers`); "same week last month" = 28-35 day window; date math via `date-au.ts` `toAESTStart(todayAEST())`, never raw UTC
- vercel.json: ≤22 function configs, crons daily max
- All AI logging via `logAICallSafe` from LOGGING-AUDIT-3
- All numeric output validated by V2 Check 6 against `_anchor_values`

## External approval lead-times (v2 — start early)
- **Meta App Review** (`instagram_content_publish`): Business acct + FB Page; multi-week. Gates R6.
- **TikTok Content Posting API audit**: 2–6 wks, multiple rounds; SELF_ONLY + 5 users/24h until passed. Gates R6.
- **YouTube Data API / FB**: lighter; confirm scopes during the Meta filing.

## Fresh chat opener (copy-paste this)

> *"Continuing Aria OS work. I've pushed `dd87b298` + `4c2d1a7f` (or have not yet — verify with `git log origin/main..HEAD`). Read `prompts/ROADMAP.md` + `prompts/intelligence-12-sprints.html`. Confirm next sprint per locked build order, audit it against live Supabase, then write the detailed prompt using the template in ROADMAP.md. No marathon — one sprint, then I close this chat."*
