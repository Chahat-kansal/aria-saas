# RUN-M17 · BRAIN-1 — THE SPINE

13 September 2026. Autonomous run, RULE 20. Written incrementally — a halted run still leaves a
readable log.

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
