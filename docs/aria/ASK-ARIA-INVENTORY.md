# ASK ARIA — THE TWO INVENTORIES

**MS17 Phase 1.** Derived by reading the code and querying the live database on 2026-08-25.
Nothing here comes from memory or from the sprint notes. Row counts are live; "Sip" is
`ff5055a0-c351-4ada-817a-1804961035f3`.

---

## THE HEADLINE

# 10 fake controls on the new surface.

Ten things a user can see and click that do **nothing at all** — no handler, no route, no store.
Four of them are the room tabs the whole panel is organised around.

The old page, by contrast, has **29 capabilities and 16 routes**, and almost all of them are real.
**The new surface is prettier and does less.** That is the gap this sprint closes.

---

## TABLE A — EVERY CAPABILITY ON `/dashboard/ask-aria` (1,646 lines)

Sixteen distinct routes. Row counts are `Sip / all businesses`.

| # | capability | where it lives | route it calls | table it touches | rows today |
|---|---|---|---|---|---|
| 1 | **Ask Aria** — send a message, get an answer | `page.tsx:652` `send()` | `/api/aria/ask` | `aria_conversations` | **172 / 286** · newest **today** |
| 2 | Conversation history list | `page.tsx:587` `loadHistory` | `/api/aria/ask/history` | `aria_conversations` | as above |
| 3 | Open a past conversation | `page.tsx:610` `loadConversation` | `/api/aria/ask/history` | `aria_conversations` | as above |
| 4 | Delete a conversation | `page.tsx` | `/api/aria/ask/delete` | `aria_conversations` | as above |
| 5 | New conversation | `page.tsx:961` `newConversation` | — (local) | — | — |
| 6 | Regenerate the last answer | `page.tsx:830` `regenerate` | `/api/aria/ask` | — | — |
| 7 | **File upload / document analysis** | `page.tsx:842` `uploadFile` | `/api/aria/ask/upload` | none (in-request) | — |
| 8 | **Voice input** | `components/aria/VoiceInput.tsx` (88 ln) | none — Web Speech API | — | — |
| 9 | Chat suggestions | `components/aria/ChatSuggestions.tsx` | `/api/aria/ask/suggestions` | `businesses` | — |
| 10 | **Skill picker** — list/create/edit/delete custom skills | `components/aria/SkillPicker.tsx` (284 ln) | `/api/aria/skills` ×4 | `aria_skills` | **6 / 18** · newest 25 Jul |
| 11 | Action preview / fork card | `components/aria/ActionPreviewCard.tsx` | `/api/aria/ask/action` | `aria_conversations` | — |
| 12 | Confirm / cancel a proposed action | `page.tsx:880` / `:925` | `/api/aria/ask/action` | `aria_conversations` | — |
| 13 | Save a plan action | `page.tsx:939` `savePlanAction` | `/api/aria/ask/action` | — | — |
| 14 | **Audit log + rollback** | `components/aria/AuditLogCard.tsx` | `/api/aria/ask/audit`, `/rollback` | `aria_action_log` | **64 / 64** · newest 25 Jun |
| 15 | Deliverables list | `page.tsx:597` `loadDeliverables` | `/api/aria/deliverables` | `aria_task_outputs` | **26 / 26** · newest 17 Jun |
| 16 | Deliverable → PDF | `page.tsx:371` `downloadPdf` | `/api/aria/deliverable-pdf` | `aria_task_outputs`, `aria_ai_calls` | — |
| 17 | Deliverable → email | `page.tsx:387` `sendEmail` | `/api/aria/deliverable-email` | `aria_task_outputs` | — |
| 18 | Schedule a recurring report | `page.tsx:402` `saveSchedule` | `/api/aria/intelligence/schedules` | `aria_scheduled_reports` | **1 / 1** · newest 5 Jun |
| 19 | **Artifact rendering** | `components/aria/AriaArtifact.tsx` (286 ln) | — | — | — |
| 20 | Artifact parse-failure telemetry | `page.tsx` | `/api/aria/artifact-parse-failure` | `aria_ai_calls` | 2,862 / 10,180 · newest **today** |
| 21 | **Block renderer** — charts, tables, KPI blocks | `components/dashboard/BlockRenderer.tsx` (602 ln) | — | — | — |
| 22 | **Save to Files** | `components/dashboard/SaveToFilesButton.tsx` | `/api/canopy/reports` | → **inserts `aria_task_outputs`** (`canopy-reports.ts:65`) | writer is live |
| 23 | Vitals strip | `page.tsx` | `/api/aria/vitals` | `pos_sales` | — |
| 24 | Daily briefing modal | `showAriaBriefing` | — | — | — |
| 25 | 3D Aria (talking head) | `components/aria/AriaTalkingHead.tsx` | `/models/Aria.glb` (18 MB) | — | — |
| 26 | Degraded-provider / total-outage banner | `page.tsx` state | — | — | — |
| 27 | Council-thinking indicator | `page.tsx` `councilThinking` | — | — | — |
| 28 | Message actions (copy, etc.) | `page.tsx:96` `MessageActions` | — | — | — |
| 29 | Document result card | `page.tsx:128` `DocumentResultCard` | — | — | — |

### What the new surface already has from Table A

Rows **1** (streaming ask), **12** partially (the proposal card approves through `/api/aria/ask/action`),
and the provenance expansion — which is *new*, not migrated. **Everything else on this table is
absent from `/ax`.**

### Two findings inside Table A

- **The audit log has had nothing since 25 June** (`aria_action_log`, 64 rows, all Sip). The feature
  works; nothing has written to it in two months. Worth knowing before it looks broken on the new
  surface.
- **`aria_scheduled_reports` holds exactly one row, from 5 June.** The schedule feature is real but
  has been used once, ever.

---

## TABLE B — EVERY CONTROL ON `/dashboard/ask-aria/ax`

Every clickable or focusable element in `AskAriaTransition.tsx`. **"Nothing" means literally no
handler and no href** — I checked each one, not the class name.

| # | control | line | what it appears to promise | what it actually does | to make it real |
|---|---|---|---|---|---|
| 1 | Room tab **Ask** | 215 | switch to the conversation room | **NOTHING** — bare `<a>`, no href, no onClick | room state + render the conversation (it is already the default view) |
| 2 | Room tab **Awaiting you** | 216 | the decisions waiting on me | **NOTHING** | real: `aria_actions` has **409 Sip rows**, 54 pending. Needs a room view + live badge |
| 3 | Room tab **Made for you** | 217 | things Aria made for me | **NOTHING** | real: `aria_task_outputs`, 26 rows, and a **live writer** via Save to Files → `/api/canopy/reports` → `canopy-reports.ts:65` |
| 4 | Room tab **Routines** | 218 | recurring things Aria does | **NOTHING** | see the house-rules finding below |
| 5 | **New chat** | 220 | start a fresh thread | **REAL** — `newChat()` clears turns + conversation id | — |
| 6 | Noticed cards ×3 | 276 | ask about what Aria noticed | **REAL** — `ask(n.prompt)`, sourced from `aria_actions` / stock / a real zero | — |
| 7 | Rope buttons ×3 (welcome) | 292 | set Aria's autonomy | **REAL** — `/api/aria/autonomy` → `agent_settings.mode` | — |
| 8 | Welcome composer input | 309 | ask a question | **REAL** | — |
| 9 | **Mic (welcome)** 🎙 | 315 | speak instead of typing | **NOTHING** — no onClick | `VoiceInput.tsx` already exists (Table A #8) |
| 10 | Welcome send ↑ | 316 | send | **REAL** | — |
| 11 | Rope buttons ×3 (collapsed) | 323 | same as #7 | **REAL** | — |
| 12 | **Share** 🔗 | 343 | share this thread | **NOTHING** | `task-outputs/[id]/share` exists for outputs; no thread-share path |
| 13 | **More** ⋯ | 344 | thread options | **NOTHING** | rename/delete — `/api/aria/ask/delete` exists |
| 14 | Figure → provenance toggle | 382 | show where this number came from | **REAL** — expands the `.src` panel from real anchors | — |
| 15 | Working composer textarea | 405 | ask a question | **REAL** | — |
| 16 | **Attach** 📎 | 416 | attach a file | **NOTHING** — no onClick | `/api/aria/ask/upload` exists (Table A #7) |
| 17 | **Voice (working)** 🎙 | 417 | speak | **NOTHING** | as #9 |
| 18 | Working send ↑ | 418 | send | **REAL** | — |
| 19 | Back to welcome | 426 | leave the thread | **REAL** — `home()` | — |
| 20 | **Mode chip "💬 Ask ⌄"** | 415 | a dropdown — it has a caret | **NOTHING** — it is a `<span>`, not even a button | this is where the **skill picker** (Table A #10) belongs |

### THE COUNT

| | |
|---|---|
| controls that are real | **10** |
| **controls that are fake** | **10** |

**Fake:** 4 room tabs · mic ×2 · attach · share · more · the mode chip.

The mode chip is the worst of them: it is a `<span>` styled to look like a dropdown, complete with a
`⌄`. It cannot even be focused with a keyboard.

---

## THE HOUSE-RULES FINDING — it decides the Routines tab

The sprint says "`house_rules` is at 0 rows". **There is no `house_rules` table.** House rules are
rows in `aria_business_memory` with `kind='house_rule'`. The live picture:

```
kind        rows   Sip   newest
fact         109    71   2026-08-12
concern       41    31   2026-08-04
pattern       22    22   2026-08-17
decision      20    20   2026-07-31
goal          18    16   2026-08-10
preference    10     9   2026-07-25
tried          7     6   2026-08-10
house_rule     0     0   —          ← zero, for every business, ever
```

A **complete, tested CRUD library exists** — `createHouseRule`, `editHouseRule`, `retireHouseRule`,
`listHouseRules`, `listHouseRuleHistory` (`src/lib/aria/house-rules.ts`). Its **only** production
caller is `src/app/api/onboarding/provision/route.ts:433`, at provisioning time. There is **no API
route and no UI anywhere** that lets an owner write one.

So the writer exists on paper, has never produced a row, and no owner can reach it. Under the
sprint's rule — *"a tab that renders an honest 'nothing here yet' is only acceptable when a working
writer exists and the emptiness is real"* — a Routines/House-rules tab today can only ever be empty.

**Phase 3 decides between:** wiring the existing library to an owner-facing route (it is written and
tested — the missing pieces are an API route and a room), or removing the tab. The decision table's
first row says wire it if wiring is small; its third says remove it if the data source has no writer.
Both apply, which is why this is called out here rather than settled in Phase 1.

---

## ONE MORE THING WORTH KNOWING

`/api/canopy/reports` reads `businesses` and `user_active_business` directly, but persists through
`saveReport()`, which inserts into **`aria_task_outputs`**. There is no `canopy_reports` table —
I checked, and querying it errors with `42P01: relation does not exist`. Nothing is broken; the
name is just misleading, and it means **"Save to Files" and "Made for you" are the same store.**
