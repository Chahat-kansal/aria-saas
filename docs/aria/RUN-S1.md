# RUN-S1 — THE CHAT SURFACE

**Run date:** 2026-08-25 → 26 · autonomous (RULE 20) · branch `main`

---

## THE ONE-SCREEN SUMMARY

**Eight phases, seven commits. Seven shipped, one parked** — feedback, because there is no table to
write to and a control that cannot store anything is a fake control.

| phase | commit | outcome |
|---|---|---|
| 0 — gate | — | **PASSED** — both docs present, S1 in the map |
| 1 — stop generating | `a89ee84d` | **the abort now reaches the provider** |
| 2 — regenerate | `a3368a13` | supersede, never overwrite |
| 3 — edit and re-run | `a3368a13` | supersede, never delete |
| 4 — copy | `b52d4b11` | raw markdown, not DOM text |
| 5 — feedback | `15217b2c` | **PARKED** — no table. Schema named, snapshot logic built |
| 6 — auto titles | `a671674f` | written exactly once, ever |
| 7 — errors + retry | `494140df` | typed, retryable vs not, watchdog |
| 8 — rendering + follow-ups | `d9cf5a62` | **real tables**, nothing executes |

### The four things you most need to know

**1. Stop now genuinely cancels server-side.** Before this sprint it could not have: the client had
an `AbortController`, but nothing carried the abort to the server. `ToolLoopParams` had no signal,
the route never touched `req.signal`, and the provider's `iterAc` was a hard-*timeout* controller
only. So pressing stop was a **disconnect** — the browser stopped listening while the model kept
generating and the tokens kept being billed. The chain is now complete end to end.

**2. Nothing is ever deleted.** Regenerate and edit-and-rerun both *supersede*. Regenerating twice
leaves three assistant rows with only the newest rendering; editing message 2 of a four-message
thread leaves messages 3 and 4 in the database, marked superseded. No DDL was needed —
`aria_conversations.messages` is JSONB, so the branch lives inside the message objects.

**3. Tables render as tables, and hostile output cannot execute.** Verified in real Chromium, not
asserted from source: a real `<table>` with 2 headers and 4 cells, 0 raw pipes, a working code-copy
button — and a `<script>`, an `<img onerror>` and a `javascript:` link that all produced **nothing**.

**4. Feedback is parked, correctly.** There is no feedback/rating table anywhere in the database. A
thumbs-down that silently drops the rating is worse than none, so no control shipped. What did ship
is the snapshot logic and the exact schema, so it becomes a wiring job when you approve the DDL.

---

## WHAT THE PREFLIGHT FOUND ALREADY BUILT

The decision table says extend, never duplicate. It was right to insist — **four of the eight were
already partly there**, and one of them was actively doing the thing its phase forbids.

| phase | what already existed | what I did |
|---|---|---|
| 1 stop | `useAriaStream` had an `AbortController` and a `cancel()` — but the surface never destructured `cancel`, so there was **no Stop button**, and **nothing carried the abort server-side** | wired the missing chain; kept the existing controller |
| 2 regenerate | MS17 shipped "Ask again" — which did `turns.slice(0, lastUser)` and **threw the old answer away** | extended it to supersede; removed the discard |
| 4 copy | MS17 already copied `t.text`, the raw model output — not DOM text | added the guarantee, the sentinel stripping and the proof |
| 8 follow-ups | the route **already returns `followups`** (`council.ask_followups`); nothing consumed them | rendered them — no new generation |
| 8 markdown | `AriaMarkdown` in the old page: hand-rolled, bold/italic only, no tables | replaced on the new surface with react-markdown + remark-gfm |
| 6 titles | `title = userMsg.slice(0, 60)` — a truncation, not a title | generated once, at creation |

Also found, and it shaped three phases: **there is no messages table.**
`aria_conversations.messages` is a JSONB array. That is why stop-marking, superseding and parent
pointers all needed zero DDL.

---

## PHASE 1 — DOES STOP ACTUALLY CANCEL SERVER-SIDE?

**Yes, and this is the answer to the question the sprint asked most pointedly.**

```
surface   Stop button (replaces Send while in flight) -> cancel()
hook      controller.abort() on the fetch
route     req.signal -> _POST(..., signal) -> callAnthropicWithTools({ signal })
provider  linkAbort(params.signal, iterAc) -> iterAc.signal is what the SDK already
          receives, so client.messages.stream(...) is cancelled at the source
          + a new turn refuses to start: `if (params.signal?.aborted) throw new AbortedByCaller()`
```

`linkAbort` lives in its own file **because of how it is proven**. Left inline it could only ever be
grep-asserted — "the code contains an addEventListener" — which shows a wire exists, not that
current flows. As a pure function it gets a real test: aborting the outer aborts the inner; an
**already-aborted** outer aborts immediately (the race where the owner stops during a tool turn);
unlink stops propagation; and eight iterations add and remove exactly eight listeners, so a long
tool loop does not leak one per turn.

### What a stopped message looks like on reload

It is **still there**, and it says what it is. The partial is persisted into the conversation JSONB
with `incomplete: true, stopped_by: 'user'`, the route returns a normal response (`stopped: true`,
not an error) so the thread stays usable, and the answer carries a visible amber
**"Stopped — this answer is unfinished"** mark. A half-answer the owner watched arrive is real work;
discarding it silently would lose something they saw, and presenting it as complete would be worse.

**Mutations, all RED:** severing `linkAbort`'s signal · dropping `req.signal` at the route ·
breaking `linkAbort`'s listener so the mechanism itself fails.

---

## PHASES 2 & 3 — SUPERSEDE, NEVER DELETE

One commit for both, deliberately: same mechanism, same three files. Splitting them would have
produced one commit that does not build and a second containing the real change.

`lib/aria/conversation-branch.ts` — `superseded_at`, `superseded_by` (a parent pointer, in reverse),
`edited_from`. Nothing is spliced out; the array only ever grows and `renderPath()` decides what
shows.

Both acceptance tests the sprint names pass:
- regenerate twice → **three assistant rows**, only the newest renders, both older ones still present
- edit message 2 of 4 → **messages 3 and 4 still in the array**, marked superseded, new branch renders

**No branch-navigation UI**, and a test asserts none appears. A café owner will never sit comparing
three generations; they want the newest to be right.

> **A test of mine was wrong and the code was right.** My first "three assistant rows" assertion used
> the 4-message thread and expected 3, forgetting its *earlier* assistant also counts — it got 4.
> Rewritten on a single-exchange thread. Recorded because the reflex to "fix" the code would have
> been the wrong move.

---

## PHASE 5 — FEEDBACK, PARKED. THE SCHEMA YOU'D NEED.

No table matching feedback / rating / thumb / eval exists in the live database. Per the decision
table this parks, and per MS17's rail no control ships.

**Why a snapshot and not a message id** — this is the part that matters. A feedback row holding only
`message_id` would be a **dead table here**, for two reasons: messages are JSONB entries that get
*superseded* by phases 2–3, so the row a rating points at may no longer be what was rated; and the
reason an answer was wrong usually lives in the **ground truth** it was built from, which is not in
the message at all. So a rating copies by value: question, exact answer, model, provider, provenance
anchors and tiers, and whether it was a stopped partial.

```sql
create table public.aria_message_feedback (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  user_id uuid,
  conversation_id uuid references public.aria_conversations(id),
  message_id text,                                   -- context only. NEVER the record.
  rating text not null check (rating in ('up','down')),
  reason text,
  question text not null,                            -- snapshot
  answer text not null,                              -- snapshot
  model text, provider text,                         -- snapshot
  provenance jsonb not null default '{}'::jsonb,     -- anchors + tiers in play
  answer_incomplete boolean not null default false,
  created_at timestamptz not null default now()
);
create index aria_message_feedback_biz_idx on public.aria_message_feedback (business_id, created_at desc);
create index aria_message_feedback_down_idx on public.aria_message_feedback (business_id) where rating = 'down';
-- RLS: same policy shape as aria_conversations.
```

### How a 👎 feeds the 51-case eval set

`EvalCase` is `{ id, category, question, ground, good, bad, expectBad }`. A thumbs-down **already
carries** `question`, `bad` and `ground`, so `toEvalCaseDraft()` converts it directly. `expectBad` is
derived: **`refuse`** when the answer carried unbacked figures (the model asserted numbers it could
not support), **`hedge`** otherwise. The one field left for a human is `good` — what Aria *should*
have said — which is judgement, and the right place to require a person. That is how a complaint
becomes a regression test instead of a statistic.

---

## PHASE 7 — WHAT AN OWNER SEES WHEN THE PROVIDER FAILS

**The sprint's premise checked out, for the recent window.** Live `aria_ai_calls`:

```
last 8 days   anthropic   92 calls,  0 ok      google  70 calls, 70 ok
last 30 days  anthropic 3837 calls, 1247 ok (32.5%)   <- the successes are historical
```

So the brief's "~100% failing" is right for now, and the 32.5% is pre-incident. **Every answer today
comes from Gemini.**

**What the owner sees today:** the Anthropic circuit breaker opens, the route serves a *degraded
grounded answer* from the fallback chain, and an amber banner appears. Before this phase that banner
said only "running on backup intelligence" — it now **names the provider that answered**, because
"backup intelligence" alone tells an owner nothing they can act on or report.

**If the call fails outright**, the failure is now typed rather than a dead end: the credit-balance
error classifies as `credit`, **not retryable**, and says *"Aria's AI account needs topping up.
Retrying won't help — this one is on us to fix."* Offering Retry there would cost a second wait to
reach the same wall.

**The watchdog** turns the worst failure — a stream stuck in "streaming" with nothing to read and
nothing to press — into an ordinary retryable error after 45s of silence. That window is
deliberately longer than the provider's own 30–55s per-iteration timeout so a slow but live tool
turn is never killed.

> **The trap in that, and why there is a flag:** the watchdog aborts the *same controller the Stop
> button uses*. Without separating them, a stall would be reported to the owner as *"you stopped
> this"*. `stalledRef` distinguishes them, and the mutation that removes it goes red.

---

## PHASE 8 — RENDERING, VERIFIED IN A BROWSER

`react-markdown@9` + `remark-gfm@4` — **both already dependencies**, so no new supply chain.

**Sanitisation, answered by not needing it.** react-markdown does not render raw HTML unless
`rehype-raw` is added. It is not added, and a test asserts it never is. A `<script>` in model output
is therefore never HTML in the first place — it arrives as text and React escapes it. That is
stronger than a filter, because there is no allowlist to get wrong.

**Provenance outranks rendering**, as instructed. Figures are wrapped *inside* every text-bearing
element the parser produces — `td` and `th` included — so a number in a table keeps its truth tier
and click-to-source exactly as one in a paragraph does.

Measured in Chromium:

```
mid-stream cut   0 tables, 0 raw pipes on screen        no broken layout flashes
completed        1 real <table>, 2 th + 4 td, 0 pipes   1 code block + copy button
hostile output   script + img onerror + javascript:     NOTHING executed
                 0 script elements, 0 img elements       shown as literal text
provenance       tier survived; click-to-source ->      "Completed sales, 18-24 Aug."
```

> **The render caught a real bug that reading would not have.** react-markdown already hands `<pre>`
> a `<code>` child, so my `CodeBlock` was producing nested `<code><code>`. The probe counted 2 and
> failed. This is the second sprint running where looking at the output beat reading the source.

**Mutation:** swapping the renderer for `dangerouslySetInnerHTML` gave `pwned: true` **and**
`pwnedImg: true` — both the script and the img `onerror` fired — plus 0 tables, 12 raw pipes and
provenance destroyed. Nine failures.

---

## ANYTHING THAT RENDERED PLAUSIBLY BUT DID NOTHING

**One, and it was mine to fix: the Stop button did not exist even though `cancel()` did.** The hook
had exposed a working `cancel` since MS16 and the surface simply never destructured it — so the
capability was present, tested-looking, and unreachable. That is the exact shape MS17's rail was
built to catch, and it slipped through because the rail checks *rendered controls*, not *unused
exports*. Worth knowing: a capability with no control is invisible to that rail.

Nothing else. The MS17 no-fake-control rail still passes, and every control added this sprint
(Stop, Edit, Try again, follow-ups, code-copy) reaches a real handler.

---

## GATES

- `npx tsc --noEmit` — **0 errors**
- `npx vitest run` — **843 passed / 843** across 70 files
- **All mutations RED**: 3 for stop · 3 for supersede · 2 for copy · 2 for the watchdog ·
  1 for titles · 1 for sanitisation (9 sub-failures)
- **Render verified in Chromium**: real tables, nothing executes, provenance intact
- `npx next build` — **BUILD_EXIT=0**, read from the log, never the wrapper

```
/dashboard/ask-aria       22.2 kB   452 kB    <- the OLD page, still serving
/dashboard/ask-aria/ax    11.1 kB   251 kB    <- the new surface
```
The new surface grew 206 kB -> 251 kB this sprint: react-markdown + remark-gfm, the
renderer, and the branch/error/title modules.

## WHAT IS NOT DONE

- **Feedback UI** — parked on the table. Schema named above; the snapshot logic and eval-set
  conversion are built and tested.
- **Nothing was exercised under real auth.** Every check is a unit test, a source rail, or a
  Chromium render of the component. No stop was pressed, and no answer was streamed, in a
  logged-in browser.
- **The route still serves the old page.** S1 built on `/dashboard/ask-aria/ax`; the swap remains
  blocked by MS17's eleven unmigrated capabilities.
