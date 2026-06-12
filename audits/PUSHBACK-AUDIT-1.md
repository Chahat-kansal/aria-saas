# PUSHBACK-AUDIT-1 — Map the "Aria is pushing back" Panel Source
**Date:** 2026-06-13 · Read-only audit · References current as of commit `298e6d2f`

> Headline: TWO persistence mechanisms explain the panel surviving DB cleanup.
> (A) **Filter asymmetry** — the council's memory recall checks `is_active` but NOT `deleted_at`,
> while the main brain checks both. A cleanup that set `deleted_at` is invisible to the council.
> (B) **A second, unfiltered feed** — `aria_conversation_summaries.key_decisions` (7-day window,
> no archive flag at all) carries "Tuesday Bundle activated…" text into the synthesis regardless
> of memory cleanup.

---

## Q1 — Where is the pushback panel rendered?

**`src/components/dashboard/BlockRenderer.tsx:243-258`** — the `pushback` block case:
- `:253` → header text `Aria is pushing back`
- `:258` → `<span …>Past decision:</span> {block.decision}`

Props shape (from `lib/aria/ask-types.ts:98-104`, the `pushback` AskBlock):
```ts
{ type: 'pushback'; decision: string; tension: string; question: string; severity?: 'low' | 'medium' | 'high' }
```
This is a generic chat block — there is no standalone "pushback panel" component; it arrives inside the `blocks[]` array of a chat response and renders inline. (The POS twin `components/aria/BlockRenderer.tsx` has the same case.)

## Q2 — Where does the panel's data come from?

Backwards trace (all live-computed per request — nothing precomputed/stored as pushback rows):

1. Rendered from `blocks[]` in the `POST /api/aria/ask` response.
2. Those blocks are **council synthesis output**: `council.ask_blocks` returned at `route.ts:~700` from `runAriaCouncil` (`route.ts:667`), reached via the analytical/strategic branch (`route.ts:~649`).
3. The synthesis MODEL emits the pushback block. It is prompted to do so by the **contradiction block** injected into the synthesis input: `council.ts:874-876` —
   `'PAST DECISION CONFLICTS (generate pushback blocks if relevant):\n' + contradictions.map(c => '- Past decision: "' + c.past_decision + '" | Severity: ' + c.severity)`
4. `contradictions` = `detectContradictions(activeQuestion, memories)` (`council.ts:691`, body at `:590-615`): filters memories to `kind === 'decision' || 'tried'`, requires a reversal signal in the question (`/should i|thinking of|considering|what if i|…/i`), then ≥0.25 word-overlap; max 3.
5. `memories` = `recallMemories(businessId, activeQuestion)` (`council.ts:684`) → **`aria_business_memory`** (`memory/recall.ts:35-38`).
6. SECOND feed: `summaryBlock` from `fetchRecentSummaries` (`council.ts:685,690`) → **`aria_conversation_summaries`** (`recall.ts:101-107`), whose `key_decisions` are formatted as `Decisions: …` (`recall.ts:122`) and injected into BOTH the brains' userPrompt (`council.ts:819`) and the synthesis input (`council.ts:873`). The synthesis prompt's block list always includes the pushback type, so the model can emit a pushback citing summary content even when `detectContradictions` returned nothing.

So: **computed live on every council request from two tables; never stored as pushback rows.**

## Q3 — What table holds "Past decision: Tuesday Bundle Special activated on 2026-06-10…"?

Suspect-by-suspect:

| Suspect | Exists in code? | Verdict |
|---|---|---|
| `aria_business_memory` | YES (recall.ts:35, business-context.ts:341, extract.ts writer) | **PRIMARY SOURCE.** Writer: `memory/extract.ts` — `maybeWriteOutcome`/extractor writes `kind: 'decision'` rows (`extract.ts:179`; kinds union at `:5`). Text like "Tuesday Bundle Special activated on 2026-06-10 with email outreach to 11 consented customers" is exactly the post-action outcome memory this writer produces from chat turns. ("Tuesday Bundle"/"activated on" are DB row content — not literals in src; zero grep hits, as expected for extractor-written text.) |
| `aria_conversation_summaries` | YES (recall.ts:101, writer `memory/summarize.ts` — `key_decisions: ["explicit decision the owner made or confirmed"]` at summarize.ts:21,28) | **SECONDARY SOURCE** — same decision text survives here for 7 days with NO archive flag. |
| `aria_actions` | YES | Feeds VERIFIED FIGURES/recommendations context, not the pushback contradiction block. Not the panel source. |
| `aria_decisions` / `aria_pushbacks` / `aria_contradictions` / `aria_outcomes` | NO matches in src (no such tables referenced) | Don't exist in code. |

## Q4 — When was Sip's last pushback record created?

**NEEDS-DB (chat Claude runs — no pushback table exists; query the two real feeds):**
```sql
-- Feed A: decision/tried memories (note: check BOTH soft-archive columns)
select id, kind, left(content, 160) as content, importance, is_active, deleted_at, created_at, last_referenced_at
from aria_business_memory
where business_id = 'ff5055a0-c351-4ada-817a-1804961035f3'
  and kind in ('decision','tried')
order by created_at desc limit 10;

-- Feed B: summaries inside the council's 7-day window
select conversation_date, left(summary, 120) as summary, key_decisions
from aria_conversation_summaries
where business_id = 'ff5055a0-c351-4ada-817a-1804961035f3'
  and conversation_date >= (current_date - interval '7 days')
order by conversation_date desc;
```
Expected: the Tuesday-Bundle text appears in Feed A with `deleted_at` set but `is_active` still true (explaining persistence via the recall asymmetry), and/or in Feed B's `key_decisions`.

## Q5 — Side-effect check

`aria_business_memory` readers:
- `memory/recall.ts:35-38` (council memoryBlock + contradictions) — filters `.eq('is_active', true)` **ONLY — no `deleted_at` check** (recall.ts:38).
- `ask/business-context.ts:340-348` (main-brain "WHAT I KNOW ABOUT …" personalisation, injected at route.ts:~1320) — filters `.eq('is_active', true)` **AND** `.is('deleted_at', null)` (:344-345). Also writes `last_referenced_at` (:352-361).
- Writers: `memory/extract.ts` (+ memory-extract cron), `maybeWriteMemory`.

**Consequence:** setting `is_active=false` cleanly silences BOTH the council and main brain (safe soft-archive, by design). Setting only `deleted_at` silences ONLY the main brain — the council (and therefore pushback + memoryBlock) keeps seeing the rows. That asymmetry is the most likely reason the cleanup "didn't take".
`aria_conversation_summaries` readers: council only (`fetchRecentSummaries`, recall.ts:95-113). Cleaning rows there affects only the 7-day "RECENT CONVERSATIONS" context — no other feature reads it (grep: recall.ts + summarize.ts writer only). Rows naturally age out after 7 days.

## Q6 — Brevity gating

Two gates exist post-COUNCIL-PORT-1 (`298e6d2f`):
1. **Route gate** — `route.ts:~648-656`: `isBrevityQuestion` (BREVITY_SIGNALS + SHORT_FACTUAL regexes) makes brevity questions **skip the council entirely** → no synthesis → no pushback block possible. This is the primary suppression point.
2. **Council prompt gate** — the ported BREVITY block in `council.ts` SYNTHESIS_PROMPT_BODY: "Output exactly one block plus at most one short sentence… NEVER emit council_split, comparison_table, alert_card, or ai_reasoning". **Gap: `pushback` is NOT in that named suppression list** — it is only implicitly covered by "exactly one block".
3. Incidental: `detectContradictions` requires a reversal signal (`/should i|thinking of|considering|what if i|…/i`, council.ts:595-596) — "just tell me…" never matches, so the contradiction INJECTION never fires for brevity questions anyway; but the model could still emit a pushback from `summaryBlock` content on advisory questions.

Does it fire on every chat response? **No** — only council-branch responses, and within those only when the model chooses the block (prompted when contradictions exist; possible whenever summaries mention decisions).

---

## RECOMMENDED FIX SCOPE

**(a) Stop citing dormant decisions — 2 one-line data-layer fixes + 1 cleanup rule:**
1. `src/lib/aria/memory/recall.ts:38` — add `.is('deleted_at', null)` to `recallMemories`, matching business-context.ts:345. Closes the filter asymmetry (council + pushback + memoryBlock all respect soft-deletes).
2. Same file, `fetchRecentSummaries` (:101-107) — either add a freshness/active filter if the table gains one, or accept the 7-day natural expiry; for immediate relief, chat Claude deletes/edits the Sip rows in `aria_conversation_summaries` whose `key_decisions` mention the archived bundle (no code change needed — rows age out in ≤7 days anyway).
3. Cleanup convention going forward: soft-archive memories by setting **`is_active=false`** (not just `deleted_at`) — it is the only flag every reader respects today.

**(b) Suppress pushback on brevity questions — already 95% done; 1 word remaining:**
- Route gate (COUNCIL-PORT-1 Part 1) already prevents pushback on brevity questions entirely.
- Belt-and-braces: add `pushback` to the council BREVITY block's named suppression list (`council.ts`, the "NEVER emit council_split, comparison_table, alert_card, or ai_reasoning" line → append ", or pushback") and optionally the same in route.ts's BREVITY block. One-word prompt edits.

Tables touched by the fix: `aria_business_memory` (read filter only), `aria_conversation_summaries` (data cleanup only). Files: `memory/recall.ts` (+2 lines), `council.ts` (+1 word), `route.ts` (+1 word, optional). No schema changes.

---
*Read-only. No source files modified. All claims file:line-cited; DB-content claims marked NEEDS-DB with the exact SQL.*

---

## ERRATUM (added by PUSHBACK-FIX-1, 2026-06-13)

**Mechanism A ("filter asymmetry") was a FALSE finding.** `recall.ts` already contained `.is('deleted_at', null)` at line 39 — verified against the audit-time commit itself (`git show 298e6d2f:src/lib/aria/memory/recall.ts` shows both filters), and `git log` shows the file untouched since commit `77a34ddb` (pre-session). The audit's grep pattern (`is_active|archived|kind`) did not include "deleted_at", so line 39 never appeared in the output and absence was wrongly inferred. Lesson recorded: presence/absence claims require reading the file region, not pattern-limited greps.

**Mechanism B stands** as the live explanation for pushback persistence: `aria_conversation_summaries.key_decisions` (7-day window, no archive flag) feeding the council synthesis — since cleaned at the data layer by chat Claude.

Q5's reader inventory is also corrected by PUSHBACK-FIX-1's full grep: recall.ts, business-context.ts, memory/route.ts GET, memory-consolidate, hypothesis/generate.ts:56, and extract.ts dedupe ALL filter both flags. The only readers missing one or both filters are `aria-os/status/route.ts:33` (no flags — admin status surface) and `ask/memory-writer.ts:27-34` (dedup check, is_active only) — flagged for RECALL-PARITY-1, not edited.
