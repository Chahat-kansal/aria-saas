# RUN-MS17 — ONE PANEL. EVERYTHING REAL. NOTHING LOST.

**Run date:** 2026-08-25 · autonomous (RULE 20) · branch `main`

---

## THE ONE-SCREEN SUMMARY

**Six phases done, six commits.** Everything visible on the new surface is now real.
**The swap did not happen, and that is the correct outcome** — eleven capabilities are still on the
old page, so deleting it would have lost them.

| phase | commit | outcome |
|---|---|---|
| 1 — the inventories | `9697458a` | **10 fake controls found** |
| 2 — migrate | `458fb57d` | 13 capabilities moved |
| 3 — wire or remove | `ce73527e` | 8 wired, 2 removed |
| 4 — the swap | `d1d7407b` | 5 more migrated · **swap BLOCKED, old page kept** |
| 5 — real data walk | `32038056` | 15/15 wires resolve · no overflow · no drawn face |
| 6 — the rail | `2fd523f7` | dead-wire detection added |

### The three things you most need to know

**1. The headline number was ten.** Ten controls on `/ax` did nothing at all — no handler, no route,
no store. Four were the room tabs the whole panel is organised around. **Eight are now wired to
real routes; two were deleted**, and the reasons are below. Zero fake controls remain, and a test
now fails if one reappears.

**2. The swap is blocked, deliberately.** Your rule was "no old feature may be lost." Eighteen of
twenty-nine old capabilities are migrated; **eleven are not**. So `/dashboard/ask-aria` still serves
the old page, unchanged and fully working, and the new surface stays at `/dashboard/ask-aria/ax`.
Nothing is lost and nothing is pretended.

**3. One control is parked on purpose.** The old page can **email** a deliverable. That route sends
a message to a person, and your decision table parks anything that sends. The new surface offers
PDF and "ask about it" instead. The route is untouched; the old page still offers it.

---

## PHASE 1 — THE TWO INVENTORIES

Full tables in **`docs/aria/ASK-ARIA-INVENTORY.md`**. Derived by reading the source and querying the
live database — nothing from memory.

### THE FAKE-CONTROL COUNT: 10 of 20

| | |
|---|---|
| controls that were real | 10 |
| **controls that were fake** | **10** |

Four room tabs · mic ×2 · attach · share · more · the mode chip.

The mode chip was the worst: a `<span>` styled as a dropdown, **caret and all**, that could not even
be focused by keyboard.

### What Table A actually found

**29 capabilities across 16 routes** — not the five the brief listed as known. Beyond
deliverables/artifacts/skills/voice/upload: audit log + rollback, conversation history/open/delete,
regenerate, action preview + confirm/cancel/save-plan, deliverable PDF + email, recurring report
schedules, the block renderer, save-to-files, vitals, the briefing modal, the degraded-provider
banner, the council indicator, message actions, and the document result card.

Live row counts, because *has rows* and *has a writer* are different questions:

```
aria_conversations     172/286   newest TODAY     live
aria_actions           409/437   newest TODAY     live
aria_ai_calls        2862/10180  newest TODAY     live
aria_skills              6/18    newest 25 Jul
aria_action_log         64/64    newest 25 Jun    nothing in two months
aria_task_outputs       26/26    newest 17 Jun    stale rows, LIVE writer
aria_scheduled_reports    1/1    newest  5 Jun    used once, ever
```

### Two findings that decided Phase 3

- **"Made for you" is legitimate.** `aria_task_outputs` looks abandoned at 26 rows since June, but
  **Save to Files → `/api/canopy/reports` → `canopy-reports.ts:65` inserts into it**, owner-triggered
  and reachable today. Stale data, live writer.
- **There is no `house_rules` table.** House rules are `aria_business_memory` rows with
  `kind='house_rule'`, and that kind has **zero rows for every business, ever**. A complete tested
  CRUD library exists whose only production caller is onboarding provisioning — no API route and no
  UI lets an owner write one.

---

## TABLE A — MIGRATED / PARKED

**18 migrated · 11 not.**

| # | capability | status |
|---|---|---|
| 1 | Ask Aria (streaming) | ✅ migrated |
| 2 | Conversation history | ✅ migrated — `ThreadsPanel` |
| 3 | Open a past conversation | ✅ migrated |
| 4 | Delete a conversation | ✅ migrated |
| 5 | New conversation | ✅ migrated |
| 6 | Regenerate | ✅ migrated — "Ask again" |
| 7 | File upload / doc analysis | ✅ migrated — same route, same FormData |
| 8 | Voice input | ✅ migrated — both composers |
| 9 | Chat suggestions | ✅ migrated |
| 10 | Skill picker (CRUD) | ✅ migrated — replaced the dead mode chip |
| 11 | Action preview / fork | ❌ **not migrated** |
| 12 | Confirm / cancel action | ⚠️ partial — `ProposalCard` approves via the same endpoint; fork/preview variants not moved |
| 13 | Save plan action | ❌ **not migrated** |
| 14 | Audit log + rollback | ✅ migrated — into the Awaiting room |
| 15 | Deliverables list | ✅ migrated — Made for you |
| 16 | Deliverable → PDF | ✅ migrated |
| 17 | Deliverable → email | 🅿️ **PARKED — it sends** |
| 18 | Recurring report schedule | ❌ **not migrated** |
| 19 | Artifact rendering | ❌ **not migrated** |
| 20 | Artifact parse telemetry | ❌ **not migrated** |
| 21 | Block renderer | ✅ migrated — charts/tables in answers |
| 22 | Save to Files | ❌ **not migrated** |
| 23 | Vitals strip | ❌ **not migrated** |
| 24 | Daily briefing modal | ❌ **not migrated** |
| 25 | 3D Aria | ✅ migrated (MS16C) |
| 26 | Degraded / outage banner | ✅ migrated |
| 27 | Council indicator | ✅ migrated |
| 28 | Message actions (copy) | ✅ migrated |
| 29 | Document result card | ⚠️ partial — upload shows a text summary, not the structured card |

---

## TABLE B — WIRED / REMOVED

### WIRED (8)

| control | now does |
|---|---|
| Room tab **Ask** | `setRoom('ask')` — the conversation |
| Room tab **Awaiting you** | `AwaitingRoom` over `aria_actions` (409 Sip rows, 54 pending) **+ a live badge** |
| Room tab **Made for you** | `MadeForYouRoom` over `aria_task_outputs` — list + PDF export |
| **Mic** (welcome) | `VoiceInput` — the real Web Speech component |
| **Mic** (working) | `VoiceInput` |
| **Attach** | hidden file input → `/api/aria/ask/upload` |
| **More (⋯)** | `ThreadsPanel` — history, open, delete |
| **Mode chip** | was a `<span>`; now a button opening the real `SkillPicker` (`/api/aria/skills`) |

### REMOVED (2), with reasons

**Share (🔗)** — there is no thread-share route. `/api/aria/task-outputs/[id]/share` shares an
**output**, not a conversation. A button that cannot share is worse than no button, so it is gone
rather than stubbed. *To bring it back:* a conversation-share route.

**Routines / House rules tab** — `kind='house_rule'` has **zero rows for every business, ever**, and
no API route or UI can create one. A tab there could only ever be empty, which is a fake control
wearing an empty state. *To bring it back:* an owner-facing route over the existing, already-tested
`createHouseRule`/`editHouseRule`/`retireHouseRule` library, then the tab. **The library is the hard
part and it is already written** — this is close, and worth a sprint of its own.

---

## PHASE 5 — THE CONTROL WALK

**A. Wiring — all 15 routes the surface calls resolve to a route file.** Zero dead wires:

```
/api/aria/ask · ask/action · ask/audit · ask/delete · ask/history (+ templated ?id=&messages=true)
ask/rollback · ask/suggestions · ask/upload · autonomy · ax-context · deliverable-pdf
deliverables · skills (+ ?id=)
```

**B. Render at 1280 / 1440 / 1920 × 900, both states:**

```
tabs = [Ask | Awaiting you | Made for you]      ← Routines correctly absent
17 buttons · 3 inputs · drawnFace=0 · horizontal overflow = false, every size
```

`drawnFace=0` counts `.hair/.head/.fringe/.eye/.smile/.torso/.lapel` in the rendered DOM at every
size and state, so the contract's placeholder face cannot creep back unnoticed.

### ⚠️ WHAT PHASE 5 IS NOT — the distinction this whole sprint exists to protect

**No control was clicked in an authenticated session.** The route sits behind `DashboardShell` and
Supabase auth, and `.env` is not readable in this environment. This walks the **wiring** and the
**render**, not a live click. **It proves a wire exists and resolves — not that current flows
through it.** A route that exists and 500s against Sip's data would pass this and fail a real user.

**Nothing rendered plausibly and did nothing** — that was the failure mode to report, and the
handler rail plus the dead-wire rail between them make it impossible to reintroduce silently. But
"impossible to reintroduce silently" is not the same as "exercised against Sip today", and I am not
going to blur those.

**What you should check on the deployed site:** open `/dashboard/ask-aria/ax`, click each room tab,
open ⋯ for threads, press the mic, attach a file, and open Skills. Those are the eight newly wired
controls.

---

## PHASE 6 — THE RAIL, AND ITS HONEST GAP

Two tests, both permanent:

1. **Every interactive element has a real handler.** Scans `<button>`, `<a>`, `<input>`, `<textarea>`
   across the five surface files. The tag walker respects brace depth, so
   `onClick={() => setX(a > b)}` is not cut short at the inner `>`, and `<a` does not match
   `<AwaitingRoom`. Also rejects **no-op handlers** — `() => {}`, a bare `console.log`, a lone toast,
   `undefined`.
2. **Every wire reaches a real route.** Every `/api/...` path the surface fetches must resolve to a
   `route.ts` on disk — including the templated form. Guarded against passing vacuously by asserting
   at least eight paths were found and naming three.

**Mutations, all RED:** a handler-less button · `send` rewired to `console.log` · `ThreadsPanel`
repointed at a non-existent route. Restored clean each time.

### What the rail CANNOT catch — kept in the test file's own header

1. **A route that exists and 500s**, or returns `[]` because its table has no writer. It proves a
   wire exists, not that it carries current.
2. **Controls inside imported components** (`VoiceInput`, `SkillPicker`, `BlockRenderer`) — covered
   by their own files, not by this scan.
3. **Tags the matcher never sees**, e.g. `<button {...handlers} />`.
4. **A handler that runs and achieves nothing** — `onClick={() => setOpen(open)}`. Syntactically
   live, semantically dead.

**It is a floor, not a ceiling.**

---

## MISTAKES I MADE THIS RUN

**The backslash trap, again, and it went quiet rather than red.** The Phase 6 block was first
injected through a shell heredoc, which turned the `\n` inside a string literal into a real newline
and left the test file unparseable. Vitest reported **"no tests"** — the failure mode where a suite
goes silent instead of failing. This is the exact rule already on the wall: *backslash-bearing edits
go through script files, not heredocs.* Fixed with the Edit tool.

**Two assertions caught by their own comments.** A "no Routines room" check failed against the
comment explaining why the room was removed, and a similar one in MS16C failed against its own
warning text. Both now strip comments before matching, with a probe proving the stripper doesn't
hide a real occurrence.

---

## GATES

- `npx tsc --noEmit` — **0 errors**
- `npx vitest run` — **737 passed / 737**, whole suite (62 files)
- **All mutations RED**: handler-less button · no-op handler · dead route · hard-coded badge
- **Visual baseline still 0.0px** after every change, both states
- `npx next build` — **BUILD_EXIT=0**, read from the log, never the wrapper

Route sizes from that build, worth keeping beside the swap decision:
```
/dashboard/ask-aria       22.2 kB   452 kB   <- the OLD page, still serving
/dashboard/ask-aria/ax     8.85 kB  206 kB   <- the new surface
```
The new surface grew from 181 kB to 206 kB this sprint, which is the eight newly
wired controls and the three rooms. The 18 MB GLB is still not in it.

## WHAT IS NOT DONE

- **The swap.** `/dashboard/ask-aria` still serves the old page; the new surface is at `/ax`.
  Eleven capabilities remain on the old page — listed above.
- **Deliverable email** — parked because it sends.
- **Nothing was clicked under real auth.**
- **The Routines room** — removable today, buildable cheaply, because the CRUD library already
  exists and is tested. It needs an owner-facing route and a room.
