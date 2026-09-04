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

That is **639 characters** — measured twice off the source literal. Tools attached: **2**
(`fetch_url`, `web_search` — 1,595 characters of schema). User message:
`Tidy up before the weekend`. Nothing else. No business context, no groundTruth, no data tools, no
iron rules.

> ⚠️ **I first wrote 781 here and it was not supported by anything I observed.** The probe printed a
> character count, my captured output was truncated before that line, and I published a number
> anyway. Caught by re-measuring the source literal and finding 639. **The token count is the
> claim that matters and it is measured: 1,089, matching the founder's turn exactly.** Recorded
> rather than quietly corrected — GROUNDING-TEETH applies to my own reports, and a fabricated
> figure in a run log is the same defect this sprint is about.

**What is absent, checked key by key:** `café`/`cafe` ✗ · `Sip` ✗ · `takings` ✗ · `revenue` ✗ ·
`stock` ✗ · `roster` ✗ · `till` ✗ · `constitution` ✗. The word "business" appears — **inside the
instruction not to mention it**.

### Side by side with a grounded turn

| | this turn | council synthesis (median, last 30) |
|---|---|---|
| input tokens | **1,089** | **10,323** |
| system prompt | 639 chars, general-assistant | full grounding rules + advisor findings + business context |
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

---

## PHASE 2 — HOW MANY PATHS BUILD AN ASK ARIA PROMPT? ✅

**Commit:** `<phase-2>` · report only, no code.

### ⚠️ THE BRIEF'S PREMISE ABOUT THE COUNCIL IS WRONG, AND IT MATTERS

> *"The council path is known to carry the constitution."*

**It does not.** `IRON RULES` appears **zero times** in `council.ts`. The council carries its *own*
grounding rules — a separately worded 16,596-character block headed `GROUNDING RULES — ABSOLUTE —
NEVER BREAK` — which overlaps the iron rules in intent and matches none of them in wording.

**There is no constitution in this codebase.** There are five differently-worded partial ones and
one lane with none. That changes phase 3 from "attach the existing constitution everywhere" to
"there is nothing to attach yet — extract one first."

### Every path that can answer in Ask Aria

Measured from the source; character counts are of the literal.

| # | lane | file:line | constitution | grounding | tools | model |
|---|---|---|---|---|---|---|
| 1 | **general fast-path** | `ask/route.ts:818-866` | ✗ **none** | ✗ **none** | 2 (web only) | **haiku**, hardcoded |
| 2 | main grounded tool-loop | `ask/route.ts:1536` → `:2380` | ✓ the iron rules, 18,171 chars | ✓ business ctx + groundTruth | full set | router |
| 3 | slim data-lookup | `slim-context.ts:39` via `route.ts:2311` | ~ **partial**, 1,382 chars | ✓ must call a tool | `slimTools()` subset | router |
| 4 | council synthesis | `council.ts:387` + `:555` | ~ **its own**, 16,596 + 6,706 chars | ✓ advisor findings | none | router |
| 5 | council sub-brains x4 | `council.ts:256` etc. | ~ per-brain rules | ✓ the data passed in | none | haiku |
| 6 | action planner | `action-planner.ts:141` | ✗ none | ✓ `contextSummary` | none | **sonnet**, hardcoded |
| 7 | accuracy verifier | `ask/route.ts:2528` | n/a — a reviewer | ✓ the context it checks | none | — |

**Four of the seven carry a different, partial version of the same idea. One carries none at all.**
Only lane 2 has the iron rules, and only lane 2 has them because they are typed inline in the route
as a template literal — **not a module, not an import, nothing else can reach them.**

### The wider picture, for scale

`grep -rn "You are Aria" src` (excluding tests): **88 persona strings across 68 files.** Most are
other surfaces (POS chat, daily briefing, roster, studio, staff-talk…) and are out of this sprint's
scope, but they are the same pattern at product scale: every feature that ever needed Aria to speak
wrote its own Aria.

### The classifier is a copy too

Two independent classifiers run **in parallel on every turn** — `classifyIntent` (`intent.ts`) and
`classifyAriaIntent` (`aria-intent.ts`) — with overlapping vocabularies (`general` and `smalltalk`
in both) and different rules. The route then ORs them:

```ts
intent.type === 'general' || ariaIntent.intent_type === 'general' || ariaIntent.intent_type === 'smalltalk'
```

**An OR across two classifiers doubles the chance of the destructive misclassification** and halves
the chance of the safe one. Note the asymmetry: `intent.type === 'smalltalk'` is *not* in the
condition, but `ariaIntent.intent_type === 'smalltalk'` is — so the two classifiers' identically
named verdicts are treated differently, and nothing documents why.

### What this settles for phase 3

- The rail cannot just "attach the constitution": **the constitution must be extracted into one
  module first**, because it exists only as an inline literal in one route.
- The general fast-path is **redundant, not merely wrong**. Lane 2's prompt already contains a
  `GENERAL QUESTION RULE` covering exactly this case — *"If a question is NOT about the business,
  answer it directly and competently as a helpful general assistant — do NOT force a business
  angle"*. Aria can already answer a general question **while remaining Aria**. The fast-path
  duplicates that one instruction and throws away everything else.
