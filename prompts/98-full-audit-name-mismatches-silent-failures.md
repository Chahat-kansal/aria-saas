# Prompt 98 — Full codebase audit: name mismatches + silent API failures

## What this is
A systematic, multi-session audit of every file in the codebase. Not a feature.
Not a refactor. Just truth-finding and fixing.

Two specific problems to find and fix:
1. NAME MISMATCHES — a route queries `pos_staff` but data lives in `staff_members`.
   A page fetches `/api/pos/customers` but the table is `pos_customers`. Column
   names in code that don't match DB column names. These cause silent empty states.

2. SILENT API FAILURES — a fetch() call that swallows errors so the owner sees
   "no data" instead of "something broke". A .catch(() => []) that hides a 500.
   An API route that returns 200 with empty data instead of 4xx on failure.

## How to run this across multiple sessions

This audit is too large for one session. Use this tracking system:

### Audit state file
At the start of EVERY session running this prompt, read `AUDIT_STATE.md` at the
repo root. It tracks what has been audited and what remains.

At the END of every session, update `AUDIT_STATE.md` with what was completed and
where to start next session.

### AUDIT_STATE.md format
```markdown
# Aria OS Audit State

## Last updated
2026-05-29 Session 1

## Completed sections
- [x] src/app/api/aria/* (47 routes) - 3 mismatches fixed, 2 silent failures fixed
- [x] src/app/api/pos/* (partial - routes a-m done)

## Current position
Currently auditing: src/app/api/pos/ (routes n-z remaining)
Next session starts at: src/app/api/pos/orders/route.ts

## Issues found (running log)
| File | Type | Issue | Fixed? |
|------|------|-------|--------|
| src/app/api/pos/timesheets/route.ts | MISMATCH | queries pos_staff not staff_members | YES commit abc1234 |
| src/app/dashboard/social/page.tsx | SILENT | connections state never loaded | YES commit def5678 |

## Sections remaining
- [ ] src/app/api/aria/*
- [ ] src/app/api/pos/*
- [ ] src/app/api/public/*
- [ ] src/app/api/social/*
- [ ] src/app/api/reports/*
- [ ] src/app/api/seo/*
- [ ] src/app/api/community/*
- [ ] src/app/api/integrations/*
- [ ] src/app/api/cron/*
- [ ] src/app/dashboard/* (all page.tsx files)
- [ ] src/app/pos/* (all page.tsx files)
- [ ] src/lib/aria/* (all lib files)
- [ ] src/components/dashboard/* (all component files)
```

## What to check in EVERY file

### For API routes (route.ts files)

**Name mismatch checks:**
1. Every `.from('table_name')` — does that table exist? Cross-reference against
   the known table list below.
2. Every `.select('column_name')` — does that column exist in that table?
3. Every `.eq('column_name', value)` — does that column exist?
4. Every `.insert({column_name: value})` — does that column exist?
5. Every `params.business_id` used directly as a UUID — should it go through
   `resolveBusinessId()` to accept slugs too?

**Silent failure checks:**
1. Every `try { } catch (e) { }` with an empty or swallowing catch — replace
   with proper error logging AND a meaningful response.
2. Every `.catch(() => [])` or `.catch(() => null)` or `.catch(() => {})` —
   these hide real errors.
3. Every route that returns `{ data: [] }` on error instead of a non-200 status.
4. Every route missing a try/catch entirely on DB calls.
5. Supabase `.data` accessed without checking `.error` first.
6. Any route that returns 200 with `{ success: false }` — should be 4xx or 5xx.

**The standard fix pattern for silent failures:**
```typescript
// BEFORE (silent failure)
const { data } = await supabase.from('table').select('*')
return NextResponse.json({ data: data || [] })

// AFTER (surfaces errors)
const { data, error } = await supabase.from('table').select('*')
if (error) {
  console.error('[route-name] DB error:', error.message)
  return NextResponse.json({ error: error.message }, { status: 500 })
}
return NextResponse.json({ data: data || [] })
```

### For page components (page.tsx files)

**Name mismatch checks:**
1. Every `fetch('/api/...')` URL — does that route actually exist in src/app/api/?
2. Every field accessed on the response — e.g. `data.customers` but the route
   returns `data.data` — these cause silent undefined.
3. State variable typed as `ConnectionType[]` but the API returns a different shape.

**Silent failure checks:**
1. Every `fetch()` without a try/catch or .catch().
2. Every `.then(r => r.json())` without checking r.ok first.
3. Every useEffect that calls an API but has no error state to show the user.
4. The pattern `setData(res.data || [])` where `res.data` being undefined means
   a real error happened but the user sees an empty list.

**The standard fix pattern for page fetches:**
```typescript
// BEFORE
useEffect(() => {
  fetch(`/api/data?business_id=${bid}`)
    .then(r => r.json())
    .then(d => setData(d.items || []))
}, [bid])

// AFTER
useEffect(() => {
  if (!bid) return
  fetch(`/api/data?business_id=${bid}`)
    .then(async r => {
      if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`)
      return r.json()
    })
    .then(d => setData(d.items || []))
    .catch(err => {
      console.error('[PageName] fetch failed:', err)
      setError('Failed to load data. Please refresh.')
    })
}, [bid])
```

## Known table names (use this to check .from() calls)
The live DB has these tables (read AUDIT_STATE.md for the full list which is
appended there). Key ones that are commonly confused:

CORRECT → COMMON WRONG ASSUMPTION
staff_members → pos_staff (pos_staff is the register login table, not the team)
pos_customers → customers (customers is a separate non-POS table)
pos_products → products (no plain "products" table exists)
pos_sales → sales (no plain "sales" table exists)
social_connections → integrations (no plain "integrations" table)
business_expenses → expenses (no plain "expenses" table)
pos_modifier_groups → modifier_groups
pos_product_modifier_groups → (join table, not a standalone)
community_members → members
instore_conversations → kiosk_conversations

## Known column name traps (things that have already caused bugs)
- `businesses.slug` EXISTS (added in prompt 89)
- `businesses.website` EXISTS (used by SEO + community)
- `businesses.hub_visible_features` EXISTS (jsonb)
- `businesses.booking_link_slug` EXISTS
- `businesses.google_review_link` EXISTS
- `pos_products.barcode` EXISTS but is usually NULL (products also have entries
  in pos_product_barcodes as a separate table)
- `pos_products.is_active` EXISTS (boolean)
- `pos_sales.status` — filter is `!= 'voided'` not `= 'completed'`
- `pos_sales.served_by` is TEXT (cashier name), not a UUID
- All monetary amounts in DB are in DOLLARS (numeric), not cents
- `instore_kiosk_configs.scan_and_go_enabled` EXISTS (added prompt 96)
- `aria_monthly_spend` EXISTS (added prompt 86/87)
- `market_price_scans` EXISTS (added prompt 97)

## Audit order (start here, work through systematically)

### Session 1 starting point
Begin at: `src/app/api/aria/`
List every file. Read each one. Check both name mismatches and silent failures.
Fix inline. Commit per directory (not per file — too many commits).

### Subsequent sessions
Read AUDIT_STATE.md. Start exactly where it says. Update it at the end.

## Commit format
Each commit covers one directory:
`audit(api/aria): fix 3 name mismatches + 2 silent failures in aria routes`
`audit(api/pos): no issues found`
`audit(dashboard/social): fix silent connection state error handling`

## Rules
- Read AUDIT_STATE.md at the START of every session
- Update AUDIT_STATE.md at the END of every session
- Fix every issue found inline — do not create a "issues list" and fix later
- npx tsc --noEmit must pass after every commit
- npm run build does NOT need to run after every commit (too slow) — run it
  at the end of each session only
- git push origin main after every commit (not batched — push as you go so
  progress is never lost between sessions)
- If a fix is risky (changes behavior, not just error handling), leave a
  TODO comment and note it in AUDIT_STATE.md for human review
- Do NOT refactor working code. Only fix mismatches and silent failures.
  If something works but uses an old pattern, leave it.

## Success criteria
The audit is complete when:
1. Every .from() call references a real table name
2. Every .select()/.eq()/.insert() references real column names
3. Every API route has try/catch and returns meaningful error responses
4. Every page component has error handling on its fetch calls
5. AUDIT_STATE.md shows all sections checked
6. No new regressions (tsc passes throughout)

This will take 5-10 sessions. That is expected and fine.
Start with Session 1 now.
