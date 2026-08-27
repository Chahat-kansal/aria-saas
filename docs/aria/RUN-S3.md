# RUN-S3 — what the screenshot showed

**Run date:** 2026-08-27 · autonomous (RULE 20) · branch `main`
**Six phases shipped, one could not be run, six commits.**

---

## THE ONE-SCREEN SUMMARY

| phase | commit | outcome |
|---|---|---|
| 0 — gate + preflight | — | 4/4 columns, 2/2 indexes live · **preflight changed two phases** |
| 1 — provenance | `b0fa86ce` | **the chain was broken in FOUR places, not one** |
| 2 — the titler | `2b285142` | JSON leak fixed · titles now distinguish · 2 rows repaired |
| 3 — rename & pin | `4c9c0e97` | **already built** — verified in Chromium, not rebuilt |
| 4 — the rail | `86f2459e` | catches the opposite failure · proven red on the real files |
| 5 — the two numbers | `19722b96` | **the headline was wrong; the badge was right** |
| 6 — the panel | `b0263da7` | unclosed quote **fixed** · clipping **not reproducible** |
| 7 — the walk | — | **NOT RUN** — no credentials. What a human must click is below. |

### The three things you most need to know

**1. The provenance chain was broken in four places, and the fourth would have silently undone
the other three.** `anchorValues` was real all along — built from live queries — but it lived three
`try` blocks deep and was spent only on the model prompt. It was never carried out, never persisted,
never returned, and never passed to the renderer. Even with the first three fixed, `openThread()`
mapped only `role` and `content`, so a stored tier would have vanished on reload — indistinguishable
from never having stored it.

**2. The headline was counting a page size, and `ax-context.ts:76` says not to do that.** "8 things
stood out" = 6 capped decisions + 2 other notices. The line directly above the bug reads *"a count
and a page size are not the same number and must not share a source"* — MS17 fixed exactly this for
the badge and the defect survived one line higher. The badge (55, now 53) was right.

**3. Two of the seven phases had already been built.** Rename and pin shipped in S2B `1226e225`;
the screenshot predates that deploy. I verified them in a browser instead of rebuilding them.

---

## PHASE 0 — GATE AND PREFLIGHT

**Gate, my own query, not the document:**
```
columns pinned_at · deleted_at · title_edited_at · search_tsv        4/4
indexes aria_conversations_biz_recent_idx · _search_idx              2/2
data    289 conversations · 0 tombstoned · 0 pinned · 0 renamed
        2 JSON titles · 6 "Tell me about" titles
```
Every figure in the sprint matched live.

**What the preflight found already built — and it changed two phases:**

| finding | effect |
|---|---|
| ThreadsPanel already has Pin (`:221`), Rename (`:227`), Delete (`:233`) — S2B `1226e225` | phase 3 became verification, not construction |
| `AnswerMarkdown` already accepts a `provenance` prop; `segmentFigures()` and the verifier both work | phase 1 became *finding the missing link*, not building either end |
| `useAriaStream` already declares a vestigial `figures?: unknown` field | left alone (RULE 0); `provenance` added beside it |
| history route returns whole message objects (`messages: all.slice(...)`) | provenance passes through on reload with no change needed |
| **three Ask Aria surfaces exist** — `/dashboard/ask-aria` (1,674 lines), `/dashboard/ask-aria/ax`, `/pos/ask` | the screenshot is the **ax** one ("Awaiting you" is an ax room). All S1/S2/S2B/S3 work targets ax; the 1,674-line original is untouched and still the default route. **Not this sprint's call to resolve** — see MS16's note. |

---

## PHASE 1 — WHERE THE CHAIN WAS BROKEN

```
computed        route.ts:1110  anchorValues, from real queries        ✅ existed
   ↓
carried out     3 try-blocks deep, scope ended                       ❌ BROKEN → turnProvenance
   ↓
persisted       upsertConversation() had no provenance param         ❌ BROKEN → stored on the message
   ↓
returned        response never included it                           ❌ BROKEN → provenance: turnProvenance
   ↓
rendered        <AnswerMarkdown> given no provenance prop            ❌ BROKEN → provenance={t.provenance}
   ↓
restored        openThread() mapped role+content only                ❌ BROKEN → provenance: m.provenance
   ↓
renderer        segmentFigures + click-to-source                     ✅ worked all along
```

**Conversations carrying provenance after this phase: still 0 of 289.** Stated plainly because it is
the number the sprint asked for. The chain is joined but a **council turn has to actually run** to
write the first one, and I cannot sign in to run one. The first non-zero value is the real proof,
and it needs a human — same honest position as phase 7.

**Scope of the win.** Anchors exist **only** on the strategic/analytical council path
(`route.ts:993`). That path's `upsertConversation` is the one now carrying provenance. The other
~20 call sites compute no anchors and are unchanged — inventing some for them is exactly what the
decision table forbids, and `segmentFigures` already renders those figures `plain`, claiming nothing.

**Labels are attached only where the query is known by name** — `revToday` → *"Completed sales,
today."* and six more. The spread sets (health/goal/benchmark/hypothesis) arrive as bare `number[]`,
so they get an anchor but no label and fall back to *"Computed from your data this turn"*. A wrong
source line is worse than a generic true one.

---

## PHASE 2 — THE TITLER

**I probed the shipped code before changing it, and it was worse than the two live rows showed:**

| model output | old result |
|---|---|
| pretty JSON | `"{"` — the title was a single brace |
| compact JSON | the entire JSON blob |
| fenced JSON | `"json"` — the fence's language tag |

Only the compact case was visible in the database. Fixing what the screenshot showed would have left
two of three alive.

**(a)** `extractTitleFromJson()` unwraps a fence, parses, retries a **truncated** object by closing
the dangling tail (the real failure mode — a model hitting its token cap), then falls back to reading
the first quoted `"title"` pair. Fails **closed** to the owner's question if anything still carries a
brace or a bare fence word.

**(b)** The six identical titles were not a truncation bug but a **truncation-point** bug: those
questions come from the Awaiting room's launcher, so all begin `Tell me about …` and the subject —
the only part that differs — was pushed past the 48-char cut. `subjectOf()` strips the stock opener
and wrapping quotes. Ten launcher questions → ten distinguishable titles, asserted.

**Backfill: 2 rows, previewed first, both with `title_edited_at IS NULL`.**
```
{ "title": "Revenue Shortfall Analysis",  ->  Revenue Shortfall Analysis
{"title":"POS Payment Sync                ->  POS Payment Sync
json_titles_remaining after: 0
```
The second reads oddly against its question ("Briefing pipeline stalled") — **that is what the titler
actually produced**; I recovered the model's intent rather than substituting my own. The six
"Tell me about" rows are **not** backfilled: they are poor, not broken, and rewriting a title an
owner may recognise is not mine to do.

---

## PHASE 3 — ALREADY BUILT, SO MEASURED INSTEAD

The obvious way "it is in the source" and "the screenshot shows only a delete icon" could both be
true is **clipping** — controls that exist and cannot be clicked. So I measured rather than argued.

```
viewport 1280 -> surface 1060   12/12 controls inside the panel, narrowest 32px
viewport 1440 -> surface 1220   12/12 inside, narrowest 32px
viewport 1920 -> surface 1700   12/12 inside, narrowest 32px
```
⚠️ **My first run was wrong.** It gave the panel the full viewport; the ax page renders inside
`DashboardShell`, whose desktop sidebar is a fixed 220px (`DashboardShell.tsx:40`). Re-measured
against viewport − 220. Same verdict, now for the right reason.

Pin ordering verified in the route, not the UI: `history/route.ts:96-97` orders `pinned_at DESC NULLS
LAST, last_message_at DESC` and returns `pinned_at` so the panel can mark and re-sort.

**Live: 0 pinned, 0 renamed — that is usage, not a defect.** Nothing in the code prevents either.

---

## PHASE 4 — WHAT THE NEW RAIL CAN AND CANNOT CATCH

**Catches:** every key a surface hook *returns* is destructured; every prop a surface component
*accepts* is passed. **Proven red against the real files**, not just in memory — orphaning
`provenance` and `cancel` in `AskAriaTransition.tsx` produced:
```
x useAriaStream returns these and nothing takes them: cancel
x AnswerMarkdown accepts these and no caller passes them: provenance
```
…the exact S1 and S3 bugs. Restored from backup; green again.

**Cannot catch — the honest half:**
1. a prop **passed but always `undefined`** — syntactically wired, semantically dead;
2. a value destructured and then never used (needs scope analysis, not regex);
3. anything reached dynamically — `obj[name]()`, `{...handlers}`, or a caller outside the surface list;
4. **a route with no caller at all** — a different scan, deliberately *not* half-attempted.

It proves a capability is **handed over**. It does not prove anyone uses what they were handed.
No exemptions were needed — nothing false-positived. If that list ever grows long, the rail is wrong.

---

## PHASE 5 — WHICH NUMBER WAS WRONG

**The headline.** Established from the database:
```
pending decisions (aria_actions, status='pending')   53   <- "Awaiting you", CORRECT
awaiting list capped at                               6   <- ax-context.ts:98 .limit(6)
lines at/below reorder point                          7   -> 1 notice
completed sales today                                 0   -> 1 notice
noticed.length = 6 + 1 + 1                            8   <- "8 things stood out", WRONG
```
**Not made to agree by copying.** `noticedTotal = awaitingTotal + (noticed.length − awaiting.length)`
— the capped slice replaced by the true count, everything else counted as-is → 55 on today's data.

**They still differ, and should.** "Awaiting you" counts **decisions waiting**; the headline counts
**everything Aria noticed**, including notices that are not decisions. The existing labels already
carry that distinction, so nothing needed relabelling.

*(The screenshot said 55 pending; today it is 53 — decisions were actioned in between. The arithmetic
is pinned in a test against the 26 Aug shape so the reasoning survives the numbers moving.)*

---

## PHASE 6 — ONE CLAIM TRUE, ONE NOT REPRODUCIBLE

**The unclosed quote was real.** `AskAriaTransition:586` did `.slice(0, 42)` — a raw cut, no
ellipsis, no quote balancing:
```
Tell me about "Revenue below weekly target"   (43 chars)
Tell me about "Revenue below weekly target    <- what rendered
```
The header now uses `fallbackTitle()`, the same rule the thread list uses, so the two can no longer
disagree about a thread's name. `closeDanglingQuote()` lives **with** the truncation so every
truncated title gets it.

**The clipping is not reproducible** at 1280/1440/1920 on the current stylesheet, with the real
titles and the real 220px sidebar inset. Nothing clips; the panel sits 26px off the right edge and
covers 9–15% of the conversation area. Either the screenshot predates this CSS, or the cause is
something the harness cannot reproduce (a live instance, browser zoom, a viewport under 1280).
**I did not "fix" a layout I cannot reproduce** — that risks breaking a panel that measures correct.

Measurements: `docs/aria/S3-panel-measurements.txt`. Screenshots at all three widths were captured
to the session scratchpad (`s3-panel-1280/1440/1920.png`); they are not committed, as the repo has a
documented history of binaries being swept into commits.

---

## PHASE 7 — THE WALK: NOT RUN

**I did not click through the product, and I am not presenting anything as if I had.**

`npm run test:smoke` would have been a real walk — it drives a production build with Playwright —
but it needs `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` from the process environment
(`tests/smoke/global-setup.ts:39-42`). They are not set in this shell, Playwright does not load
`.env.local`, and reading `.env.local` is blocked by policy here. **A fixture is not a walk**, so
nothing was substituted.

### What a human must click

| # | action | what to check |
|---|---|---|
| 1 | Ask a **strategic** question ("how do I grow midweek?") — it must hit the council path, not a data lookup | a figure renders **underlined**; click it and a source line appears |
| 2 | Reload the thread | the same figure is **still** underlined and still clickable |
| 3 | Find that thread via search, open it | tier and source survive |
| 4 | Then run: `select count(*) from aria_conversations c where exists (select 1 from jsonb_array_elements(c.messages) m where m ? 'provenance')` | **must be ≥ 1.** It is 0 today. This is the real proof of phase 1 |
| 5 | Start a **new** thread | its title is not raw JSON and not "Tell me about …" |
| 6 | Open `⋯` → rename a thread, then send another message | the name survives |
| 7 | Pin a thread, reload | it sorts first |
| 8 | Delete a thread, search for a phrase in it | gone from both |
| 9 | Look at the header while a thread is open | no unclosed quote |
| 10 | Compare the welcome line to the "Awaiting you" badge | headline ≈ badge + non-decision notices; neither is a page size |
| 11 | Open the threads panel at your actual window size | **is anything clipped?** If yes, tell me the exact viewport width — I could not reproduce it at 1280/1440/1920 |
| 12 | Stop mid-answer, then reopen the thread | the partial answer is there and marked partial |

### Anything that rendered plausibly but did nothing

Three, all now fixed and all of the same class — a capability wired at one end only:
`provenance` (accepted, never passed), the headline count (real number, wrong source), the header
title (real text, cut mid-quote). Phase 4's rail exists so the first kind cannot recur silently.

---

## GATES

- `npx tsc --noEmit` — **0 errors**
- `npx vitest run` — **1017 passed / 1017** across 77 files (was 987 at phase 1; +30 this sprint)
- `npx next build` — **BUILD_EXIT** read from `build-s3.log`, never the wrapper
- **Mutations, all RED:** stripping the provenance assembly · dropping the renderer prop · removing
  the titler's parse step · orphaning `cancel` and `provenance` **on the real files** · counting the
  capped list again
- ⚠️ **Build honesty:** the build was run **once, at the end, over all six commits** — not per
  commit. Six full builds is ~an hour of wall-clock, and every commit is pushed together, so the
  pushed tree is the build-verified one. Intermediate commits are `tsc`- and `vitest`-verified only.
  Recorded rather than implied.

### Corrections I made to my own work

- The panel harness first gave the surface the **full viewport**, ignoring the 220px sidebar. Re-run.
- I asserted `closeDanglingQuote('the "oat milk" and "cream')` should drop the trailing word. The
  code keeps it — and the code is right, because the owner's word is content and the stray quote is
  the artefact. **Test corrected to the better behaviour rather than the code bent to a worse one.**
