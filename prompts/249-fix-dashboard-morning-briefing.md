# CLAUDE CODE PROMPT — 249: Fix Dashboard Morning Briefing (shows only 3 things + redirects to Ask Aria)

Autonomous mode, no permission prompts. Build gate before commit. RULE 0. `pwd` = `C:\Users\kansa\aria-saas-audit`.

## THE BUG (verified against live code)
The dashboard login briefing modal (`src/components/dashboard/DailyBriefingModal.tsx`) shows only ~2 insight cards plus a "Read full intelligence brief → open Ask Aria" card, instead of the full briefing. 

Root cause: `DailyBriefingModal` calls `/api/aria/briefing`. That modal has TWO paths:
1. If `councilData.recommendations` (a structured array) exists → it renders them all. GOOD path.
2. If only `councilData.briefing` (text) exists → it crudely splits the text into 2 cards + appends a "navigate to Ask Aria" card. BAD path — this is what's happening.

`/api/aria/briefing/route.ts` returns `{ briefing: council.final_briefing, ask_blocks, consensus, contested, confidence_map, layout }` — it **never returns a `recommendations` array**. So the modal always falls into the bad path.

The council DOES produce rich structured data. In `src/lib/aria/council.ts`, `runAriaCouncil` returns per-brain `recommendations: string[]` (revenue/risk/strategy/context brains), plus `final_briefing`, `consensus` (string[]), `contested` (string[]).

## THE FIX
Make `/api/aria/briefing/route.ts` return a proper `recommendations` array built from the council's real output, so the modal renders the full briefing inline and stops redirecting to Ask Aria.

### Step 1 — Read these fully first
- `src/app/api/aria/briefing/route.ts` (the endpoint — note it returns `briefing`/`consensus`/`contested` but no `recommendations`)
- `src/lib/aria/council.ts` (find the exact shape `runAriaCouncil` returns — confirm `consensus`, `contested`, and whether per-brain recommendations are exposed on the result or only internally)
- `src/components/dashboard/DailyBriefingModal.tsx` (the `Recommendation` type at top, lines ~10-50, and the parse logic ~130-200)

### Step 2 — Build a recommendations array in the briefing route
After the council runs and before the `return NextResponse.json({ briefing: council.final_briefing, ... })`, assemble a structured `recommendations` array matching the modal's `Recommendation` type:

```ts
type BriefingRec = {
  id: string
  priority: 'high' | 'medium' | 'low'
  category: 'revenue' | 'customers' | 'stock' | 'marketing' | 'compliance'
  title: string
  description: string
  action_label: string
  action_type: 'winback' | 'review_reply' | 'promotion' | 'reorder' | 'campaign' | 'navigate' | 'dismiss'
  metric: string
  metric_label: string
  trend: null
  action_payload?: { href?: string }
}
```

Source the cards from the council's REAL output, in priority order:
1. **`consensus` items** (what all brains agreed on) → high priority cards
2. **`contested` items** (where brains disagreed) → medium priority, framed as "worth a look"
3. If the council exposes per-brain recommendations, map each domain to its category (revenue brain→revenue, risk brain→stock/compliance, strategy→marketing, context→customers)
4. Each card: title = first ~6 words of the item; description = the full item text; action_label/action_type chosen by category (e.g. stock→'reorder' 'Reorder now', customers→'winback' 'Win back', else 'navigate' with a relevant dashboard href, NOT always Ask Aria)

Aim for 4–7 real cards. Only fall back to the text-split path if the council genuinely returned nothing structured.

Add `recommendations` to BOTH the council-success return (line ~134) and keep the text `briefing` field too (the modal uses it as fallback). Do NOT remove `briefing`, `ask_blocks`, `consensus`, etc.

### Step 3 — Stop the forced Ask Aria redirect
In `DailyBriefingModal.tsx`, the text-fallback path (lines ~155-189) sets every card's `action_payload.href` to the Ask Aria full-briefing query and appends a "Read full intelligence brief" card. Since the route now returns real recommendations, this path should rarely run — but also fix it so it's not the ONLY behaviour:
- Keep a single, smaller "See full analysis in Ask Aria" link at the BOTTOM of the modal (not as a card that replaces content)
- The individual cards should have real actions based on their category, not all "navigate to Ask Aria"

### Step 4 — Make actions real where possible
For cards where the council recommends a concrete action (reorder, winback, review reply), wire `action_type` + `action_payload` so the button does the real thing (or navigates to the right dashboard section), not Ask Aria. Only use `action_type: 'navigate'` to Ask Aria for genuinely open-ended strategic items.

## VERIFICATION — RENDER THE ACTUAL OUTPUT (mandatory, do not skip)
This is the new standard: do NOT mark done on "it compiles." Verify the rendered result.
1. `npx tsc --noEmit` + `npm run build` pass
2. Start the dev server, hit `/api/aria/briefing?businessId=<Sip cafe id ff5055a0-c351-4ada-817a-1804961035f3>` with a valid session (or write a quick script using the service role to call runAriaCouncil for Sip), and PASTE the JSON response — confirm `recommendations` is a non-empty array with real titles/descriptions, not just `briefing` text.
3. Confirm the array has 4+ cards and that NOT all of them are `action_type: 'navigate'` to Ask Aria.
4. Confirm the modal's GOOD path (line ~132 `if Array.isArray(councilData.recommendations)...`) will now be taken — i.e. `recommendations.length > 0`.
5. Show the evidence (the JSON) before claiming done.

## HARD RULES
- Do NOT remove `briefing`, `ask_blocks`, `consensus`, `contested`, `confidence_map`, `layout` from the response — only ADD `recommendations`
- The full briefing must render IN the modal — Ask Aria is an optional "go deeper" link, never the only way to see it
- Verify with the rendered JSON output, not just compilation
- Build gate before commit
