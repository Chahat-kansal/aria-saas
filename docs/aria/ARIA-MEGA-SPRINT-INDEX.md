# ARIA — THE MEGA SPRINT INDEX
**The run order and dependency map for the whole product.** 2 Sep 2026 · v2.

---

## ⚠️ WHAT THIS FILE IS, AND WHAT IT IS NOT

**This is a MAP. It is NOT a specification.**

Every line below is a scope of about ten words. **The sprint prompt is the specification** — it is written when the sprint is reached, against a live preflight, and it is the only thing to build from.

**Never build from a line in this file.** "M99 replenishment agent" is a location in a queue, not a brief. Treating it as one produces exactly the shallow work the sprint discipline exists to prevent.

**What it IS for:**
- knowing where a sprint sits — what came before it, what depends on it
- checking whether a thing you are about to build is already owned by a later sprint (this codebase's most expensive recurring bug is building a second copy of something)
- seeing which of the gating decisions blocks the work in front of you

**Some of these lines are already built.** Five features turned out to be already shipped during earlier preflights, and four register entries were delisted for the same reason. **Every sprint opens with a preflight that checks — the index is not evidence.**

**Precedence:** this index supersedes `ARIA-MASTER-ORDER.md` and `ARIA-NCR-BUILD-ORDER.md` as the working run order. Both remain valid as source detail underneath it. Where they disagree on ORDER, this file wins; where they carry more DETAIL on a sprint, they win.

---

One line = one mega sprint = one autonomous Claude Code session (5–8 phases, one commit each, gate at the end). **No sub-sprints.** Run top to bottom.

**Built from:** memory-filed records of every planning conversation, the two uploaded reference docs, and the Ask Aria register. Not from re-reading every chat line by line — the filed records are the distilled version and are the more reliable source.

Sources folded in: ARIA-MASTER-ORDER (13 phases, 8 Aug) · ARIA-NCR-BUILD-ORDER (41 sprints, 1 Sep) · ARIA-TOOLCHAIN-VERIFIED (1 Sep) · ASK-ARIA-MASTER-REGISTER (127 features) · ASK-ARIA-OPEN-BUGS · the 28 batches · Team Space TS-1→3 · the money layer · the NEVER-STARTED-SWEEP · every run log S1–S10 and MS6–MS17.

### ⚠️ TWO CONSTRAINTS I HAVE BEEN REPEATING THAT ARE WRONG OR STALE
1. **"~22 Vercel functions"** — the TEAM audit found this limit **stale and superseded**. Verify the real current limit before any sprint designs around it. It has been used to reject designs that may be fine.
2. **The cron budget is FULL at 23/23.** Any sprint adding a cron must first free one or consolidate. This blocks M42 (alerting), M99 (replenishment), M104 (competitor prices) and several others as written.

**Standing rules that apply to every sprint below** — do not restate them per sprint, they are in CLAUDE.md: RULE 0 extend-never-remove · nothing is ever cut, deferred means later · Claude Code writes NO DDL (propose, founder applies via MCP, then commit byte-identical) · preflight before every sprint, report what already exists · one commit per phase · tsc 0 + build 0 + BUILD_EXIT read from the log · every rail carries an anti-vacuity assertion · mutation checks must be proven able to fail · money/sending/authorisation/personal-data = PARK · observed output beats static analysis.

**Status key:** ✅ done · ▶ next · ⏸ blocked on a founder action · ○ not started

---

## STATUS AT THE HEAD OF THE QUEUE

**Done:** M1–M10 (the Ask Aria repair series, S1–S10).
**Blocked on you:** the feedback table DDL · approve/reject design call · the verifier's placement · the four lockout-critical rate-limit routes · `ALERT_WEBHOOK` · Stripe products/prices/webhook for billing · Sip logo · wallet certs · WhatsApp provider.

---

# PHASE A · ASK ARIA — THE HERO SURFACE
*127 features. M1–M10 shipped. Ask Aria is the face of the product, so it finishes before Canopy assembly.*

| # | Sprint | Scope | Status |
|---|---|---|---|
| M1 | ASK-CHAT-SURFACE | stop · regenerate · edit-and-rerun · copy · feedback · auto-titles · error+retry · follow-ups | ✅ |
| M2 | ASK-PERSISTENCE | conversations+messages schema, RLS, FTS index | ✅ |
| M3 | ASK-THREADS | thread list · rename · pin · soft delete · search · drafts · rendering | ✅ |
| M4 | ASK-SEND-FIX | why send didn't send · the streaming watchdog · suggestions truncation | ✅ |
| M5 | ASK-SWAP | /ax becomes /dashboard/ask-aria · classic retained | ✅ |
| M6 | ASK-EMPTY-CLASS | empty council scaffold · anchor labels · unsupported claims | ✅ |
| M7 | ASK-RENDERERS | one empty predicate across all 17 block types · 22 contrast failures | ✅ |
| M8 | ASK-COUNCIL-TRUTH | advisor token ceilings · lost-advisor disclosure · notice deep links | ✅ |
| M9 | ASK-REGISTER-CLEAR | CI lockfile · cron false failures · classic migration · duplicate parser | ✅ |
| M10 | ASK-LIMITER | smoke env plumbing · fail-closed login analysis · FATAL sweep | ✅ |
| M11 | ASK-WORKS-1 | **Aria Works part 1** — delegate by outcome · visible plan · approve · execute · report · history | ✅ done |
| M12 | ASK-WORKS-2 | cloud execution · live progress · self-verification · scheduled recurring work · cost transparency | ✅ done |

### ⚠️ DATED — RUN IMMEDIATELY AFTER M13, BEFORE ANY OTHER FEATURE
| # | Sprint | Scope | Deadline | Status |
|---|---|---|---|---|
| M14 | **SURCHARGE-BAN-1** | model the margin hit per menu item net of the new interchange caps (8c/0.16% debit, 0.3% credit, 1.0% foreign from Apr 2027) · propose new prices, owner approves · push to menu boards/ESL · receipts + checkout copy compliant · least-cost routing awareness | **1 Oct 2026** | ✅ done — was: after M13 |
| M15 | **PAYDAY-SUPER-1** | ⚠️ **already in force since 1 Jul 2026** — super due within 7 business days of wages; the ~13-week float is gone. Model the daily liability from rostered hours; surface the cash-flow shift; pre-fund view | **passed** | ○ |
| M16 | **ADM-DISCLOSURE-1** | APP 1.7–1.9 automated-decision transparency statement; meaningful human review designed in — the propose-then-approve loop IS the artefact; penalties to $50m | **10 Dec 2026** | ○ |


### THE BRAIN — after the dated block, before any Aria Works or feature sprint
*From ARIA-LOGIC-READ.md: `_POST` is a 2,460-line waterfall with 28 exits; the verifier sits after the exit that carries every request it was written for. Turn the exits into stages.*
| # | Sprint | Scope | Status |
|---|---|---|---|
| M17 | **BRAIN-1** | the six-stage `runTurn()` spine — understand → ground → decide → act → verify → render — with every existing lane wrapped as a strategy that returns a result object; one exit; guard: no `return NextResponse` inside `lib/aria/ask/`. **Behaviour identical, structure changed** | ✅ done — was: after M16 |
| M18 | **BRAIN-2** | grounding first and always (lean envelope, cached prefix, constitution unconditional); the verifier on every result, scoped to numbers and claims; delete the five-boolean guard. **The day the verifier starts running** | ✅ done |
| M19 | **BRAIN-3** | one classifier with confidence replaces two OR'd classifiers + ~15 regexes; regexes become features; lane logged per turn; compared against 290 real conversations before switching; guard: no `new RegExp` on the raw message outside stage 1 | ○ |
| M20 | **EXECUTOR-FIX** | the mass-write threshold (20) checked on resolved count **before** the limit; an unfiltered target query is a schema error (Zod at the boundary), not a first-ten default; every action names its targets or refuses | ○ |


### THE INSTALLED-BUT-UNUSED — the four swaps, as sprints
*From the dependency read: the right tools are already in `package.json`.*
| # | Sprint | Scope | Status |
|---|---|---|---|
| M21 | **ZOD-BOUNDARY** | Zod on every route input — 16 of 1,209 today. A schema at the boundary is what makes the first-ten-products class impossible. Guard: a route without a parsed schema fails lint. Batches by directory | ○ |
| M22 | **POS-STORE** | the 4,780-line terminal onto Zustand (installed, unused): 148 `useState` → one store with slices; 59 `fetch(` → typed actions. **Extract, don't rewrite** — same canon-rail method, hooks moved one at a time with a replay test | ○ |
| M23 | **REACT-QUERY** | `@tanstack/react-query` for the 2,019 raw `fetch(` calls in UI — cache, dedup, stale handling. The twice-observed stale-read class is partly this. Guard: no raw `fetch(` in components | ○ |
| M24 | **INNGEST-SPINE** | Inngest (installed, 3 files) as the durable-execution layer: Aria Works cloud execution, and the h01–h23 dispatcher's 74 fire-and-forget tasks become retryable steps with a real run record. **Replaces the "cron budget full" constraint entirely** | ○ |
| M25 | **NEXT-15** | Next 14 → 15/16, React 18 → 19. Not urgent; every month makes it harder. After the walls, on a branch, with the full tour suite green before merge | ○ |

### THE NEW FIFTEEN — from the definitive research pass (6 Sep 2026), folded where they belong
| # | Sprint | Scope | Phase |
|---|---|---|---|
| M26 | PROMPT-CACHE-1 | cache the venue system prompt + menu + policies as a stable prefix; cache reads at 0.1× input; per-venue warming before peak (**pure margin, ships in days**) | A (was BE-2) |
| M27 | COMMAND-PALETTE | Cmd-K Ask-Aria everywhere; keyboard-first (Raycast/Linear grammar) | J |
| M28 | STATUS-STRIP | always-on shift status: sales vs forecast, labour %, next delivery, any fridge breach | J |
| M29 | MODEL-ROUTER | route by strength/cost/latency/**sensitivity** — PII on-device, bulk to Flash, money-adjacent to frontier | O |
| M30 | BREAKAGE-PRELOAD | breakage-aware preload wallet — surface expiring balances to owners as a redemption campaign; **per-venue, never pooled** | F |
| M31 | VOICE-COUNTER | hands-busy speech-to-speech counter mode (Gemini Live class, ~$0.05/min) bound to the action gateway; **nothing customer-facing answers regulated facts from the model** | J |
| M32 | FRIDGE-SENSORS | LoRaWAN temperature sensors (Thermalog / Telemetry2U LHT65N ~$85 + LPS8v2 gateway ~$295) → auto 3.2.2A evidence + breach escalation | D-hardware |
| M33 | FOOD-SAFETY-322A | the 3.2.2A evidence tool — three tools for Category 1, FSS + trained handlers for Category 2; PEAL allergen data, never model-answered | M-moat |
| M34 | CLOSE-THE-DAY | the reconciler — POS cash + card settlement + supplier invoices + roster hours + fridge logs into one signed daily record; folds M153 EOD-1 + M66e | J |
| M35 | VENUE-MEMORY | episodic/procedural/graph memory per venue on Postgres+pgvector with write/decay/update policy; every entry carries source + timestamp | H |
| M36 | GENERATIVE-UI | A2UI/AG-UI-style surface so Aria renders forms/receipts/mini-apps inside any Canopy app; streaming tool-call visibility; persistent approval context | J |
| M37 | ON-DEVICE-TIER | Apple Foundation Models / Gemini Nano / WebGPU — receipt OCR triage and PII redaction on-device before cloud | O |
| M38 | CASHFLOW-PACK | provenance-tagged revenue/margin/seasonality pack routed to a **licensed AU lender** — Aria never lends, never touches money | M-moat |
| M39 | ESL-1 | electronic shelf label integration for liquor/retail; owner→shelf only (s45) | N |
| M40 | PROVENANCE-LEDGER | tap any figure → the exact source rows + tier — provenance as a product, not a badge | A |

*Previously M14–M277 shift by 18. The renumbered full list follows. Every source ID (BE-2, EOD-1, etc.) is preserved in the scope column so nothing is lost.*

| M40-2 | ASK-WORKS-3 | parallel sub-agents · interrupt/steer/pause/resume · overnight agent · multi-step checkpoints | ○ |
| M41 | ASK-INPUT | file attach · paste image · drag-drop · photo→data (vision OCR) | ○ |
| M42 | ASK-DELIVERABLES | the artifact pipeline · PDF · Excel/CSV · QR · zip · download · email · signed URLs · provenance | ○ |
| M43 | ASK-MEMORY | memory across conversations · view/edit memory · house rules · RAG over own docs · injection defence | ○ |
| M44 | ASK-ARTIFACTS | artifacts/canvas split pane · versioning · charts from verified data · HTML→PDF · posters | ○ |
| M45 | ASK-AGENT-BUILDER-1 | plain-English agent creation · template gallery · triggers · tools · knowledge | ○ |
| M46 | ASK-AGENT-BUILDER-2 | per-tool permissions + spend caps · dry-run · run history · autonomy · kill switch · versioning | ○ |
| M47 | ASK-POLISH | keyboard shortcuts · accessibility (streaming live regions) · mobile layout · share/export · voice · slash · @-mentions | ○ |
| M48 | ASK-MCP-CLIENT-1 | connector directory · per-tenant token vault · hosted-connector wiring · external-unverified tier | ○ |
| M49 | ASK-MCP-CLIENT-2 | schema pinning · result sanitisation · per-tool caps · tool routing · graceful degradation | ○ |
| M50 | ASK-MCP-SERVER-1 | remote MCP server · OAuth resource server · token→business→RLS · read-only tool set | ○ |
| M51 | ASK-MCP-SERVER-2 | writes as proposals only · metering · rate limits · developer mode | ○ |
| M52 | ASK-VERIFIER-PLACEMENT | where accuracy verification belongs now the council returns first (**design call first**) | ⏸ |
| M53 | ASK-CHATTER | **chatter on every record** (Odoo) — audit + AI explanation + outcome in one strip, with the brain as a participant. This is where a hypothesis finally gets accepted | ○ |
| M54 | ASK-KANBAN-APPROVAL | the approval queue as a board with dollar totals in column headers (Odoo steal #2) | ○ |
| M55 | ASK-ANYWHERE | Ask Aria Anywhere — select anything in Aria and ask; structured context envelope, never a screenshot (Gemini F2) | ○ |
| M56 | ASK-HABIT-TILES | saved view → dashboard tile, auto-pinned from repeated Ask Aria questions (Odoo steal #5) | ○ |

---

# PHASE B · TRUE NUMBERS — RELIABILITY RAIL
*Not negotiable ahead of the rest. An electronic journal on non-idempotent writes records the wrong thing faithfully.*

| # | Sprint | Scope | Status |
|---|---|---|---|
| M53-2 | TZ-RAIL-1 | one timezone resolver · businessToday() · trading-day boundary · groundTruth date/day/tz/location | ○ |
| M54-2 | TZ-RAIL-2 | audit the 123 bare `date` columns across 85 tables; classify trading vs calendar vs wrong | ○ |
| M55-2 | LOC-1 | capture suburb/state/postcode/lat-lng at onboarding (state NULL 4/5, suburb NULL 5/5) | ○ |
| M56a | POS-LINE-NO | the open decision from POS-INTEGRITY-1 — `line_no` + a partial unique index on `(sale_id, line_no)` to close the concurrent-retry race properly | ○ |
| M56-2 | POS-IDEM-1 | client-minted idempotency key on every sale · unique constraint · same key to Stripe | ○ |
| M57 | POS-ATOMIC-1 | single Postgres function for the atomic sale write | ○ |
| M58 | EJ-1 | electronic journal: append-only, INSERT-only via grants/RLS, hash-chained, daily export | ○ |
| M59 | EJ-2 | on-device journal mirror | ○ |
| M60 | OFFLINE-SPINE-0 | **decision + spike**: PowerSync vs RxDB vs Dexie (see toolchain doc — PowerSync 719★ vs RxDB 23,371★) | ⏸ |
| M61 | POS-OFFLINE-1a | fix the sync-swallow before any offline trading | ○ |
| M62 | POS-OFFLINE-1 | full local-first offline trading | ○ |
| M63 | CHAOS-1 | CI test: N sales offline, restore network, assert exactly-once | ○ |
| M64 | SLO-1 | sale-write success SLO · error budget · public status page | ○ |
| M65 | POS-DRIFT-1 | tombstone the seven 0-row twin tables | ○ |
| M66 | POS-HARDWARE-1 | receipt/kitchen printing (ReceiptPrinterEncoder), cash drawer, scanner | ○ |
| M67 | CI-FIXTURE-1 | seed.ts + resolveTestBusinessId + TEST_BUSINESS_ID + register + orphaned session, together | ○ |
| M68 | READ-CONSISTENCY-1 | the twice-observed stale-read class (booking_availability, booking_table_mode) — Supabase-side | ○ |
| M69 | ALERT-1 | nothing listens to FATAL; cron_runs has no watcher; wire MONITOR-1's sendAlert to red checks | ⏸ |
| M70 | RELY-TOURS | six business-flow Playwright tours asserting database rows, not screens (Odoo's tour tests) | ○ |
| M71 | RELY-INERTNESS | nightly inertness ledger — writers at zero rows since deploy flagged **cold**, not broken | ○ |
| M72 | RELY-STAGING | neutralise staging environments by construction | ○ |
| M73 | RELY-SIBLING | promote sibling-sweep from a rule to a guard check (the fix-landed-on-the-wrong-file class, seen 3× in one day) | ○ |
| M74 | CANON-MIGRATE-3 | 154 Bucket-A handlers still inline their own resolver | ○ |
| M75 | CANON-BUCKET-B | **the design sprint** — 344 behaviour-divergent handlers, decided once per recurring shape | ○ |
| M76 | CANON-REVENUE | extend the rail to the revenue primitive (120 `neq('voided')` across 77 files) | ○ |
| M77 | CANON-HEALTH | extend the rail to business-health (3 non-agreeing computations, one an LLM output with no formula) | ○ |
| M78 | SCHEMA-STAMP | offline session schema-version stamping — the stale-writer risk (Odoo steal #4) | ○ |

---

# PHASE C · SECURITY
| # | Sprint | Scope | Status |
|---|---|---|---|
| M79 | SEC-X4-1 | the Security×4 batch, phase 1 residue | ○ |
| M80 | SEC-TOKENS | Google/Kounta/Lightspeed tokens still plaintext · businesses.xero_access_token (10 sites, 2 crons) | ○ |
| M81 | SEC-RLS-DOOR | every route uses supabaseAdmin and bypasses RLS — prove isolation at the door, not the wall | ○ |
| M82 | SEC-LIMITER | the x-user-id trust bug · instore-chat shared bucket · fail-open/closed per route | ⏸ |
| M83 | AUTHZ-EJ | journal read access role-gated; nobody can UPDATE or DELETE, service role included | ○ |
| M84 | SEC-PERMISSION-ORDER | document the resolution order across RLS/capability/UI; deny wins ties (the Discord law) | ○ |
| M85 | ACTION-GATEWAY-1 | **the bypass-proof gateway** — every agent write resolves target server-side, writes the intent row, then acts. No path acts without the record existing first | ○ |
| M86 | HOUSE-RULES-1 | **owner-authored boundaries in plain English** — "never draft a PO over $500 without asking me", "Maya can't approve her own variance". Aria compiles to policy; deny before allow; missing policy permits nothing | ○ |
| M87 | HOUSE-RULES-2 | take-the-wheel **inverted** — Aria watches the owner resolve an exception once, then proposes a House Rule from it | ○ |
| M88 | SECRETS-DISCIPLINE | audit trail records that a secret was requested and its length, never its value | ○ |
| M89 | REVERSIBILITY-MATRIX | **design sprint** — classify every action type by true reversibility before the undo tier can exist | ○ |
| M90 | UNDO-WINDOW-1 | the medium tier: reversible actions execute with a real undo window. Pending-reversal store + timer + per-action reversal implementations | ○ |
| M91 | PERMISSION-MATRIX | **design sprint** — owner/manager/cashier × every capability | ○ |

---

# PHASE D · BILLING + PLAN ENFORCEMENT
| # | Sprint | Scope | Status |
|---|---|---|---|
| M76-2 | SS-2 | Stripe subs + webhooks, PRELOAD-grade (**needs founder Stripe setup**) | ⏸ |
| M77-2 | SS-3 | requireEntitlement enforcement, real gated UI, client lock badges | ○ |
| M78-2 | SS-4 | per-business token metering, CSV-proven | ○ |
| M79-2 | SS-5 / TT | billing portal | ○ |
| M80-2 | BRAND-TIER | "Powered by Aria" on lower tiers, removable on top — wired to entitlements | ○ |

---

# PHASE E · ONBOARDING, BRANDING, SOFT LAUNCH
| # | Sprint | Scope | Status |
|---|---|---|---|
| M81-2 | PP-ONBOARD-1 | self-serve onboarding | ○ |
| M82-2 | PP-LOGO | logo capture · shape detection drives bleed vs inset | ○ |
| M83-2 | BRAND-KIT-1 | one logo → palette + contrast-safe text · themes POS, receipt, loyalty, wallet, booking, community, PDFs | ○ |
| M84-2 | BRAND-KIT-2 | monogram fallback generator | ○ |
| M85-2 | POS-BRAND-1 | white-label POS chrome per the Coles/Woolworths grammar · Total vs **Due** · no Aria mark customer-side | ○ |
| M86-2 | POS-BRAND-2 | customer-facing display as a second surface | ○ |
| M87-2 | LOY-NAME-FIX | loyalty_program_name defaults to `{business} Rewards` (Sip reads "Aria Rewards" — live leak) | ○ |
| M88-2 | BEZEL-KIT | printed frame/sticker for the iPad stand — the only place Aria's name appears in the shop | ○ |
| M89-2 | QQ-MIGRATION | migration tooling for incoming businesses | ○ |
| M90-2 | RR-HELP | in-product help | ○ |
| M91-2 | UU-SUPPORT | support surface | ○ |
| M92 | VV-AUDIT-PRIVACY | audit + privacy batch (AU Privacy Act, APP 8 cross-border) | ○ |

---

# PHASE F · THE MONEY LAYER
*Closed-loop, Aria-POS-only. Preload stays per-venue — pooling is licence territory.*

| # | Sprint | Scope | Status |
|---|---|---|---|
| M93a | **PAY-LOCK-NOW** | ⚠️ **the two lock-now design choices — do these before any other money work.** Customer identity at platform level (CX-D1 dual identity, already built) + card saved at platform with **per-charge cloning** to each venue's connected account. Costs almost nothing now; preserves the entire closed-loop upside. Retrofitting later is expensive | ○ |
| M93b | PAY-PRELOAD-LINE | the hard line enforced in code: **per-venue balances, never pooled.** Displayed as one wallet, legally many. Pooling = multi-merchant stored-value facility = licence | ○ |
| M93 | MONEY-TRUTH-1 | cash-days counter · real profit today after wages/GST · leak alerts · 30-day forecast · repricing helper | ○ |
| M93c | **MONEY-0-TAPTOPAY** | ⚠️ **Tap to Pay, NOT QR.** Cards are ~75% of AU transactions; nobody here scans to pay. Stripe Terminal, eftpos supported, Connect-compatible. The owner's phone becomes the terminal — this is Aria's All-in-One-QR moment. **Correct any QR-first framing elsewhere in this index against this line** | ○ |
| M93d | MONEY-0-CONNECT | Stripe Connect onboarding — the acceptance layer that makes MONEY-1's numbers real rather than inferred | ○ |
| M93e | RECONCILE-3WAY | **money truth** — takings vs card settlement vs bank, T+1/T+2, with the gap **named**. The AU version of instant confirmation, one level up | ○ |
| M93f | PAYID-SURFACE | display the merchant's own PayID and reconcile the incoming transfer via bank feed — **Aria never sits in the flow** | ○ |
| M93g | PAYTO-RAIL | PayTo for account customers, supplier payments, preload top-ups **and Aria's own subscription billing** — every one a card fee stopped. BECS retires by 2030 | ○ |
| M93h | TRADING-RECORD | **a verified trading record** the owner hands a supplier or landlord to win terms. Paytm's data flywheel without the credit exposure | ○ |
| M94 | MONEY-BANK-1 | **the owner "bank app"** (mockup: `aria-money-app.html`) — Money in / Money out / **Spendable today** / every transaction, filtered by source (Aria Pay · Tap to Pay · Online · Links · PayTo · Transfers · Direct debits) **and** outlet | ○ |
| M94b | MONEY-ACCOUNTS | multiple payout accounts surfaced (NAB Everyday / NAB Saver shape) with per-account routing | ○ |
| M94c | MONEY-NARRATE | "Aria says" on the money surface — narrated insight over the transaction feed, tier-carried | ○ |
| M95 | ANNOUNCE-1 | ⚠️ **the INTEGRITY speaker, not a payment chime.** Paytm chimes on every payment; Aria is **silent on normal sales and loud on exceptions** — void, discount over threshold, refund, no-sale drawer open. Silence means clean. An audible integrity alarm is a product nobody sells. en-AU, music ducking, reuses `aria-voice-guide.ts` + `pos-sfx.ts` | ○ |
| M95b | ANNOUNCE-CLOSE | **the spoken close** — a 30-second end-of-day voice brief on the counter speaker as the owner locks up: takings, best hour, one thing for tomorrow | ○ |
| M96 | ANNOUNCE-2 | pocket announce — **presence, not notification.** "Maya took $84 at register 2" — attributed, not just amounted | ○ |
| M97 | CX-PAY-1 | **Aria Pay consumer app** (mockup: `aria-pay-app.html`) — scan & pay with the order-locked bill · **my code** (staff scans the customer: charge + points in one scan, the true Starbucks move) · saved card | ○ |
| M97b | CX-PAY-WALLET | venue balances as one screen with the never-pooled explanation as **trust copy**, not a disclaimer · wallet-pass tie-in to the existing .pkpass | ○ |
| M97c | CX-PAY-ORDER | order ahead inside the pay app | ○ |
| M97d | CX-PAY-REWARDS | rewards · this week's challenge · **post-payment reveal** | ○ |
| M97e | CX-PAY-RECEIPTS | one receipt identity across venues — **the same itemised evidence that defends the venue in a chargeback** | ○ |
| M97f | CX-PAY-NEARBY | "nearby on Aria" — the marketplace seed inside the wallet that already exists | ○ |
| M97g | CX-PAY-REFER | bring a friend — referral program | ○ |
| M98 | CX-PAY-WEDGE | the install wedge — café-offered instant discount/cashback at the counter | ○ |
| M99 | CHARGEBACK-1 | chargeback defence with auto-assembled evidence (his pull-forward) | ○ |
| M100 | PAYLINK-1 | payment links · multi-outlet QR · tax invoicing · PayTo agreements | ○ |
| M101 | SETTLE-1 | split settlements · multiple payout accounts · scheduled settlement reports | ○ |
| M102 | BNPL-1 | Afterpay/Zip method toggling at checkout (**NCCP reform applies**) | ○ |
| M102b | RADAR-1 | Stripe Radar fraud signals surfaced to the owner | ○ |
| M102c | CHECKOUT-EMBED | embeddable checkout for the business's own pages | ○ |
| M102d | SURCHARGE-BAN | ⚠️ **dated regulatory work — the AU surcharge ban and new interchange caps take effect October 2026.** Pricing, receipts and checkout copy must be compliant before that date | ○ |
| M102e | REFERRAL-FIN | working-capital and insurance **referral** flows (mere-referral exemption — under ASIC review, verify before building) | ○ |
| M103 | HOUSE-1 | house tabs / trade accounts AR ledger with NCCP guardrails | ○ |
| M108 | COMPETITOR-PRICE-1 | ⚠️ **more built than it looks** — `competitor_snapshots` 375 live rows, `market-prices.ts` 274 lines (Dan Murphy's/BWS/Liquorland/Coles/Woolworths/Costco/Amazon AU/Uber Eats), `/api/products/barcode-lookup` GTIN cascade already there. Gaps: `market_price_scans` 0 rows (cold-start deadlock) · all 106 products have empty barcodes · `pos_market_price_cache` empty · HTML fetch fails on JS-rendered pages · **cron budget 23/23 full**. **Sprint 1 = a recon test on 20 real Sip SKUs to measure the current hit rate before any code.** Fix = a SERP/Shopping API strategy (DataForSEO / Serpent, ~US$0.0006/lookup) added **inside** the existing file, never a fork | ○ |
| M108b | PRICE-LANES | the three remaining automated lanes: affiliate product feeds · a self-hosted crawler for sites with no API · **the Canopy browser lane** — reads a public page the way a customer does, at human pace, owner-triggered, top-N SKUs, aggressively cached. ⚠️ **No CAPTCHA handoff** — passing a human check and handing the session to automation is what turns "reading a public page" into "circumventing an access control". If a site blocks, Aria says so and skips it. Prefer official endpoints where they exist | ○ |
| M108c | PRICE-OUTPUT | the owner-facing shape: **cost and margin intelligence, never a shared price board.** "Your cost is down 12% and your price hasn't moved." ⚠️ Prices flow OUT to consumers, never sideways between venues — CCA s45, no numeric safe harbour. Stale prices carry their age; a cached figure is never presented as current | ○ |
| M104b | PRICE-PIXELS | ⚠️ **read the pixels, not the DOM.** Screenshot the visible tab, vision model extracts product + price. Site-agnostic, survives every redesign, **zero per-retailer scrapers to maintain** — a DOM scraper means owning a Dan Murphy's adapter, a BWS adapter, a Liquorland adapter, forever | ○ |
| M104c | PRICE-RITUAL | **a ritual, not a crawler.** Canopy remembers the owner's five tabs; Monday morning "Price check" → tabs restore → one button → snapshot. Sparse human-triggered data, but *legitimate* sparse data, and week-over-week it still builds the series. ⚠️ **Aria reads, never drives** — the moment it clicks through categories, paginates, or loops on a schedule it is a bot in the owner's coat, and that is deliberate circumvention. **No CAPTCHA handoff.** Canopy states once, plainly, that it is the owner's session carrying the ToS exposure | ○ |
| M104d | PRICE-SHELF-CAM | **same engine, second input: the phone camera.** Owner walks into the competitor's store, photographs the shelf, same vision pipeline. **The version no scraper can copy** | ○ |
| M104e | PRICE-PRODUCT-TAB | a competitor-prices tab on every product — price ladder, ordering, sources — refreshed by the above so an owner can answer a price-match question at the counter. ⚠️ **Owner's eyes only.** ACL substantiation bites the moment this feeds a customer-facing "cheapest in town" claim, and CCA s45 bites if prices flow sideways between venues | ○ |
| M105 | LAYBY-1 | layby state machine | ○ |
| M106 | RETURN-1 | returns and reason codes | ○ |
| M107 | PRICE-1 | price book: effective-dated prices, price zones, future-dated changes that apply offline | ○ |
| M108-2 | PROMO-1 | promotion rules engine — multi-buy, mix-and-match, happy hour, member pricing, client-side | ○ |
| M109 | MONEY-2 | invoice chaser (**B2B only; verify RG 96 + credit-licence position before building**) | ⏸ |
| M110 | MONEY-3 | bankability — BAS/GST + Xero/MYOB export as lender-grade record | ○ |
| M111 | CUST-INVOICE-1 | customer management + invoicing (batch 25) | ○ |

### ⚠️ THE HARD DESIGN RULE FOR THIS ENTIRE PHASE
**Aria never holds or touches the money.** Funds go merchant → acquirer → merchant's bank. Aria triggers, displays, explains and reconciles. That is how every AU POS vendor operates and it keeps Aria out of licence categories almost entirely.

**The one existing exposure: the loyalty preload ledger is a stored-value construct.** Under Treasury's Tranche 1 activity-based regime (draft March 2026), POS technology providers and payment facilitators likely need an AFSL or authorised-representative arrangement, commencing ~12 months after Royal Assent, likely 2027. Stored-value facilities come under APRA above $200m credit. **Keep preload as the only exposure, deliberately.**

**Skip or partner, never build:** BPAY biller status (needs a sponsoring bank; 55,000+ billers exist), lending, insurance, gold, an ads network.

---

# PHASE G · INVENTORY
| # | Sprint | Scope | Status |
|---|---|---|---|
| M112 | INV-COST-2 | resolveCostFor consults recorded transactions first — **42 files still read cost_price direct** | ○ |
| M113 | INV-BLIND-COUNT | staff app pre-fills expected; open-and-submit records a perfect match having counted nothing | ○ |
| M114 | INV-SUBMITCOUNT | submitCount writes items_counted=1 and no ledger line — breaks last_counted_at and the cycle rotation | ○ |
| M115 | INV-VELOCITY-1 | product_performance_scores (0 rows, the keystone) | ○ |
| M116 | INV-UOM-1 | base-unit conversion finishing; CSV import still writes tombstoned pack columns | ○ |
| M117 | INV-PAR-1 | par inferred from velocity, never owner-configured | ○ |
| M118 | INV-CYCLE-1 | ABC cycle counts | ○ |
| M119 | INV-STAFF-APP | per-staff PWA · outlet selector · Gap Scan (from MATE research) | ○ |
| M120 | INV-EXCEPTIONS | mismatch scan → owner review queue | ○ |
| M121 | INV-REPORTS | the 10-report library, PDF, auto-emailed | ○ |
| M122 | INVOICE-OCR-1 | supplier invoice → structured lines. **Bench Kimi K3 against Gemini for this exact slot** — that is the decided test, not a general model change (PaddleOCR is the OSS fallback) | ○ |
| M123 | INV-RECIPE-1 | ingredient depletion (recipes seeded 2/5) | ○ |
| M124 | FOODCOST-1 | theoretical vs actual usage variance | ○ |
| M125 | INV-WASTE-1 | waste capture | ○ |
| M126 | INV-FORECAST-1 | replenishment agent — par + velocity + lead time → drafts POs | ○ |
| M127 | INV-CONSOLIDATE-1 | three counting surfaces → one | ○ |
| M128 | INV-AGENT-1 | the conversational owner agent over all inventory | ○ |
| M129 | EXC-ANOM-1 | void/refund/discount anomaly detection into the exception queue | ○ |
| M130 | SHRINK-1 | cashier and till behaviour exception reporting | ○ |

---

# PHASE H · BRAIN + INTELLIGENCE
| # | Sprint | Scope | Status |
|---|---|---|---|
| M132 | I2-GOAL-AWARE | goal-aware advice | ○ |
| M133 | I3-PATTERN-MEMORY | pattern memory | ○ |
| M134 | I4-OUTCOME-LOOP | wire aria_outcomes/advice_weights/hypotheses — **1,653 hypotheses, 0 accepted** | ○ |
| M135 | I5-I12 | the remaining intelligence wiring | ○ |
| M136 | GROUNDED-MIGRATION | the ~146 direct-SDK call sites — flagged open across four reports, never picked up | ○ |
| M137 | BRAIN-BACKLOG-1 | LOGGING-AUDIT-4 · WAITUNTIL-COLUMN-FIX · CACHE-EPOCH-2 · CRON-1 · COMMAND-PORT-1 | ○ |
| M138 | BRAIN-BACKLOG-2 | TZ-2-LIB-FIX · MEMORY-DEDUPE-1 · MONITOR-1 · RICH-2 · RICH-3 · SPELLS-1 | ○ |
| M139 | ASK-SQL-1 | conversational analytics over Postgres with grounding guardrails | ○ |
| M140 | FCST-1 | demand forecasting — statistical baseline first (**runtime decision: JS vs Python service**) | ⏸ |
| M141 | AGENT-CROSS-1 | agents that act across domains — draft the order, send the roster, chase the reply | ○ |
| M142 | ROUTINE-LEARN-1 | Aria learns the owner's routine from Canopy telemetry and suggests | ○ |
| M143 | DEMAND-GEN-1 | the Growth domain — reactivation/yield, never-lose-an-inbound, AEO presence | ○ |
| M144 | EVAL-LAB-1 | evaluation lab in shadow mode; grow the 51-case set from real 👎 | ○ |
| M145 | ARIA-GATE-1 | fail-closed approval seam (from the DeepSeek Harness read) | ○ |
| M146 | ARIA-INVARIANT-1 | runtime invariant registry — the answer to N-copies drift | ○ |

---

# PHASE I · TEAM
| # | Sprint | Scope | Status |
|---|---|---|---|
| M147 | TS-DEFECT-1 | three write paths use status='completed' which the CHECK rejects — silent failures | ○ |
| M148 | TS-1-REST | expiry sweep · poll engine · execution binding · labels + supersede | ○ |
| M149 | TS-2 | the Team Space surface | ○ |
| M150 | TS-3 | the human layer — relationship lens, anniversaries, go-first nudge | ○ |
| M150b | WHATSAPP-BSP | ⚠️ **each café needs its own WABA and its own Meta Business Verification** — you cannot verify on their behalf. Requires a BSP with Embedded Signup at onboarding. Unverified sending is capped at 250 business-initiated conversations / 24h. **Unconfirmed and load-bearing: one low-quality source claims general-purpose AI chatbots are prohibited on Meta's API — confirm against Meta's own policy before scoping** | ○ |
| M151 | TS-TRANSLATE | live per-message translation (structured content rendered per reader, free text translated) | ○ |
| M152 | TEAM-SEC-1 | unscoped hard DELETEs on pos_timesheets (AU 7-year retention) | ○ |
| M153 | TEAM-TRUTH-1 | fabricated pay-rate defaults (`?? 2500`, `?? 25`) reaching agent output · UTC timezone penalty bug | ○ |
| M154 | TEAM-DRIFT-1 | prod RLS → migrations capture | ○ |
| M155 | TEAM-LINK-1 | materialise staff_shifts on publish · shift_id at all four clock-in points | ○ |
| M156 | TEAM-RULES-1 | immutable punch log · interpreted rate frozen at punch time | ○ |
| M157 | TEAM-EXCEPT-1 | team review queue mirroring inventory's | ○ |
| M158 | TEAM-CONSOLIDATE-1 | three rosters and two portals → one each | ○ |
| M159 | TEAM-COST-1 | live labour % of sales — Deputy can't replicate it, they don't own the till | ○ |
| M160 | PAY-COST-RAIL-1 | one canonical labour-cost module (5–15 scattered computations) | ○ |
| M161 | PAYROLL-1 | payroll runs · payslips · super obligations | ○ |
| M162 | LEAVE-1 | leave balances and requests | ○ |
| M163 | LABOUR-1 | demand-driven roster generation | ○ |
| M164 | LABOUR-2 | constraint solver for shift assignment (OR-Tools / Timefold) | ○ |
| M165 | AWARD-1 | HIGA MA000009 + General Retail MA000004 interpretation (**build vs integrate decision**) | ⏸ |
| M166 | TIME-1 | time and attendance · break compliance | ○ |
| M167 | STP-1 | Single Touch Payroll Phase 2 (needs a commercial SSP) | ○ |
| M168 | TIP-1 | tip pooling and distribution | ○ |
| M169 | HIRE-1 | post-hire outcome loop scoring trial shifts (**not** video interviews — locked). ⚠️ **From 10 Dec 2026 AU privacy law requires disclosure of substantially automated decisions affecting a person's rights — recruitment shortlisting is explicitly in scope. No opaque scoring; facial and vocal analysis permanently excluded** | ○ |
| M169b | TEAM-SURFACE-114 | the TF-01→TF-114 feature surface across 16 domains, incl. TF-110–114 **family business** — owner-as-staff, unpaid family labour, multi-owner. No existing WFM product handles these | ○ |

---

# PHASE J · CANOPY
| # | Sprint | Scope | Status |
|---|---|---|---|
| M170 | CANOPY-SHIFT-1 | the shift as the operating object — Start / Run / Close the business | ○ |
| M171 | SHELL-SECURITY-1 | WebContents isolation · per-app session partitions (**hard gate before any third-party content**) | ○ |
| M172 | STORE-1 | MCP-host core · generic app registry · curated connectors · honest capability tiers | ○ |
| M173 | STORE-2 | page-reading fallbacks (only after STORE-1 is proven) | ○ |
| M174 | KDS-1 | kitchen display · ticket states · station routing · bump and recall · Realtime | ○ |
| M175 | KDS-2 | coursing · timing · throttling | ○ |
| M176 | TABLE-1 | floor plan · table state · seat-level ordering · split checks · bar tabs with pre-auth | ○ |
| M177 | MENU-1 | menu versioning · multi-location propagation · day-parting · price zones | ○ |
| M178 | AGG-1 | Uber Eats Marketplace API — menu, orders, webhooks | ○ |
| M179 | AGG-2 | middleware evaluation vs direct (**decision**) | ⏸ |
| M180-2 | EOD-1 | end of day: cash declaration · safe count · over/short · deposits | ○ |
| M181 | LOGBOOK-1 | manager logbook and shift notes | ○ |
| M182 | DEVICE-1 | config push and feature flags as a table + flag service | ○ |
| M183 | MULTI-SCREEN-1 | customer counter display · kitchen display · Canopy multi-window | ○ |
| M184 | DISPLAY-2 | journey display legs 2+ · true sunset from venue lat/long · weather flag | ○ |
| M185 | CANOPY-LITE | the Lite tier (**funnel or standalone product — decision**) | ⏸ |

---

# PHASE K · OWNER PHONE APP
| # | Sprint | Scope | Status |
|---|---|---|---|
| M186 | PH-5 | offline + role scoping (finishes the phone app) | ○ |
| M187 | PH-MONEY | the Money tab — the bank-app view on the phone | ○ |
| M188 | PH-APPROVALS | approvals to phone with one-tap signed links | ○ |
| M189 | LL-IOS | iOS wrapper | ○ |
| M190 | MM-ANDROID | Android wrapper | ○ |
| M191 | NN-PUSH | push notifications | ○ |
| M192 | OO-OFFLINE | offline for the phone surface | ○ |

---

# PHASE L · CUSTOMER SURFACES
| # | Sprint | Scope | Status |
|---|---|---|---|
| M193 | CX-UI-POLISH | every customer surface to Pipel in one pass — loyalty, inventory staff app, bookings, community | ○ |
| M194 | CX-D2 | live presence + chat + POS pulse (free Realtime) | ○ |
| M195 | CX-D3 | cold-start AI feed | ○ |
| M196 | CX-GAME | levels · leaderboard · digest · reward teeth | ○ |
| M197 | BOOK-TABLE-RESTORE | table selection regressed after being verified working — restore it | ○ |
| M198 | BOOK-DEPOSITS | deposits + no-show scoring | ○ |
| M199 | BOOK-WAITLIST | waitlist | ○ |
| M200 | BOOK-UPSELL | upsell + RWG + social | ○ |
| M201 | ORD-3D | online ordering flow + the 3D visual system | ○ |
| M202 | REELS-R2-R5 | editor MVP · editor full · AI essentials · AI useful | ○ |
| M180 | **REELS-R6a — THE SPINE** | calendar + queue + composer with **per-channel preview**, four channels (IG/TikTok/YT/FB). ⚠️ **This is the real gap** — Aria already has the two expensive halves (Studio/Veo generation, a conversational brain) and is missing the boring middle | ○ |
| M180b | **REELS-R6b — ANALYTICS** | per-platform performance in one view · then the thing no scheduling tool can do: **revenue attribution per post, off the POS** | ○ |
| M180c | **REELS-R7a — APPROVALS** | owner approves, staff drafts. **The mechanic already exists everywhere in Aria** (mismatch→owner queue, gated agents) — same shape, new surface. Postiz's version is generic team commenting; Aria's is the propose-then-approve rail it already runs on | ○ |
| M180d | **REELS-R7b — POS TRIGGERS** | ⚠️ **the recipe change.** Theirs is RSS in, webhooks out, auto-actions on engagement milestones. Aria's fuel is the till: **sales spike · low stock · quiet Tuesday · new loyalty tier reached.** Same mechanic, completely different input | ○ |
| M180e | REELS-R8 | the POS caption engine (unchanged) | ○ |

⚠️ **Deliberately NOT built from the Postiz comparison:** 34 platforms (a Melbourne café needs four) · platform-specific niche fields (Reddit flairs, LinkedIn carousels, Pinterest boards, YouTube playlist categories, X reply controls) · a public REST API / CLI / MCP server **for social** (exposing a scheduling API to nobody) · a paid Canva-clone editor (Studio covers it; theirs is Polotno, a paid licence). **Breadth is Postiz's pitch. It is not Aria's** — building it makes the product feel like a marketing tool rather than a business OS.
| M204 | REELS-R9-R11 | sales-spike trigger · POS-CTA + narrator · Aria differentiators | ○ |
| M204b | REELS-FACESWAP | **R11 add-on, contingent on R2/R3 shipping clean.** Post-export layer only — the editor renders, then an optional "make it viral" step calls a GAN face-swap API (Replicate / HF / Stability, ~$0.05–0.10 a call). No editor changes. Curated templates only, never auto-generated. **Drop it if it complicates the pipeline.** ⚠️ Two constraints the source discussion did not cover: (a) **consent** — swapping a staff member's face needs their explicit, revocable, recorded permission; AU has criminal offences for non-consensual sexual deepfakes and the reputational floor is far above the legal one; (b) **IP** — celebrity clips and movie scenes are the exact material Reface itself restricts, and a café posting them carries the rights risk, not Aria. Templates must be licensed or original | ○ |
| M205 | STUDIO-GEN-A | artifact generation in Aria Studio | ○ |
| M206 | STUDIO-GEN-B | clickable mockup (prototypes only) | ○ |
| M207 | LOOKS-1 | product photography | ○ |
| M208 | PUBLIC-PAGES-1 | Aria builds the business's own landing/booking/menu pages from live data | ○ |
| M209 | SEO-2-3-4 | the remaining SEO sprints (read-only advisor, never writes to customer sites) | ○ |

---

# PHASE M · THE MOAT
| # | Sprint | Scope | Status |
|---|---|---|---|
| M210 | PAY-RAIL-DECISION | own payfac vs Stripe Connect vs partner acquirer (**licensing research first**) | ⏸ |
| M211 | PAY-RAIL-1 | Aria becomes the merchant payment rail | ○ |
| M212 | CAPITAL-1 | embedded lending via an AU funding partner, gated on GMV, not balance sheet | ○ |
| M213 | BENCH-1 | cross-merchant benchmarking with k-anonymity + min cohort (needs ~30–50 businesses) | ○ |
| M214 | WHATIF-1 | the what-if simulator — elasticity over the venue's own history | ○ |
| M215 | OUTCOME-TRACK-1 | Aria's advice measured against what actually happened | ○ |
| M216 | SUPPLIER-AGENT-1 | supplier negotiation using real volume history as leverage | ○ |
| M217 | STAFF-AGENT-1 | staff-facing floor agent, no money powers | ○ |
| M218 | CUSTOMER-AGENT-1 | customer-facing agent the owner configures and scopes | ○ |
| M219 | COMPLIANCE-PACKS | GST/BAS · NZ GST · UK MTD-VAT · e-invoicing, as config not code | ○ |
| M220 | ACCT-1 | Xero connector (summary journal sync) | ○ |
| M221 | ACCT-2 | MYOB connector | ○ |
| M222 | AGE-1 | age gate + PDF417 ID scan on AU licences (zxing-js) | ○ |
| M223 | RSA-1 | RSA certification tracking per staff, expiry alerts | ○ |
| M224 | HOURS-1 | trading-hours enforcement per licence | ○ |
| M225 | MARKETPLACE-1 | the "in stock near me" demand engine (parked moat #4) | ○ |
| M226 | GLOBAL-1 | NZ launch — the first compliance pack proves the model | ○ |

---

# PHASE N · SCALE
| # | Sprint | Scope | Status |
|---|---|---|---|
| M227 | API-1 | public API · webhooks · OAuth · sandbox | ○ |
| M228 | FRANCHISE-1 | multi-unit hierarchy · central menu/price control · royalty calculation | ○ |
| M229 | EDI-1 | Metcash and ALM ordering via an EDI provider | ○ |
| M230 | ESL-1 | electronic shelf label vendor integration | ○ |
| M231 | MARKET-1 | ISV marketplace on top of API-1 | ○ |
| M232 | WW-PERF | performance batch | ○ |
| M233 | AVATAR-3 | V/M/L avatar + transparent canvas + orb fallback | ○ |
| M234 | PHASE-AN | the 22 micro-animations | ○ |
| M235 | FREE-AI-7 | Whisper · pgvector · OCR · bg-removal · moderation · Gemini Nano · forecasting v1 | ○ |

---

---

# PHASE O · THE BRAIN ENGINE + GEMINI RAILS
*Batch #29 (BE-1..10) and batch #30 (6 rails + 14 features). Rails before features — nothing model-calling ships before the gateway.*

| # | Sprint | Scope | Status |
|---|---|---|---|
| M236 | BE-1 | model gateway pass-through + per-call cost logging (**pre-launch; the hard root**) | ○ |
| M237 | BE-2 | prompt cache ordering (**pre-launch**) | ○ |
| M238 | BE-3 | engine registry + BrainEngine contract — velocity, days-of-cover, reorder, dead stock, margin as deterministic source of truth | ○ |
| M239 | BE-4 | typed intelligence repositories | ○ |
| M240 | BE-5 | intent router, deterministic-first | ○ |
| M241 | BE-6 | ai_jobs batch table | ○ |
| M242 | BE-7 | pgvector semantic cache | ○ |
| M243 | BE-8 | audit tables | ○ |
| M244 | BE-9 | cost controls — max 2–3 model calls per interaction | ○ |
| M244b | BE-9b | add **DeepSeek V4 Flash** to the gateway as a cheap high-volume lane | ○ |
| M245 | BE-10 | model harness — job routing, verifier, eval set, the "win on the harness not the model" direction | ○ |
| M246 | GEM-1 | the gateway rail (Gemini as a managed provider inside the existing gateway, never a second brain) | ○ |
| M247 | GEM-2 | the context contract rail — **urgent, every new screen should register context as it is built** | ○ |
| M248 | GEM-3 | budget/precompute rail — per-business per-DAY cap; on breach degrade to precomputed, never an error | ○ |
| M249 | GEM-4 | agent rail | ○ |
| M250 | GEM-5 | media rail | ○ |
| M251 | GEM-6 | render rail | ○ |
| M252 | GEM-F1 | the morning brief | ○ |
| M253 | GEM-F3 | watchers | ○ |
| M254 | GEM-F4 | hypothesis tournament | ○ |
| M255 | GEM-F5 | generative reports | ○ |
| M256 | GEM-F6 | mini-apps | ○ |
| M257 | GEM-F7 | exception inbox | ○ |
| M258 | GEM-F8 | voice | ○ |
| M259 | GEM-F9 | media studio | ○ |
| M260 | GEM-F10 | image studio | ○ |
| M261 | GEM-F11 | **customer-facing AI** — precompute-first, allergen/price/stock hard rule: no model output ever answers those | ○ |
| M262 | GEM-F12 | community remix | ○ |
| M263 | GEM-F13 | connectors | ○ |
| M264 | GEM-F14 | WebMCP | ○ |

---

# PHASE P · REPORTS
| # | Sprint | Scope | Status |
|---|---|---|---|
| M265 | REPORTS-CORE | one report model, shared catalog, consistent filter bar, sales reports, CSV/PDF (folds FIN/BAS #21 + Weekly BI #26) | ○ |
| M266 | REPORTS-SCHEDULER | scheduler UI, email channel | ○ |
| M267 | REPORTS-CHANNELS | owner phone · WhatsApp (consent-gated) · ClickSend · degrade to email + delivery log | ○ |
| M268 | REPORTS-ARIA-EMIT | Ask Aria emits a report into the same model | ○ |
| M269 | REPORTS-CROSS | cross-domain fill — inventory reports REFERENCE the existing 10-report library, never duplicate | ○ |

---

# PHASE Q · OWNER LIFE OS
*The personal/business bridge. Business funds it; owner-first.*

| # | Sprint | Scope | Status |
|---|---|---|---|
| M270 | OWNER-LIFE-1 | the My Life dashboard — business shows runway, personal shows what's actually spendable | ○ |
| M271 | OWNER-LIFE-2 | external price watchlists for life intents, alerts joined to business context | ○ |
| M272 | OWNER-LIFE-3 | trip and party planning against affordability + quiet weeks + cover | ○ |
| M273 | OWNER-LIFE-5 | schedule-first — personal schedule as the hard constraint, merged week, protection status | ○ |
| M274 | OWNER-LIFE-6 | dollar-priced trade-off cards when a conflict is unavoidable; time gated like money | ○ |
| M275 | OL-7 | pay-yourself-first engine | ○ |
| M276 | OL-8 | **sick-day continuity pack** (a "need" unlock — prioritised) | ○ |
| M277 | OL-9 | **licence wall** — personal certs that can close the business (prioritised) | ○ |
| M278 | OL-10 | dual-ledger life projects | ○ |
| M279 | OL-11 | energy/burnout ledger | ○ |
| M280 | OL-12 | exit horizon | ○ |
| M281 | OL-BRIEF | one merged morning brief as the daily surface | ○ |

---

# PHASE R · MARKETPLACE (the demand engine)
*Gated on stock accuracy. A marketplace that says "in stock" and is wrong is worse than none.*

| # | Sprint | Scope | Status |
|---|---|---|---|
| M282 | M-1 | the confidence layer — never binary "in stock", always "3 left · updated 4 min ago" | ○ |
| M283 | M-2 | catalog normalisation via GTIN (**the sleeper — hardest part**) | ○ |
| M284 | M-3 | consumer search, ONE postcode | ○ |
| M285 | M-4 | reserve-and-collect — conversion plus the attribution receipt | ○ |
| M286 | M-5 | attribution billing — charge only on a provably new customer | ○ |
| M287 | M-6 | loyalty network tie-in | ○ |
| M288 | M-7 | density recruitment playbook — 10–15 stores in one postcode before consumer launch | ○ |

---

# PHASE S · GESTURE + NOVEL INTERACTION
| # | Sprint | Scope | Status |
|---|---|---|---|
| M289 | GESTURE-RESEARCH | the commissioned pass — everything possible with camera hand gestures, beyond the 5-surface demo | ○ |
| M290 | AIRDECK-2 | working hand zoom · no vein-like skeleton overlay · genuinely sci-fi, first-of-its-kind | ○ |
| M291 | GESTURE-SURFACES | the useful business surfaces gestures actually improve | ○ |

---

# PHASE T · CANOPY DESIGN GATES
*Each is a DESIGN sprint that must close before its BUILD sprint. Naming every unknown IS the planning.*

| # | Sprint | Scope | Status |
|---|---|---|---|
| M292 | DESIGN-REMOTE-EXEC | can scheduled machine-off execution actually run on this stack? Go/no-go before promising it | ⏸ |
| M293 | DESIGN-OFFLINE-SCOPE | what works offline; sales-win-on-reconcile conflict model | ⏸ |
| M294 | DESIGN-BROKER-CONTRADICTION | what Aria does when a connector's data conflicts with the ledger (likely flag, act on neither) | ⏸ |
| M295 | DESIGN-EMPTY-BUSINESS | first-time owner, no data | ○ |
| M296 | DESIGN-COST-GOVERNANCE | per-business AI spend; AUTO mode "uses more usage" must be bounded and surfaced | ○ |
| M297 | DESIGN-UPDATE-SAFETY | atomic, rollback-able, **never auto-update mid-trade** | ○ |
| M298 | DESIGN-EXPORT | data export and offboarding — her data is hers | ○ |
| M299 | CONNECTOR-BROKER-1 | the broker: policy check → isolated call → **validate the response against the ledger** → gate any write | ○ |
| M300 | TOOL-SEARCH-1 | MCP tool search + lazy loading — 3–6 active servers beats 15; naive 20 makes Aria worse | ○ |
| M301 | ARIA-BROWSER | the Comet-style browser inside Canopy (after SHELL-SECURITY-1, never before) | ○ |

---

# PHASE U · EXPANSION
| # | Sprint | Scope | Status |
|---|---|---|---|
| M302 | NZ-PACK | New Zealand — GST pack, the first proof that compliance-as-config works | ○ |
| M303 | UK-PACK | UK — MTD-VAT | ○ |
| M304 | IE-PACK | Ireland | ○ |

### THE AGENTS-OFFICE STEALS — suffix block, nothing renumbered
*Source read live 9 Sep 2026. **PolyForm Noncommercial licence — patterns only, zero code, zero assets, zero copied config shapes.** Aria is a paid product; anyone pasting from that repo creates a licence problem.*
*Live counts verified 9 Sep: skills 18 · business_memory 299 · agent_memory 0 · advice_weights 5 · outcomes 3 · hypotheses 305 · autopilot_actions 907 · task_outputs 30. **5 weights and 3 outcomes against 907 actions is a learning loop that is not turning.***

| # | Sprint | Scope | Order |
|---|---|---|---|
| S5-2 | **PAYLOAD-EXACT-APPROVAL** | hash the approved payload in `aria_autopilot_actions`; if price, quantity or recipient changed between approve and send, **re-queue instead of sending**. A genuine hole in any propose→approve system. Half a session, standalone | **anytime — do it early** |
| S6 | **CHECK-LIVE** | one command that, against the seeded test business, sends **one real Ask Aria question and one real proposed action end to end** and asserts the answer grounded and the gate held. ⚠️ **Aria's recurring failure mode is green build, dead feature — this is the command that catches it.** Protects every sprint after it | ✅ done — was: **before more feature sprints** |
| S1-2 | **HOUSE-RULES-LEARN** | every owner correction becomes **one English sentence** in `aria_house_rules`, business-scoped, on an editable page: read them, edit, delete to unlearn, see when learned, from which conversation, and **how many times it fired**. Scoped (outlet/weekday/supplier) and expirable. **Enforced not prompted** — loaded at the grounding stage, re-checked at stage 5; a card violating a live rule does not render. Upgrades the OpenBot House Rules stream from an action-gateway concept into the learning loop itself | **after M17 BRAIN-1** |
| S2-2 | **SKILLS-FROM-WHAT-THEY-HAVE** | skills bound to a **moment** (opening, close, delivery arrival, Friday order, slow Tuesday), not a seat. **One artefact, two readers** — the same skill renders as the staff checklist in the inventory app *and* is the agent's procedure. Authored from what the owner already has: paste the real closing checklist / last supplier email / roster photo. Zero blank pages. Lands in `aria_skills` | with PP onboarding |
| S3-2 | **DATA-FIRST-INTERVIEW** | **don't ask what the POS already knows.** Aria drafts the rules from its own data, shows them, and asks only what data cannot answer — who may refund, what never to order again, what a good week looks like. Nothing written until the last answer. Closes Canopy design gap #6 (empty-business onboarding) | with PP onboarding |
| S4-2 | **CONNECTOR-HONESTY** | grey + reason on hover for a connector needing auth, wired to nothing until it works · **per-scope wiring carrying a dollar ceiling and a time window** (supplier portal 6am–4pm up to $X, else queue) · a **provenance chip on the card** — "this used Xero + your POS, 6:04am" | folds into STORE-1 / the broker, never before |
| S7-2 | **CAPABILITY-SENTENCE** | the boundary as one sentence the owner reads, on the House Rules page: *"Aria can read anything of yours. It only sends, posts, pays or changes something when you asked for that exact thing — or approved it."* Enforced by the harness, not the prompt | with S1 |
| S8a | **WHAT-ARIA-KNOWS** | the brain graph — 299 memories doing nothing visible today. Every node is something Aria believes about this business, showing **where it came from** (a sale, an invoice, you told me, I inferred it) and whether it still checks out against the ledger. Click to correct; correcting writes a House Rule. *"Here is everything I think is true about your café. Delete anything that isn't."* d3-force, ours to use | **can ship first — the data exists** |
| S8b | **THE FLOOR** | isometric 3D of the owner's **actual venue**, from data Aria holds: tables coloured by live spend, shelves filled to stock-on-hand, staff at clocked-in stations, machine pulsing at real orders/min, **Aria standing where the problem is** — spatial location *is* the diagnosis. Time scrubber replays today. three.js `OrthographicCamera` + fixed isometric vector, primitives in code, no art assets. ⚠️ **A view, never on the sale path** — reads a snapshot; the POS never waits on it. ⚠️ **After decrement/cost/velocity are trustworthy, or it renders a beautiful lie** | after the data is true |
| S8c | **ENGINES-DISAGREE** | when two engines conflict — forecast says order, count says don't — **show them meet and resolve it in front of the owner** instead of silently picking one | with S8a |

⚠️ **Explicitly not built: an office of 35 agent seats.** The seats aren't the work; that is their idea and the weakest part of their product. Steal the mechanic — *make invisible state physically legible in a space you can walk* — and change the subject to the venue.

### AGENT REACH — VERDICT AND PLACEMENT (9 Sep 2026)
**Not for competitor pricing. Not in `aria-saas`. Local dev tool + read-only sourcing only.**

Why it fails the pricing job: it is a Python CLI holding credentials in `~/.agent-reach/config.yaml` on a local machine — **a cookie-holding CLI does not run in a Vercel function**, so adopting it means owning a persistent box before scraping a single price. Its channels are social/content (X, Reddit, YouTube, GitHub, Bilibili, XiaoHongShu, Douyin, Weibo, WeChat, LinkedIn, Instagram, RSS, Exa); **AU retail is not among them**, and the generic fallback is `curl https://r.jina.ai/URL` — markdown with no structured price, no SKU match, no pagination. The maintainers describe it as cat-and-mouse; channels break and get re-fixed. **Fine for research, fatal where an owner reads a matched price aloud to a customer** — that is precisely the GROUNDING-TEETH failure. And reading a tweet for research is a different legal exposure from republishing a competitor's price inside a paid SaaS.

**The already-planned architecture stays:** M108b's Canopy browser lane (the owner's own session, human pace, no CAPTCHA handoff) plus Tavily server-side. Agent Reach does nothing for either.

| # | Sprint | Scope | Order |
|---|---|---|---|
| AR-1 | **AGENT-REACH-DEV** | install locally, **outside `aria-saas`**, as a founder research tool — reading repos, talks and threads while building. Zero API fees. Not a sprint so much as a setup note; no product code touches it | anytime, local only |
| AR-2 | **REELS-SOURCING** | read what is performing on TikTok/IG/YouTube for a café's format, as **input** to the R8 caption and R11 script engines. Read-only, non-customer-facing, staleness harmless | with REELS R7/R11 |
| AR-3 | **FEED-COLD-START** | hospitality content as seed material so the community feed is not empty on day one | with CX-D1/D3 |
| AR-4 | **MENTION-MONITOR** | Reddit and Instagram mentions of the business **as a signal, never as a quoted fact** — a mention is surfaced with its source and never enters an Aria figure | with the reviews/reputation work |

⚠️ **The rule of thumb, worth keeping as a standing test for any scraping tool:** use it where a wrong or missing result costs five minutes; **never where it costs a customer a wrong price.**

### ONE SURFACE + GROK BOT + 118-CATALOGUE — PLACEMENT (22 Sep 2026)
Anthropic merged chat + Cowork on 16 Sep, and it merged memory first, on 25 Aug. **The lesson is the order: memory before routing.** Grok Bot specifics (pricing, launch list) are **unverified**: sources disagree, so nothing below depends on them.

| # | Sprint | Scope | Order |
|---|---|---|---|
| G1 | **KILL-MODE-PICKER** | remove the composer "Ask ▾" mode picker and every Business/Research/Computer/Build label. **Aria routes; the owner never picks a mode.** Routing is M19's deterministic decide, so this ships in the same sprint | **with M19** |
| G2 | **MEMORY-ALL-LANES** | one memory read on every lane before decide. The audit found memory reaches 1 lane of 3. **Gate: G1 can't ship before this** | **with M18 (ground stage)** |
| G3 | **WHO'S-HANDLING-WHAT** | a visible feed: which agent took which job, its handoff, its state, and what it's waiting on. MANAGER-AGENT-1 already does the work, and this makes it visible. Reads agent_runs + aria_plans, **no new table** | after M11 plans are stable |
| G4 | **TRUST-LADDER** | a per-action-type ladder: propose → auto with undo → auto silent, **earned** from an approval streak (N approvals with 0 reverts) and dropped back down after one revert. **Reversible actions only. Money, sending, personal data and anything irreversible never climb, whatever the streak.** One owner-facing dial, on the axis of *what kind of action stops her*, not *how much she does*. Extends M46 autonomy | after M46 |
| G5 | **WATCH-YOUR-SHIFT** | = M142 ROUTINE-LEARN-1, sharpened: derive routines from POS, clock-in and stock events (never screen capture), then **propose** a routine and let the owner approve it. **Nothing new, just the M142 spec tightened** | M142 |
| G6 | **FLOOR-CAPTURE** | spoken context → task, no typing (the Omi/Screenpipe pattern; Screenpipe's licence is non-commercial, so **pattern only**). Opt-in, on-device transcription where possible, with staff consent recorded. Folds into the M31 voice counter | with M31, ⏸ privacy review |
| G7 | **LIVING-ARTIFACT** | the Docs/Slides pattern with Aria's recipe: the artifact is a PO, a roster or a price list, with one link across phone and desktop. The owner corrects a line and she redoes only that line | with M11 plans |
| G8 | **SOURCE-READS** | one question per repo, answered from source only: IronClaw (how is an extension isolated?) · Hermes (what is a reusable skill?) · OpenFang (how does a monitoring run decide it's worth reporting?) · Pydantic AI (the typed boundary on a money tool). **Read, don't depend.** Five of the 118 are already dead or frozen (Relay.app, Flowise, AutoGen, Continue, ChatGPT agent mode) | founder research, anytime |
| G9 | **SUPPLIER-PORTAL-NO-API** | Grok's steal #4. **Parked** behind HANDS/broker + S4 connector ceilings. No CAPTCHA handoff, ever | ⏸ |

The pitch line this produces: *Claude asks because it doesn't know your business. Aria shouldn't need to, because she's inside it.*

### ARIA-VS-COMPETITORS CHAT (26–27 Sep) — FOLDED IN, ALL CLAIMS VERIFIED 27 Sep
Full verification in **ARIA-CHAT-VERIFICATION-27SEP.md**. Two corrections change the order below: the "6 sales / 0 stock movements" alarm is **not a decrement bug** (all 6 rows synthetic, 3 with no line items; the real path is 12/12 correct), and **73 of 106 products carry a fabricated `price × 0.4` cost**.

| # | Sprint | Scope | Order |
|---|---|---|---|
| P0 | **ONE-REAL-VENUE** | not a launch and not a deadline — **one venue, one real day**, shadowing its existing POS if that is easier. Every "Aria wins… if" in the 52 scenarios, and the #1 buying factor in that chat's own survey data (reliability, 37%), is downstream of this. It is also the only way to re-measure decrement on rows that aren't seeded | **before the next build sprint** |
| P1 | **KILL-FAKE-COSTS** | 73 of 106 products have `cost_price` exactly `price × 0.4`. Null them or tag them at source so a cost with no supplier-invoice provenance **cannot** render as a verified margin. GROUNDING-TEETH guards the answer; the invention is one layer below it, in the data | **with P0** |
| P2 | **DECREMENT-REMEASURE** | re-derive coverage over real sales only, then keep or kill **INV-DECREMENT-FIX**. Its "8% coverage" premise came from seeded rows the seeder never decremented. Correct the tracker either way. ⚠️ n=12 today — "correct so far", not "proven at volume" | **before INV-DECREMENT-FIX** |
| V1 | **CRED-SURROGATION** | the model never holds a real token; the broker swaps it in at the network boundary. Confirmed real twice over: Meta's `authd`/Sentinel split, and Vercel Sandbox's documented `injectionRules[]`. **`syd1` (Sydney) exists**, so the privacy blocker is gone. Belongs in SHELL-SECURITY-1 | with the broker |
| V2 | **CHEAP-TAINT** | skip eBPF. Flag an agent run tainted once it reads customer PII; a tainted run cannot make an outbound call without the hard gate. aria-privacy applies | with V1 |
| V3 | **SCOPED-APPROVALS** | replace yes/no with once · this task · time-limited · under $X — *"approve Bidfood POs under $200, this week only."* Gives the Replenishment Agent its trust dial; pairs with G4 TRUST-LADDER | with M46 / G4 |
| V4 | **SINGLE-USE-CARD** | if Aria ever auto-orders: a credential locked to one merchant, one amount, one short window. Never the real card. Money stays gated regardless. ⚠️ **No longer a differentiator** — Muse for Small Business shipped single-use card numbers per new merchant on 29 Sep 2026. Keep it; it is table stakes, and the index should stop calling it a moat | ⏸ behind the money rail |
| V5 | **SANDBOX-JOBS** | Vercel Sandbox as the per-job workbench: deny-all networking + allowlist, `syd1`, destroy on completion. ⚠️ Corrections to the source chat: persistence via snapshot is now the **default** (choose ephemeral explicitly), timeout is 5 min default / 45 min Hobby / 24 h Pro, and it meters at $0.128 CPU-hr + $0.08/GB-mo snapshots. **Unverified: whether sandboxes count against the ≤22 function budget** | with SHELL-SECURITY-1 |
| V6 | **ARIA-INBOX** | a per-business address (`sip@…`) suppliers email invoices to, so costs capture themselves and short deliveries get flagged. This is the honest fix behind P1 | with INV-COST-1 |
| V7 | **MISSED-CALL-RESCUE** | the free first step of VOICE: an unanswered call triggers an SMS with the booking link and a loyalty perk. **No streaming telephony, so no Twilio decision needed** | anytime after bookings |
| V8 | **VOICE-TOOLS-FIRST** | when VOICE comes: the hard part is `check_availability` / `create_reservation`, not the model — Maitly and ~15 rivals all queue at OpenTable's partner gate and Aria has none to pass. Copy the state machine and confirm-before-write rule from the MIT Deepgram receptionist; ⚠️ **it runs on Twilio**, so take the logic, not the transport. Pipecat (BSD-2) restaurant flow is in `pipecat-ai/pipecat-examples`, not the main repo | after FLOOR-1 + GUEST-LINK |
| V9 | **AGENT-ENDPOINT** | read-only first: availability, stock, menu, for consumer agents. Cheap on engines that exist. ⚠️ **Not a race** — Muse is US-only, and Amazon blocked it on 21 Sep, which shows a platform can shut an agent out overnight. Build it; don't reorder around it | after the engines |
| V10 | **BUSINESS-PASSPORT** | two years of verified ledger as a signed pack for a lender or buyer. Nobody verified offers provenance-backed books. Sits on the moat file's capital layer, not before it | with the money rail |
| V11 | **DOC-CHAT** | drop in the lease, supplier contract or food-safety plan and ask *"when does my renewal notice go out?"* — pgvector is already planned; AnythingLLM (MIT) is the pattern | owner's-life layer |
| V12 | **INTERRUPTION-BUDGET** | Muse has a proactivity slider; Aria gets a **daily allowance of ~3 interruptions that each have to be earned** — a finding must pass aria-evidence and GROUNDING-TEETH or it waits for the morning digest. An agent that is quiet unless it matters is the trust play | with the wake runtime |
| V13 | **WAKE-RUNTIME** | the three things that wake Aria — **clock** (Supabase Cron), **event** (a DB change: par breach, sale spike, cancellation, invoice arrival), **goal** (a standing objective) — on Supabase Cron + pg_net, which sidesteps the Vercel cron daily-max entirely. Short job, sandbox only when it needs code or files, pay per run not per hour. **This is the runtime the four INV agents and "while you slept" run on, not a separate batch** | with M40 / the INV agents |
| V14 | **STANDING-GOALS** | business goals, not personal ones — *"food cost under 30% by December."* Re-checked weekly, one change proposed at a time, measured through **I4 OUTCOME-LOOP**, which is what finally puts the 1,653 idle hypotheses to work. Extends M132 I2-GOAL-AWARE | with I2/I4 |
| V15 | **KEEP-YOUR-POS-INGEST** | read-only ingest from a third-party POS (Square first) so an owner gets Aria's brain **without swapping hardware**. Locked direction since Aug, **missing from this index until now**. The chat's own survey data makes it the counter to the biggest loss: 37% of owners stay put purely because switching takes time | after the engines, before any push on incumbents' customers |
| V16 | **OWN-WORLD-PREFILL** | Firecrawl's idea turned inward: at onboarding read **the owner's own** website and Google listing to pre-fill menu, hours and photos. No scraping of other businesses, so none of the price-lane legal exposure. Buildable without Firecrawl (AGPL) | with PP onboarding / S3 DATA-FIRST-INTERVIEW |
| V17 | **ROUTE-LIFE-OUT** | a decision, not a build: Canopy's life layer **hands personal tasks to Muse/ChatGPT/Claude** rather than competing with their connector ecosystems (Walmart, Expedia, Instacart). Aria stays the business brain; the one place it wins is where the two cross — *"book the dentist around my roster"* | decision, now |
| V18 | **AGENT-FRONT-DOOR-SPEC** | sharpens V9 with the mechanic Autopolis publishes live: a machine-readable door at a **well-known path** — `/agents/openapi.json` plus a plain-English `skill.md` saying what an outside agent may do here. A consumer agent discovers an Aria business **without a partnership**, which is the exact gate Maitly queues at with OpenTable. ⚠️ Checked 27 Sep on autopolis.city; **its own live entry isn't open yet**, and the reel behind it is a **30-day rule-based recording in a Three.js viewer, not 50 models thinking** — so take the published-door pattern, and claim nothing about the city | with V9 |
| V19 | **AGENT-CALLER-IDENTITY** | the missing half of V9: an agent that books or orders must **register first** — who it is, which human it acts for, what it may do, its rate ceiling — credentials kept separate from model-provider keys (Autopolis does this; it is V1 seen from the outside). No identity, read-only. Bookings and orders stay gated exactly as a human's would be | with V9, before any write |
| V20 | **CONSEQUENCE-LEDGER** | Autopolis's real idea: *a choice changes a balance, and the city records it so the choice has a history.* Aria's version — every agent action stores its **before/after state**, so the day is replayable, I4 OUTCOME-LOOP has something to measure, and S8b's time scrubber replays decisions rather than just sales. Mostly a column discipline on `aria_autopilot_actions`, not a new system | with I4 / S8b |
| V21 | **AGENT-PROBATION** | Autopolis's one genuinely new mechanic: its agents **study at an Institute, graduate, then get hired** — a capability is *earned by passing an evaluation*, not granted. Aria's version: an agent gets a permission only after it passes the **M144 EVAL-LAB** set for that action type, and loses it when the eval regresses. This is the missing *entry* rung under G4 TRUST-LADDER, which only ever described climbing once live. Sharpens M144 and M245 rather than adding a system | with M144, before G4 |
| V22 | **SIM-BEFORE-REAL** | test an agent against a **simulated business** — replayed real history, no writes — before it touches a real one. Already the intent of M144 EVAL-LAB shadow mode; this names the venue-shaped harness it should replay against, and pairs with P0: the first real venue's day becomes the replay corpus | with M144 |

⚠️ **The prior read of this chat deliberately left Autopolis out**, on the grounds that M144 and M245 already cover it. That was right about the substance and wrong about the record: V21's earn-then-hold rung and V18's published-door path are not written anywhere in M144 or M245, so they are stated here rather than assumed. Nothing is renumbered.

### INDEX HYGIENE — verified 27 Sep
**29 duplicate sprint IDs** in this file, counted live: M40, M53–M56, M76–M91, M104b–M104e, M108, M108b, M108c, M180 (336 unique IDs). Parallel lanes make a duplicate ID an ownership collision, not a cosmetic flaw — **renumber before any second lane starts, never during**.
### PARALLEL BUILD — LANES AND GATES (plan dated 27 Sep, evidence: 37 run logs + repo at `07fd8bc4`)
**The verdict is not "go wider".** Coding capacity is not the constraint: no commits since 20 Sep, Aria's own Anthropic credit spent, and the three biggest delay causes in the logs are all one-at-a-time — wrong premise in the prompt (23 of 37), work found already built (19 of 37), schema change waiting on the founder (12 of 37). **More lanes make all three worse.** Lanes are split by **file ownership**, not sprint number, because overwrites happen at the file.

| Lane | Tool | Owns (only this lane edits) | Work | ~Sprints |
|---|---|---|---|---|
| A · Brain | Claude | `src/lib/aria/ask/**`, gateway, `answer-council.ts`, `aria-tools.ts` | M18–M20, intelligence, BE + GEM rails | 45 |
| B · Money/POS/schema | Claude | POS sale path, payments, `supabase/migrations/**`, `database.types.ts` | reliability, money, billing, **every schema change** | 60 |
| C · Operations engines | Claude | `src/lib/inventory/**`, inventory page, team/labour | Inventory, Team | 40 |
| D · Platform | Claude | `.github/**`, `scripts/**` guards, CI, security middleware | the gates, security, M21 Zod outside `ask/` | 30 |
| E · Isolated surfaces | Codex | new/self-contained UI dirs, `e2e/`, `tests/` | customer surfaces, Studio, gestures, polish | 70 |

Plus ~44 split (schema in B or C, screen in E) and ~16 decisions that are not code. **Order inside a lane is unchanged — this says who builds and when it merges, never what gets built.**

**Eight gates before any lane runs (~1 week).** Founder's: top up Anthropic credit with a spend cap · clear the queue of schema changes and ⏸ decisions · turn on branch protection for `main`. Lane D's: unit tests + lint + build in CI on every PR with `.next/cache` cached (137 tests have never run in CI) · **index v3** (the 29 duplicate IDs above, statuses marked from the run logs, lane + zone columns, retire clashing S-IDs) · an `AGENTS.md` under **32 KiB** (Codex's cap; CLAUDE.md is 44.6 KB so it cannot be copied) · `check:live` after every merge, not daily (20 of 37 features were never clicked through logged in) · first 6 prompts written from a **live** preflight.

**Then pilot, then scale — never straight to five.** Pilot = A + D + Codex E for two weeks; passes at ≥2 merged sprints a day with `main` never red over 2 hours, founder queue never older than 2 days, zero ownership breaches. Only then add B and C. **A sprint counts when it is merged, green, and `check:live` passes after — commits and runs do not count.** No finish date until the pilot measures a rate; the only figures in hand are 1.9 runs/day at the single-lane peak and 0.6 recently.

⚠️ **The rule that governs this file from here on: plan growth is a measured cost.** Roughly 12 new sprints ≈ one week at full pace, and the source chat alone added about 7. **New ideas go to a parking list reviewed every 2 weeks, never straight into a lane** — including the suffix blocks above. Nothing is cut; arrival is what's paced.
### PARKING LIST (the pace rule's landing zone — reviewed every 2 weeks, nothing enters a lane from here without that review)
From turn 1 of the same chat, the four voice twists that were **never written down** — only missed-call rescue (V7) and tools-first (V8) made it in. Each reuses the same call pipeline, so they are recipe changes, not new systems:

| # | Idea | Why it is Aria's and not Maitly's |
|---|---|---|
| K1 | **CALLER-IS-A-CUSTOMER** | match the incoming number to the loyalty identity — *"welcome back Jason, your usual Saturday window table? There's a free coffee waiting."* Maitly and the ~15 other OpenTable voice partners can't see POS history; Aria owns it |
| K2 | **BOOK-PLUS-PREORDER** | *"want your usual flat white ready when you sit down?"* — the order lands in POS as a draft, paid from the preload wallet. Turns a booking call into revenue on the same call |
| K3 | **CALLS-AS-DEMAND-SENSOR** | every transcript feeds the brain: *"12 callers asked for gluten-free this month and you stock none."* Links voice to inventory and menu, which a receptionist dashboard structurally cannot do |
| K5 | **SHOW-ONCE-1** | the one genuinely new mechanic in the agent-teammate wave, and it is **not in the 321**: teach by demonstration. The owner drives the supplier portal once; Aria learns the routine. **Our recipe, not theirs** — Aria watches through the built-in browser, writes a routine bound by House Rules (domain allow-list, no payments, **no credential capture** — credentials stay in the Connector Broker, M299), and its first three runs sit on the proposer rung with the owner approving each, after which it climbs G4's ladder like any other agent. Answers the "does the supplier have an API?" question by not needing one, and so supersedes G9 | after M299 + G4 ladder |
| K4 | **OWNER-VOICE-MODE** | the same pipeline pointed inward — the owner rings Aria while driving: *"how's today going?"*, *"approve the oat-milk PO"*. Reuses INV-AGENT-1's gated actions, so no new permission surface |

⚠️ **Two blockers decide all of them, and both are founder calls, not build work:** (a) **telephony** — realtime voice needs inbound call-audio streaming, the research's path for that is Twilio Media Streams, and the standing rule is ClickSend-only; whether any AU carrier on the allowed list streams inbound is **unverified**. (b) **call recording and transcript consent** varies by AU state and needs a live legal check (aria-privacy). Until (a) is answered, K1–K4 and V8 are all parked behind the same door — and V7 is the one that needs neither.
⚠️ **The agent-teammate wave, verified live 5 Oct — and the sentence it hands Aria.** dots (OpenAI, 30 Sep, Pro and Business Premium only), Muse for Small Business (29 Sep, free to a token cap then $20–$100/mo, human approval before purchases and publishing) and Grok Bot (beta since 11 Aug, SuperGrok Heavy / Cursor Ultra only, macOS/Windows/iOS, **no Android**) all now ship gated agent teammates. **Grok Bot gives an account one shared computer, and xAI's own docs say not to treat Bots as isolated — the security boundary is the account, not the Bot.** That is ten agents behind one login and one blast radius. Aria's per-agent scopes — **the payroll agent cannot see the marketing credentials** — is a difference an accountant understands in one sentence, and it is already implied by V1/V2/V19. Say it; build it so it stays true. **AU reality: dots is on the $200 tier, Muse's AU availability is unverified, Grok Bot needs a Cursor/SuperGrok plan — and none of the three touches a POS, a stock movement or an award rate.**

⚠️ **Competitive picture, re-verified 27 Sep — it is better than the chat claimed.** In Australia: Square AI answers but **cannot act**; Managerbot is US-only beta; Toast IQ's acting assistant shipped **US-only with international "planned"**; Lightspeed AI's AU availability is **unconfirmed**; and **Allvio could not be verified to exist at all** (domain unreachable, no source found) despite driving two scenario verdicts. Confirm its real name before planning against it. *"Nobody in AU acts on the owner's own data yet"* is the sharper, better-supported line.

⚠️ **Licences, checked live:** reuse MIT/BSD — Pipecat, Deepgram receptionist, anything-llm, crewAI, browser-use, `firecrawl-py`. **Study only, never copy** — Postiz and Firecrawl are AGPL. Cline is Apache-2.0 but irrelevant: Aria reads code and never writes it (M31b).

## EXPLICITLY NOT BUILT (assessed, off the order — not scope reduction)
Self-checkout hardware · computer-vision loss prevention · RFID tagging · forecourt/fuel · pharmacy · full WMS · planogram/space planning · own hardware line · professional services org · retail media network · facial-recognition payment (AU privacy) · video-interview hiring · a general-purpose app builder · super-app model · own foundation model · robotics.


## SHIPPED WORK THAT HAD NO INDEX ROW  ·  added by M19 phase 1

⚠️ **33 of the 39 run logs in `docs/aria/` had no row in this index.** They were built, gated,
committed and pushed, and the index did not know they existed — so every plan drawn from it has
been drawn from a map missing a quarter of the territory. They are added here rather than
threaded into the sections above, because inserting them inline would mean choosing an order
they never had, and because a block is easier to audit against `ls docs/aria/RUN-*.md`.

**Lane:** A brain · B money/POS/schema · C operations · D platform · E Codex.
**Zone** is derived from the paths each run log names in its own *files changed* entries — not
assigned by me. A log that names no path says so rather than being given a guess.

| # | Sprint | Scope | Lane | Zone | Status |
|---|---|---|---|---|---|
| M11B | THE PLAN GETS A SURFACE | shipped — see `docs/aria/RUN-M11B.md` | A | `src/lib/aria/` · `src/app/api/` | ✅ done |
| M13 | THE FIRST TWO WALLS | shipped — see `docs/aria/RUN-M13.md` | A | `src/lib/ai/` · `src/app/api/` | ✅ done |
| M13B | THE HERO PATH BEHIND THE WALL | shipped — see `docs/aria/RUN-M13B.md` | A | `src/lib/` · `src/lib/agents/` | ✅ done |
| M13C | THE COUNCIL THAT SAYS STEADY STATE | shipped — see `docs/aria/RUN-M13C.md` | A | `src/lib/agents/` · `src/lib/ai/` | ✅ done |
| M13D | THE AGENTS CAN'T SEE OR WRITE | shipped — see `docs/aria/RUN-M13D.md` | A | `src/app/api/` · `src/lib/agents/` | ✅ done |
| M17B | LAND THE SPINE | shipped — see `docs/aria/RUN-M17B.md` | A | `src/lib/aria/` · `src/app/api/` | ✅ done |
| M18B | PROVIDER-SPEND-CONTROL | shipped — see `docs/aria/RUN-M18B.md` | A | `src/lib/aria/` · `src/lib/` | ✅ done |
| MS10 | COST RAIL + ORDER DRAFTING | shipped — see `docs/aria/RUN-MS10.md` | B | `scripts/canon-rail-guard.ts/` · `src/lib/inventory/` | ✅ done |
| MS11 | CLOSE THE COST STORY + BASE-UNIT MODEL | shipped — see `docs/aria/RUN-MS11.md` | B | `src/lib/inventory/` | ✅ done |
| MS12 | ONE BILLING TRUTH + IMPORT HOLE | shipped — see `docs/aria/RUN-MS12.md` | B | *unknown — the log names no path* | ✅ done |
| MS13 | TENANT ISOLATION + OWNER-BUILT AGENTS | shipped — see `docs/aria/RUN-MS13.md` | D | `supabase/migrations//` · `src/lib/security/` | ✅ done |
| MS14 | ENFORCEMENT (INERT) + ONBOARDING THAT TEACHES ARIA | shipped — see `docs/aria/RUN-MS14.md` | D | `src/lib/billing/` | ✅ done |
| MS15 | THE HARNESS + THE INERTNESS LEDGER | shipped — see `docs/aria/RUN-MS15.md` | D | `scripts/run-evals.ts/` | ✅ done |
| MS16 | AX-1 · THE ASK ARIA PANEL | shipped — see `docs/aria/RUN-MS16.md` | A | `scripts/ms16-visual-verify.tsx/` · `src/lib/aria/` | ✅ done |
| MS16B | AX-1 CORRECTIONS | shipped — see `docs/aria/RUN-MS16B.md` | A | `scripts/ms16-visual-verify.tsx/` | ✅ done |
| MS16C | AX-1 FRAMING + THE REAL AVATAR | shipped — see `docs/aria/RUN-MS16C.md` | A | `scripts/ms16c-leak-verify.tsx/` · `src/components/ask-aria-ax/` | ✅ done |
| MS17 | ONE PANEL. EVERYTHING REAL. NOTHING LOST. | shipped — see `docs/aria/RUN-MS17.md` | A | *unknown — the log names no path* | ✅ done |
| MS7 | MEGA-SPRINT 7 · COUNT-TRUTH + AU-COMMS-RAIL | shipped — see `docs/aria/RUN-MS7.md` | B | `src/lib/` · `src/lib/inventory/` | ✅ done |
| MS7-PRE | MS7-PRE · GATE RELIABILITY | shipped — see `docs/aria/RUN-MS7-PRE.md` | D | `scripts/git-hooks/pre-push/` · `src/app/api/` | ✅ done |
| MS8 | MEGA-SPRINT 8 · COST-TRUTH + CI-FIXTURE | shipped — see `docs/aria/RUN-MS8.md` | B | `src/lib/aria/` · `src/lib/inventory/` | ✅ done |
| MS9 | MEGA-SPRINT 9 · TRUSTED NUMBERS + PAR LEVELS | shipped — see `docs/aria/RUN-MS9.md` | B | *unknown — the log names no path* | ✅ done |
| POS-INTEGRITY-1 | money is recorded correctly from the deploy date | shipped — see `docs/aria/RUN-POS-INTEGRITY-1.md` | B | `src/lib/pos/` · `src/app/api/` | ✅ done |
| POS-OFFLINE-1a | the sync swallow (G11) | shipped — see `docs/aria/RUN-POS-OFFLINE-1a.md` | B | `src/app/api/` · `src/lib/` | ✅ done |
| S1 | THE CHAT SURFACE | shipped — see `docs/aria/RUN-S1.md` | A | *unknown — the log names no path* | ✅ done |
| S10 | THE LIMITER AND THE LAST GATE | shipped — see `docs/aria/RUN-S10.md` | A | `e2e/helpers//` | ✅ done |
| S2 | CONVERSATION PERSISTENCE | shipped — see `docs/aria/RUN-S2.md` | A | *unknown — the log names no path* | ✅ done |
| S2B | THREADS, SEARCH, SOFT DELETE | shipped — see `docs/aria/RUN-S2B.md` | A | `src/app/api/` · `supabase/migrations/` | ✅ done |
| S3 | what the screenshot showed | shipped — see `docs/aria/RUN-S3.md` | A | `tests/smoke/` | ✅ done |
| S4 | why doesn't send send | shipped — see `docs/aria/RUN-S4.md` | A | `src/app/dashboard/` | ✅ done |
| S5 | the swap | shipped — see `docs/aria/RUN-S5.md` | A | `src/middleware.ts/` | ✅ done |
| S7 | FINISH THE CLASS | shipped — see `docs/aria/RUN-S7.md` | A | `src/lib/aria/` · `src/styles/` | ✅ done |
| S8 | FIX THE BUGS | shipped — see `docs/aria/RUN-S8.md` | A | `src/lib/aria/` · `scripts/setup-git-hooks.js/` | ✅ done |
| S9 | CLEAR THE REGISTER | shipped — see `docs/aria/RUN-S9.md` | A | `e2e/helpers/` · `scripts/set-smoke-test-password.ts/` | ✅ done |

## THE DECISIONS THAT GATE SPRINTS
1. Offline sync engine (M33) · 2. Forecasting runtime (M113) · 3. Award build vs integrate (M138) · 4. Aggregator direct vs middleware (M152) · 5. Brand colour extracted vs picked (M56) · 6. Branding per-business vs per-outlet (M56) · 7. Money wedge vs inventory first — **the 10 owner conversations decide, and they haven't happened** · 8. Canopy Lite funnel vs product (M158) · 9. Payment rail route (M183) · 10. Verifier placement (M25) · 11. Rate-limiter fail-open routes (M46) · 12. Approve/reject on the default Ask Aria surface.
