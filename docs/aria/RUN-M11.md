# RUN-M11 · ARIA WORKS (part 1)

Started 3 September 2026. Autonomous run, RULE 20. Written incrementally — a halted run still
leaves a readable log.

---

## PHASE 0 — THE REGISTER AS FOUND

Read before anything was written: `ASK-ARIA-OPEN-BUGS.md`, `RUN-S9.md`, `RUN-S10.md`,
`docs/aria/ARIA-MEGA-SPRINT-INDEX.md`.

**Register state, as the file itself now reports it: 4 open · 6 parked · 13 closed or delisted.**

| # | state | one line |
|---|---|---|
| 3 | **OPEN** | the accuracy verifier has run once in three months — the council path returns first. A design decision, deliberately not guessed at. |
| 5 | PARKED (DDL) | `aria_message_feedback` does not exist, so there is no thumbs and no eval set accumulating. |
| 14 | **OPEN** | 10 logins / 15 min is too tight for CI's push cadence. Product-side fix is authorisation → founder's. |
| 15 | **OPEN** | an Upstash outage locks every owner out of login. Fail-open/closed is one global default, not per route. |
| 16 | **OPEN** | `cron_runs` has no watcher and the `[rate-limit] FATAL` has no consumer. |
| 17 | **OPEN** | POS product grid did not render for the smoke suite; needs the failure screenshot, not a hunch. |
| 2, 6-half, 12 | parked/founder | the credit outage (resolved by the founder), approve-reject + email-a-deliverable on `/classic`, the CI credential. |

Nothing in this sprint contradicts the register, and nothing in the register blocks it.

**Index cross-check, used only to avoid building someone else's sprint:** M12 owns cloud execution,
live progress, scheduled recurring work and cost transparency; M13 owns sub-agents, interrupt/steer
and the overnight agent; M15 owns the artifact/deliverable pipeline; M17 owns artifacts/canvas;
M18–M19 own the agent builder. **M120 is `TS-DEFECT-1` and M121 is `TS-1-REST`** — the two things
the previous run left open already have sprints of their own, so neither is picked up here.

---

## PHASE 1 — A REFRESH MUST NOT LOSE THE CONVERSATION ✅

**Commit:** `<phase-1>` · **files:** `src/lib/aria/thread-session.ts` (new, 148),
`src/lib/aria/thread-refresh.test.ts` (new, 29 tests), `src/components/ask-aria-ax/AskAriaTransition.tsx`
(+70/−3).

### What was losing the thread on refresh

**Nothing was losing it. Nothing was ever carrying it.**

`AskAriaTransition` held the open conversation in `useState` and nowhere else
(`AskAriaTransition.tsx:109`). React state does not survive a reload, so on F5 `conversationId`
came back `null`, `working` came back `false`, and the owner landed on the welcome screen. The
conversation itself was never at risk: `aria_conversations` had every message, `/api/aria/ask/history?id=&messages=true`
could hand it back with provenance intact (S3), and the Threads panel could reopen it in one click.
What was missing was the thread's **identity** — the page had no way of knowing what it had been
showing a second earlier.

**This is the M8 shape the sprint predicted, inverted.** M8 found a deep link passing a *display
string* where a record reference was needed. Here there was no reference of any kind to pass.

**Checked before adding one, as instructed:** no conversation-id URL parameter existed on either
surface. `/dashboard/ask-aria` reads exactly one query key, `q` (`:401`), and `/classic` reads the
same one and only that (`classic/page.tsx:548`).

### The fix

The thread id rides in the URL as `?c=<uuid>`, written at the three moments a thread starts or
stops being open, and read once on mount:

| moment | what happens |
|---|---|
| the Threads panel opens a thread | `syncThreadUrl(id)` inside `openThread` |
| the first answer creates a thread | `syncThreadUrl(result.conversation_id)`, beside `adoptDraft` |
| New chat | `syncThreadUrl(null)` — leaving must clear it, or the next refresh reopens what the owner stepped out of |
| **mount with `?c=`** | enter WORKING immediately, fetch, restore **through the same `openThread`** |

Three properties worth naming, because each forecloses a bug rather than adding a feature:

1. **`threadSearch` deletes `q` when it writes `c`.** `?q=` auto-sends on load (S5 phase 4). A
   conversation started from a briefing link would otherwise re-ask its question, and bill for it,
   on every refresh — the "a reload repeats an action" class M4 fixed on the send path. The `?q=`
   effect carries a second lock: a URL with both present restores and sends nothing.
2. **`replaceState`, never `pushState`.** A push per send would put one history entry per message
   behind the owner, and Back would walk backwards through a conversation they never left.
3. **WORKING is entered before the fetch resolves.** Waiting would show the welcome screen for the
   length of a round trip and then snap away — a flash of the exact wrong state.

**A restore that fails lands on welcome and drops the stale id.** `/api/aria/ask/history` answers
`{conversation: null}` for a thread that is deleted, another business's, or absent — the route's
own business filter and tombstone filter, unchanged — and every one of those is an ordinary thing
to click, not an error to shout about. Offline, 401, 500 and a thread with zero messages take the
same path.

**Scroll position** is remembered per thread in `sessionStorage` and applied once on restore, then
released so a live conversation is always pulled to its newest turn. It is not recorded while a
reply is streaming: the view is being dragged to the newest token then, and recording that would
remember the machine's position rather than the owner's. No memory → the bottom, which is the
existing behaviour and the right default.

**Nothing new is stored server-side and no route changed.** No new endpoint, no second store, no
authorisation change: a conversation id is not a capability, and the one route involved already
filtered every read by the caller's own `business_id`.

### Sibling sweep

Searched for every component holding a conversation id in React state alone: **9 hits, 5 of them
genuinely the same shape.**

| file | verdict |
|---|---|
| `ask-aria-ax/AskAriaTransition.tsx` | **fixed** — the default surface, the one the sprint observed |
| `ask-aria/classic/page.tsx:488` | **same defect, NOT fixed** — see below |
| `components/AriaFloatingPanel.tsx:92` | not a defect: a floating panel has no URL of its own to carry |
| `in-store/[business_id]/KioskClient.tsx:104` | different product (customer kiosk); a shared URL there would hand one customer another's session |
| `owner/[slug]/aria/page.tsx:36` | different surface, out of domain |
| `community/dm/[businessId]`, `website-chat/conversations`, `ThreadsPanel` ×2 | not conversation identity (thread list state, expanded-row state) |

**`/classic` carries the identical defect and is deliberately left alone.** It is retained (RULE 0)
and still uniquely holds approve/reject and email-a-deliverable, so it is reachable and an owner
can be on it. It is a different file with its own `loadConversation`, and fixing it is a second
change to a second surface inside a phase whose scope is the default one. **Listed, not taken** —
standing table: fix what is in the declared domain, list the rest.

### Mutation check

Replaced `const id = readThreadId(window.location.search)` with `const id: string | null = null` in
the real file — the defect, restored exactly.

```
MUTATED: the reload no longer reads the thread identity
 FAIL  src/lib/aria/thread-refresh.test.ts > MUTATION PROBE — dropping the thread identity on reload is detectable
 Test Files  1 failed (1)
      Tests  2 failed | 27 passed (29)
```

Reverted; 29/29 green. **It goes red, and it goes red on the right two assertions** — the mutation
probe and the rail that says the restore exists.

### Gates

`tsc --noEmit` (8 GB heap) **0** · `npx next build` **BUILD_EXIT=0 read from build.log:1963** ·
`vitest` **103 files / 1327 tests, exit 0**.

⚠️ **One cold vitest run failed 3 tests and I could not reproduce it.** The run immediately after
the 8 GB `tsc` reported `3 failed | 1324 passed` at 63 s wall / 103 s import — the only failure text
I captured was `src/lib/aria/agents/tier-caps.test.ts:70`. Three subsequent full runs and three
isolated runs of that file are all green. Recorded as an **unexplained flake under memory pressure**,
not dismissed: the other two files were never identified.

### NOT done, and why

- **The browser reload itself was never pressed.** This repo's vitest runner is `environment: 'node'`
  with no `@testing-library/react`, and adding one is a dependency change — the exact move that
  killed CI for three days in August. The Playwright smoke suite could do it but needs a login.
  **The mechanism is proven; the gesture is not.** See "what needs a person" at the end of this log.
- `?context=` and `?topic=` — **two dead deep links found in the sweep** and not fixed. See below.

### Discovered — two dead deep links, reported not fixed

`intelligence/page.tsx:527` links to `/dashboard/ask-aria?context=…` and
`dashboard/AriaSays.tsx:180` links to `/dashboard/ask-aria?topic=…`. **Neither parameter is read by
any surface** — not `/dashboard/ask-aria`, not `/classic`. Both land on a blank composer and the
owner's intent is dropped silently: failure pattern #1, and precisely what S5 phase 4 fixed for
`?q=`. Not fixed here because what they should *do* (auto-send? pre-fill? scope the answer?) is a
product decision, not a repair, and inventing one would be inventing scope.

---

## PHASE 2 — CAN A PLAN LIVE IN THE EXISTING TABLES?

*(in progress)*
