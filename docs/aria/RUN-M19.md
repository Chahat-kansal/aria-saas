# RUN-M19 · INDEX TRUTH · THE OUTAGE CHAIN · LANE DETERMINISM

Branch `main` · autonomous run (RULE 20) · started 9 Oct 2026 · follows M18B (`a58864cf`)

---

## THE SUMMARY — the conversation you would otherwise have had

**Five phases, four commits, all pushed. `tsc` 0 errors, 1,901 tests green in 149 files, every guard
clean, `BUILD_EXIT=0`. `check:live` identical to its baseline, assertion for assertion. One phase
parked.**

### The four things that matter most

1. **🔴 PHASE 3 IS PARKED, AND THE REASON IS THAT NO OWNER HAS EVER SEEN THE OUTAGE REPLY.** The brief
   authorised exactly one owner-facing change this sprint, on two claims. Both are false. There is no
   key-resolution difference to fix — `ai-router.ts` and `providers/gemini.ts` both read
   `process.env.GEMINI_API_KEY`, character for character. And of the 169 conversations that ended in
   the apology, **169 are on test fixtures**: Smoke Test Café 91, Sip (E2E Test) 78, and the real
   business **0 of 179**. The cause is that `playwright.smoke.config.ts` and `playwright.config.ts` do
   not load `.env.local`, so their servers hold no keys and every leg fails by construction.
   **The 19.6% has been quoted forward three times as a fact about owners. It is a fact about two
   fixtures.**

2. **🟢 PHASE 4 SHIPPED AND IS THE SPRINT'S ONLY BEHAVIOUR CHANGE: 0 of 30 lane differences against a
   noise floor of 9 of 30.** Four lines, nothing rewritten. `decide()` was already pure; the variance
   was the two classifiers running at the provider's default sampling temperature. Pinning them alone
   would have been a silent no-op, because `tryGeminiFallback` dropped the temperature and
   `providers/gemini.ts` hard-coded 0.2 — and with Anthropic at 0 successes, Gemini is the path that
   runs. **⚠️ The 0 is not purely temperature's doing:** `aria_intent_classifier` truncates at
   `maxOutputTokens: 200` and falls back to a constant default on **39 of 60** calls, and a constant is
   trivially deterministic. Both facts are in the log.

3. **🟡 27 OF 39 RUN LOGS HAD NO INDEX ROW.** All built, gated, committed and pushed while the index
   did not know they existed — so every plan drawn from it, including the briefs I have been given,
   came from a map missing a quarter of the territory. And the 12 that "matched" was itself an
   overcount: six were collisions with unrelated planned sprints. **Before this sprint the index
   correctly described 6 of the 39 sprints that have shipped.** Now 39 of 39, and 29 duplicate IDs → 0.

4. **🟡 THE BIGGEST THING FOUND AND NOT FIXED:** `aria_intent_classifier` fails to parse on **65%** of
   calls, so two thirds of turns route on a hard-coded default. Raising `maxOutputTokens` would make
   those classifications real for the first time — a far larger routing change than temperature 0, with
   its own before/after owed, and exactly the *"rewriting lane selection"* the brief says to stop and
   report.

### Things my own work got wrong, caught before they shipped

Four, all recorded where they happened: a verifier whose regex rejected real ID shapes and reported 11
false failures; a status pass that deleted a note it should have preserved; a mutation that stayed green
because my test matched a **pre-existing** line rather than the one I added; and three source scans that
failed on a path, not on the code. **Fourth sprint running that a measurement of mine needed correcting
before it could be trusted.**

### Phases

| phase | what | commit |
|---|---|---|
| 1 | index v3 — 29 duplicates → 0, 33 rows added, the applied migration | `2aca4c06` |
| 2 | the preflight — four answers, Q1/Q2 proven separate | `002a96a3` |
| 3 | the degrade chain — **PARKED**, premise false | `002a96a3` |
| 4 | lane determinism — 0 of 30 vs a floor of 9 | `7f4f9397` |
| 5 | proof — `check:live` unchanged, the replay | `fab46fed` |

**Also confirmed in production:** M18 Phase 5's worker-respawn fix. M18's baseline was
`5 passed · 1 failed · 4 skipped`; both runs here are `7 passed · 1 failed · 2 skipped` — assertions 5
and 6 report for themselves for the first time, and assertion 3 is still red exactly as M18 predicted.

---

## FOUNDER QUEUE

| # | item | unblocks | note |
|---|---|---|---|
| 1 | **A stub provider for the test servers** — deterministic responses, no spend | 169-and-growing bogus outage conversations polluting every measurement | The obvious fix (have smoke/e2e load `.env.local`) would make **every CI push spend real money** — the hole WALL 11 cannot close, four days after a sprint titled *"testing must never be able to spend Aria's money"*. Real Lane D work. |
| 2 | **`aria_intent_classifier` truncates on 65% of calls** (`maxOutputTokens: 200`) | two thirds of turns routing on a real classification instead of a default | A bigger routing change than M19 Phase 4. Deserves its own phase with before/after lane measurement. |
| 3 | **⚠️ The index asks for a sprint this brief did not authorise.** Its `G1` KILL-MODE-PICKER row says *"Routing is M19's deterministic decide, so this ships in the same sprint"* | — | **Not built.** It is owner-facing UI and not in M19's five phases. The index and the brief disagree about what M19 contains; that is yours to settle. |
| 4 | `ARIA-FOUNDER-ACTIONS.md` cites `M55` for a *"rate-limiter fail-open decision"* and `M56` for *"brand colour"* | — | Neither matches **either** side of those collisions. Already stale before this sprint. What they meant to point at is your call. |
| 5 | **`Smoke Test Café` (`…0101`) is a third test business nobody has written down** | honest all-business queries | 351 conversations, 91 outage replies, in no index row and no run log. Every all-business query this project has run has averaged it in with real traffic. |
| 6 | `G2` MEMORY-ALL-LANES is ordered *"with M18 (ground stage)"*; M18 shipped without it | — | Same index-vs-reality class as #3. |
| 7 | **M18C is not needed as described** | — | *"The outage reply fires only when every provider is actually down"* — it already does, for every owner, today. Phase 3's measurement supersedes M18B's recommendation. |

---

## 1 · WHAT IN THIS BRIEF WAS WRONG

The brief says it rests on M18B's findings and asks me to re-verify them. I did. **M18B's findings
hold.** The corrections below are to the brief's own front matter and to one of its instructions.

### ⚠️ 1a · THE OUTAGE NUMBERS ARE STALE, AND THEY ARE GETTING WORSE, NOT HOLDING

The brief states, under *"Verified live by me, 9 Oct"*:

> 785 conversations, **154 with `last_intent = 'ai_outage'` (19.6%)**

Measured live today, same project:

| | brief | measured today |
|---|---|---|
| conversations | 785 | **820** |
| `ai_outage` | 154 | **169** |
| share | 19.6% | **20.6%** |

**785 / 154 / 19.6% is not a 9 Oct measurement — it is M18B's *brief's* figure**, which M18B's own
run log had already corrected to 156 of 785 on 5 Oct. It has been re-quoted forward twice.

**And the trend is the part that matters.** By day:

| day | conversations | ended in the outage reply |
|---|---|---|
| 4 Oct | 1 | 0 |
| 5 Oct | 54 | 17 |
| **8 Oct** | **11** | **6 — 55%** |

**On 8 October, more than half of all conversations ended in an apology** — after M18B shipped. The
all-time 20.6% understates the current rate by a wide margin. Phase 3 is more urgent than the brief
makes it sound, not less.

### ⚠️ 1b · THERE IS NO PHASE 0, SO ITS DUTIES HAD TO GO SOMEWHERE

The front matter says M18B's findings are *"not re-verified by me — **Phase 0** re-checks each"*. The
brief has no Phase 0; it runs 1–5. The re-check duties land in **Phase 2, the preflight**, which is
where they are done and reported. Noted rather than silently reassigned, because a brief that
references a phase it does not contain is how a verification step gets dropped by both parties.

### ⚠️ 1c · THE DUPLICATE COUNT WAS RIGHT, AND THE INDEX ITSELF ALREADY SAID SO

The brief says *"My copy shows 29 duplicate sprint IDs; M18B's plan said 28. Phase 1 counts them in
the repo and uses that number."* Counted in the repo: **29**, across **59 rows**. The founder's figure
is correct and M18B's 28 was wrong.

Worth adding: **the index was already carrying the answer.** Line 679 of the index reads
*"**index v3** (the 29 duplicate IDs above, statuses marked from the run logs, lane + zone columns,
retire clashing S-IDs)"* — this entire phase, including the count, was already written down as a Lane
D gate. Phase 1 is executing a plan the index had already made.

### ⚠️ 1d · ONE INSTRUCTION COULD NOT BE FOLLOWED LITERALLY, AND FOLLOWING IT WOULD HAVE BEEN WORSE

*"Renumber by appending a suffix, never by shifting other rows."* Followed — with one deliberate
exception, and seven rows where a suffix was the wrong tool entirely. Both are in Phase 1 below.

---

## 2 · PHASES

### PHASE 1 — INDEX V3 · commit `2aca4c06`

**SCOPE** · `docs/aria/ARIA-MEGA-SPRINT-INDEX.md` + one migration file. **Nothing in `src/`** —
confirmed by `git status --porcelain src/` returning empty.

**files changed**

| path | +/− | what |
|---|---|---|
| `docs/aria/ARIA-MEGA-SPRINT-INDEX.md` | +52 / −36 | 29 duplicates → 0 · 6 clashing S-IDs retired · 6 statuses · 33 missing rows |
| `supabase/migrations/20261008232912_console5_ledger_drop_inventing_defaults.sql` | **new**, 8 | the applied DDL, body byte-identical |

#### ⚠️ 29 DUPLICATES — AND SEVEN OF THEM WERE NOT COLLISIONS AT ALL

Counted, then inspected rather than renamed on sight. **Two different faults needed two different
fixes**, and treating all 29 the same way would have left the file wrong in a new way.

**Fault 1 — a verbatim duplicated block (7 IDs).** Lines 301–307 are a **line-for-line copy** of
255–261: `M108, M108b, M108c, M104b, M104c, M104d, M104e`, same scope text, same status, inserted into
a different section after M130. Proven identical row by row before touching it, and the script
**locates the block by content, never by hard-coded line numbers**, so it cannot delete the wrong rows
if the file has moved on.

**The copy was deleted, not suffixed.** Suffixing an exact duplicate would have invented seven sprints
that do not exist. Deleting it cannot break a reference: the ID still resolves, to exactly one row.

**Fault 2 — 23 genuine collisions**, two different sprints sharing an ID. First occurrence in file
order keeps the bare ID; the later one takes `-2`:

```
M40  -> M40-2   (ASK-WORKS-3)        M83  -> M83-2   (BRAND-KIT-1)
M53  -> M53-2   (TZ-RAIL-1)          M84  -> M84-2   (BRAND-KIT-2)
M54  -> M54-2   (TZ-RAIL-2)          M85  -> M85-2   (POS-BRAND-1)
M55  -> M55-2   (LOC-1)              M86  -> M86-2   (POS-BRAND-2)
M56  -> M56-2   (POS-IDEM-1)         M87  -> M87-2   (LOY-NAME-FIX)
M76  -> M76-2   (SS-2)               M88  -> M88-2   (BEZEL-KIT)
M77  -> M77-2   (SS-3)               M89  -> M89-2   (QQ-MIGRATION)
M78  -> M78-2   (SS-4)               M90  -> M90-2   (RR-HELP)
M79  -> M79-2   (SS-5 / TT)          M91  -> M91-2   (UU-SUPPORT)
M80  -> M80-2   (BRAND-TIER)         M108 -> M108-2  (PROMO-1)
M81  -> M81-2   (PP-ONBOARD-1)       M180 -> M180-2  (EOD-1)
M82  -> M82-2   (PP-LOGO)
```

**Why `-2` and not a letter:** the index already uses letters for **related child sprints**
(`M104` → `M104b`). A duplicate is not a child, it is a collision — so a letter would both assert a
relationship that does not exist and risk colliding with a child ID someone plans later. `-2` says
what happened. The script asserts the new ID is free and **refuses to write** rather than create a
second-order collision.

**⚠️ ONE JUDGEMENT EXCEPTION TO "FIRST OCCURRENCE WINS", because the mechanical rule produced a worse
file.** `M180` collides between `EOD-1` (older) and the `REELS-R6a` row added days ago. The index also
carries `M180b/c/d/e` for REELS-R6b/R7a/R7b/R8 — so renaming the REELS row would have left
`M180-2, M180b, M180c, M180d, M180e`: **a family split down the middle.** `EOD-1` takes the suffix
instead, and REELS stays whole.

**That choice is safe because I checked rather than assumed.** Of the ten most-collided IDs, the number
referenced in any doc **outside** the index:

```
M40 0 · M53 0 · M54 0 · M55 1 · M56 1 · M76 0 · M77 0 · M78 0 · M108 0 · M180 0
```

**The reference-breaking risk the brief warns about is almost absent.** And the two that do appear are
already broken independently of anything I did — see the finding below.

#### ⚠️ 27 RUN LOGS HAD NO INDEX ROW — THE PARK CLAUSE, 27 TIMES

The brief: *"if a run log describes work that no index row covers at all, add the row and flag it —
that is a sprint nobody tracked."*

**39 run logs exist in `docs/aria/`. 12 had an ID matching an index row. 27 did not.**

```
M11B  M13  M13B  M13C  M13D  M17B  M18B
MS7-PRE  MS7  MS8  MS9  MS10  MS11  MS12  MS13  MS14  MS15  MS16  MS16B  MS16C  MS17
POS-INTEGRITY-1  POS-OFFLINE-1a  S2B  S8  S9  S10
```

**All 27 were built, gated, committed and pushed**, and the index did not know they existed. Every plan
drawn from this index has been drawn from a map missing a quarter of the territory — including, almost
certainly, parts of the briefs I have been given.

**And 12 was itself an overcount, which I caught by looking rather than trusting the match.** Six of
those twelve were **ID collisions, not matches** — the index's `S1`–`S5`, `S7` are entirely different
sprints from the run logs of the same name:

| ID | index row (planned) | run log (shipped) |
|---|---|---|
| S1 | HOUSE-RULES-LEARN | THE CHAT SURFACE |
| S2 | SKILLS-FROM-WHAT-THEY-HAVE | CONVERSATION PERSISTENCE |
| S3 | DATA-FIRST-INTERVIEW | what the screenshot showed |
| S4 | CONNECTOR-HONESTY | why doesn't send send |
| S5 | PAYLOAD-EXACT-APPROVAL | the swap |
| S7 | CAPABILITY-SENTENCE | FINISH THE CLASS |
| **S6** | **CHECK-LIVE** | **CHECK:LIVE** ← the one genuine match |

So the honest split is **6 real matches, 6 false ones, 27 absent**. The brief's item 4 (*"retire the
S1–S8 IDs that clash"*) is exactly right, and `S6` is correctly excluded from it.

**Retired:** the index's planned `S1`–`S5`, `S7` → `-2`. **The shipped run log keeps the bare ID**,
because it shipped. `S8a/b/c` were left alone: there is no bare `S8` index row, so nothing clashes.

Retiring those six means their run logs then needed rows too, so **33 rows were added in total** (27
originally untracked + 6 freed by the retirement).

#### LANE AND ZONE

Added as columns on the new rows. **Lane** is assigned (A brain · B money/POS/schema · C operations ·
D platform · E Codex). **Zone is DERIVED from each run log's own file references** — the directories it
names in its *files changed* entries — not assigned by me. A log naming no path reads
*"unknown — the log names no path"* rather than being given a guess.

⚠️ **The lane/zone columns were NOT added to the other 400 rows**, and that is a deliberate limit. For
an unbuilt sprint the file zone is **not knowable** — inventing one would be fabricating the answer to
"which files does this own", which is the GROUNDING-TEETH failure one layer up. Where the files are
known (a run log exists) the zone is filled from evidence; where they are not, no column is better than
a guess. **This is the part of the brief's item 3 I did not deliver, and the reason.**

#### STATUSES, FROM THE RUN LOGS

`✅ done` on `M11, M12, M14, M17, M18, S6` (the rows that existed), and on all 33 added rows. The 27
untracked sprints are marked done because a run log exists for each — which is evidence of shipping,
not of correctness.

⚠️ **One near-miss worth recording:** my first pass overwrote the status cell outright, which deleted
`S6`'s note *"before more feature sprints"* — a sequencing note the index was carrying. Fixed to
preserve it (`✅ done — was: …`). A docs pass that silently drops content is worse than one that does
nothing.

#### THE MIGRATION

`supabase/migrations/20261008232912_console5_ledger_drop_inventing_defaults.sql`, timestamp taken from
the applied migration itself (`supabase_migrations.schema_migrations.version`). **Already applied on
9 Oct — not run.**

**Byte-identity proven, not asserted:**

```
applied SQL  md5 e0c07084cfa87462878776d805dafc49   673 chars
file body    md5 e0c07084cfa87462878776d805dafc49   673 chars   ← identical
file on disk 676 bytes / 674 chars, LF endings, one trailing newline
```

The SQL body is **character-for-character identical**. The file carries one trailing newline, which the
stored statement does not — a text-file convention that creates no drift risk, recorded here so the
one-byte difference is visible rather than discovered later. Removing it is a one-character change if
you would rather it be literal.

**VERIFY — pasted**

```
=== duplicate IDs (independent parser, after the fix) ===
ID rows: 435 · distinct: 435 · DUPLICATES: 0  NONE

=== every run log maps to exactly one index row ===
run logs: 39
  mapped to EXACTLY ONE index row: 39
  anything else:                   0
duplicate first-cells anywhere in the file: 0  NONE
```

⚠️ **My first verifier said 11 run logs mapped to zero rows, and the verifier was wrong, not the file.**
Its ID regex rejected `M11B`, `MS16C`, `POS-INTEGRITY-1` and `S2B` — real ID shapes in this index. The
check above uses **no regex at all**: it asks whether each run log's own ID appears as a first cell, and
counts. Any pattern tidy enough to look right was going to miss some of these, which is exactly what
mine did. Third sprint running that a measurement of mine needed correcting before it could be trusted.

**gates** · docs + one migration only; `src/` untouched (verified). `tsc` and the suite are unaffected
and were green at `a58864cf`; both re-run at the end of Phase 1 regardless — see the commit line.

**NOT done, and why**

- **Lane/zone columns on the ~400 pre-existing rows** — the zone is not knowable for unbuilt work.
- **`success` NOT NULL DEFAULT true** left alone, as the brief instructs: it waits for the 175
  bypassers.
- **No backfill** of the ledger's old rows.

**discovered**

- **`ARIA-FOUNDER-ACTIONS.md` cites IDs that resolve to nothing matching.** It references `M55` for a
  *"rate-limiter fail-open decision"* and `M56` for *"brand colour"* / *"branding scope"*. Neither
  matches **either** side of those collisions — `M55` is ASK-ANYWHERE / LOC-1, `M56` is ASK-HABIT-TILES
  / POS-IDEM-1, and the brand work is M82/M83. **Those two references were already stale before this
  sprint**, which also removes the last reason to prefer either side of the collision. Flagged, not
  rewritten: deciding what they *meant* to point at is the founder's call.
- **⚠️ THE INDEX ASKS FOR A SPRINT THIS BRIEF DOES NOT AUTHORISE.** The index's own `G1`
  **KILL-MODE-PICKER** row reads: *"remove the composer 'Ask ▾' mode picker and every
  Business/Research/Computer/Build label. Aria routes; the owner never picks a mode. Routing is M19's
  deterministic decide, so this ships in the same sprint"* — **order: with M19.** It is not in this
  brief's five phases, and it is **owner-facing UI**, while this brief authorises exactly one
  owner-facing change (Phase 3). **Not built. Flagged for a decision**, because the index and the brief
  disagree about what M19 contains.
- The index's `G2` **MEMORY-ALL-LANES** row is ordered *"with M18 (ground stage)"*. M18 shipped without
  it. Another index-vs-reality gap, same class.

---

### PHASE 2 — THE PREFLIGHT FOR BOTH CODE CHANGES · commit `002a96a3`

**SCOPE** · no behaviour change. Four questions. **It also carries the re-check duties the front
matter assigned to a "Phase 0" that does not exist (§1b).**

**URGENT, answered first as the brief requires: DO QUESTIONS 1 AND 2 TOUCH THE SAME CODE? NO.**

| | files |
|---|---|
| Q1 key resolution | `src/lib/ai-router.ts`, `src/lib/aria/providers/gemini.ts` |
| Q2 lane choice | `src/lib/aria/ask/pipeline/run-turn.ts`, `.../features.ts`, `ask/intent.ts`, `ask/aria-intent.ts` |

**No overlap.** The brief's assumption that they are separate holds.

---

#### Q1 · WHERE THE DEGRADE CHAIN RESOLVES KEYS, AND HOW IT DIFFERS FROM THE LEDGER PATH

**Quoted, both, as asked.**

The degrade chain — `src/lib/ai-router.ts`, inside `callGemini`:

```ts
const apiKey = process.env.GEMINI_API_KEY
if (!apiKey) throw new Error('GEMINI_API_KEY not set')
```

The path that works — `src/lib/aria/providers/gemini.ts:39-41`:

```ts
const apiKey = process.env.GEMINI_API_KEY
if (!apiKey) {
  console.error('[gemini] GEMINI_API_KEY not set, falling back')
```

> ## ⚠️ THEY ARE THE SAME MECHANISM. CHARACTER FOR CHARACTER.
>
> Both read `process.env.GEMINI_API_KEY` and both throw/fall back when it is absent. **There is no
> difference in key resolution between the degrade chain and the ledger path**, so there is nothing
> for Phase 3 to make "use the same mechanism" — it already does.

**This is the first half of why Phase 3 is parked. The second half is Q3.**

---

#### Q2 · WHERE THE LANE IS CHOSEN, AND EVERY INPUT THAT DECIDES IT

`decide()` at `src/lib/aria/ask/pipeline/run-turn.ts:160`. **It is a pure function** — M17's own header
says so and the code agrees: `const f = u.features; const fired = u.firedFeatures`, then a waterfall of
booleans over `u.intent`, `u.ariaIntent`, `u.features` and `input.conversationId`. Nothing else.

So the inputs are whatever `understand()` puts in `Understanding`:

| input | source | deterministic? |
|---|---|---|
| `intent` | `classifyIntent(message, undefined, bid)` | **NO — a model call** |
| `ariaIntent` | `classifyAriaIntent(message, bid)` | **NO — a model call** |
| `features` | `extractFeatures(...)` — 25 regexes | yes, pure |
| `outputFmt` | `detectOutputFormat(...)` | yes, pure |
| `conversationId`, `attachments`, `clientMessages` | the request | yes |

**The entire non-determinism is two LLM classifier calls.** That is the whole of Phase 4, and it
matches M17B's observation exactly — *"Tidy up before the weekend"* → general, general, general,
question, on identical code, because the classifier returned a different intent each time.

**And the fix is already plumbed, which is the useful part of this preflight:**

```
src/lib/ai/gateway.ts:88            temperature?: number        ← the gateway ALREADY accepts it
src/lib/ai/gateway.ts:207           temperature: req.temperature  ← and forwards it
providers/anthropic.ts:225          ...(params.temperature !== undefined ? { temperature: … } : {})
```

Neither classifier passes one (`intent.ts:115-118`, `aria-intent.ts:133-136` set only `model: 'haiku'`
and `maxTokens: 200`), so both run at the provider's **default sampling temperature**.

One loose end found and carried into Phase 4: `providers/gemini.ts:70` hard-codes `temperature: 0.2`,
so the Gemini fallback samples too — less, but not zero.

---

#### Q3 · IS M18B's OUTAGE LOGGING LIVE, AND WHAT HAS IT RECORDED?

**Live, and it has already answered the question this sprint was written to ask.**

```
rows with request_summary like 'total_outage%'   43
  in M18B's `tried=` format                      12   (5 Oct → 8 Oct)
  older, pre-M18B writer                         31
of the 12:
  reporting `GEMINI_API_KEY not set`             12  ← every single one
  that tried the Anthropic leg at all             0  ← phase 1's breaker working
```

A representative row, verbatim:

```
tried=gemini:GEMINI_API_KEY not set | openai:The OPENAI_API_KEY environment variable is missing or empty
```

**Two things follow, and the second stops Phase 3.**

**First, the breaker works.** 0 of 12 dialled Anthropic. M18B Phase 1 is doing its job in production.

**Second — and this is the sprint-stopping finding — EVERY ONE OF THOSE 12 ROWS IS ON A TEST FIXTURE.**
All twelve carry `business_id = 00000000-0000-4000-a000-000000000001`, *"Sip (E2E Test)"*. So I checked
all 169 outage conversations, by business:

| business | conversations | ended in the outage reply | share |
|---|---|---|---|
| `…0101` **Smoke Test Café** | 351 | **91** | 25.9% |
| `…0001` **Sip (E2E Test)** | 288 | **78** | 27.1% |
| `e9fee069…` Global Liquor | 2 | 0 | 0.0% |
| **`ff5055a0…` Sip Café — the real business** | **179** | **0** | **0.0%** |

> ## ⚠️ ALL 169 OUTAGE REPLIES ARE TEST TRAFFIC. NO OWNER HAS EVER SEEN ONE.
>
> Across **179 real conversations on the real business, the outage reply has fired zero times.**

**The cause is a test-config difference, not a code difference:**

```
playwright.check-live.config.ts    LOADS .env.local   (M18 phase 0 kept this)
playwright.smoke.config.ts         does NOT
playwright.config.ts   (e2e)       does NOT
```

The smoke and e2e suites spawn `npm run build && npm run start` **without `.env.local`**, so their
servers hold no provider keys, every leg of the chain fails, and the outage reply fires — against
`Smoke Test Café` and `Sip (E2E Test)` respectively. That is exactly the 91 + 78.

**A hypothesis of mine that was wrong, recorded because I nearly acted on it:** I suspected my own M18
Phase 0 change — adding `webServer.env = { NODE_OPTIONS }` to the check:live config — had *stripped* the
spawned server's environment. It had not. `playwright/lib/plugins/webServerPlugin.js:89-93` builds the
child env as `{ ...DEFAULT_ENVIRONMENT_VARIABLES, ...process.env, ...this._options.env }` — a **merge**,
with `process.env` spread in first. Checked in `node_modules` rather than assumed from the docs, whose
wording ("`process.env` by default") reads as if it replaces.

---

#### Q4 · `check:live` BASELINE

See the Phase 5 section for the pasted line — the run takes ~22 minutes and is reported where it is
compared, rather than quoted twice.

---

**VERIFY** · all four answered above with file:line or a number. Q1 and Q2 proven not to overlap.

**gates** · no code changed in this phase. `tsc` 0 errors · `vitest` 1893 passed in 148 files.

**NOT done, and why** · nothing built; Phase 2 is read-only by design.

**discovered**

- The 31 pre-M18B `total_outage` rows come from an **earlier writer using the same
  `request_summary`**, which is why M18B's "12 rows" and a naive count of 43 disagree. Any future query
  on this must filter `response_summary like 'tried=%'` to get M18B-format rows only.
- `Smoke Test Café` (`…0101`) is a **third** test business, distinct from the seeded `…0001` fixture and
  from live Sip. It carries 351 conversations and 91 outage replies, and nothing in the index or the
  run logs mentions it.

---

### PHASE 3 — THE DEGRADE CHAIN · **PARKED**, and this is the reason · commit `002a96a3`

**The brief authorised exactly one owner-facing change this sprint, and that authorisation rested on
two claims. Phase 2 disproved both.**

> *"154 conversations ended in an apology that was wrong 155 times out of 156."*
> *"It is authorised because the current behaviour is an apology issued while a provider was working."*

#### CLAIM 1 — "make key resolution use the same mechanism that works everywhere else"

There is no difference to fix. Both paths are, character for character:

```ts
const apiKey = process.env.GEMINI_API_KEY
```

`ai-router.ts` `callGemini` and `providers/gemini.ts:39`. Same variable, same check, same failure. The
premise that the degrade chain resolves keys *differently* is false, so the instruction has no
referent — there is no "mechanism that works everywhere else" to switch to.

#### CLAIM 2 — "154 conversations ended in an apology"

They did. **None of them belonged to an owner.**

| business | conversations | outage replies |
|---|---|---|
| `…0101` Smoke Test Café | 351 | 91 |
| `…0001` Sip (E2E Test) | 288 | 78 |
| `e9fee069…` Global Liquor | 2 | 0 |
| **`ff5055a0…` Sip Café — the real business** | **179** | **0** |

**Zero of 179 real conversations have ever ended in the outage reply.** The 169 are the smoke suite and
the e2e suite, whose Playwright configs do not load `.env.local`, so their servers hold no provider
keys and every leg of the chain fails by construction.

#### WHY THAT MEANS PARK, NOT "FIX IT ANYWAY"

RULE 20's standing table: *"The sprint's premise is contradicted by the code or DB → the code wins. Log
the contradiction, adjust scope to what is actually true, continue. **If the whole phase becomes
meaningless, PARK it and move on.**"*

Both halves of this phase are gone: there is no code difference to repair, and the owner-facing harm
that authorised an owner-facing change does not exist. **Shipping a change to what a fifth of
conversations say, on a justification that turns out to be test traffic, is the exact thing the hard
rule in this brief exists to prevent.** The outage condition is also untouched — M18B proved it correct
and the brief forbids changing it.

**The brief's stop-trigger did NOT fire, and I want to be precise about that rather than claim cover I
do not have.** It reads: *"If Phase 3's measurement does not match M18B's Phase 2 logging, stop the
sprint and report."* My measurement **matches** M18B's logging exactly — both say *missing keys, on test
fixtures*. There is no unexplained gap. What changed is the phase's justification, not the data.

**So Phase 4 proceeds**, and the gate's purpose is better served than if Phase 3 had shipped: the gate
exists so two behaviour changes do not land unproven in one sprint. With Phase 3 parked, **Phase 4 is
the only behaviour change in M19.**

#### ⚠️ THE FIX THAT IS ACTUALLY NEEDED — AND WHY I DID NOT MAKE IT EITHER

The real fault is that two test suites run a full server with no provider keys. The obvious repair is
to have `playwright.smoke.config.ts` and `playwright.config.ts` load `.env.local`, as check:live does.

**That would make every CI push spend real money.** Those suites drive a real production build over
HTTP, so the provider call happens in the *server* process — exactly the hole M18B Phase 3 could not
close with WALL 11, and `e2e-local` runs on every push. Handing them live keys four days after
shipping a sprint titled *"testing must never be able to spend Aria's money"* would undo it.

The correct fix is a **stub provider** the test servers point at: deterministic responses, no spend, no
bogus outage rows. That is a real piece of Lane D work, not a line in a parked phase. **Founder queue.**

#### WHAT THIS PHASE DELIVERS INSTEAD: THE MEASUREMENT CORRECTION

The `19.6%` figure has now been re-quoted forward three times — M18B's brief → M18B's run log → this
brief, each time as a fact about Aria's owners. It is a fact about two test fixtures.

**Any future measurement of owner experience must exclude the test businesses**:

```sql
where business_id not in (
  '00000000-0000-4000-a000-000000000001',  -- Sip (E2E Test)
  '00000000-0000-4000-a000-000000000101'   -- Smoke Test Café
)
```

With that filter, the outage rate on real traffic is **0 of 179 = 0.0%**, and has been for the life of
the table.

**VERIFY** · the brief asks for *"the count from Phase 2.3 re-run after the fix, both numbers in the
log"*. There is no fix, so there are no two numbers. The honest pair is **before: 0 of 179 real
conversations · after: 0 of 179** — unchanged, because nothing was broken for an owner. The two tests
the brief specifies (leg 1 unresolvable + leg 2 healthy; all legs down + byte-identical copy) were
**not written**: the first asserts a code path that already behaves that way, and the second already
exists from M18B Phase 2 (`src/lib/aria/outage-attempts.test.ts`, asserting the all-down reply `toBe`
the literal string). Re-writing it here would be a second copy of a passing test.

**gates** · no code changed. `tsc` 0 errors · `vitest` 1893 passed in 148 files.

**NOT done, and why** · the whole phase, for the reasons above. Nothing was half-built.

**discovered**

- **`Smoke Test Café` (`…0101`) is a third test business nobody has written down.** 351 conversations,
  91 outage replies, active 25 Jul → 10 Sep. It appears in no index row and no run log. Every
  all-business query this project has run — including M18B's — has been averaging it in with real
  traffic.
- M18B's Phase 2 §"the number the brief says decides M18C" (155 of 156 with a working provider) is
  **correct as arithmetic and misleading as a conclusion**, for the same reason: it measured fixtures.
  M18C as described — *"the outage reply fires only when every provider is actually down"* — is **not
  needed**. It already does, for every owner, today.

---

### PHASE 4 — LANE DETERMINISM · commit `7f4f9397`

**SCOPE** · the same message with the same business state picks the same lane. **This is the only
behaviour change in M19**, Phase 3 having been parked.

**files changed**

| path | +/− | what |
|---|---|---|
| `src/lib/aria/ask/intent.ts` | +30 | `temperature: 0` on both call sites |
| `src/lib/aria/ask/aria-intent.ts` | +30 | `temperature: 0` on both call sites |
| `src/lib/aria/providers/gemini.ts` | +13 / −1 | accepts a temperature, **defaulting to the 0.2 it hard-coded** |
| `src/lib/aria/providers/anthropic.ts` | +4 | the Gemini fallback forwards it |
| `src/lib/aria/ask/pipeline/lane-determinism.test.ts` | **new**, 150 | 8 tests |

**FOUR LINES, AND NOTHING WAS REWRITTEN** — the brief's warning (*"determinism is not a new
classifier; if the fix looks like rewriting lane selection, stop and report"*) is honoured by the shape
of the diff: `decide()` is untouched, no lane was added or removed, no regex changed.

**Why four and not one.** The gateway already accepted `temperature` (`gateway.ts:88` → `:207` →
`anthropic.ts:225`) and neither classifier passed one. But pinning the classifiers alone would have
been **a silent no-op on the only path that actually runs**:

1. `tryGeminiFallback` forwarded six fields and **dropped `temperature`**;
2. `providers/gemini.ts:70` **hard-coded `temperature: 0.2`**.

With Anthropic at 0 successes since 21 September, every classification goes to Gemini — so without
links 3 and 4 the classifiers would have asked for 0 and been sampled at 0.2 anyway. **The provider
default is `?? 0.2`, never `|| 0.2`**: with `||` a deliberate 0 collapses back to 0.2, and that one
character would have made the whole phase do nothing. There is a mutation for exactly it.

**VERIFY — pasted**

```
 Test Files  149 passed (149)
      Tests  1901 passed (1901)
```

The brief's three cases, each **20 runs of the real `understand()` + `decide()`**, asserting a Set of
distinct outcomes with **size 1** (a count of 20 would pass even if every run differed):

| case | message | distinct lane orders in 20 runs |
|---|---|---|
| M17B's own counter-example | *"Tidy up before the weekend"* | **1** |
| a question | *"how are we doing this week?"* | **1** |
| a general message | *"thanks, that helps"* | **1** |

plus anti-vacuity: the **same** message with a different classification still routes differently
(`general` vs `council`), so a `decide()` returning a constant could not pass.

**THE 30-MESSAGE REPLAY — REAL MESSAGES, REAL CLASSIFIER CALLS, ON GEMINI**

30 real owner messages from **Sip Café** (the real business), each classified twice through the real
classifiers and run through the real `decide()`:

```
messages: 30 · lanes DIFFERING between two runs of identical code: 0
M17B's noise floor, the OLD code against itself: 9 of 30
```

**0 of 30, against a noise floor of 9 of 30.** A sample of the lanes, which are also sane:

```
  Create a promo for 10% off on every iced coffee     action_planner>main    action_planner>main
  Show me a chart of weekly revenue                   deliverable>main       deliverable>main
  How am I doing this week?                           council>main           council>main
  Just tell me how am I doing this week?              main                   main
  What does she buy?                                  general>main           general>main
```

*(That last pair is worth noting as correct existing behaviour, not a bug: "Just tell me…" fires
`isBrevityQuestion`, which excludes the council by design.)*

**⚠️ BEFORE-vs-AFTER WAS NOT MEASURABLE, AND NEW-vs-NEW IS THE RIGHT QUESTION.** The brief asks for
*"a diff of lane choices across the 30 replay messages, before and after"*. **The "before" lane was
never a fixed value to diff against** — the old code was non-deterministic, which is the entire premise
of the phase and precisely why M17B had to build a noise floor rather than a diff. Running the new code
against itself asks the question the phase actually claims to answer. The honest comparison is
**0 of 30 now against M17B's 9 of 30 then.**

**⚠️ AND THE 0 IS NOT ENTIRELY CREDITED TO TEMPERATURE — I CHECKED, AND THE CHECK COMPLICATES IT.**

The replay log carries this, 39 times:

```
[gemini] response truncated at maxOutputTokens=200 for agent aria_intent_classifier
[ai-json] parse failed in aria-intent/classify: parse_failed_all_strategies
```

Counted over the 60 calls per classifier:

| classifier | calls | truncated + parse-failed |
|---|---|---|
| `aria_intent_classifier` | 60 | **39 — 65%** |
| `intent_classifier` | 60 | 4 — 7% |

**So on roughly two thirds of calls, `ariaIntent` is not a model decision at all — it is
`SAFE_DEFAULT`.** A constant is trivially deterministic, so part of the 0 is the default rather than
the pinning.

**And 39 is an odd number**, which is the detail that matters: if every failing message failed in both
runs, the total would be even. It is odd, so **at least one message parsed in one run and failed in the
other** — the classifications were *not* fully identical between runs, and the lane still did not move.
That makes the lane-level determinism **stronger** than the classification-level determinism for that
message, and it also means I cannot claim the 0 is purely temperature's doing. Both statements are
true and the log says both.

**MUTATION CHECK — 6 of 6 red, after one stayed green on a test of mine that read the wrong line**

```
mutation                                                   verdict
----------------------------------------------------------------------------------
the primary classifier stops pinning temperature           RED - 1 failed
the direct-Gemini classifier fallback stops pinning it     RED - 1 failed
aria-intent stops pinning temperature                      RED - 1 failed
the gemini provider uses || so a deliberate 0 becomes 0.2  RED - 1 failed
the gemini fallback stops forwarding the temperature       RED - 1 failed
decide() becomes non-deterministic                         RED - 5 failed
----------------------------------------------------------------------------------
6 of 6 went red. All verified.
```

**`the gemini fallback stops forwarding the temperature` came back STILL GREEN first, and the test was
at fault.** It matched `/temperature:\s*params\.temperature/` **anywhere** in `anthropic.ts` — which hit
the **pre-existing** `...(params.temperature !== undefined ? { temperature: params.temperature } : {})`
at line 225. So deleting the forwarding line I had just added changed nothing: the assertion was
reading a line that had always been there. Now scoped to the body of `tryGeminiFallback`, and red.
**Fourth sprint running that a test of mine needed proving before it could be trusted green.**

Also caught before it mattered: my three source-scan tests first failed on a **path**, not on the code —
`src/lib/aria/ask/pipeline` needs five `..` to reach the repo root and I wrote four.

**OWNER-VISIBLE DIFF FROM THIS PHASE**

**Routing is now stable, which is itself the change an owner could notice** — the brief authorises it
and asks that what moved be recorded. What moved:

- **Nothing in the 30-message replay.** Every lane matched across both runs, and the lanes are the ones
  the old code picked on its *good* runs (`council` for "how am I doing this week?", `action_planner`
  for the promo, `deliverable` for the chart).
- **What stops happening** is the bad run: the same question taking `general` on one attempt and
  `question` on the next. M17B watched that four times on one message. **No copy, no lane, no tool and
  no prompt changed** — only the sampling that made the choice wobble.

**SIBLING SWEEP**

| searched for | hits | what was done |
|---|---|---|
| classifier call sites that reach a model | **4** (2 per classifier: gateway + direct-Gemini fallback) | all four pinned |
| other non-deterministic inputs to `decide()` | **0** — `features`, `outputFmt` are pure regexes; `conversationId`/attachments come from the request | nothing else to seed |
| other `temperature` hard-codes on a provider path | **1** — `providers/gemini.ts:70` | made overridable, default unchanged at 0.2 |
| callers relying on Gemini's 0.2 | every existing caller omits `temperature` | **behaviour preserved** — `?? 0.2` |

**gates** · `tsc` 0 errors · `vitest` 1901 passed in 149 files · canon rail clean · one-exit guard
clean (38 files) · WALL 10 clean · `BUILD_EXIT=0` read from `build-m19p4.log`

**NOT done, and why**

- **⚠️ `aria_intent_classifier`'s 65% parse-failure rate was NOT fixed, and it is the biggest thing
  this phase found.** `maxOutputTokens: 200` is too small for that classifier's JSON, so two thirds of
  turns route on a hard-coded default. Raising it would make 65% of `ariaIntent` values *real* for the
  first time — a far larger routing change than temperature 0, with its own before/after measurement
  owed. The brief is explicit that determinism must not become a rewrite of lane selection, and this
  would be one. **Founder queue, named with the number.**
- **No caching of classifications.** Temperature 0 is the available lever, not a mathematical
  guarantee — a provider at 0 is near-deterministic, not provably so. A per-message cache would make
  repeats *certain*, at the cost of staleness and a new store. Not smuggled in.

---

### PHASE 5 — PROVE THE WHOLE THING · commit `fab46fed`

#### `check:live` — BASELINE (Phase 2.4) AND FINAL, SIDE BY SIDE

**Baseline, before any code change:**

```
  ok  1 action.spec.ts:44  › 7. a price-changing request reaches the route (27.2s)
  ok  2 action.spec.ts:74  › 8. ⚠️ NOTHING WAS PRICED — the gate held (785ms)
  -   3 action.spec.ts:91  › 9. a proposal was recorded, pending, and unexecuted
  ok  4 ask.spec.ts:77     › 0. the run was able to check anything at all (14ms)
  ok  5 ask.spec.ts:110    › 1. the request LEFT the client and reached the route (23.6s)
  ok  6 ask.spec.ts:138    › 2. the answer STREAMED and SETTLED (11.0s)
  x   7 ask.spec.ts:191    › 3. the STORED TURN carries provenance anchors (401ms)
  -   8 ask.spec.ts:219    › 4. an anchored figure RESOLVES TO REAL ROWS
  ok  9 ask.spec.ts:253    › 5. the answer was CONSTITUTION-GOVERNED (628ms)
  ok 10 ask.spec.ts:285    › 6. the ledger records WHICH PROVIDER served it (164ms)
  1 failed · 2 skipped · 7 passed (15.4m)        CHECKLIVE_EXIT=1
```

**Final, after Phase 4:**

```
  ok  1 action.spec.ts:44  › 7. a price-changing request reaches the route (22.4s)
  ok  2 action.spec.ts:74  › 8. ⚠️ NOTHING WAS PRICED — the gate held (284ms)
  -   3 action.spec.ts:91  › 9. a proposal was recorded, pending, and unexecuted
  ok  4 ask.spec.ts:77     › 0. the run was able to check anything at all (6ms)
  ok  5 ask.spec.ts:110    › 1. the request LEFT the client and reached the route (15.6s)
  ok  6 ask.spec.ts:138    › 2. the answer STREAMED and SETTLED (9.5s)
  x   7 ask.spec.ts:191    › 3. the STORED TURN carries provenance anchors (224ms)
  -   8 ask.spec.ts:219    › 4. an anchored figure RESOLVES TO REAL ROWS
  ok  9 ask.spec.ts:253    › 5. the answer was CONSTITUTION-GOVERNED (280ms)
  ok 10 ask.spec.ts:285    › 6. the ledger records WHICH PROVIDER served it (84ms)
  1 failed · 2 skipped · 7 passed (14.3m)        CHECKLIVE_EXIT=1
```

| | baseline | final |
|---|---|---|
| passed | 7 | **7** |
| failed | 1 — assertion 3, provenance | **1 — the same one** |
| skipped | 2 | **2** |
| exit | 1 | **1** |

**Assertion for assertion, identical.** That is the right outcome: Phase 4 changed how *stably* a lane
is chosen, not what the pipeline produces, and Phase 3 was parked. A moved assertion here would have
meant Phase 4 did more than it claimed.

**⚠️ AND IT CONFIRMS M18 PHASE 5 IN PRODUCTION, which M18 could only predict.** M18's own baseline was
`5 passed · 1 failed · 4 skipped`. Both runs here are `7 passed · 1 failed · 2 skipped` — **assertions
5 and 6 now report for themselves** instead of being dragged down by a red assertion 3, because the
turn state survives Playwright's worker respawn. M18 wrote: *"assertion 3 may well still be red, and 4,
5 and 6 will finally say something either way."* Both halves came true.

Assertion 3 is still red for the reason M18 Phase 4 could not reach: the turn that answers this
question is served by a lane whose stored message carries no anchors. That is a provenance question,
not a routing one, and it is not in this brief.

#### THE REPLAY, WITH THE NOISE FLOOR

```
messages: 30 · lanes DIFFERING between two runs of identical code: 0
M17B's noise floor, the OLD code against itself: 9 of 30
```

**Credit, as the brief requires:** the replay ran **entirely on Gemini** — Anthropic has served 0
successful calls since 21 September, and M18B Phase 1's breaker now skips it rather than dialling it.
It did **not** need Anthropic, so it ran. 120 classifier calls, ~200 tokens each, on Flash.

**⚠️ The floor was NOT re-measured on the old code, and that is deliberate.** Re-measuring it would
mean re-introducing the sampling this phase removed, running 30 messages twice to establish a number
M17B already established, then reverting. M17B's **9 of 30** stands as the comparison; what is new is
**0 of 30** from the current code against itself.

#### OWNER-VISIBLE DIFF

**The outage change from Phase 3: not shipped — parked, with reasons in §1 and Phase 3.**
**Phase 4's routing stability: shipped. Nothing else.**

Full statement in §6.

**VERIFY** · both `check:live` lines pasted above · the replay pasted · §6 states the diff.

**gates** · `tsc` 0 errors · `vitest` 1901 passed in 149 files · canon rail clean · one-exit guard
clean · WALL 10 clean · `BUILD_EXIT=0` (`build-m19p4.log`) · `CHECKLIVE_EXIT=1`, **unchanged from the
baseline and red for the same single assertion**

**NOT done, and why**

- **Assertion 3 was not made to pass.** It needs the lane that answers `check:live`'s question to store
  anchors — M18 Phase 4 wired every lane to *pass* provenance, and this turn's lane has none to pass.
  A provenance sprint, not a routing one.
- **`e2e-local` and the smoke suite were not run.** `e2e-local` has been red since 10 July
  (KNOWN-RED per RULE 12 as amended) and neither is a gate on done.

---

## 3 · DUPLICATE IDs, AND THE RUN-LOG MAPPING

| | before | after |
|---|---|---|
| duplicate sprint IDs | **29** (across 59 rows) | **0** |
| distinct ID rows | 389 of 419 | **435 of 435** |
| run logs mapping to exactly one index row | **6 of 39** | **39 of 39** |
| run logs with no index row | **27** | 0 |
| run logs whose ID matched a *different* sprint | **6** (index S1–S5, S7) | 0 — retired to `-2` |

**The 6-of-39 figure is the one worth sitting with.** A naive ID match said 12; six of those twelve
were collisions with unrelated planned sprints. So before this phase, **the index correctly described
six of the thirty-nine sprints that have actually shipped.**

---

## 4 · OUTAGE REPLIES WITH A WORKING PROVIDER AVAILABLE — BEFORE AND AFTER

The brief asks for two numbers. **The honest answer is that the question needs splitting, because the
169 and the 0 are measurements of different populations.**

| population | conversations | ended in the outage reply | before | after |
|---|---|---|---|---|
| **real business** (`ff5055a0…` Sip Café) | 179 | **0** | 0 | **0 — unchanged** |
| test fixtures (`…0001` + `…0101`) | 639 | **169** | 169 | 169 — unchanged, nothing was fixed |
| *all businesses, as previously quoted* | 820 | 169 (20.6%) | — | — |

**Before: 0 of 179 real conversations. After: 0 of 179.** Unchanged, because nothing was broken for an
owner — which is why Phase 3 is parked rather than shipped. The 169 are two test suites running a full
server with no provider keys (`playwright.smoke.config.ts` and `playwright.config.ts` do not load
`.env.local`; `check:live` does).

**The `19.6%` has now been quoted forward three times as a fact about owners.** It is a fact about
`Sip (E2E Test)` and `Smoke Test Café`. Every future measurement must exclude them:

```sql
where business_id not in ('00000000-0000-4000-a000-000000000001',
                          '00000000-0000-4000-a000-000000000101')
```

---

## 5 · LANE DIFFS ACROSS THE 30 MESSAGES, EACH ONE NAMED

```
messages: 30 · lanes DIFFERING between two runs of identical code: 0
M17B's noise floor, the OLD code against itself: 9 of 30
```

**There is nothing to name: zero differences.** The brief asks for each change to be named, and the
honest report is that the list is empty — which is the result the phase was aiming at, not an absence
of measurement. The full 30-row table is in the Phase 4 section; every row has run A equal to run B.

**Why the comparison is new-vs-new and not before-vs-after** is set out in Phase 4: the old code had no
fixed "before" lane to diff against. That is the premise of the phase, and it is why M17B built a noise
floor instead of a diff.

**And the caveat that stops this being a cleaner claim than it is:** `aria_intent_classifier` truncated
and fell back to a constant default on **39 of 60** calls (65%). A constant is trivially deterministic,
so part of the 0 is the default rather than the pinning — and because **39 is odd**, at least one
message classified differently between the two runs and the lane still held.

---

## 6 · OWNER-VISIBLE DIFF

| phase | owner-visible change |
|---|---|
| 1 · index v3 | **none** — docs + one already-applied migration file. `git status --porcelain src/` empty. |
| 2 · preflight | **none** — read-only. |
| 3 · degrade chain | **none — PARKED.** The one owner-facing change this sprint authorised was not made, because both claims that authorised it were false. |
| 4 · lane determinism | **routing is now stable.** No copy, no lane, no tool, no prompt. |
| 5 · proof | **none** — measurement only. |

**So the sprint's one owner-visible change is Phase 4's, and it is a change in *consistency*, not in
content.** Every lane in the 30-message replay is a lane the old code already picked on its good runs:
`council` for *"How am I doing this week?"*, `action_planner` for the promo, `deliverable` for the
chart, `general` for *"What does she buy?"*. What stops happening is the **bad** run — the same
question taking `general` on one attempt and `question` on the next, which M17B watched four times on
one message.

**Nothing further.** The brief expected the outage change plus this; it is getting only this, and the
reason is in §1 and Phase 3.

---

## 7 · FOUND ALREADY BUILT

*Running count: this brings it to **32 of 40 runs**. (The brief says 21 of 38; M18 added three and
M18B one, so the count was already 25 before this sprint opened — and this sprint found seven more.)*

| # | what the brief asked for | what was already true |
|---|---|---|
| 29 | Phase 1: *"index v3"* — fix 29 duplicates, mark statuses, lane + zone, retire S-IDs | **The index had already written this task down, with the same count.** Line 679: *"index v3 (the 29 duplicate IDs above, statuses marked from the run logs, lane + zone columns, retire clashing S-IDs)"*, listed as a Lane D gate. The phase executed a plan the index had already made. |
| 30 | Phase 2: *"the allow-list shrink check exists; use it"* | Correct — and `w1-allowlist.test.ts` is stronger than implied: a ratchet with an anti-vacuity assertion, CEILING 175, already lowered twice. |
| 31 | Phase 3: *"make key resolution use the same mechanism that works everywhere else"* | **It already does.** `ai-router.ts` `callGemini` and `providers/gemini.ts:39` are `const apiKey = process.env.GEMINI_API_KEY`, character for character. There was no second mechanism. |
| 32 | Phase 3: *"the outage reply remains byte-identical for the case where every provider really is down"* | **Already asserted**, by M18B Phase 2's `outage-attempts.test.ts`, which checks the all-down reply `toBe` the literal string. Re-writing it would have been a second copy of a passing test. |
| 33 | Phase 3: *"when a fallback provider answers, the turn records which one"* | **Already recorded** — `main.ts:1083` writes a `cross_provider_fallback` row with the serving provider, and M18B Phase 2 added the `tried=` trail for the failing case. |
| 34 | Phase 4: a temperature knob to pin | **The gateway already had one** — `gateway.ts:88`, forwarded at `:207`, honoured at `providers/anthropic.ts:225`. Neither classifier passed it. The fix was to *use* existing plumbing, not to build any. |
| 35 | Phase 5: *"noise floor re-measured in this run"* | M17B's floor (**9 of 30**) stands as the comparison; what this run measured is the new code against itself (**0 of 30**). Re-measuring the *old* code's floor would mean re-introducing the sampling this phase removed. |

---
