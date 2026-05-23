# Aria OS — Prompt 04: Setup Guide — Post-Onboarding Checklist with Spotlight
ONE task, ONE commit, ONE push.

## STEP 0 — SYNC FIRST
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
```

## STEP 1 — READ BEFORE WRITING
Read the dashboard home page/layout. Read BusinessProvider. Read the routes
for: adding a product, the POS, inviting staff, business settings/hours.
Do NOT write code first.

## CONTEXT — DB READY
Table business_setup_progress exists: business_id (unique PK), user_id,
completed_tasks (jsonb array of task keys), dismissed (boolean), updated_at.
Do not alter tables.

## STEP 2 — BUILD THE SETUP GUIDE CARD
On the dashboard home, show a "Get started" card while
business_setup_progress.dismissed is false and not all tasks are done.
Card shows a progress bar (X of N done) and a task list.

Tasks differ by businesses.business_model:

PRODUCT businesses:
- add_product     "Add your first product"
- test_sale       "Make a test sale on the POS"
- set_hours       "Confirm your trading hours"
- invite_staff    "Invite a team member" (optional)
- connect_google  "Connect your Google Business listing"

SERVICE businesses (business_model='service'):
- add_service     "Add your first service or class"
- add_customer    "Add your first customer / family"
- set_hours       "Confirm your opening hours"
- invite_staff    "Invite a team member" (optional)
- connect_google  "Connect your Google Business listing"

Each task has a "Do it" button. Completion tracked in
business_setup_progress.completed_tasks via an API route. A task auto-
completes when its underlying data exists (e.g. add_product done once the
business has >= 1 product) — check real tables, do not rely only on the button.
Card has a "Dismiss" link (sets dismissed=true). When all required tasks done,
show a brief "You're all set" state then hide.

## STEP 3 — LIGHTWEIGHT SPOTLIGHT
When owner clicks "Do it", route to the relevant page AND highlight the
specific element they need (e.g. the "Add product" button).

Implement a SIMPLE spotlight — do NOT add a heavy product-tour library:
- A fixed full-screen dim overlay (rgba 0,0,0,0.6)
- A transparent cut-out using box-shadow around the target element
- A small tooltip pointing at it ("Click here to add your first product")
- Add data-tour="add-product" (and similar) attributes to the relevant
  buttons in their respective pages
- Pass the task key via query param (?guide=add_product) so the destination
  page knows which element to spotlight
- Clicking anywhere or the target dismisses the spotlight
- Keep it small and dependency-free — no new libraries

## UI RULES (locked)
- Financial Trust palette, Fraunces italic headings, Inter body
- No backtick template literals inside className={...} or style={{}}
- 'use client' line 1 where needed
- Additive only

## STEP 4 — BUILD GATE
npx tsc --noEmit, then npm run build. Both must pass. ONE commit, ONE push.

Commit message:
feat(onboarding): post-onboarding Setup Guide checklist with lightweight spotlight coach-marks, product/service task sets, auto-completion from real data
