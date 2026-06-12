# OPS-AUDIT-1 — Mapping the Real Chat Code Path
**Date:** 2026-06-12 · Read-only audit · References current as of commit `d01b5ae8`

> Headline: the premise "chat goes through ops_narrative" is **half right, with a twist**.
> Chat POSTs to `/api/aria/ask` as believed — but "how much did I make" questions classify as
> `analytical` and take the **COUNCIL branch** (route.ts:649), whose prompts live in
> `lib/aria/council.ts` and contain none of this session's BREVITY/GROUNDING edits, and which logs
> `agent_key='council_*'`, never `ask_aria`. The `ops_narrative` rows at chat timestamps are
> **WarmupPinger** firing `/api/aria/live-intelligence` on every dashboard page mount.

---

## Q1 — Where is ops_narrative's system prompt?

**`src/lib/aria/agents.ts:28-44`** — `buildSystemPrompt(agentKey, ctx)`, shared by ALL judge-pipeline agents; ops_narrative additionally gets its schema line at **`agents.ts:53`** and model `haiku` at **`agents.ts:110`**. Verbatim (the full base template — it is shorter than 40 lines):

```
You are Aria, an AI business advisor for Australian SMBs. Industry: ${ctx.industry}${ctx.industry_subtype ? ` (${ctx.industry_subtype})` : ''}.
${adaptation ? `\nINDUSTRY RULES: ${adaptation}` : ''}

HARD RULES (never violate):
- Never fabricate numbers. Only use values in the context.
- BOGO on alcohol or products >$25 or margin <30% is FORBIDDEN.
- Price below cost is FORBIDDEN.
- Discount >50% of gross margin is FORBIDDEN.
- If unsure, return type:"none".

PAST DISMISSALS: ${ctx.past_dismissals…}

Return ONLY valid JSON. No prose. No code fences.
```
Plus ops_narrative's schema (`agents.ts:53`):
```
Schema: { "type": "narrative", "title": "max 8 words", "description": "3 sentences: performance vs baseline, notable pattern, recommended action", "rationale": "data-driven", "confidence": "high", "estimated_impact_dollars": number, "payload": {} }
```
Note: this prompt returns **strict JSON** (a recommendation object), not chat prose — it cannot be the author of the founder's 5-sentence advisory chat replies.

## Q2 — Every caller of ops_narrative

Chain: `ariaInvoke(agent, businessId, opts)` (`lib/aria/invoke.ts:40`) → `routeAndJudge` (`lib/aria/router.ts`) → `runAgent` (`lib/aria/agents.ts:122-130`, `callAnthropic` with `agentKey`) → aria_ai_calls insert (`providers/anthropic.ts:101`).

| Caller (file:line) | Surface | User message? |
|---|---|---|
| `app/api/aria/live-intelligence/route.ts:43` `ariaInvoke('ops_narrative', bid, { includeWeather: true })` | GET — pinged by **WarmupPinger on EVERY dashboard page mount** (`components/dashboard/WarmupPinger.tsx:8-11` lists it in WARM_ROUTES; WarmupPinger is mounted in `app/dashboard/layout.tsx`) AND by MorningCommandCentre (`MorningCommandCentre.tsx:223`) | **No** — context-only |
| `app/api/aria/business-brain/route.ts:180` `ariaInvoke('ops_narrative', …)` fire-and-forget when `mode ∈ {daily, health, sales}` (line 179) | MorningCommandCentre `postBrain()` (`MorningCommandCentre.tsx:160-168`) — dashboard home widget | **No** — `{business_id, mode, context, force_refresh}`; no message field |
| `app/api/aria/daily-narrative/route.ts:102-103` | DailySummaryCard (`components/dashboard/DailySummaryCard.tsx:30`) | No |
| `app/api/aria/profit-analysis/route.ts:58` | RetailDashboard (`RetailDashboard.tsx:169`) + profit-leaks page (`profit-leaks/page.tsx:69-119`) | No |

**Is the daily briefing cron one of them? NO.** `grep ops_narrative src/app/api/cron*` → zero matches. The briefing crons (daily-briefing-submit/poll, generate-briefings) use the Batch API / parallel-orchestrator, not ariaInvoke. (`MorningCommandCentre.tsx:245` comment confirms callers throttle "to prevent concurrent ops_narrative calls".)

**Why ops_narrative rows coincide with chat questions:** opening or hard-refreshing ANY dashboard page (including /dashboard/ask-aria) fires WarmupPinger → live-intelligence → one `ops_narrative` row ~when the user starts typing. The rows correlate with sessions, not with the chat POST.

## Q3 — What endpoint serves /dashboard/ask-aria's chat?

`src/app/dashboard/ask-aria/page.tsx` fetch map (grep `fetch(`):
- **Chat send: `POST /api/aria/ask`** — lines **669, 671** (main send incl. multipart), **836** (regenerate), **894** (action confirm)
- History `GET /api/aria/ask/history` :579, :602 · upload :803 · action :878 · delete :1088
- `GET /api/aria/vitals` :541 · deliverables :589 · deliverable-pdf :372 / -email :388 · intelligence/schedules :403 · artifact-parse-failure :245

So chat DOES hit the much-edited `src/app/api/aria/ask/route.ts`. **BUT** inside `_POST` there are multiple LLM branches, and the relevant one for "how much did I make" questions is:

**`route.ts:649`**: `if (isStrategicQuestion || ariaIntent.intent_type === 'analytical') {` → `route.ts:661`: `const council = await runAriaCouncil(augCtx + '\n\nOWNER_QUESTION: ' + message, bid, 'ask_aria', message)` → returns `council.final_briefing` at :662-665 and **never reaches the main tool-loop**. The aria-intent classifier (`lib/aria/ask/aria-intent.ts`) maps business-performance questions to `analytical` — so brevity-style revenue questions are served by **`lib/aria/council.ts`** (4 Haiku brains + synthesis, prompts at council.ts:285-420), which:
- contains **no BREVITY / GROUNDING / 2-paragraph rules** (separate prompt corpus), and
- logs `agent_key='council_growth'/'council_risk'/'council_strategy'/'council_synthesis'` — not `ask_aria`.

ops_narrative is **never called from ask/route.ts** (grep: zero matches).

## Q4 — pushback / council_read / priority_actions provenance

| Block in screenshot | Data origin | Rendered by |
|---|---|---|
| "Aria is pushing back" (`pushback`) | INLINE LLM output — council synthesis json_blocks; block schema + contradiction feed at `council.ts:795-798` (PAST DECISION CONFLICTS → "generate pushback blocks") | `components/dashboard/BlockRenderer.tsx` (`'pushback'` present, count=1) |
| Council read (growth/risk/context) (`brain_readouts` / `council_split`) | INLINE — council synthesis examples `council.ts:315-420`; brains at `council.ts:772-776` | same renderer (both types present) |
| Priority actions / Recommended actions | **SEPARATE** — business-brain recommendations (`BrainRecommendation`) from `lib/aria/business-brain.ts` via `runAriaModel` (`business-brain.ts:270`), persisted through `ariaInvoke` judge pipeline / `POST /api/aria/actions` (`MorningCommandCentre.tsx:175`) and read back from `aria_actions` | MorningCommandCentre's own JSX (dashboard home), not BlockRenderer |

**Implication:** prompt-only BREVITY is NOT sufficient for chat — the council branch must either be gated (brevity questions skip council) or council.ts's synthesis prompt must gain its own brevity rules. MCC's priority-actions panel is a dashboard widget, not chat output — unaffected by chat brevity.

## Q5 — BREVITY side effects per ops_narrative caller

All four ops_narrative callers (Q2) pass **context-only** input — `runAgent` builds the user prompt from ctx JSON + optional `taskHint` (`agents.ts:96-104`); there is **no user message** in which a brevity signal could appear. Confirmed: briefing crons don't call ops_narrative at all. Adding BREVITY to `agents.ts buildSystemPrompt` would be inert (and pointless — output is schema-locked JSON). **No gating needed for ops_narrative.**

User-message surfaces that DO need attention (flagged for caller-source gating):
1. **Council branch** in ask/route.ts:649-661 — the actual brevity-failure path (user message IS passed, prompts lack BREVITY).
2. **`POST /api/aria/command`** (AriaCommandBar — mounted on EVERY dashboard page via DashboardShell:153, including ask-aria): raw `anthropic.messages.create` at `command/route.ts:251` with prompt from `lib/aria/get-system-prompt.ts` — zero BREVITY/GROUNDING/json_blocks rules (grep: no matches).
3. **business-brain `mode:'chat'`** (`business-brain/route.ts:31`, `chatWithBusinessBrain` at `lib/aria/business-brain.ts:338`) — no UI caller found in components (grep), likely API-only; low priority.

## Q6 — Block renderer compatibility

Chat (ask-aria) renders via **`components/dashboard/BlockRenderer.tsx`**. Type-support matrix (grep `'<type>'` count, dash vs `components/aria/BlockRenderer.tsx`):

| Type | dashboard | aria (pos/ask) |
|---|---|---|
| animated_kpi, bold_metric, bento_grid, progress_bars, activity_stream, alert_card, kinetic_text, aurora_summary, pushback, council_split, brain_readouts | ✓ 1 each | ✓ 1 each |
| **ai_reasoning** | **✗ 0** | ✓ 1 |
| **clay_chart** | **✗ 0** | ✓ 1 |

**The chat renderer is missing 2 of the 10 RICH-1 types.** Consequence: GROUND-1's Check-2 reasoning heal prepends an `ai_reasoning` block that the chat surface cannot render (no `default:` case found by grep — unknown types appear to render nothing; exact fallback behaviour needs a code-read to confirm, not verified here). Inverse of the AUDIT-1 assumption that only the POS renderer lagged.

## Q7 — Where does "19% reconciliation / POS capturing 19% of transactions" come from?

- `wh_payments_coverage` RPC exists as a DB function (`types/database.types.ts:25912`) and is called ONLY by the health cron: `app/api/cron/aria-health-monitor/route.ts:214`, writing check rows `payments_coverage_pct` (:222, :438, :455) into **`aria_wiring_health_checks`** (:361).
- **No prompt consumer found**: grep for `wiring_health|payments_coverage|reconciliation` across `src/lib/aria` → zero context-builder hits (only product-map blurbs for the Cash Up page).
- **Cannot verify the 19% source by file:line — saying so explicitly.** Leading hypotheses (unverified): (a) the model derived a coverage ratio itself from raw context numbers (fabrication-risk class GROUND-1 targets — but the council branch lacks the GROUNDING rules), or (b) it surfaced via a tool/RPC path not matched by these greps. Needs a DB check of the actual conversation row + council synthesis input to settle.

## Q8 — Logging gap

`requestSummary` wiring **IS present and correct at HEAD**: `providers/anthropic.ts:138` (param) + `:251` (insert), passed at both `agentKey:'ask_aria'` sites `ask/route.ts:492` (general path) and `:1565` (main tool-loop).

The zero-ask_aria-rows mystery is **routing, not broken logging**:
1. Analytical/strategic questions exit via the **council branch (route.ts:649-679)** before the main tool-loop — logging `council_*` rows (via `callBrain`, council.ts:772-776), never `ask_aria`. The founder's test questions are exactly this class.
2. **AriaCommandBar** traffic (`/api/aria/command`) is logged by `trackAICall` (`lib/aria/ai-telemetry.ts:12-33`) which writes **console JSON + Sentry only — it never inserts into aria_ai_calls** (grep `from('` in ai-telemetry.ts: zero). Invisible in the table.
3. ops_narrative rows at matching timestamps = WarmupPinger page-mount pings (Q2).

So PROMPT-TIGHTEN-1's request_summary fix is fine but only fires on the paths that reach `callAnthropicWithTools` — which the tested questions never did.

---

## RECOMMENDED FIX SCOPE (minimum diff for brevity-in-chat without breaking briefings)

1. **Gate the council branch on brevity (ask/route.ts, ~3 lines):** reuse the existing `SPREADSHEET_RE`-style approach — `const BREVITY_RE = /^(just |quickly|tldr|tl;dr)|just tell me|in one number|single number/i`; at route.ts:649 add `&& !BREVITY_RE.test(message)` so brevity questions fall through to the main tool-loop, where BREVITY + GROUNDING + HEAL already live and `ask_aria` logging (with request_summary) fires. This alone fixes the founder's failing case end-to-end.
2. **Council prompt hardening (council.ts, prompt-only):** add a short brevity+grounding clause to the synthesis prompt for analytical questions that legitimately stay in council ("how am I doing this week?" deserves council; "just tell me X" doesn't) — covers signal phrases the regex misses.
3. **Council logging parity (council.ts callBrain / providers callAnthropic):** pass `request_summary: message.slice(0,100)` on council_* rows so future SQL verification can see council-served questions (the `callAnthropic` non-tool path at providers/anthropic.ts:~51-101 currently has no requestSummary param — small additive param mirroring the tool-loop one).
4. **Do NOT touch** `agents.ts` buildSystemPrompt / ops_narrative (schema-locked JSON, no user message — briefings and MCC widgets unaffected by construction).
5. **Renderer gap (1 file):** add `ai_reasoning` + `clay_chart` cases to `components/dashboard/BlockRenderer.tsx` (or fold into the BLOCK-1 merge sprint) so council/heal output renders on chat.
6. **Separate small sprint:** `/api/aria/command` (AriaCommandBar) needs its own brevity/grounding pass in `get-system-prompt.ts` + real aria_ai_calls logging — different prompt corpus, different bug surface; keep out of this diff.
7. **Q7 follow-up:** verify the "19%" conversation row against council synthesis input before fixing; if model-derived, fix #2's grounding clause covers it.

---
*Read-only. No source files modified. Every claim above is file:line-cited or explicitly marked unverified.*
