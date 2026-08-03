# BRIEF-FIX-1 — Fixing the 4 live briefing bugs

Sip Café (`ff5055a0-c351-4ada-817a-1804961035f3`) dashboard screenshot, 19 Jul 2026.

## The real "before" text (pulled live from `aria_daily_briefings`, not paraphrased)

Row: `business_id=ff5055a0-c351-4ada-817a-1804961035f3`, `briefing_date=2026-07-19`, `pipeline=parallel`, `generated_at=2026-07-18 16:00:49 UTC`:

> \# Revenue Has Flatlined — Only $41 in the Past Week Against a $31,500 Target
>
> Your café recorded just **$41 over 7 days** (4 transactions) — that's **99.9% below your weekly target** of $999,999. Yesterday brought in $7 from a single sale; today shows $0 so far, though the day is still in progress. This isn't a quiet patch — it's a complete collapse in trading activity that demands immediate investigation. • **Stock is running dry**: 5 core items (Apple Juice, Turmeric Latte, Avocado Smoothie, C[ortado, Still Water]...)

Live DB check confirms `businesses.weekly_revenue_target = 0` (unset) for Sip, and 0 completed sales in the trailing 7 days — this is a genuinely dormant test business, not a real trading collapse.

## Structural finding: there are TWO independent briefing generators, not one

The investigation initially focused on `src/lib/aria/council.ts` (`runAriaCouncil`), the on-demand pipeline behind `GET /api/aria/briefing` — used when a user opens the dashboard and no briefing is cached yet for today.

Live data showed the actual broken text above did **not** come from that pipeline. It came from `src/app/api/cron/generate-briefings/route.ts` → `src/lib/aria/parallel-orchestrator.ts` (`runParallelAriaAgents`, `pipeline='parallel'`) — a nightly cron job that pre-populates `aria_daily_briefings` for every business *before* the owner ever opens the dashboard. `pickCanonicalBriefing()` (`src/lib/aria/briefing-guard.ts`) prefers `pipeline='parallel'` rows first, so this cron output is what owners see by default; `council.ts` only runs as a same-day fallback if the cron row is missing.

Both pipelines had versions of all 4 bugs, from independent causes, because they are two separate prompts/generators with no shared grounding or rendering contract. Both are fixed below. A third pipeline (`daily-briefing-submit`/`-poll`, `pipeline='batch'`, lowest read precedence) was checked and does not compute a target or reference markdown scaffolding in its prompt — live sample rows for Sip from that pipeline already read correctly ("yesterday was quiet..."), so no bug was found there; it benefits from the renderer-side BUG 2 fix as a bonus since it shares the same `aria_daily_briefings.content` field.

---

## BUG 1 — the invented target ($999,999 / $31,500)

**Root cause (two separate ones, same symptom):**

1. **`council.ts` / `response-validator.ts`**: `stripUngroundedNumbers()` — the code-level anti-hallucination guard ("GROUNDING-TEETH-V2") — had `if (... || anchorNumbers.length === 0) return { healedText: text, stripped: [] }`. When a business has no real ground-truth numbers to check against (exactly the dormant-business case), the guard silently no-op'd instead of stripping anything — it disabled itself precisely when hallucination risk was highest. A second, worse bug in the same function: when *every* sentence turned out to be risky (`kept.length === 0`), it reverted to the **original fabricated text** rather than a safe fallback — backwards, since that's the case with the most fabrication.
2. **`generate-briefings/route.ts`**: `TARGET_DAILY = 4_500` was a hardcoded constant (→ $31,500/week), computed against and shown to the owner as "your target" regardless of whether they had ever configured `businesses.weekly_revenue_target`. This is the literal source of "$31,500 Target" in the screenshot's title — a fabricated target from application code, not a model hallucination, but the same GROUNDING-TEETH violation the task describes. (`$999,999` itself was not traceable to any constant in the codebase — it is a genuine model fabrication inside the `parallel_merge` LLM call, which had **zero** code-level numeric guard at all before this fix, unlike `council.ts`.)

**Fix:**
- `response-validator.ts`: `stripUngroundedNumbers()` now treats zero anchors as "nothing can be grounded" (strip every risky number) instead of "nothing to check" (bypass). When everything is stripped, it returns an honest fallback sentence ("Aria doesn't have enough verified data yet to state specific figures here") instead of the original fabricated text.
- `council.ts`: removed the `v2Anchors.length > 0 &&` gates on both call sites (per-advisor cleaning + final synthesis) so the guard always runs. Also merges `computeHealthSignals()`'s own verified numbers into the anchor set (see BUG 4), so a dormant business has a few *real* numbers to ground against instead of zero.
- `generate-briefings/route.ts`: `TARGET_DAILY` replaced with the real `businesses.weekly_revenue_target` (added to the cron's business query). No target set → no target line is even given to the model, plus an explicit instruction not to mention one. Target set → the real value, divided into a daily equivalent.
- `generate-briefings/route.ts`: added a `stripUngroundedNumbers()` call (reusing the now-fixed shared function) on the merged text before storage, with anchors built from `extractNumbers()` over every task result actually fed to the model — the first numeric backstop this pipeline has ever had.

**Where else this root cause appears:** `stripUngroundedNumbers()` is also Check 6 in `validateAndHeal()` (`response-validator.ts`), shared by the `ask_aria` chat pipeline — the fix applies there automatically, for free, since it's the same function. Every other module that reads `weekly_revenue_target` (`goal-context.ts`, `get-business-context.ts`, `get-system-prompt.ts`, `facts-packet.ts`) was checked and already handles "unset" correctly — the two bugs above were the only two places a fake target was computed and shown.

---

## BUG 2 — raw markdown leaking into the UI (structural, the recurring one)

**Root cause:** no shared contract between briefing generation and the surfaces that render it. Two renderers existed independently:
- `AriaBriefingCard.tsx`'s `parseBriefing()` handled `**bold**` and `**Heading:**` but had no case for literal ATX headings (`#`/`##`/`###`), so `#` fell through as plain text.
- `DailyBriefingModal.tsx` rendered `rec.title`/`rec.description` as raw interpolated strings — zero markdown handling at all — both for server-built recs and its own client-side sentence-split fallback.
- `daily-briefing/page.tsx`'s Action Items (`r.title`/`r.description`) and its "Executive Summary" history view (`historyView.content`) were also raw, unsanitized renders of the same AI text.

**Fix — one format contract, applied per surface type, not per symbol:**
- **Full-prose surfaces** (the main card's body) render markdown-lite *properly* — this was already a deliberate feature (bold spans). `parseBriefing()` was extended to also handle `#`/`##`/`###` as headings, rather than stripping the feature.
- **Title/label surfaces** (anything shown as a single line, not a formatted paragraph) get **plain text** — a title should never show raw `**`/`#` syntax. New shared utility `src/lib/aria/markdown-lite.ts` (`stripMarkdownToPlainText`), safe to import from both server routes and client components, applied at every such site:
  - `briefing/route.ts`'s `buildBriefingRecs()` — every `title`/`description` field (consensus items, brain recommendations, contested items, `final_briefing` sentence fallback).
  - `DailyBriefingModal.tsx`'s client-side sentence-split fallback (bypassed `buildBriefingRecs()` entirely before this fix).
  - `daily-briefing/page.tsx`'s Action Items render, its history "Executive Summary" (`historyView.content`), and its PDF export (`buildBriefingHtml()`).

**Where else this appears:** this was the surface-level fix; the actual raw markdown in the reported screenshot originated in the `parallel-orchestrator.ts` `parallel_merge` LLM call's output, stored verbatim into `aria_daily_briefings.content` and read by *all three* pipelines' consumers — so fixing the renderers (rather than trying to ban markdown at the source, which would regress the main card's intentional rich formatting) is the one fix that covers `council.ts`'s output, the cron pipeline's output, and the batch pipeline's output simultaneously, without downgrading any surface's formatting.

---

## BUG 3 — duplicated headline

**Root cause:** `council.ts`'s synthesis prompt instructs the model to produce a headline **twice**, with no rule against duplicating between the two: once as `final_briefing`'s opening sentence ("Leads with the single most important insight as a punchy headline with the actual number"), and again, optionally, as a `lead` ask_block's `content` field ("ONE punchy headline sentence with the key number"). `AriaBriefingCard.tsx` renders the `lead` block first, then `final_briefing`'s body directly below it — exactly "the card title, then the first body paragraph" if the model wrote the same sentence into both.

The nightly cron pipeline (`parallel-orchestrator.ts`) doesn't have a separate title field, but its `MERGE_SYSTEM` prompt had the same underlying gap: nothing stopped the model from opening with a markdown heading and then restating the same fact as the first body sentence (visible in the real "before" text above: the `#` heading and the first sentence both center on the same $41/99.9%/$999,999 claim, just reworded).

**Fix:**
- `council.ts`: added a code-level dedup guard in the `ask_blocks` filter — a `lead` block is dropped if its (normalized) content is a substring match of, or matches, `final_briefing`'s opening sentence. Added a matching prompt rule ("NO DUPLICATION ACROSS BLOCKS").
- `parallel-orchestrator.ts`: added `MERGE_SYSTEM` rule 9 — state the headline fact once; the sentence after the opening must add new information, not restate the same number/finding in different words.

**Note on BUG 1/BUG 3 overlap:** the task correctly flagged this as likely the same root cause as BUG 1 — in the real sample, the duplicated content also carried the fabricated $999,999/$31,500 figures, so BUG 1's numeric guard now strips much of that duplication as a side effect even where the dedup rule doesn't catch it verbatim.

---

## BUG 4 — dormant business misclassified as catastrophic failure

**Is the distinction already derivable from existing signals, or does it need a new one? — It already exists; it just wasn't wired into the pipeline that needed it.**

`src/lib/aria/health-signals.ts`'s `computeHealthSignals()` already computes exactly this distinction: `pos_health.status = 'INSUFFICIENT_SAMPLE'` when a business has fewer than 5 completed sales in 7 days, with reasoning text already written to say precisely the right thing: *"Only N completed sales in the last 7 days — too small a sample to draw any POS-health conclusion. Low revenue here does NOT imply a broken POS."* This is wired into the `ask_aria` chat pipeline (`src/app/api/aria/ask/route.ts`) already.

It was **never wired into `council.ts`** (covers both `briefing` and `weekly_report` modes) despite `council.ts` having a `diagnosticPointer` string that explicitly told every advisor *"The system state is in business_health (within available_ground_truth)... consistent with pos_health.status"* — a promise the briefing pipeline never actually kept, because `business_health` was never added to the JSON context it built. It was also entirely absent from the cron pipeline (`generate-briefings.ts`), which has its own separate, already fairly explicit anti-catastrophizing prompt rules (`MERGE_SYSTEM` rules 1-4: "QUIET DAY ≠ CLOSURE", "NO CATASTROPHIC LANGUAGE" etc.) — and the model still wrote "complete collapse in trading activity" despite them, confirming prompt wording alone isn't reliable (the same pattern as BUG 1).

**Fix:**
- `council.ts`: fetches `computeHealthSignals()` in parallel with the other context calls, injects `business_health` into `available_ground_truth` (making the existing `diagnosticPointer` claim true), merges its verified numbers into the grounding-guard anchor set, and adds an explicit severity-check rule to both the Risk Advisor prompt and the synthesis prompt referencing `pos_health.status` by name.
- `generate-briefings/route.ts`: added a new high-priority `system_state` task that calls `computeHealthSignals()` directly and hands the model the concrete status + reasoning string, reinforcing the existing abstract "don't catastrophize" rules with a specific, sourced fact to defer to.

---

## Verification

- `npx tsc --noEmit` — 0 errors.
- `npm run build` (`NODE_OPTIONS=--max-old-space-size=6144 npx next build`) — green, only pre-existing lint warnings (all in files untouched by this sprint).
- Pure-function verification against the real "before" text pulled live from `aria_daily_briefings` (see above), via `stripUngroundedNumbers`/`stripMarkdownToPlainText` directly:
  - With zero anchors (Sip's actual scenario — no real target set): both the `$31,500`/`$999,999` sentence and the `$41`/`99.9%` sentence are stripped; only the non-numeric sentence survives, matching the fixed "strip everything risky, no bypass" behaviour.
  - With the real grounded numbers as anchors ($41, 4, $7, $0): only the fabricated `$31,500 Target`/`$999,999` sentence is stripped; the genuinely-grounded `$7`/`$0` sentence is correctly kept — confirms the guard targets fabrication specifically, not all numbers.
  - `stripMarkdownToPlainText` on the same text: all `#`/`**` markdown removed, clean single-line plain text.
- Live DB check (Supabase MCP) confirms Sip Café: `weekly_revenue_target = 0` (unset) and 0 completed sales in the trailing 7 days — the exact dormant scenario these fixes target.
- **Not done in this session**: a live end-to-end regeneration through the real deployed pipelines (would require either an authenticated dashboard session or loading local service-role secrets, both out of scope for this session's standing constraints). Once deployed, the fixes will apply automatically on the next cron run (`generate-briefings`) or the next cache-miss `council.ts` call; to see it immediately, force-refresh from the dashboard (Refresh button) or wait for tonight's scheduled run — the next `aria_daily_briefings` row for Sip should carry no target claim, no raw markdown, no duplicated headline, and "quiet"/"dormant" framing instead of "collapse".

## Files changed

- `src/lib/aria/response-validator.ts` — `stripUngroundedNumbers()` zero-anchor fix (BUG 1)
- `src/lib/aria/council.ts` — BUG 1 gate removal, BUG 3 dedup + prompt rule, BUG 4 health-signal wiring
- `src/lib/aria/markdown-lite.ts` — new shared plain-text sanitizer (BUG 2)
- `src/components/dashboard/AriaBriefingCard.tsx` — ATX heading support (BUG 2)
- `src/components/dashboard/DailyBriefingModal.tsx` — sanitize client-side fallback (BUG 2)
- `src/app/api/aria/briefing/route.ts` — sanitize `buildBriefingRecs()` (BUG 2)
- `src/app/dashboard/daily-briefing/page.tsx` — sanitize Action Items, history view, PDF export (BUG 2)
- `src/app/api/cron/generate-briefings/route.ts` — real target, numeric guard, health-signal task (BUG 1, 4)
- `src/lib/aria/parallel-orchestrator.ts` — no-duplicate-headline rule (BUG 3)
