# Aria OS — Prompt 29: Privacy Sprint — Data Export + Deletion
Run before launch. ONE task, ONE commit, ONE push.

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

Read in full:
- `src/app/dashboard/settings/page.tsx`
- How supabaseAdmin is used in other routes (for admin-level deletes)
- businesses, pos_customers, pos_sales tables — understand FK relationships

---

## STEP 2 — DATA EXPORT

### src/app/api/account/export/route.ts

GET handler:
1. Auth check
2. Find all businesses owned by user
3. Collect all data: businesses, pos_customers, pos_sales, pos_products, aria_conversations
4. Return as JSON file download:
```typescript
return new NextResponse(JSON.stringify(exportData, null, 2), {
  headers: {
    'Content-Type': 'application/json',
    'Content-Disposition': 'attachment; filename="aria-data-export.json"',
  },
})
```

---

## STEP 3 — DATA DELETION

### src/app/api/account/delete/route.ts

DELETE handler body `{ confirm: string }`:
1. Auth check
2. Reject if confirm !== "DELETE MY DATA"
3. Delete in FK-safe order:
   - aria_conversations, aria_ai_calls, aria_autopilot_actions (business_id)
   - pos_sales, pos_customers, pos_products (business_id)
   - seo_audits and related (business_id)
   - businesses (user_id)
4. Delete auth user via supabaseAdmin.auth.admin.deleteUser(user.id)
5. Return { deleted: true }

---

## STEP 4 — SETTINGS PAGE

Add "Privacy & Data" section to /dashboard/settings:
- "Download my data" button → GET /api/account/export → browser download
- "Delete my account" section:
  - Warning text explaining this is permanent
  - Text input: "Type DELETE MY DATA to confirm"
  - Red "Delete Account" button → calls DELETE /api/account/delete → redirects to /goodbye
- Privacy statement: "Your data is stored securely. Aria never sells your data."

### Create src/app/goodbye/page.tsx
Simple page: "Your account has been deleted. Thank you for using Aria OS."
Link to ariaos.site home.

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
