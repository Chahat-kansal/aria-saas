# Aria OS — Prompt 25: Phase 1 Security — Pre-Launch Hardening
MUST complete before soft launch. THREE data-leak holes. ONE commit, ONE push.

## MANDATORY PRE-EDIT CHECKLIST

```
1. pwd → must print C:\Users\kansa\aria-saas-audit — STOP if wrong
2. git pull origin main
3. Read every file listed in STEP 1 IN FULL before writing anything
4. npx tsc --noEmit — ZERO errors before touching anything
5. npm run build — must succeed before touching anything
```

---

## STEP 1 — READ BEFORE WRITING

Read these files in full before writing anything:
- `src/app/api/cron/square-sync/route.ts`
- All files under `src/app/api/pos/` directory
- All files under `src/app/api/square/` directory
- `src/middleware.ts`

---

## HOLE 1 — Square sync cron bypass

**Problem:** The Square sync cron at `/api/cron/square-sync` can be triggered by anyone — no secret validation.

**Fix:** Add at the top of the handler, before any logic:
```typescript
const secret = request.headers.get('x-vercel-cron-signature')
  ?? request.headers.get('authorization')?.replace('Bearer ', '')
if (secret !== process.env.CRON_SECRET) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

Add `CRON_SECRET=<random-32-chars>` to Vercel env vars. Vercel sends this automatically with cron requests.

---

## HOLE 2 — Unauthenticated POS stubs

**Problem:** Some `/api/pos/*` routes accept `business_id` from the request without verifying ownership.

**How to find them:** Search for routes that use `business_id` from `body` or `searchParams` WITHOUT a follow-up ownership query.

**Fix for each affected route — add after auth check:**
```typescript
const { data: biz } = await supabase
  .from('businesses')
  .select('id')
  .eq('id', businessId)
  .eq('user_id', user.id)
  .single()
if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

Mark each fixed route with comment: `// SECURITY: ownership verified`

---

## HOLE 3 — Square status endpoint ownership

**Problem:** `/api/square/status` or similar returns Square connection info for a `business_id` param without ownership verification.

**Fix:** Same ownership check pattern. Verify business.user_id === authenticated user.id before returning any data.

---

## STEP 2 — VERIFY

After all fixes: npx tsc --noEmit, npm run build. Then commit and push.

## CRITICAL RULES

- DB amounts stored as DOLLARS (numeric), never cents
- Model IDs: claude-haiku-4-5-20251001 / claude-sonnet-4-5-20250929 / gemini-2.5-flash-preview-05-20
- Build gate: npx tsc --noEmit + npm run build must pass before commit
- Single commit for the entire task
- vercel.json: never add sub-daily crons
- Never touch: AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts
- (Number(x)||0).toFixed(2) for all numeric display

## COMMIT

```
git add -A
git commit -m "feat(...): description"
git push origin main
```

npx tsc --noEmit and npm run build must pass. Then push.
