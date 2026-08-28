# ASK ARIA — SURFACE INVENTORY

**Compiled:** 2026-08-28 · derived by reading both surfaces and querying the live database.
Nothing here comes from memory or from a sprint paste. Every row cites a file:line; every table
named carries a live row count.

**MS17 commissioned this inventory and it was never completed. This is it.**

- **Table A** — `/dashboard/ask-aria` (`src/app/dashboard/ask-aria/page.tsx`, 1,691 lines)
- **Table B** — `/dashboard/ask-aria/ax` (`AskAriaTransition.tsx` + `rooms/*`, `useAriaStream.ts`)

### Live row counts used throughout
```
aria_conversations 289 · aria_actions 438 (59 pending) · aria_suggestions 114
aria_task_outputs   26 · aria_action_log  64 · aria_scheduled_reports 1 · aria_ai_calls 10,265
```

---

## THE HEADLINE NUMBER

> **Capabilities that exist ONLY on the old page: 6.**
> Four have no equivalent anywhere on `/ax`; two exist on `/ax` but are **not wired**.

That number is small enough that the swap is viable — and none of the six is voice or file upload,
which the sprint flagged as the likely blockers. Both of those are already on `/ax`.

---

## TABLE A — `/dashboard/ask-aria` (the old page)

| # | Capability | Handler / route | Table | Rows | On `/ax`? |
|---|---|---|---|---|---|
| A1 | Send a question, stream the answer | `page.tsx:652` `send()` → `POST /api/aria/ask` | `aria_conversations` | 289 | ✅ `useAriaStream.ts:80` |
| A2 | **`?q=` auto-send from a link** | `page.tsx:578` `URLSearchParams(...).get('q')` | — | — | ❌ **NONE** |
| A3 | Stop a running answer | `page.tsx:669` `abortRef` + `controller.abort()` | — | — | ✅ `useAriaStream.ts:61` `cancel()` |
| A4 | Conversation history / open a thread | `GET /api/aria/ask/history` | `aria_conversations` | 289 | ✅ `ThreadsPanel.tsx:66` |
| A5 | Delete a thread | `DELETE /api/aria/ask/delete` | `aria_conversations` | 289 | ✅ `ThreadsPanel.tsx:111` (soft delete, S2B) |
| A6 | Approve / reject a proposed action | `POST /api/aria/ask/action` + `ActionPreviewCard` (`:1585`) | `aria_conversations` | 289 | ⚠️ **built, NOT rendered** — `ProposalCard.tsx:55` |
| A7 | File upload → document read | `POST /api/aria/ask/upload` (`:852`) | `aria_ai_calls` | 10,265 | ✅ `AskAriaTransition.tsx:306` |
| A8 | Voice input → transcript into composer | `VoiceInput` (`:1660`) | — | — | ✅ imported by `AskAriaTransition` |
| A9 | Skill picker | `SkillPicker` (`:1655`) | — | — | ✅ imported by `AskAriaTransition` |
| A10 | Chat suggestions | `ChatSuggestions` (`:1376`) → `/api/aria/ask/suggestions` | `aria_suggestions` | 114 | ✅ AX calls the same route |
| A11 | Audit log card | `AuditLogCard` (`:1611`) → `/api/aria/ask/audit` | `aria_action_log` | 64 | ✅ imported by `AskAriaTransition` |
| A12 | Rich blocks (charts/tables/KPI) | `BlockRenderer` (`:1477` region) | — | — | ✅ `AskAriaTransition.tsx:660` |
| A13 | Deliverables list | `GET /api/aria/deliverables` | `aria_task_outputs` | 26 | ✅ `MadeForYouRoom.tsx` |
| A14 | Deliverable → PDF | `POST /api/aria/deliverable-pdf` | `aria_task_outputs` | 26 | ✅ `MadeForYouRoom.tsx` |
| A15 | Deliverable → email | `POST /api/aria/deliverable-email` | `aria_task_outputs` | 26 | ✅ `MadeForYouRoom.tsx` |
| A16 | **Artifact rendering** (typed segments) | `AriaArtifact` (`:1477`) | — | — | ❌ **NONE** |
| A17 | **Save an artifact to Files** | `SaveToFilesButton` (`:468`) | `aria_task_outputs` | 26 | ❌ **NONE** |
| A18 | **Report a bad artifact parse** | `POST /api/aria/artifact-parse-failure` (`:249`) | `aria_ai_calls` | 10,265 | ❌ **NONE** |
| A19 | **Scheduled reports** | `POST /api/aria/intelligence/schedules` (`:407`) | `aria_scheduled_reports` | **1** | ❌ **NONE** |
| A20 | Business vitals strip | `GET /api/aria/vitals` (`:552`) | `pos_sales` | hot | ⚠️ different shape — `ax-context` |
| A21 | Daily briefing modal | `DailyBriefingModal` (`:import`) | `daily_briefings` | — | ❌ not on `/ax`, but **mounted in the dashboard layout** — reachable regardless |

---

## TABLE B — `/dashboard/ask-aria/ax`

| # | Capability | Handler / route | Table | Rows | Old page has it? |
|---|---|---|---|---|---|
| B1 | Send + stream, **with stall watchdog** | `useAriaStream.ts:80`, watchdog `:113` | `aria_conversations` | 289 | ⚠️ watchdog added to old page by S4 |
| B2 | **Classified errors + Retry** | `chat-errors.ts` + `retry()` `useAriaStream.ts:153` | — | — | ⚠️ classifier yes (S4); **retry button no** |
| B3 | **Provenance tiering + click-to-source** | `AnswerMarkdown` + `figure-provenance.ts` | `aria_conversations` | 289 | ❌ |
| B4 | **Regenerate / edit a turn (supersede)** | `conversation-branch.ts` | `aria_conversations` | 289 | ❌ |
| B5 | **Rename a thread** | `PATCH /api/aria/ask/thread` | `aria_conversations` | 289 (0 renamed) | ❌ |
| B6 | **Pin a thread** | `PATCH /api/aria/ask/thread` | `aria_conversations` | 289 (0 pinned) | ❌ |
| B7 | **Full-text search over threads** | `GET /api/aria/ask/search` (GIN) | `aria_conversations` | 289 | ❌ |
| B8 | **Draft persistence** | `draft-store.ts` | localStorage | — | ❌ |
| B9 | **Awaiting-you room** | `ax-context.ts:80` | `aria_actions` | 438 / 59 pending | ❌ |
| B10 | **Made-for-you room** | `MadeForYouRoom.tsx` | `aria_task_outputs` | 26 | partial (A13–A15) |
| B11 | **Autonomy control** | `/api/aria/autonomy` | — | — | ❌ |
| B12 | **Canopy reports** | `/api/canopy/reports` | — | — | ❌ |
| B13 | Copy answer as markdown | `copy-markdown.ts` | — | — | ❌ |
| B14 | Streaming markdown stabiliser | `markdown-stream.ts` | — | — | ❌ |
| B15 | Avatar / room framing | `AriaAvatarMount` | — | — | ❌ |

---

## THE SIX — capabilities the old page has and `/ax` does not

| # | Capability | Why it matters | Migration risk |
|---|---|---|---|
| **A2** | **`?q=` auto-send** | **The big one.** ~8 links across the product pass `?q=`/`?topic=` — all three daily-briefing actions, AriaSays, MorningCommandCentre, ProWidgets, SpotlightTour, ComingSoonPage. Swapping without it lands every one on a blank composer and **loses the owner's question silently.** | Low — read the param, call the existing `ask()` |
| **A16** | Artifact rendering | Typed segments (`AriaArtifact`) render structured answers. Without it those answers fall back to prose. | Medium — a component + its segment parser |
| **A17** | Save artifact to Files | Writes to `aria_task_outputs` (26 rows — **this is used**) | Low–medium |
| **A18** | Artifact parse-failure reporting | Telemetry into `aria_ai_calls`; losing it makes artifact bugs invisible | Low |
| **A19** | Scheduled reports | `aria_scheduled_reports` has **1 row** — someone has scheduled something | Medium |
| **A6** | Action approve/reject | ⚠️ **Exists on `/ax` as `ProposalCard.tsx` but NOTHING RENDERS IT.** Wire, don't build. | Low — it is written |

**A21 (daily briefing)** is excluded from the six: `DailyBriefingModal` is mounted in
`src/app/dashboard/layout.tsx`, so it is reachable from every dashboard route regardless of which
surface serves Ask Aria.

**A20 (vitals)** is excluded: `/ax` shows the same information through `ax-context` in a different
shape. Per the decision table — *keep the newer behaviour* — this is not a loss.

---

## A FINDING THIS INVENTORY SURFACED ON ITS OWN

**`ProposalCard.tsx` is referenced only by tests.** `no-fake-controls.test.ts:44,241` and
`ax-1.test.ts:24` read it; **no surface renders it**. It is a complete, working approve/reject card
posting to `/api/aria/ask/action` — built, tested, and never mounted.

That is the **fourth** instance of this class (Stop in S1, rename/pin in S2B, provenance in S3), and
S3's phase-4 rail does **not** catch it: that rail checks the props of components that *are*
rendered. A component nobody renders at all has no call site for it to inspect. Recorded as a
known gap in a rail I wrote.

---

## NO CODE CHANGED IN THIS PHASE.
