# ASK-ARIA-E2E-AUDIT — Multi-turn re-verification through REAL HTTP

**Date:** 2026-06-25 · **Target:** Ask Aria's live chat path. **Method fix:** prior audits drove the *planner* in isolation with context pre-supplied, so they never exercised the HTTP conversation read/write — every conversation-dependent verdict was unproven. This audit hits the **real authed `/api/aria/ask` endpoint** with `conversation_id` round-trip and asserts BOTH response correctness **and** the structural DB fact (turns share one `aria_conversations` row). Test = **Sip** (`ff5055a0-…`), `[E2E]` rows torn down, **residue 0**.

---

## PART 1 — Threading root cause + fix

**The DB evidence did NOT show a split.** The two rows from the live bug report each contained **both** turns (`msg_count=4` = user/assistant/user/assistant) — they were two *separate attempts* 2 min apart, not one split session. The `conversation_id` round-trip already works: the client sends it ([page.tsx:676](../src/app/dashboard/ask-aria/page.tsx#L676)) and stores the return ([:703](../src/app/dashboard/ask-aria/page.tsx#L703)).

**The real cause:** the **GENERAL fast-path** ([route.ts:564](../src/app/api/aria/ask/route.ts)) answered "what does she buy" with `priorMessages: []` (no history → can't resolve "she") **and** only `web_search`/`fetch_url` tools (no business data → couldn't answer purchases even if resolved). Turn 1 ("who is my best customer") went to the tool-loop and named Charlotte; turn 2 ("what does she buy") was (mis)classified `general`/`smalltalk` and fell into the bare general path, losing the referent.

**The fix** (landed in `638a4b2a`, re-proven here over HTTP):
1. **Coreferential follow-ups skip the bare general path** — a `COREF_FOLLOWUP` regex (`she/he/they/it/that/the customer/…`) + an existing thread routes the turn to the **business tool-loop**, which rehydrates this conversation's history (`buildAskAriaContext(bid, conversationId, …)`) and has the data tools.
2. **Server-side history rehydration** (`loadAnswerHistory`) — since the client sends only `{message, conversation_id}` (no messages array), history is loaded from the conversation row (last ~10 turns) and injected into the answer call.
3. **Over-answering tightening** (this commit) — a `isDataLookup` factual question now appends a strict BREVITY override to the system prompt so lookups answer concisely with no advisory sections.

---

## PART 2 — The HTTP harness (the methodology fix — reusable)

**Auth solved headlessly without a password or JWT secret:**
1. Service-role `auth.admin.generateLink({ type:'magiclink', email })` → `hashed_token` (no email actually sent).
2. Anon client `auth.verifyOtp({ type:'magiclink', token_hash })` → a real session (`access_token` + `refresh_token`).
3. Drive `@supabase/ssr` `createServerClient` with an **in-memory capturing cookie jar**; `setSession(...)` + `getUser()` makes the library serialize the session into the exact `sb-<ref>-auth-token` cookie the server expects (correct format/chunking — no manual encoding).
4. Send that as the `Cookie` header to a running `next dev` (`POST http://localhost:3210/api/aria/ask`).

Every multi-turn probe captures `conversation_id` from turn 1 and sends it on turn 2+ exactly as the browser does, then queries `aria_conversations` for the **structural** assertion. This harness is the template future audits should reuse — it exercises the **real handler's own conversation read/write**, not the planner.

---

## PART 3 — Results (real HTTP, response + DB-structure)

| Probe | Response correct? | DB-structure correct? |
|---|---|---|
| **1. Coreference** — "who is my best customer" → "what does she buy" → "how often does she visit" | ✅ T1 names **Charlotte Nguyen** ($557.50 / 24 visits); T2 resolves "she"→Charlotte (no "not sure who"); T3 still resolved | ✅ **same `conversation_id` all 3 turns**, `message_count=6` (one row, no split) |
| **2. Multi-turn promo edit** — "10% off iced coffee" → confirm → "actually make it 15%" → confirm → "change it to 20%" → confirm | ✅ each step "Done — updated … to 15%/20% off"; `update_promotion` not new-create, no bulk misfire | ✅ **exactly 1 promo row**, `discount_percent=20`, `percentage_discount` (zero dupes) |
| **3. "What did you just do?"** | ✅ "I updated your iced coffee promotion from 15% off to 20% off" | ✅ matches **3 `aria_action_log` rows** (1 create + 2 update_promotion) — claim = DB |
| **4. Over-answering** — "who is my best customer" | ✅ **36 words**, no council, no advisory/strategy block, no alarm | ✅ `used_council=false` (data_lookup lane); "how do I grow my revenue" → `used_council=true` (strategic still fires) |
| **5. Edit-intent generally** — "actually make it 15%", "change it to 20%" | ✅ both mapped to `update_promotion` of the last entity (not new-create, not bulk) | ✅ (same single promo row as #2) |

---

## PART 4 — Regression (real HTTP)

| Check | Result |
|---|---|
| Brand-new question (no prior id) starts a FRESH conversation | ✅ "what is photosynthesis" → **new distinct `conversation_id`**, separate row (no over-merge) |
| Promo column correctness still holds (single-action DB guarantee) | ✅ created promo: `promotion_type=percentage_discount`, `discount_percent` set (CONSOLIDATE-1 writer intact) |
| Promo idempotency / update path still holds | ✅ 3 edits → 1 row (CONSOLIDATE-2 + RC4 intact under the live flow) |
| Action audit log written for every write | ✅ 3 `aria_action_log` rows for the promo create + 2 updates (FORTRESS audit intact) |

---

## COVERAGE STATEMENT

**5 multi-turn flows run through the real authed HTTP endpoint; 5 with structural DB assertions (conversation-row / promo-row / action-log counts).** The handler did its own conversation read/write — the planner was NOT called directly. Auth was solved via admin-generateLink → verifyOtp → ssr-cookie-capture (documented above for reuse). Outbound `send_email_now`/`send_sms_now` were **not fired** (real sends) — out of scope for this conversation audit.

---

## VERDICT & REMAINING NOTES

**Ask Aria's live multi-turn chat path is correct end-to-end:** turns thread into one conversation, coreference resolves over HTTP, edits update the single entity, recall matches the audit log, lookups are concise, and new questions start fresh — all proven structurally, not just by output text.

- **Over-answering fix detail:** the data-lookup brevity directive ([route.ts](../src/app/api/aria/ask/route.ts), after the memory block) dropped "who is my best customer" from **159 → 36 words** with the advisory campaign paragraph removed. Strategic questions ("how do I grow") still fire the full council.
- **Minor (LOW):** "what does she buy" answers honestly that line-item purchase detail isn't queryable for a named customer (a data-model limitation, not a coreference failure — the referent *is* resolved).
- No new bugs. Sip residue 0 (baseline: 1 promo, 74 products, 0 recent conversations).
