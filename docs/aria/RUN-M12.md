# RUN-M12 · ARIA STOPPED BEING ARIA

5 September 2026. Autonomous run, RULE 20. Written incrementally — a halted run still leaves a
readable log.

---

## PHASE 0 — GATE

Read `RUN-M11.md`, `RUN-M11B.md` and `docs/aria/ARIA-MEGA-SPRINT-INDEX.md` (the last for one
purpose only: M13 owns sub-agents and steering; nothing below trespasses on it).

**All four measured facts in the brief verified against the live database, not taken on trust:**

| claimed | measured |
|---|---|
| `agent_key='ask_aria'`, 4 Sep 12:48:25 Melbourne | ✅ exact |
| model `claude-haiku-4-5` | ✅ `claude-haiku-4-5-20251001` |
| 1,089 input / 334 output, success true | ✅ exact |
| `aria_plans` rows = 0 | ✅ still 0 |

The row's `response_summary` adds one fact the brief did not have: **`tools:0/iter:1/think:0`** —
one iteration, no tool ever called.

---

## PHASE 1 — REPRODUCED, NOT REASONED ABOUT ✅

**Commit:** `<phase-1>` · report only, no code.

### The path

`src/app/api/aria/ask/route.ts:818` — a **general-question fast-path**:

```ts
if (!isCoreferentialFollowup && (intent.type === 'general'
    || ariaIntent.intent_type === 'general' || ariaIntent.intent_type === 'smalltalk')) {
```

### The assembled prompt, captured — not inferred

The whole system message, verbatim (`route.ts:821`):

```
You are Aria — an AI assistant for an Australian small business owner. The owner has asked a
general question (not about their business data or operations). Answer it directly, helpfully,
and competently as a knowledgeable general assistant.

Rules:
- Answer the question thoroughly and accurately
- Do NOT force a business angle or mention the owner's business
- Do NOT call business data tools — only use web_search or fetch_url if helpful
- Do NOT produce business jargon or vague business-shaped filler
- Be direct and useful, like a smart, well-informed friend
- Australian context where relevant (e.g. local laws, products, services)
```

That is **781 characters**. Tools attached: **2** (`fetch_url`, `web_search` — 1,595 characters of
schema). User message: `Tidy up before the weekend`. Nothing else. No business context, no
groundTruth, no data tools, no iron rules.

**What is absent, checked key by key:** `café`/`cafe` ✗ · `Sip` ✗ · `takings` ✗ · `revenue` ✗ ·
`stock` ✗ · `roster` ✗ · `till` ✗ · `constitution` ✗. The word "business" appears — **inside the
instruction not to mention it**.

### Side by side with a grounded turn

| | this turn | council synthesis (median, last 30) |
|---|---|---|
| input tokens | **1,089** | **10,323** |
| system prompt | 781 chars, general-assistant | full grounding rules + advisor findings + business context |
| tools | 2 (web only) | the full data-tool set |
| business data | **none** | the turn's queried rows |

### The reproduction

Sent through the same assembly, same model, same tools:

```
input_tokens 1089   ←  EXACTLY the founder's turn
output_tokens 350

I'd be happy to help you get organized before the weekend! Here are some practical tidying tips:
**Quick wins (30 minutes)**
- Clear surfaces: desks, tables, benches—put things away or bin what you don't need
- Do a quick sweep or vacuum of high-traffic areas
- Wipe down kitchen bench and sink
- Put dirty clothes in the wash
**Bedroom & bathrooms (20 minutes)**
- Make the bed
- Clear bathroom be…
```

**Same lane, same tokens, same bedroom.** Logged as `agent_key='m12_repro'` so it is
distinguishable in the ledger and is not deleted — it was a real call and the ledger should say so.

### ⚠️ A PREMISE IN THE BRIEF, CORRECTED

> *"Aria's own identity and constitution were not in the prompt."*

Half right, and the other half is worse. **The identity string IS there** — the prompt opens
"You are Aria". What is absent is the constitution. And what is *present* is an explicit instruction
to **not** be Aria about the business: *"Do NOT force a business angle or mention the owner's
business."*

**This was not an omission. It is a lane that deliberately strips the business, working exactly as
designed.** The design is the defect. That matters for the fix: there is no missing `+ constitution`
to add back — a whole path was built on the premise that some questions should be answered by a
general assistant wearing Aria's name.

### What actually chose that lane — measured, not guessed

Both classifiers, run on the real message:

```
classifyIntent      → {"type":"smalltalk","confidence":"high","complexity":"simple"}
classifyAriaIntent  → {"intent_type":"general","needs_business_data":false,
                       "routing_reason":"personal lifestyle/housekeeping task unrelated to
                                         business operations"}
route.ts:818 general fast-path taken? → true
```

**`classifyAriaIntent` returned `general`, reading "tidy" as housekeeping.** The condition is an
**OR across two independent classifiers**, so either one saying `general` is enough.

Both classifiers carry an explicit rule against exactly this — `intent.ts:27` says *"if the question
could plausibly be about the business OR general … classify it as question (business)"*, and
`aria-intent.ts:61` says *"NEVER classify business-performance questions as 'general'"*. **The rule
is right and the classification still went wrong**, which is the point: a single ambiguous judgement
call silently drops the owner into a lane where Aria is not Aria. Classifying better is not the fix.

**Neither classifier's fallback is the culprit** — checked, because it was the obvious suspect.
`intent.ts` falls back to `question`, `aria-intent.ts` to `analytical`. Both safe. A failure would
not have produced this.

### ⚠️ DISCOVERED — two model calls per turn that the cost ledger has never seen

`agent_key='intent_classifier'` has **zero rows in `aria_ai_calls`, ever**, across **412**
`ask_aria` calls. Both classifiers run on every turn and neither is logged. AI-COST-AUDIT-1 found
three unlogged call paths and said the true spend was unknowable after the fact; this is a fourth,
running twice per turn. **Not fixed here** — it is a cost-ledger change, and this sprint has enough.
