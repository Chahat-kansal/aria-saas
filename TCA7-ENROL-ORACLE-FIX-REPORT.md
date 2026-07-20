# TCA7-ENROL-ORACLE-FIX

## PART A — TCA-7: voice-initiated writes were silently inert

### PRE-FLIGHT

There are two separate Aria chat surfaces on `/dashboard/*`, both ultimately hitting the same
brain endpoint, `/api/aria/ask` — but only one of them threads the conversation correctly:

| Surface | File | Brain call | `conversation_id` sent? |
|---|---|---|---|
| Text panel | `src/app/dashboard/ask-aria/page.tsx` | `POST /api/aria/ask` with `{message, conversation_id}` | **Yes** — `conversationId` is component state, captured from `data.conversation_id` on every response and re-sent on every subsequent turn (`send()`, line ~679-709). |
| Avatar voice panel | `src/components/AriaFloatingPanel.tsx` | `POST /api/aria/ask` (via `getBrain(pathname)` → `/api/aria/ask` whenever `pathname.startsWith('/dashboard')`) with `{message, messages, page_context}` | **No** — no `conversation_id` field existed anywhere in the request or response handling before this fix. |

`AriaFloatingPanel` is the floating avatar mounted globally by `AriaFloatingButton.tsx` — the
"talk to Aria from anywhere" surface, voice or typed, that includes the avatar. It kept its own
short-lived `messages` array for prompt context but never captured the `conversation_id` the API
returns, and never sent one back.

**Confirmed `conversation_id` is the only missing piece — the chokepoint itself is untouched and
correct.** Traced `/api/aria/ask/route.ts`'s write path end to end:

1. A write-intent message (e.g. "86 the flat white") hits `planTrigger` (~line 503), which stages
   a `PlannedAction` onto `aria_conversations.pending_action`, keyed by `conversation_id` —
   **creating a new conversation row if none was supplied** (line 513-517: "create/update the
   conversation FIRST so we always have an ID"). It replies with preview text and returns the new
   `conversation_id`.
2. A later turn is only executed as a confirmation if `convPending.pending_action` exists **for
   that same `conversation_id`** AND `isConfirmation(message)` is true (line 323) —
   `isConfirmation()` (`action-planner.ts:73`) matches natural spoken confirmations out of the box:
   `yes`, `confirm`, `do it`, `go ahead`, `execute`, `proceed`, `yep`, `yeah`, `sure`, `ok`.

Because the floating panel never captured or resent the id from step 1, every turn landed on a
**brand-new** conversation with no `pending_action` on it. Saying "yes" next therefore always hit
step 2 with `convPending.pending_action` empty — never matched, never executed. The write was
staged in the database and then silently orphaned every single time. The confirm-before-execute
chokepoint itself was never reachable via voice, not because it was broken, but because it was
never given the id it needs to find its own staged action.

### FIX

`src/components/AriaFloatingPanel.tsx` — added `conversationId` state, sent as `conversation_id`
in the POST body to `brain`, and captured from `data.conversation_id` on every response (mirroring
exactly the pattern already proven correct in `ask-aria/page.tsx`). `/api/aria/talk` and
`/api/aria/staff-talk` (the panel's other two possible `brain` targets, used off `/dashboard`) both
ignore unknown body fields and never read `conversation_id`, so sending it unconditionally is safe
on every route the panel can hit.

No change to `/api/aria/ask/route.ts`, `action-planner.ts`, or any part of the confirm-before-
execute gate — exactly as instructed.

### VERIFY

No live browser session available in this environment. Verified by tracing the fixed code path
against the real server logic instead of a live call:

- With the fix, turn 1 ("86 the flat white cup") → floating panel POSTs `conversation_id: null` →
  server creates a new `aria_conversations` row, stages `pending_action`, returns that row's real
  id → panel now stores it via `setConversationId(data.conversation_id)`.
- Turn 2 ("yes go ahead") → panel POSTs the **same** `conversation_id` this time → server's
  `convPending` lookup (line 320-323) finds the staged `pending_action` on that exact row,
  `isConfirmation('yes go ahead')` matches (`startsWith('yes ')`), and the action executes through
  `action-executor.ts` — the identical path the typed "yes" in `ask-aria/page.tsx`'s `confirmAction()`
  already goes through, producing the same `execution_result` shape.
- This is the same server code the text panel already exercises correctly in production (Sip's own
  chat history has real executed `aria_actions` rows originating from `/api/aria/ask`), so the only
  variable this fix changes is whether the *voice panel* now supplies the id that unlocks it.

**Call site that was missing it:** `src/components/AriaFloatingPanel.tsx`'s `send()` function — the
sole POST to `/api/aria/ask` originating from the avatar voice panel.

---

## PART B — enrol existence oracle (weaker form of WIDGET-PII-LEAK-FIX's leak class)

### Finding

`src/app/api/public/loyalty/[business_id]/enrol/route.ts` returned `409 "A customer with this
phone number already exists"` when the submitted phone matched an existing `pos_customers` row,
and `200` on success. No identity data (name/points/tier) was ever returned either way, but the
**existence signal itself** is an enumeration oracle: a caller can silently determine "this phone
number belongs to a customer of this specific business" for any phone they choose to try, at 10
requests/minute (the existing per-IP limit).

### FIX — idempotent enrol, byte-identical response

- The `existing` lookup is now used only to gate whether the **insert** happens — not the response.
  If the phone already has a `pos_customers` row, the entire insert + `loyalty_identity` link-repair
  block is skipped: **no duplicate row, no second membership, and critically no update to the real
  member's stored name/email** from an unverified re-submission (an attacker resubmitting a real
  member's phone with their own name/email would otherwise silently overwrite that member's actual
  contact details — this fix's idempotent-skip closes that too, not just the response leak).
- Both branches now return the exact same shape and status code:
  `200 { enrolled: true, name }` — where `name` is echoed straight from the caller's own request
  body, **never read back from the database row**. This matters: if it echoed the stored row's
  `name` instead, a guessed phone number that happened to match a real member would leak that
  member's actual name through the "success" response even without a distinguishing status code.
- Rate limiting was already present and already lookup-scoped (`enrol:{ip}` 10/min,
  `enrol:phone:{normPhone}` 5/hour) — left unchanged, no weakening.
- Added an `activity_log` insert (non-blocking, `action_type: 'loyalty_enrol_attempt'`) on every
  attempt, new or already-enrolled, recording `phone`/`email`/`was_existing` for the owner's own
  audit trail — this is never surfaced to the public caller, so it adds no observable difference
  between the two response paths.

### VERIFY

Traced both code paths directly against the post-fix file (no live HTTP call available in this
environment):

- **Known-enrolled contact**: `existing` truthy → insert block skipped entirely → falls through to
  the shared `activity_log` insert + `return NextResponse.json({ enrolled: true, name })`, status
  200.
- **Unknown contact**: `existing` null → insert runs, identity link runs (both non-observable to
  the caller — no data from either is included in the response) → falls through to the same
  `activity_log` insert + the same `return NextResponse.json({ enrolled: true, name })`, status 200.
- Response body and status code are structurally identical in both branches — the only per-request
  difference is `name`, which is caller-supplied input in both cases, not database state.
- **No duplicate rows**: confirmed by re-reading the code — the insert is now inside
  `if (!existing)`, so a second enrol attempt for the same phone takes the skip branch and performs
  zero writes to `pos_customers`.

## Build gate

- `npx tsc --noEmit` — 0 errors.
- `NODE_OPTIONS="--max-old-space-size=6144" npx next build` — exit 0, full route manifest
  generated.
- Single commit covering both parts.
