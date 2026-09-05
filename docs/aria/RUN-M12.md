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

---

## PHASE 3 — ONE ASSEMBLY POINT ✅ *(the sprint)*

**Commits:** `ffba10ce` + `ffac26a9` (the rail catching its own test — see below).

### The answer to the turn that started this sprint

Same message, same lane, same model, after the change:

```
I don't have access to your business records right now — no sales data, stock levels, roster,
bookings, or operational details are attached to this conversation.

To help you tidy up before the weekend, I need to know what you're referring to. Are you asking
about:
- Your till/takings — reconciling sales, checking cash drawer, reviewing the week's revenue?
- Your stock — cleaning up inventory records, checking for damaged items, organizing shelves?
- Your roster — confirming weekend staff are scheduled, updating shift assignments?
- Your bookings — reviewing reservations, cancellations, or appointment confirmations?
- Your general admin — organizing files, clearing clutter in the office or workspace?

Or is this just a general question about tidying up your physical space before the weekend?
```

Against `Make the bed. Put dirty clothes in the wash.`

### Moved, not rewritten

The constitution existed only as the first 4,168 characters of a template literal inside
`api/aria/ask/route.ts`. Those characters were lifted **byte-for-byte by a script**, not retyped,
into `src/lib/aria/prompt/constitution.ts`; the route now interpolates the constant, so the grounded
lane's 18,171-character prompt is character-for-character what it was. A test asserts every iron
rule is in the constant and **no longer duplicated in the route**.

### The rail

`assembleAriaPrompt()` prepends `ARIA_CONSTITUTION` unconditionally. **There is no parameter that
removes it, and a test asserts no such parameter exists** — a flag would recreate the bug with an
opt-out. Sections append *after* it, so a lane cannot bury it.

### What was deleted, and what was kept

**Deleted:** the general lane's bespoke 639-character prompt, including the line that caused this —
*"Do NOT force a business angle or mention the owner's business"*.

**Kept:** the lane itself. Deleting it would route every genuinely general question through the
18,171-character grounded prompt — roughly ten times the tokens — to fix a fault that was in the
prompt, not the lane. Its general-question instruction is not lost: the constitution already
contains a `GENERAL QUESTION RULE` saying the same thing. The lane was duplicating one line and
discarding everything around it.

The **slim data-lookup lane** is routed through the rail too. It had a grounding rule and none of
the other iron rules, so a "direct data lookup" could still state a suburb the business had not set
or claim it had created a promotion. Not a smaller need — a smaller prompt.

The general lane passes `businessName: null` deliberately: it runs **before** the business context
is built (`ctx` does not exist at that point in the route), which is precisely why it had no
grounding to lose. Passing a name we have not loaded would be inventing one — IRON RULE 2.

### Enforced, not merely available — and it caught me first

Canon rail guard **rule 9** fails a build that adds a `You are Aria` string under an Ask Aria path
outside the two files that *are* the rail. **Proven to fire, not assumed:**

```
src/lib/aria/ask/bypass-probe.ts:1  [ask-aria-prompt-outside-rail]
```

⚠️ **Then it blocked my own push.** The rule flagged `assemble.test.ts`, whose assertions have to
quote the phrase the rule blocks in order to hold the rule. Test files are now excluded — precision,
not a loosening: no production path gains an exemption, and the probe still fires afterwards.
Committed separately rather than amended, so the record shows the rail catching its author rather
than a guard that looks like it was right first time.

### Cost — RULE 11, measured not estimated

```
input   1,089 → 2,264  (+1,175)
output    350 →   212  (−138 — the honest answer is SHORTER than the invented one)
        = +$0.000485 net per general-lane turn at the haiku rate
AI as-is $0.4622 → $0.4637/biz/day · total COGS $18.65 → $18.70/mo
```

Haiku **is** in `cost.ts` PRICING, so unlike M11's `work_plan` this rate is a lookup, not a proxy.

### Three superseded assertions, rewritten not deleted

PROMPT-CACHE-1 had measured the **old** slim prompt: tools were 87% of the cache prefix, and it
concluded *"no amount of editing the prompt changes whether this path caches"*. **That conclusion is
now false.** Tools are 61.6%; the prompt is 38%; editing it can cross the threshold. The prefix moved
from ~1,476 tokens short of haiku's 4,096 minimum to **381 short** — the constitution closed three
quarters of that gap as a side effect. **Not acted on:** 381 tokens would have to be *written*, not
moved, and that changes a live answer path for a caching outcome nobody has measured against the
real tokeniser.

> ⚠️ **I first wrote "six tokens short" and it was wrong.** My probe divided characters by 3.6; the
> file's own estimator divides by 4, and its choice is what the surrounding arithmetic uses. The
> wrong divisor turned a 381-token gap into a 6-token one — a dramatic, false claim that would have
> invited exactly the padding that file forbids. **Second measurement error of mine this sprint**,
> recorded in the test file rather than quietly fixed.

The RULE 0 extraction-fidelity pin (1,351 chars) is updated to 5,650 under the one condition it was
written to allow — a deliberate prompt change — with an added assertion that the constitution
accounts for the difference rather than drift in the lane's own text.

---

## PHASE 4 — IT MUST SAY WHEN IT CANNOT SEE ✅

**Commit:** `<phase-4>` · `assemble.ts` (+`isGrounded`, +`groundingNotice`),
`ask/route.ts` (main lane spliced), `cannot-see.test.ts` (new, 11 tests).

### ⚠️ ZERO IS NOT ABSENT — the distinction the whole phase turns on

Sip has taken **A$0.00 today**. That is a fact, it came from `pos_sales`, and the honest answer to
"how are we doing" is *"you've taken nothing yet today"* — **not** "I can't see your business". A
predicate that read zero revenue as no-data would make Aria refuse on every quiet morning, which is
worse than the bug being fixed **and would look identical to it**.

So `isGrounded` tests whether the context was **loaded**, and the marker is the business's own
identity: if we do not know its name, nothing else in the object can be trusted. `revenue_today_cents: 0`
on a named business is grounded; the same field with no name is an empty shell.

### The answer changes, it is not disclaimed

`CANNOT_SEE_BLOCK` forbids substituting general advice for the answer — *"generic tips presented in
place of an answer are worse than saying nothing, because the owner cannot tell them apart from a
grounded one"* — and requires Aria to **ask which part of the business** is meant, naming the till,
the stock, the roster, the bookings and the suppliers. That is why the reply above names them.

It also permits answering a genuinely general question briefly, **labelled as such**. Without that
this becomes a refusal machine, which is a different failure.

### Both lanes

| lane | how |
|---|---|
| general fast-path | `grounded: false` hardcoded — it never has data to lose |
| main grounded lane | `${'$'}{groundingNotice(ctx)}` spliced between the iron rules and the tool catalogue |

Same position on both, so a lane cannot bury it and the footer is not true on one lane and false on
the other.

### Mutation check

`groundingNotice` always returning `''` is exactly the pre-fix state; the suite goes red on the
difference, and on the route no longer splicing it.

### NOT done

- **The browser was not opened.** The new answer above came from a live model through the real
  assembly in process, not from a click in the UI.
- `isGrounded` keys off the business name alone. A context that loaded the name but failed every
  data query would read as grounded. That is the right call today — the iron rules already force
  abstention on a missing figure — but it is a judgement, not a proof.

---

## PHASE 5 — THE ROUTER ✅

**Commit:** `<phase-5>` · `intent.ts`, `aria-intent.ts`, `ask/route.ts`, `routing.test.ts` (new,
7 tests), `ai-cost-model.json`.

### ⚠️ THE BRIEF'S FAULT #2 IS WRONG. NO ROUTER RAN.

> *"Wrong model. Judgement work routed to Haiku…"*

`routedModel` is computed at `route.ts:2272`. **The general fast-path returns at `:866`** — more than
fourteen hundred lines earlier. The model was `haiku` because **the lane hardcodes it**, not because
anything classified the request as simple. Establishing that from the code is what this phase was
for, and it changes the remedy: **there was no misrouting to correct.**

### The rule, for the record

```
intent.type === 'escalate'  → opus
sonnetExhausted             → haiku      (budget spent, silently downgraded)
needsSonnet                 → sonnet     (regex over the message + complexity/type signals)
otherwise                   → haiku      ← the default
```

### Haiku was not the fault, and nothing was raised to hide a symptom

With the constitution attached and grounding declared absent, **haiku produced the correct answer**
for the failing message (phase 3). Raising this lane to sonnet would have cost roughly three times
as much and fixed nothing, because the prompt was the fault. A test asserts the lane still asks for
haiku, so a later "fix" by model escalation is a visible change rather than a quiet one.

### What was actually broken here: the decision left no record

- **The general lane logged nothing.** The `[ask-aria] route` line lives 1,400 lines downstream of
  this lane's return, so a turn that took the fast-path left no trace of the decision at all. It now
  logs its lane, model, grounding, both classifier verdicts, `routing_reason`, and **which**
  classifier triggered it — because the condition is an OR and the two disagreed: `classifyIntent`
  said `smalltalk`, `classifyAriaIntent` said `general`, and only the second is in the condition.
- ⚠️ **Both classifier calls were invisible to the cost ledger.** `callAnthropic` gates its
  `aria_ai_calls` insert on `if (params.businessId)` and **neither classifier passed one**, so
  `agent_key='intent_classifier'` had **zero rows, ever**, across 412 `ask_aria` turns while running
  **twice per turn**. Not a bug in the logger — a bug in the call sites. That is why this sprint had
  to re-run the classifiers by hand to find out what chose the lane.

**Fixed and verified live.** The first `aria_intent_classifier` row ever written:

```
agent_key aria_intent_classifier · haiku · role classify · 1,469 in / 80 out · success true
```

### Cost — RULE 11

**This is not new spend. It is spend that was already happening and was invisible.**

```
1,469 in / 80 out on haiku = $0.00187 per call × 2 per turn ≈ $0.0037 per Ask Aria turn
AI as-is $0.4637 → $0.4824/biz/day · total COGS $18.70 → $19.26/mo
```

**The ledger's measured AI spend will rise when this ships; the true figure did not change.** This is
the **fourth** unlogged call path found after AI-COST-AUDIT-1's three — that audit's conclusion, that
true spend was unknowable after the fact, keeps being re-earned.

### PARKED

`sonnetExhausted → haiku` silently downgrades judgement work when the sonnet budget runs out. That
is a real behaviour an owner would never see, but changing it is a spend decision. Named, not taken.

---

## PHASE 6 — MAKE DELEGATE REACHABLE ✅

**Commit:** `<phase-6>` · `AskAriaTransition.tsx`, `delegate-reachable.test.ts` (new, 7 tests).

### ⚠️ IT WAS NOT UNREACHABLE — IT WAS ON THE WRONG SCREEN

The brief says nothing on the surface calls the planner. **A Delegate control does exist**, added by
M11B phase 1 — in the **working** composer, the one you see *after* you have already sent a message.

**The welcome composer had none.** That is where a fresh conversation begins, it is where the owner
was when he typed "Tidy up before the weekend", and its placeholder literally reads *"Ask Aria
anything, or tell her to do it…"* — with no way to tell her to do it.

So `aria_plans` has 0 rows not because the loop is broken but because the door is on the second
screen. This is the `/ax` shape again: four sprints of work behind a door nobody opens.

### The fix

A `🗂` control in the welcome composer, beside voice and send. **The same `delegate()` callback, the
same route, the same guarantees** — a test asserts there are exactly two call sites and exactly one
callback, because two delegation paths is how the two start disagreeing about what a plan is.

RULE 0: the working composer's control is untouched. This adds a second entry point; it does not
move the first.

### ⚠️ VERIFY — WHAT I COULD NOT DO, AND WHAT A HUMAN MUST CLICK

**The sprint asks for a delegated job from the browser creating an `aria_plans` row. I could not do
that, and I have substituted nothing.** I have no authenticated browser session: the test account's
password is a founder-held secret (register #12), and driving the UI needs a real login.

What is proven, in process against production, is the layer beneath: M11B's own run log records a
plan and its four steps written to `aria_plans` / `aria_autopilot_actions`, both database guards
firing with real sqlstates, a genuine end-to-end run, a report generated from the step rows, and the
job reopening from its conversation. What is unproven is the click that starts it.

**Exactly what to click, in order:**

1. Open `/dashboard/ask-aria` — the **welcome** screen, not an existing thread.
2. Type an outcome, e.g. `get the shop ready for the long weekend`.
3. Press **🗂** (beside the microphone and the ↑ send arrow) — **not** ↑. Pressing ↑ asks a question;
   🗂 delegates a job.
4. Expect a plan card: ordered steps, each marked *Aria can do this* / *NEEDS YOU* / *NEEDS A
   PERSON*, and the line **"Nothing has run. This is the plan."**
5. Press **Approve and run the safe steps**.
6. Expect per-step outcomes and a report whose first line is the failure count when there is one.

**Then confirm it landed** — this is the check that settles it:

```sql
select id, status, request, (report is not null) as has_report
from aria_plans order by created_at desc limit 1;

select step_index, status, requires_stepup, action_type, outcome_note
from aria_autopilot_actions
where plan_id = (select id from aria_plans order by created_at desc limit 1)
order by step_index;
```

A row in `aria_plans` with its steps is the whole of phase 6's VERIFY. **If it is not there, this
phase failed regardless of what the tests say**, and the first thing to check is the browser console
for the `POST /api/aria/works/plan` response.

### Mutation check

Replacing `delegate(welcomeInput)` with `ask(welcomeInput)` puts Delegate back behind the first
message and drops the entry-point count from two to one. The suite goes red.
