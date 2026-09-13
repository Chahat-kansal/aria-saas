# RUN-M17 · BRAIN-1 — THE SPINE

**13–14 September 2026 · autonomous run, RULE 20 · 3 of 6 phases pushed, 3 parked, 4 commits.
Build verified green, everything pushed. ⛔ THE RUN HALTED ON A GATE I AM NOT ALLOWED TO BYPASS.**

**The spine exists and the wall is up. The lanes are wrapped, green, and sitting on a local branch
because pushing them requires a decision only you can make.**

## THE THREE THINGS YOU MOST NEED TO KNOW

**1. ⛔ PHASE 3 IS BUILT, GREEN, AND BLOCKED — AND IT NEEDS ONE MINUTE FROM YOU.**
All 28 exits are wrapped: 23 `TurnResult`s across 12 strategies + 5 admission gates → one
`render()`. tsc 0, **1778 tests pass**, `BUILD_EXIT=0`, and a fidelity script proves 11 of 12
strategies are **textually IDENTICAL** to the lanes they came from (the 12th, `main.ts`, differs on
14 lines, every one declared).

**The canon rail blocked the push with 23 violations, and not one is new code.** It is a diff
scanner: moving 2,300 lines of grandfathered code makes every line look newly authored. **I fixed 20
of them properly** (they were discarded Supabase errors — locked RULE 7 — and several were hiding
real defects, see below). **Three cannot be fixed without a behaviour change M17 exists to avoid.**

**Your call, either is fine:** approve a one-time documented `--no-verify` for the move, or let the
3 lines migrate to the canonical helpers as their own small sprint first. Work preserved on branch
**`m17-phase3-parked` (5013c368)** and on disk.

**2. ⚠️ RULE 14 AND RULE 20 CONTRADICT EACH OTHER, AND THIS WILL HAPPEN AGAIN.**
RULE 14 anticipates exactly this — *"a file move has done it before on byte-identical code… if a
bypass is genuinely correct, say so explicitly"*. RULE 20's NEVER list forbids `--no-verify`
unattended, no exceptions. **The later, absolute rule wins, so I halted.** Any future sprint that
relocates grandfathered code hits the same wall. Worth resolving in CLAUDE.md rather than
rediscovering.

**3. ⚠️ FIXING THE 20 SURFACED SIX REAL SILENT FAILURES IN THE HOTTEST PATH IN THE PRODUCT.**
These were already live in `route.ts`; the move is only what made the rail point at them:

- the **pending-action read** — a lost read reads as *"no pending action"*, so the owner's **"confirm"
  falls through to smalltalk and the action they approved never runs**
- the **mass-confirm re-stage** — *the injection backstop's own write*. If rejected, the owner is
  asked to reply "confirm" against a re-stage that was never stored, and **the second confirmation
  the mass-mutation gate depends on can never arrive**
- the **clear-after-execute** — the action has already run; a failed clear leaves it live, so the
  next "yes" **re-runs a write that already happened**
- **save-plan's `aria_actions` INSERT** — owner is told *"Plan saved"*; the dashboard stays empty
- **`upsertConversation`'s existing-thread read** — falls through to INSERT and creates a **second
  conversation** instead of appending
- the **per-minute rate-limit COUNT** — a failed count returns null, reads as "no calls", and **lets
  the limit through**

**All six fixes are in the parked commit.** They are pure logging additions — no control flow, no
response changes — and they ship the moment phase 3 does.

## WHAT IS PUSHED AND WORKING

| phase | | |
|---|---|---|
| **0 · gate** | ✅ `7aaf4c2c` | four premise corrections; **99 files cleared out of intent-to-add** in the index |
| **1 · the types** | ✅ `f6af578a` | `TurnResult` designed by parsing all 28 exits |
| **2 · the spine + WALL 9** | ✅ `187b287e` | six stages, one exit, guard in the pre-push hook |
| **2b · guard defect** | ✅ this commit | the guard I shipped in phase 2 fired on its own documentation |
| **3 · wrap the lanes** | ⛔ parked | built, green, not pushable |
| **4 · route `_POST`** | ⛔ parked | depends on 3 |
| **5 · the turn record** | ⛔ parked | depends on 4 |
| **6 · prove nothing changed** | ⛔ parked | depends on 4 |

## 28 EXITS → N STRATEGIES → 1 RENDER, COUNTED

**28 → 23 `TurnResult`s (12 strategies) + 5 admission gates → 1 `render()`.** Built and verified;
parked. `route.ts` line count: **2,820 before, 2,820 after** — the route is untouched, because
rewiring it is phase 4.

## PROOF THE GUARD FAILS BOTH DIRECTIONS

```
probe planted at strategies/__probe.ts:3   (a line never in this repo before)   → EXIT 1
probe removed                                                                   → EXIT 0
render.ts stripped of its response construction:
  "⚠️ THIS RUN CHECKED NOTHING MEANINGFUL: the one exit is gone, so forbidding
   the others guards nothing"                                                   → EXIT 1
probe2 with a DECOY doc block on line 3 and a real violation on line 6
  → reports line 6, ignores line 3                                              → EXIT 1
```

The third is the one that matters: a guard forbidding every exit while the single exit has quietly
disappeared would be protecting nothing, and it exits non-zero for that too.

## WHAT THIS SPRINT DID NOT DO

- **No replay, and no `check:live`.** Both need the route wired (phase 4). **Phase 3 proves the TEXT
  is unchanged; only phase 6 can prove the OUTPUT is** — that claim is not made here.
- **No turn record**, so no sample to show.
- **`check:live` is NOT confirmed against this sprint.** RULE 3a already carries it from S6; M17 did
  not re-run it, because there is nothing wired to exercise.
- The constitution was **not** moved onto the council lane and no anchors were added to any turn —
  deliberately. M18 owns both.

## FOUR PREMISE CORRECTIONS, AND ONE OF MY OWN NUMBERS RETRACTED

1. **There is no troubleshoot lane and no escalate lane.** The sprint names both as strategies to
   create; against the code, `troubleshoot` is a prompt addendum and `escalate` is an action result
   handled *after* the model answers. Neither returns. The lane list came from the 28 exits instead.
2. **The guard as worded cannot pass on its own spine** — `render()` must construct a response, and
   the route is not under `src/lib/aria/ask/`. Scope read so every sentence holds at once.
3. **Scanning `src/app/api/aria/ask/` by prefix would have failed the push on ELEVEN innocent
   sibling routes.** The turn route is named as a single file.
4. **`ground` and `decide` are the other way round** — grounding "keyed by strategy" cannot precede
   the strategy. Stated plainly in the code that this leaves grounding lane-dependent, which *is*
   flaw 2 of the logic read; **M18 is what inverts it.**
5. **Retracted:** phase 0 said "22 named regexes + 3 inline". The **total of 25 was right, the split
   was wrong** — it is **20 named + 5 inline**. A grep counted two `const isX = /…/.test()` lines as
   named constants.

And one caught by reading rather than by a test: **`image` is not a top-level lane.** It sits after
the 19-query context build and never reads it, so offering it earlier would render a byte-identical
body while skipping those queries. **Phase 6's replay would have reported "no diff".**

---

13–14 September 2026. Written incrementally as the run went — a halted run still leaves a readable
log.

---

## PHASE 0 — GATE ✅

**Prerequisite met.** M13 is pushed and its guards are live: `scripts/canon-rail-guard.ts` carries
WALL 1 (`model-call-outside-gateway`), WALL 6 (`supabase-error-not-read` /
`supabase-write-result-discarded`), WALL 7 (`ask-aria-prompt-outside-rail`) and WALL 8
(`agent-service-role-outside-cron`, M13D), and the pre-push hook runs it on every push.

Read: `RUN-S6.md`, `docs/aria/ARIA-LOGIC-READ.md`, `RUN-M12.md`, `RUN-M13.md`,
`ARIA-MEGA-SPRINT-INDEX.md` (scope only).

### ⚠️ FOUND BEFORE ANY PHASE: 99 FILES SITTING INTENT-TO-ADD IN THE INDEX

`git status --porcelain` reported **99 entries as ` A`** — intent-to-add, not untracked. That is the
`git add -A` hazard CLAUDE.md names, already half-sprung: the junk tree (`canopy/`,
`pw-report*-extracted/`, `design/*.png`, `checklive.log`, 16 MB of binaries) was staged-by-intent and
one ordinary `git commit -a` from landing on `main`.

**Cause found, and it is ours:** `scripts/canon-rail-guard.ts:560` runs `git add -N .` inside
`getDiff()` whenever it is invoked with `--working-tree`, to make brand-new files visible to a diff
scan. It is correct for the guard and it leaves the index marked afterwards.

Cleared with `git reset` (index → HEAD, working tree untouched; nothing else was staged). Verified:
intent-to-add 0, untracked 42, `.gitignore`'s two pre-existing uncommitted lines still uncommitted.
**Recorded, not fixed** — changing the guard's diff strategy is outside this sprint's file domain.
Anyone running `--working-tree` re-marks them; run `git reset` afterwards.

### THE SPRINT'S PREMISE — CONFIRMED, WITH THE NUMBERS RE-MEASURED

`docs/aria/ARIA-LOGIC-READ.md` says its line numbers came from a zip taken 5 September. Re-measured
against `src/app/api/aria/ask/route.ts` today:

| | the read (5 Sep) | measured (13 Sep) |
|---|---|---|
| file | 2,753 lines | **2,820** |
| `_POST` | 293–2753, "2,460 lines" | **294–2779, 2,486 lines** |
| two classifiers | 443 | **441** |
| `isStrategicQuestion` | 650 | **654** |
| GENERAL lane | 820 | **824** |
| ARTIFACT lane | 935 | **964** |
| COUNCIL lane | 1062 | **1091** |
| VERIFIER | 2538 | **2567** |

**The two load-bearing counts are exactly right, not approximately:**

- **28 `return NextResponse` / `new NextResponse`** — counted: 28.
- **22 of them before the council gate** — counted: 22, at lines 317, 366, 399, 406, 424, 434, 468,
  505, 517, 599, 633, 636, 705, 714, 730, 760, 773, 804, 910, 942, 985, 1042. The council gate is
  line 1091.

### ⚠️ PREMISE CORRECTIONS — four, all of which change what a later phase builds

**1 · "~15 regex heuristics" understates it. Measured: 25 regexes** that test the raw message,
feeding **18 derived booleans**.

> ⚠️ **Split corrected in phase 2.** This paragraph first said "22 named + 3 inline". The **total of
> 25 was right and the split was wrong**: the grep behind it (`^  const [A-Za-z_]+ = /`) also matched
> `const isStrategicQuestion = /…/.test(message)` and `const isImageRequest = /…/.test(message)`,
> which are inline uses, not named constants. Re-measured with a parser: **20 named UPPERCASE regex
> constants + 5 written inline** (`isStrategicQuestion` 654, the `/[\d%$]/` value cue 663,
> `isImageRequest` 2208, and one term each of `needsSonnet` 2294 and `needsTools` 2298). Retracted
> here rather than quietly edited — RULE 16 #5.

Stage 1's feature extraction has to carry 25, not 15. None are deleted or changed (M19 owns that).

**2 · ⚠️ THERE IS NO TROUBLESHOOT LANE AND NO ESCALATE LANE.** The sprint's phase 3 names
`troubleshoot` and `escalate` among the strategies to create. Against the code they do not exist:

- `intent.type === 'troubleshoot' || 'escalate'` at **2161** appends a *system-prompt addendum*
  (`buildTroubleshootAddendum`) and falls straight through to the main tool loop. No return.
- `escalate` at **2619** is an *action result* (`action?.action === 'escalate'` →
  `createSupportTicket`) handled **after** the model has already answered, inside the main path. No
  return.

The read lists them as lanes at 2132/2296 and is wrong on both. **The code wins** (standing table),
so the strategy list is taken from the 28 exits instead of from the paste. What the preflight
actually finds is **20 lanes**:

| # | lane | exits | lines |
|---|---|---|---|
| 1 | rate limit (per-user) | 1 | 317 |
| 2 | bad request | 1 | 366 |
| 3 | save-plan fast-path | 1 | 372–399 |
| 4 | cost guard blocked | 1 | 405 |
| 5 | rate limit (per-minute) | 1 | 423 |
| 6 | daily cost ceiling | 1 | 433 |
| 7 | **pending-action confirm** | 4 | 454–636 (expired 468 · mass-confirm 505 · failed 517 · executed 599) |
| 8 | agent composer | 2 | 618–636 |
| 9 | **action planner** | 3 | 679–730 |
| 10 | inventory agent | 2 | 743–773 |
| 11 | nav fast-path (env-gated off) | 1 | 798–804 |
| 12 | **general** | 1 | 824–910 |
| 13 | multi-domain | 1 | 930–942 |
| 14 | **deliverable (= "artifact")** | 1 | 964–985 |
| 15 | background task | 1 | 1009–1042 |
| 16 | **council** | 2 | 1091–1475 (no-data 1106 · council 1475) |
| 17 | image fast-path | 1 | 2362–2390 |
| 18 | stopped (owner pressed Stop) | 1 | 2470 |
| 19 | total outage | 1 | 2522 |
| 20 | **main tool loop** | 1 | 2746 |

**20 lanes · 28 exits.** Phase 3 wraps these; `troubleshoot` and `escalate` are not among them
because they are not lanes.

**3 · ⚠️ THE GUARD AS WORDED CANNOT PASS ON ITS OWN SPINE.** Phase 2 says the guard fails on
`return NextResponse` / `new NextResponse` **anywhere under `src/lib/aria/ask/`** — but `render()`,
stage 6, *the only exit*, is specified to live under exactly that path and must construct one. And
the decision table's grandfathering of `route.ts` only makes sense if the scan covers
`src/app/api/aria/ask/` too, which is not under `src/lib/aria/ask/` at all. Phase 4's "from here the
route cannot exit early" is empty otherwise.

Read so every sentence is true at once, the scope is **both** trees with **exactly one** permanent
exception:

```
SCAN         src/lib/aria/ask/pipeline/**  ·  src/lib/aria/ask/strategies/**
SCAN (file)  src/app/api/aria/ask/route.ts           ← named exactly, NOT by prefix — see below
ALLOW        src/lib/aria/ask/pipeline/render.ts     ← the one exit, permanently
GRANDFATHER  src/app/api/aria/ask/route.ts           ← phases 2–3 only; removed in phase 4
```

> ⚠️ **Narrowed in phase 2, and the reason matters.** The obvious reading — scan the prefix
> `src/app/api/aria/ask/` — is wrong: that directory holds **eleven other routes** (`action/`,
> `audit/`, `delete/`, `escalate/`, `export/`, `history/`, `rollback/`, `search/`, `suggestions/`,
> `thread/`, `upload/`), ordinary REST endpoints with no connection to the turn pipeline. Every one
> of them legitimately constructs a response, so a prefix scan would have failed the push on eleven
> innocent siblings — failure pattern #2 in guard form, and a rule that fires on the innocent gets
> loosened until it fires on nothing. The turn route is named as a single file.

**4 · The guard must be a FULL-FILE scan, not a diff scan.** `canon-rail-guard.ts` scans added lines
only (`git diff --unified=0`), and the standing rule says a diff scanner cannot catch a reintroduced
line. Over three small, brand-new directories a whole-file scan costs nothing and cannot be fooled,
so this guard reads the files. It follows the WALL 8 pattern: the rule is a **library function** the
script imports and the test **calls**, so what CI enforces and what the test drives cannot drift
apart.

`_STREAMING_POST`'s `new Response(readable, …)` is a plain `Response`, not a `NextResponse`, and is
the SSE envelope rather than an early exit. It is deliberately not a target.

### SCOPE HELD

M18 owns grounding-always and the verifier. M19 owns the single classifier. M20 owns the executor.
**This sprint changes structure only.** `verify()` is a pass-through stamping `{ ran: false }`; the
constitution is not moved onto the council lane; no anchors are added to any turn.

**GATE: PASS.** Continuing to phase 1.

---

## PHASE 1 — THE TYPES ✅

**`TurnResult` was designed by reading all 28 exits, not by reading the paste.** A brace-aware
parser pulled every exit body out of `route.ts` with its key order intact.

**28 exits · 36 distinct top-level response keys.** Frequency, measured:

| key | exits | | key | exits |
|---|---|---|---|---|
| `response` | 24 | | `ai_mode` · `error` · `followups` · `model_used` | 4 |
| `conversation_id` · `intent` | 23 | | `served_by` | 3 |
| `action` · `cost_usd_cents` | 20 | | `degraded_provider` · `healed` · `heal_reason` · `message` · `note` | 2 |
| `used_council` | 10 | | the remaining 17 | 1 each |
| `blocks` · `downloads` | 9 | | | |
| `tool_calls` | 8 | | | |

*(My first extraction pass reported 38 and included `actionResult` and `true` — artefacts of
ternaries inside values, `action: Object.keys(actionResult).length > 0 ? actionResult : null` and
`degraded_provider ? true : undefined`, where the `?` makes the next token look like a key. Caught by
sanity-checking my own query before building on it — RULE 16 #5. The number is 36.)*

### ⚠️ THE FINDING THAT DECIDED THE SHAPE: THE 28 EXITS DO NOT AGREE ON KEY ORDER

```
exit 1106   response, blocks, conversation_id, intent, action, …
exit 1475   blocks, followups, used_council, advisors_lost, provenance, response, …
```

`JSON.stringify` preserves insertion order, and phase 3 has to prove the rendered body identical
**byte-for-byte**. A canonical field order inside `TurnResult` would therefore change every byte of
every answer while changing no behaviour — and would drown phase 6's replay in diffs that mean
nothing.

**So `body` is the lane's own object, verbatim, in the lane's own key order.** `render()` serialises
that and nothing else. The typed fields are **projections derived from `body` by
`makeTurnResult()`**, never set by hand — which is what stops them drifting from the thing actually
sent. A lane cannot claim `usedCouncil` in a typed field while sending `used_council: false` to the
client; the type gives it no way to express that.

### ⚠️ NAME COLLISION — `Grounding` IS TAKEN

The paste calls stage 2's output `Grounding`. **It already exists:**
`src/lib/aria/compute/provenance.ts` exports `type Grounding = 'verified' | 'derived' | 'estimated'`
— the provenance tier of a computed figure, with live consumers. A second `Grounding` meaning
something else entirely is failure pattern #4 committed deliberately. Stage 2's type is
**`TurnGrounding`**. Neither type is renamed.

### ⚠️ `AskResponse` LOOKS LIKE IT SHOULD ALREADY BE THIS TYPE, AND IS NOT

`src/lib/aria/ask-types.ts:176` declares `AskResponse` with 10 of the 36 keys. It has **zero
consumers** anywhere in the repo. Left exactly as it is (RULE 0); recorded so the next reader does
not mistake it for the union and build on it.

### `verified` IS MANDATORY FROM TODAY, AND DELIBERATELY EMPTY

`Verification = { ran: false; reason: string } | { ran: true; … }`. M18 changes `false` to `true`
without touching the shape. `reason` is **required** on the not-run branch — a not-run verdict that
says nothing would be the same silence in a new place.

| | |
|---|---|
| **files changed** | `src/lib/aria/ask/pipeline/types.ts` (+327), `types.test.ts` (+186) |
| **sibling sweep** | grep for any other `Understanding` / `TurnGrounding` / `TurnResult` / `VerifiedResult` / `Verification` / `TurnRecord` / `LaneName` declaration across `src/` — **0 hits** outside this file and its test. No fourth helper built. |
| **mutation check** | Replaced the verbatim body with one re-composed in sorted key order — the design alternative this type exists to rule out. **"⚠️ THE BODY SURVIVES BYTE-FOR-BYTE" went red** on exit 399: `expected '{"action":…' to be '{"response":"Plan saved…'`. **1 failed, 11 passed.** Reverted → 12 passed. |
| **anti-vacuity** | The suite asserts that exits 1106 and 1475 *genuinely start with different keys*, so the byte comparison is not comparing something to itself; that the fixture set is all 28 exits and covers all 20 lanes; and that all 36 keys survive a round trip. |
| **gates** | tsc 0 · vitest 132 files / 1718 tests pass · `BUILD_EXIT=0` read from `build.log` · pre-push hook ran |
| **NOT done** | **No code path changes.** Two new files; nothing imports them yet. The 28 exits are untouched. |

---

## PHASE 2 — THE SPINE ✅

Six stages, and a wall that makes them unavoidable.

```
understand → decide → ground → act → verify → render
```

### ⚠️ TWO CORRECTIONS TO THE SPRINT DOCUMENT, BOTH FORCED BY THE CODE

**1 · `ground` and `decide` are the other way round.** The sprint's diagram reads
`understand → ground → decide`. Its own phase-2 text says `ground()` "builds whatever context each
lane builds today, **keyed by strategy**". **Grounding keyed by strategy cannot run before the
strategy is known** — the two sentences cannot both be obeyed. Measured: every lane condition in
`_POST` is a boolean over `intent`, `ariaIntent`, the features and the conversation id, so
`decide()` is a pure function and can run first. That is the reading that makes the rest true.

> **This is the one place M17's structure is honest-but-not-yet-the-goal, and it is worth being
> plain about.** Grounding still depends on the lane, which *is* flaw 2 of the logic read — "the
> decision is made before grounding exists". **M18 is the sprint that inverts it:** once a lean
> envelope loads unconditionally, `ground()` stops needing the strategy and moves back in front.
> Doing it here would be a behaviour change, and a structural sprint that also changes behaviour
> cannot prove it changed nothing.

**2 · ⚠️ `decide()` returns an ORDERED LIST of candidates, not one name — because seven lanes decline
or fall through.** Five catch their own errors and fall through to the next lane:

| lane | route.ts | what its catch says |
|---|---|---|
| `inventory_agent` | 786 | *"RULE 0: non-fatal — fall through to main tool loop"* |
| `multi_domain` | 936 | *"multi-domain parallel failed, falling back"* |
| `deliverable` | 998 | *"deliverable generation failed, falling back to text"* |
| `background_task` | 1050 | *"background task queue failed, falling through"* |
| `council` | 1478 | *"council failed, falling back to single-model"* |

And two decline without failing: `pending_action` only applies when a pending row exists, and
`inventory_agent` only when `handleInventoryQuestion()` reports `handled`. **A single chosen name
cannot express that, and flattening it would change behaviour on all seven paths.** So `act()` walks
the candidates in source order until one produces a result — the waterfall, with the fall-through
made explicit instead of implied by where a `try` block happens to end. `declined` is recorded.

### THE THREE PURE CLASSIFIERS ARE CALLED IN `decide()`, NOT INSIDE THE LANES

`isConfirmation()`, `classifyInventoryIntent()` and `classifyDeliverableKind()` all turned out to be
**pure, synchronous functions of the message**. My first draft offered their lanes on every turn and
let the lane decide — which the spine's own test caught immediately, by routing a strategic question
through `inventory_agent` before the council. Calling them in `decide()` is both faithful to
route.ts (same call, same point in the waterfall) and narrower.

### WALL 9 — ONE EXIT

`scripts/ask-one-exit-guard.ts`, wired into `package.json` (`npm run guard:one-exit`) **and into the
pre-push hook, ahead of `tsc`**. The rule itself is `isOneExitViolation()` in
`src/lib/aria/ask/pipeline/one-exit-rule.ts` — **the guard script imports it and the unit test calls
it**, the WALL 8 pattern, so what CI enforces and what the test drives cannot drift apart. No
assertion anywhere greps a source file to decide what the rule is.

**Observed, both directions, with a genuinely new probe line** (a diff scanner cannot catch a
reintroduced line — this one reads whole files):

```
$ npx tsx scripts/ask-one-exit-guard.ts
[ask-one-exit-guard] 8 file(s) scanned whole, one exit intact (…/render.ts). Pass.
[ask-one-exit-guard] ⚠️  still grandfathered, and this list can only shrink: src/app/api/aria/ask/route.ts
GUARD_EXIT=0

# plant src/lib/aria/ask/strategies/__probe.ts:3 — a line never in this repo before
[ask-one-exit-guard] 1 response construction(s) outside the single exit:
  src/lib/aria/ask/strategies/__probe.ts:3
    return NextResponse.json({ probe: 'M17 phase 2 mutation — a genuinely new line, …' })
GUARD_EXIT=1

# probe removed
[ask-one-exit-guard] 8 file(s) scanned whole, one exit intact. Pass.        GUARD_EXIT=0
```

**And the subtler direction — the one exit itself.** A guard that forbids every exit while the single
exit has quietly disappeared is guarding a pipeline with no way out:

```
# render.ts changed to `return result.body as unknown as NextResponse`
[ask-one-exit-guard] ⚠️  THIS RUN CHECKED NOTHING MEANINGFUL: …/render.ts constructs no response —
                      the one exit is gone, so forbidding the others guards nothing
[ask-one-exit-guard] A guard that cannot fail is worse than no guard. Exiting non-zero.
GUARD_EXIT=1
```

It also exits non-zero if the walk found fewer than two files.

### ⚠️ THE GUARD'S SCOPE WAS NARROWED, AND THE REASON MATTERS

The obvious reading — scan the prefix `src/app/api/aria/ask/` — is **wrong**. That directory holds
**eleven other routes**: `action/`, `audit/`, `delete/`, `escalate/`, `export/`, `history/`,
`rollback/`, `search/`, `suggestions/`, `thread/`, `upload/`. Ordinary REST endpoints, no connection
to the turn pipeline, every one of them legitimately constructing a response. A prefix scan would
have failed the push on all eleven — failure pattern #2 in guard form, and **a rule that fires on
the innocent gets loosened until it fires on nothing.** The turn route is named as a single file, and
a test asserts all eleven siblings are ignored.

### ⚠️ A THIRD CORRECTION, CAUGHT BEFORE THE COMMIT: `image` IS NOT A TOP-LEVEL LANE

My first `decide()` offered `image` as a candidate ahead of `main`. Measured against the route, that
is wrong. The image fast-path is at **route.ts:2362 — AFTER `buildAskAriaContext()` at 1517**, which
is 19 DB queries, and it **never reads `ctx`** (checked: zero references between 2358 and 2392).
Offering it earlier would render a **byte-identical body while skipping those 19 queries**.

**Phase 6 compares rendered JSON and would have reported "no diff".** It is still a change, and
"behaviour identical" is this sprint's entire standard — so this is precisely the class of silent
drift a replay cannot catch and a reader has to.

`stopped` (2470) and `total_outage` (2536) are inside the main lane's flow for the same reason. All
three are **sub-exits of `main`**: the main strategy returns a `TurnResult` whose `lane` names
whichever exit it took. `LANE_NAMES` still has 20 members — they are exit identities — but
`decide()` offers only the 13 top-level lanes, and a test asserts the other seven never appear.

### THE 25 REGEXES WERE EXTRACTED BY SCRIPT, NOT RETYPED

Twenty-five patterns of that density cannot be transcribed by hand without introducing a difference
nobody would ever find. A script pulled each one from `route.ts` with its line number, which is now
a `// route.ts:NNN` comment on every line. **Verified: all 20 named constants byte-identical to the
line they came from, 0 drifted.** A test re-checks that on every run and is marked **delete in phase
4** — between phase 2 and phase 4 the regexes exist in two places, and two copies is failure pattern
#4; the only honest way to run a migration through it is to assert they cannot diverge while both
exist.

| | |
|---|---|
| **files changed** | `pipeline/run-turn.ts` (+405) · `pipeline/features.ts` (+167, generated) · `pipeline/render.ts` (+43) · `pipeline/one-exit-rule.ts` (+150) · `scripts/ask-one-exit-guard.ts` (+103) · 3 test files (+419) · `package.json` (+1) · `scripts/git-hooks/pre-push` (+11) |
| **sibling sweep** | Other pre-push-wired guards: `canon-rail-guard.ts` only — the new guard is added beside it, not instead of it. Other `Grounding` / `TurnResult` declarations: 0 (phase 1). Other files constructing a response under `pipeline/`: 1, and it is `render.ts`. |
| **mutation check** | **Five, all observed.** Probe planted → guard red; probe removed → green; `render.ts` stripped of its response → guard red on anti-vacuity; `decide()` offering `inventory_agent` unconditionally → caught by the spine's own test before I noticed it myself; and `image` offered as a top-level candidate → caught by re-reading the route, not by a test. |
| **gates** | tsc 0 · vitest 135 files / **1771** tests pass · `BUILD_EXIT=0` from `build.log` · one-exit guard 0 · hook ran |
| **NOT done** | **The spine is not wired to the route** — nothing imports `runTurn()` yet; that is phase 4. The registry is empty, and `act()` throws loudly on a missing lane rather than answering with nothing. `verify()` stamps `{ ran: false, reason: 'M18 …' }`. No lane bodies moved yet (phase 3). |


---

## PHASE 3 — WRAP THE LANES ⛔ **PARKED — built, verified, and NOT PUSHABLE**

**The work is complete and green. It cannot be pushed without breaking a locked rule, so it is
parked rather than forced.** Everything is preserved:

```
local branch   m17-phase3-parked   (5013c368)
working tree   src/lib/aria/ask/strategies/  ·  pipeline/admission.ts  ·  pipeline/turn-persistence.ts
restore with   git merge m17-phase3-parked        (or just keep working — the files are on disk)
```

### WHAT WAS BUILT, AND IT WORKS

**28 exits → 23 `TurnResult`s across 12 strategies + 5 admission gates → one `render()`.** Counted:

| | exits |
|---|---|
| 12 strategy files | **23** — `pending_action` 4 · `main` 4 · `action_planner` 3 · `agent_composer` 2 · `inventory_agent` 2 · `council` 2 · `save_plan` · `nav_fastpath` · `general` · `multi_domain` · `deliverable` · `background_task` |
| `pipeline/admission.ts` (stage 0) | **5** — `rate_limited_user` 429 · `bad_request` 400 · `cost_guard_blocked` · `rate_limited_minute` 429 · `cost_ceiling` 402 |
| | **28 → one `render()`** |

Gates on the parked commit: **tsc 0 · vitest 135 files / 1778 tests pass · one-exit guard exit 0 ·
`BUILD_EXIT=0`.**

**Proof it was a MOVE and not a rewrite** — a script reconstructs each strategy body, undoes the
declared edits, and diffs against the original slice from `route.ts`:

```
save-plan · pending-action · agent-composer · action-planner · inventory-agent · nav-fastpath
general · multi-domain · deliverable · background-task · answer-council      →  ALL IDENTICAL
0 strategy file(s) with undeclared differences
```

`main.ts` (1,262 lines) checked separately: **14 differing lines, every one a declared feature-const
removal.** Zero undeclared.

### ⛔ WHY IT IS PARKED — THE CANON RAIL CANNOT TELL A MOVE FROM AUTHORSHIP

`scripts/canon-rail-guard.ts` is a **diff scanner over added lines**. Moving 2,300 lines of
grandfathered code into new files presents every one of them as newly authored. The push was
**BLOCKED with 23 violations, none of which are new code.**

**20 of the 23 I fixed properly**, because locked **RULE 7** requires it and a discarded Supabase
error is the silent-failure shape that soft-deleted a row in `/api/customers/merge` and landed 0 of
854 audit inserts in `council-executor.ts`. Each is `const { data } = …` → `const { data, error } =
…` plus a log. **No control flow, no response body changes.** The most consequential ones:

| site | what the silence was hiding |
|---|---|
| `pending-action.ts` pending read | a lost read reads as *"no pending action"*, so the owner's **"confirm" falls through to smalltalk and the action they approved never runs** |
| `pending-action.ts` mass-confirm re-stage | **the injection backstop's own write.** If rejected, the owner is asked to reply "confirm" against a re-stage that was never stored, and the second confirmation the mass-mutation gate depends on can never arrive |
| `pending-action.ts` clear-after-execute | the action **has already executed**; a failed clear leaves `pending_action` live, so the next "yes" re-runs a write that already happened |
| `save-plan.ts` `aria_actions` INSERT | the whole point of the lane. Owner is told *"Plan saved"* and the Actions dashboard stays empty |
| `turn-persistence.ts` existing-thread read | falls through to the INSERT branch and creates a **second conversation** instead of appending |
| `admission.ts` per-minute count | a failed COUNT returns null, reads as "no calls this minute", and **lets the rate limit through** |

**3 could not be fixed, and all three are byte-identical moved lines** (verified present verbatim in
`route.ts`):

| | rule | line |
|---|---|---|
| `main.ts:730` | `ask-aria-prompt-outside-rail` | `systemPrompt = systemPrompt.replace('You are Aria', memoryBlock + …)` |
| `answer-council.ts:147` | `ad-hoc-revenue-sum` | `const gtSum = (rows) => (rows ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0)` |
| `main.ts:116` | `ad-hoc-revenue-sum` | the same-week-last-month `.reduce()` over `total_amount` |

**Why each is out of scope for M17:**

- **WALL 7** fires on any new line containing `You are Aria` under `src/lib/aria/ask/`. This line is
  a `.replace()` **needle**, not a prompt — it inserts the memory block immediately *before* the
  constitution's opening words. The canonical fix is `assembleAriaPrompt()`, and **it cannot express
  this**: it always emits `ARIA_CONSTITUTION` first, so memories would move from *before* the
  constitution to *after* it. **That is a behaviour change, and it is M18's.**
- **`ad-hoc-revenue-sum`** wants `getRevenueSnapshot()` / `getRevenueForRange()`. Both sums already
  use the canonical `status = 'completed'` filter, so the *values* are probably identical — but
  "probably" is not good enough for the council's ground-truth anchors, which feed GROUNDING-TEETH
  Check 6. Getting them wrong makes the council start rejecting valid numbers.

### WHY I DID NOT PUSH ANYWAY

Three doors, all locked:

1. **`--no-verify`** — on RULE 20's **NEVER, unattended** list, no exceptions.
   ⚠️ **RULE 14 explicitly contemplates this exact case** — *"a file move has done it before on
   byte-identical code… if a bypass is genuinely correct, say so explicitly"* — **and RULE 20
   overrides it.** The two rules conflict here; the later, absolute one wins. **This conflict is
   itself a finding and it will recur on any sprint that relocates grandfathered code.**
2. **Adding the new files to the rail's allow-lists** — `route.ts` is on none of them; those lines
   were grandfathered *by time*, not by name. Adding entries would create exemptions that never
   existed: loosening a guard to make my own code pass.
3. **Changing the 3 lines** — a behaviour change in the one sprint whose entire claim is that
   behaviour did not change.

**So the run halts here rather than forcing it.** The founder's call, and it takes a minute:
approve a one-time documented bypass for the move, or approve the canon migration of 3 lines as its
own small sprint ahead of M17.

### PHASES 4, 5 AND 6 — PARKED AS DEPENDANTS

`_POST` still holds all 28 exits, so: no route rewiring (4), no turn record (5), no replay (6).
Not attempted, nothing half-built. Per the standing table: *"A phase's dependants are parked → skip
them too, note the chain."*

### ⚠️ ONE FIX FROM PHASE 3 IS KEPT AND PUSHED: THE GUARD SHIPPED IN PHASE 2 WAS BROKEN

Phase 2's one-exit guard **fired on twelve files, and all twelve were the same sentence** — the line
in every strategy header explaining the migration. `stripComments()` handled `//` and single-line
`/* */`, and **a line in the middle of a multi-line block looks like ordinary code when you only
ever see one line of it.**

That is a defect in something I shipped, independent of whether the lanes move, so it is fixed and
pushed: `stripBlockComments()` blanks comment content while preserving line numbers. The rule was
**taught, not loosened** — a guard you have to phrase around is a guard people route around.

**Re-proved after the fix** with a probe whose doc block mentions a response on **line 3** and whose
real violation is on **line 6** — the guard reports **line 6**. Five new tests, including `/*`
inside a string, which must not blind the scanner.

### ALSO WORTH KNOWING: M13B's RAIL FIRED TWICE ON THIS WORK, AND WAS RIGHT BOTH TIMES

Naming the strategy `council.ts` made the registry import the bare `council` specifier M13B phase 2
retired repo-wide. **The rule is about the specifier, not the directory.** Renamed to
`answer-council.ts` — the better name anyway, since the lane wraps `runAriaCouncil()` from
`lib/aria/answer-council.ts`. It then fired **a second time on the comment explaining the rename**,
because that scan reads raw source and my sentence quoted the forbidden import verbatim. Sentence
reworded; the rail untouched. *A rule that is not mine to change gets worked with, not around.*

| | |
|---|---|
| **pushed from phase 3** | `pipeline/one-exit-rule.ts` (+62) · `one-exit-rule.test.ts` (+58) — the guard defect only |
| **parked** | 12 strategies (+2,447) · `turn-persistence.ts` (+243) · `admission.ts` (+97) · `strategies/index.ts` (+63) |
| **mutation check** | Probe with a **decoy doc block on line 3 and a real violation on line 6** → guard red, reporting **line 6**. Probe removed → green. |
| **gates (parked commit)** | tsc 0 · vitest 135 files / 1778 pass · one-exit guard 0 · `BUILD_EXIT=0` |
| **gates (pushed)** | tsc 0 · vitest green · one-exit guard 0 · canon rail **pass** |
