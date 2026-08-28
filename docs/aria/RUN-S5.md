# RUN-S5 — the swap

**Run date:** 2026-08-28 · autonomous (RULE 20) · branch `main`
**Eight commits** — six phases plus two defect fixes I caused or uncovered on the way.

---

## THE ONE-SCREEN SUMMARY

| phase | commit | outcome |
|---|---|---|
| 0 — gate | — | 4/4 columns, 2/2 indexes · provenance still 0 · nothing written since 26 Aug |
| 1 — why `/ax` didn't render | `36fbb7d2` | **the premise was wrong — `/ax` renders fine** |
| 2 — the inventory | `002b04bd` | **6 capabilities were old-page-only** |
| 3 — the watchdog | `bcf42c86` | one shared watchdog, tested as **behaviour** for the first time |
| — flaky timings | `6f8099dd` | my own test margins widened |
| 4 — migrate | `56adf6fc` | **1 migrated (`?q=`), 5 parked** |
| — security-rail flake | `986f05bf` | `staff-pin.test.ts` walk cached |
| 5 — **THE SWAP** | `d6ca087f` | **`/dashboard/ask-aria` now serves the built surface** |
| 6 — the first real turn | — | **NOT RUN** — cannot authenticate |

### The three things you most need to know

**1. `/ax` was never broken, and measuring that changed the sprint.** The paste said it appeared
only in edge-middleware with no serverless render. Over 7 days: **middleware 14, function 13,
redirect 1 — thirteen 200s.** It rendered fine. Nothing pointed at it: all ~14 navigation entry
points already linked to `/dashboard/ask-aria`. So the fix was never a redirect rule — it was moving
the surface onto the URL the product already links to.

**2. The swap happened, and the old page is still reachable at `/dashboard/ask-aria/classic`.**
Five of six old-page-only capabilities are parked, and the decision table is explicit that a parked
capability means no retirement.

**3. Provenance is still 0 of 289, and the second blocker is still live.** The Anthropic credit
rejection appears in production logs **within the last 24 hours** (`cron/generate-briefings`,
`cron/dispatch/h08`). Even now that the surface is swapped, a real turn would fall back to Gemini.

---

## PHASE 1 — WHY `/ax` "DID NOT RENDER"

**It did.** Queried live over 7 days:

```
/dashboard/ask-aria/ax     source: middleware 14 · function 13 · redirect 1
                           status: 200 x13 · 307 x1
```

I read `src/middleware.ts` end to end: **there is no `ask-aria` or `/ax` rule in it**, and every
`/dashboard/*` gate (POS-employee, auth, trial) treats both routes identically. The single 307 is one
auth/trial redirect out of fourteen — the same gate the old page passes through.

**The cause was navigation, not routing.** Every entry point linked to `/dashboard/ask-aria`:
`AriaFloatingPanel:20`, `AriaCommandBar:30,227`, `RetailDashboard:34,279`,
`MorningCommandCentre:332,567`, `DailyBriefingModal:175,191,505`, `AriaSays:180`, `ProWidgets:303`,
`SpotlightTour:262,270`, `ComingSoonPage:25`. **Zero pointed at `/ax`.** Its 14 requests were someone
typing a URL.

**Does it affect other routes?** No. Nothing to fix in routing at all.

---

## PHASE 2 — THE INVENTORY (`docs/aria/ASK-ARIA-SURFACE-INVENTORY.md`)

> **Capabilities that existed ONLY on the old page: 6.**

And the two the sprint feared most were **not** among them: **voice and file upload are already on
`/ax`** (`VoiceInput`/`SkillPicker` imported by `AskAriaTransition`; upload posts to the same
`/api/aria/ask/upload` at `:306`). That is what made the swap viable.

| # | old-page-only | note |
|---|---|---|
| A2 | **`?q=` auto-send** | ~8 links depend on it — **migrated** |
| A6 | approve/reject | `ProposalCard` exists on `/ax` and **nothing renders it** |
| A16 | artifact rendering | — |
| A17 | save artifact to Files | `aria_task_outputs` = **26 real rows** |
| A18 | artifact parse-failure telemetry | `aria_ai_calls` |
| A19 | scheduled reports | `aria_scheduled_reports` = **1 real row** |

Two things I excluded **with reasons rather than padding the number**: the daily-briefing modal is
mounted in `dashboard/layout.tsx` and reachable from every dashboard route regardless; and vitals is
not lost — `/ax` shows the same information via `ax-context`, and the table says keep the newer
behaviour.

**A finding the inventory produced by itself:** `ProposalCard.tsx` is referenced **only by tests**.
No surface renders it. That is the **fourth** instance of this class (Stop → S1, rename/pin → S2B,
provenance → S3), and **S3's phase-4 rail does not catch it** — that rail inspects the props of
components that *are* rendered, and a component nobody renders has no call site to inspect. A known
gap in a rail I wrote.

---

## PHASE 3 — ONE WATCHDOG, TESTED AS BEHAVIOUR

S4 fixed the old page by **writing the watchdog a second time, inline**. Right under pressure, wrong
to leave: two copies of a timing rule on the send path is how they drift. Extracted to
`lib/aria/stream-watchdog.ts`; both surfaces call it; a test asserts **neither** still carries an
inline `stalled = true; controller.abort()`.

**And it is now tested as behaviour, not as source text** — every previous watchdog assertion in this
repo was a regex over a file. Against real timers and an actually-silent stream:

- a stream that never speaks **rejects in <1s** instead of hanging
- **the next send works** afterwards — the caller is left usable, which was the entire failure
- 6 kicked frames **survive** far past the budget (a once-only timer would kill a healthy answer)
- a stream going quiet **mid-answer** still stalls
- a real error passes through unchanged; **a user abort stays an AbortError** so Stop still reads as
  "— stopped —" rather than an error the owner never caused

**Eight existing assertions broke and were rewritten, not deleted**, each with a note that the
behaviour *moved*. One got stronger: "both surfaces use the same constant" now asserts neither
surface names a timeout at all, because neither owns the timing any more.

**Verified on the surface that is now default:** `AskAriaTransition:729-737` renders the error,
offers Retry only when `error.retryable`, and otherwise says *"Retrying won't change this one."*

---

## PHASE 4 — 1 MIGRATED, 5 PARKED

**`?q=` auto-send** — the highest-consequence, lowest-risk of the six. It fires **once** behind a ref
guard, and that guard is the whole subtlety: `ask` is recreated whenever `conversationId` changes, so
without it the owner's question would be sent twice and **billed twice**.

**Parked, with reasons:**

| # | why |
|---|---|
| A6 approve/reject | **Parked on the decision table, not on difficulty** — it is the authorisation path for actions and money-adjacent. The component is complete; what is missing is a verified mapping from the route's action payload to its props, and an approval card is the last place to guess. |
| A16/A17/A18/A19 | substantial UI, telemetry and scheduling work that **cannot be exercised without a session** |

Phase 4's VERIFY asks for each migrated capability to be exercised against real data. I cannot
authenticate, so I migrated the one whose correctness is establishable without a session and parked
the rest rather than claim four unverifiable migrations.

---

## PHASE 5 — THE SWAP

**Verified in the build output, not asserted:**
```
ƒ /dashboard/ask-aria          458 B     253 kB    <- the thin built surface
ƒ /dashboard/ask-aria/ax       456 B     253 kB
ƒ /dashboard/ask-aria/classic  22.3 kB   453 kB    <- old surface, still built, still reachable
```
The canonical route went from 22.3 kB to 458 B. **That drop is the swap.** `BUILD_EXIT=0`, no dead
imports, all three routes dynamic (`ƒ`).

### What remains reachable, and where
**`/dashboard/ask-aria/classic`** — the 1,691-line original, carrying the five parked capabilities.
A test pins that it still contains `AriaArtifact`, `SaveToFilesButton`, `ActionPreviewCard`,
`intelligence/schedules` and `artifact-parse-failure`, so they cannot be quietly lost by a later edit.

**Retirement is deliberately NOT in this commit.** A revert is one line: point `page.tsx` back at the
old import.

---

## PHASE 6 — THE FIRST REAL TURN: NOT RUN

**I cannot authenticate to this deployment, and I have substituted nothing.**

```
conversations                289
carrying provenance            0      <- unchanged for five sprints
newest last_message_at        2026-08-26 07:30:51 UTC (17:30 Melbourne)
```

**Both blockers S4 identified are still in play**, and one is measurably live: the Anthropic credit
rejection appears in production logs **within the last 24 hours** (`/api/cron/generate-briefings`,
`/api/cron/dispatch/h08`). So even with the swap deployed, a council turn would fall back to Gemini —
and **an answer without tools is not proof the chain works.**

### What a human must click

1. **Deploy.** The swap only exists in the repo until then.
2. Open **`/dashboard/ask-aria`** — confirm it is the new surface (rooms across the top, avatar,
   "Awaiting you" tab). If it looks like the old chat, the deploy has not landed.
3. Ask something **strategic** — *"how do I grow midweek?"* — so it takes the council path. A plain
   data lookup will not produce anchors.
4. Watch the answer. **A figure should be underlined; click it and a source line should appear.**
5. Reload the thread. **Both must survive.**
6. Run: `select count(*) from aria_conversations c where exists (select 1 from
   jsonb_array_elements(c.messages) m where m ? 'provenance')`
   → **must be ≥ 1. It is 0 today.** This is the only real proof of S3's chain.
7. **Check which provider served it.** If the answer arrived but step 6 is still 0, the turn ran on
   Gemini — fix the Anthropic credential first (`docs/aria/S4-anthropic-credential.md`: org →
   **workspace spend limit** → balance, then **redeploy**, because the key is cached at cold start).
8. Test `?q=`: open `/dashboard/ask-aria?q=how+did+last+week+go` — **it must send by itself.**
9. Let a send hang. After 45s it must show an **error with a Retry button**, not blink forever —
   then send again and confirm it fetches.
10. Visit **`/dashboard/ask-aria/classic`** and confirm the five parked capabilities still work.

---

## GATES

- `npx tsc --noEmit` — **0 errors**
- `npx vitest run` — **1075 passed / 1075** across 82 files, **three consecutive clean runs**
- `npx next build` — **BUILD_EXIT=0**, read from `build-s5.log`
- **Mutations, all RED:** removing the watchdog from either surface · removing `?q=` auto-send ·
  pointing the canonical route back at the old surface

### Two defects I caused or uncovered, both fixed and both recorded

**I committed phase 4 with two failing tests.** That breaks the protocol. It was unpushed, I caught
it on the next run, and rather than re-running until green I looped with output captured to a file
until a failure reproduced. It was **`staff-pin.test.ts` at 7,267ms** against vitest's 5s default —
a security rail failing on disk contention, not on security. Not my code and not the swap. Fixed at
the cause: the walk stats several thousand files and ran **twice**, so it is now cached, plus the
explicit timeout its sibling already had. 2 failures in 7 runs → 0 in 3.

**My own phase-3 tests were fragile.** They used real timers at 40–60ms, including 6 frames at 30ms
against a 60ms budget — a 2:1 ratio that contention can break. Widened to 16:1. A flaky test on the
send-path guard is worse than none: it trains people to re-run instead of read.
