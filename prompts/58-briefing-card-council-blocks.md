# Prompt 58 — Briefing Card: Wire Council ask_blocks Into Dashboard (Council Decides Everything)

## The real problem
The council already generates `ask_blocks` (metric cards, charts, action items) for every briefing.
The council ALREADY decides what to show — it's all in `src/lib/aria/council.ts`.
The `AriaBriefingCard` on the dashboard fetches the briefing but ONLY renders `final_briefing` text.
The `ask_blocks` the council generated are being thrown away on the dashboard.
Fix: pass `ask_blocks` from the briefing API response → render via BlockRenderer in AriaBriefingCard.
No hardcoded cards. No preset charts. Council decides everything.

## Pre-edit checklist (MANDATORY — read ALL before writing one line)
1. `cat src/components/dashboard/AriaBriefingCard.tsx` — full read (17KB)
2. `cat src/app/api/aria/daily-briefing/route.ts` — full read (17KB)
3. `cat src/components/dashboard/BlockRenderer.tsx` — full read (11KB)
4. `cat src/lib/aria/council.ts` — read lines around ask_blocks return (lines 220-265, 370-395)
5. `cat src/app/dashboard/ask-aria/page.tsx` — find how it renders ask_blocks via BlockRenderer
6. Check: what does daily-briefing API currently return? Does it include ask_blocks in response?

## What to build

### Step 1 — Check daily-briefing API response
Read the daily-briefing route carefully.
Find what it returns to the client — look for the final `return NextResponse.json({...})`.
Check if `ask_blocks` is included in the response.
If NOT included: add it.

The council's `runCouncil()` function returns `{ final_briefing, ask_blocks, layout, ... }`.
The daily-briefing route must include `ask_blocks` in its JSON response:
```ts
return NextResponse.json({
  briefing: council.final_briefing,
  ask_blocks: council.ask_blocks ?? [],  // ← ADD THIS if missing
  layout: council.layout ?? null,
  // ... rest of existing fields
})
```

### Step 2 — Check what daily_briefings DB table stores
The route may save to `daily_briefings` table and serve from cache.
If it caches: check if `ask_blocks` is stored in the cache too.
If not: add `ask_blocks jsonb` column to `daily_briefings` table via Supabase MCP.
Update both the save and the serve-from-cache path to include `ask_blocks`.

### Step 3 — Update AriaBriefingCard to render ask_blocks
In `AriaBriefingCard.tsx`:
1. Add `ask_blocks` to the fetch response type
2. Add state: `const [blocks, setBlocks] = useState<AskBlock[]>([])`
3. After fetch: `setBlocks(data.ask_blocks ?? [])`
4. Import BlockRenderer: `import { BlockRenderer } from '@/components/dashboard/BlockRenderer'`
5. Render blocks ABOVE the existing briefing text:
```tsx
{blocks.length > 0 && (
  <div style={{ marginBottom: 20 }}>
    {blocks.map((block, i) => (
      <BlockRenderer key={i} block={block} />
    ))}
  </div>
)}
```
Keep ALL existing briefing card code — mood, accents, council debate sections, layout — completely untouched.
Only add the blocks rendering above the text.

### Step 4 — Trigger fresh briefing if no ask_blocks in cached response
If the cached briefing has no ask_blocks (old format):
Show a "Refresh briefing" button that calls the briefing API with `?force=true`.
This regenerates with the council and returns ask_blocks.

## What the council generates (no changes needed to council.ts)
Council already generates these block types — just render them:
- `metric_row` — 2-4 metric cards with values, labels, trends
- `chart` — bar chart of time-series revenue/transaction data
- `action` — action items with buttons
- `lead` — lead statement
- `html` — custom tables, heatmaps

The council decides WHICH of these to include based on actual business data.
If revenue data exists → council includes chart.
If stock issues exist → council includes metric_row with stock numbers.
If customers at risk → council includes action items.
Owner sees exactly what the council decided matters most. Nothing hardcoded.

## Critical rule
Do NOT add any hardcoded metric cards or charts that fetch their own data.
Do NOT add a `/api/pos/daily-summary` route.
The council is the only source of truth for what appears visually.
If council says show a chart → show it. If council says show metrics → show them.
If council generates nothing → show nothing (just the text).

## DB migration (only if ask_blocks column missing)
```sql
ALTER TABLE daily_briefings ADD COLUMN IF NOT EXISTS ask_blocks jsonb DEFAULT '[]'::jsonb;
```
Run via Supabase MCP only if needed after checking.

## Execution order
1. Read ALL pre-edit files fully
2. Check daily-briefing API response — does it return ask_blocks?
3. If not: add ask_blocks to response + DB column
4. Update AriaBriefingCard to render blocks via BlockRenderer
5. `npx tsc --noEmit` — zero errors
6. `npm run build` — must pass
7. `git add -A && git commit -m "feat: briefing card renders council ask_blocks — council decides all visuals, no hardcoded cards" && git push`
