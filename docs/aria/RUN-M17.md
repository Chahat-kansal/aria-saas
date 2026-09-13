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

**1 · "~15 regex heuristics" understates it. Measured: 22 named regex constants** assigned inside
`_POST`, plus 3 more written inline (`isStrategicQuestion`, `isImageRequest`, the `/[\d%$]/` value
cue inside `isEditIntent`) — **25 regexes**, feeding **18 derived booleans**. Stage 1's feature
extraction has to carry 25, not 15. None are deleted or changed (M19 owns that).

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
SCAN         src/lib/aria/ask/pipeline/**  ·  src/lib/aria/ask/strategies/**  ·  src/app/api/aria/ask/**
ALLOW        src/lib/aria/ask/pipeline/render.ts     ← the one exit, permanently
GRANDFATHER  src/app/api/aria/ask/route.ts           ← phases 2–3 only; removed in phase 4
```

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
