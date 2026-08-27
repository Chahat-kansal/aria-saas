# S4 PHASE 5 — the silent-failure sweep

Three findings drove this sprint and all three are the same shape: **something failed and reported
success.** This is the sweep for the rest of that class on the Ask Aria surface and its routes.

**Every entry below was opened and read before being listed.** S2B's first isolation rail flagged 11
blocks and none were leaks; the dismissals at the bottom are as much a part of this report as the
findings, because a sweep whose false positives are invisible is not checkable.

---

## THE STRUCTURAL POINT, FIRST — it changes how every row below should be read

`withErrorCapture` (`src/lib/api/with-error-capture.ts:25-27`) logs and reports to Sentry — but only
for errors that are **thrown**. An inner `catch { return null }` never throws, so it **never reaches
that capture**. Every swallow below is therefore invisible to the route-level observability the
codebase already has. They do not appear in Vercel logs, they do not appear in Sentry, and the route
returns 200.

That is why finding #3 of this sprint took a human noticing a 16-second page load to surface.

---

## RANKED FINDINGS

### 1. `src/lib/aria/get-business-context.ts` — **10 swallows, no trace, on Aria's factual inputs**
`:376, 393, 412, 434, 460, 510, 546, 575, 598, 699` — each `} catch { return null }`

Each wraps a live query building one domain of Aria's business context: loyalty liability, gift-card
liability, and eight more. If a query fails, that domain silently becomes `null`, the answer is
generated **without it**, and nothing is logged anywhere.

**What this looks like to an owner:** Aria answers confidently and completely, and simply never
mentions the thing that failed. Not an error — an omission they cannot see. If the loyalty query
fails, Aria does not say "I could not read your loyalty data"; it answers about everything else as
though loyalty were fine.

**Why it is ranked first:** GROUNDING-TEETH depends on Aria knowing what it does *not* have. These
ten lines are exactly where that knowledge is discarded. The block at `:374` even carries the
instruction *"Never invent loyalty numbers — cite these"* — and the `catch` two lines below removes
the numbers it is telling the model to cite, without telling anyone.

**Fix shape (not done here):** log the failure and mark the domain `unavailable` rather than `null`,
so the prompt can say "this was not readable" instead of the domain silently not existing.

### 2. `src/app/api/aria/ask/route.ts:123` and `:132` — a proposed action can vanish
```ts
function extractAction(text) { ... try { return JSON.parse(match[1]) } catch { return null } }
function extractBlocks(text) { ... try { ... } catch { return null } }
```
These parse the model's `<json>` / `<json_blocks>` payloads. Malformed JSON → `null` → the action or
the rich blocks **silently do not appear**, with no log line. The model produced them; the owner
never sees them.

**What this looks like to an owner:** Aria describes what she is going to do, and then no
confirmation card appears. Or an answer that should have carried a chart renders as plain prose.
Indistinguishable from Aria having chosen not to.

**Same class as the suggestions bug this sprint fixed** — except suggestions at least logged its
parse failure. These two do not log at all.

### 3. `src/app/api/aria/autopilot/route.ts:56` — a missing table reads as "nothing to do"
```ts
if (error?.code === "42P01") return NextResponse.json({ actions: [] });
if (error) return NextResponse.json({ error: error.message }, { status: 500 });
```
`42P01` is *undefined_table*. Line 57 correctly 500s for every other error, so this is a deliberate,
narrow swallow — but a table that does not exist is a **deploy problem that can never surface**. The
autopilot panel shows "no actions" forever and looks healthy.

This is failure pattern #1 in the CLAUDE.md list, in one line: exists, looks correct, does nothing.
Same shape at `src/app/api/aria/competitor-prices/history/route.ts:29`.

### 4. `src/app/api/aria/ask/audit/route.ts:18, :20` — unauthenticated reads as empty
```ts
if (!user) return NextResponse.json({ log: [] })
if (!bid)  return NextResponse.json({ log: [] })
```
A request with no session gets **200 and an empty log**, not a 401. The audit panel renders "nothing
here" to someone who is not logged in, which is the same thing it renders to someone who is.

**Lower harm** (it leaks nothing, and the surface is behind auth anyway) but it is squarely in the
class: a failure state and a legitimate empty state are made indistinguishable. Note
`src/app/api/aria/ask/suggestions/route.ts:19` does the same thing and is *slightly* better for
returning 401 alongside the empty array.

### 5. `src/lib/aria/ask/suggestions.ts:45` — the open-loop nicety fails invisibly
`openLoopSuggestion()` → `} catch { return null }`. If it fails, the "How did *X* work out?" prompt
just is not offered. Genuinely low harm — it is an enhancement, not a fact — but it is the same
pattern and worth knowing it is there.

---

## CHECKED AND DISMISSED — not findings

| location | why it is fine |
|---|---|
| `ask-aria-ax/rooms/ThreadsPanel.tsx:51` | `when()` is a date formatter; `catch { return '' }` on an unparseable timestamp renders no date. Correct — a thread row should not disappear because its date is odd. |
| `ask-aria-ax/rooms/MadeForYouRoom.tsx:39` | identical formatter, identical reasoning. |
| `ask/route.ts:121, :128` | `if (!match) return null` — the *absence* of a `<json>` block is the normal case for a plain answer, not a failure. |
| `autopilot/route.ts:57`, most `!bid` guards | these return real status codes, or represent a genuinely empty state rather than a swallowed error. |

---

## WHAT WAS FIXED IN THIS SPRINT, AND WHAT WAS NOT

**Fixed** (inside the phases): the suggestions route caching a fallback as though generated and
returning after 16.5s (phase 4); the UI showing a stream with no request behind it (phases 1–2).

**Not fixed, deliberately.** Every finding above is outside this sprint's declared phases. The
instruction was explicit — *report findings; fix only the ones inside this sprint's phases; a sweep
that turns into a refactor is how sprints park* — and finding 1 alone is ten call sites plus a prompt
contract change, which is its own sprint.

**Suggested order if it becomes one:** 1 (Aria's grounding), then 2 (work the owner never sees), then
3 (a deploy fault that cannot surface), then 4 and 5.

**One more, adjacent and worth naming:** `buildAskAriaContext` runs 19 DB queries and sits inside the
suggestions path on every uncached page load. Phase 4 bounded the *model* call at 6s but did not
touch the context build, so it remains inside the latency budget. Not a silent failure — a latency
one — but it is the other half of why that route was slow.
