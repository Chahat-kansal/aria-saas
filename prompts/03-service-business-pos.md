# Aria OS — Prompt 03: Product-vs-Service + Conditional POS
ONE task, ONE commit, ONE push.

## STEP 0 — SYNC FIRST
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
```

## STEP 1 — READ BEFORE WRITING
Read the onboarding wizard from Prompt 01. Read the dashboard sidebar/nav
and how the POS entry point is currently rendered. Do NOT write code first.

## CONTEXT — DB READY
businesses.business_model (text, default 'product') and businesses.pos_enabled
(boolean, default true) already exist. Do not alter tables.

## STEP 2 — ADD ONE ONBOARDING QUESTION
In the wizard's Step 3 ('details'), add a question BEFORE the industry select:
"Does your business sell products, or provide services and classes?"

Two choices:
- "We sell products" → business_model='product', pos_enabled=true
- "We provide services / classes" → business_model='service', pos_enabled=false

When 'service' is chosen, the industry select also offers: swim school,
childcare / kindergarten, clinic / allied health, tutoring, fitness / studio,
services other. Save both fields at final submit.

## STEP 3 — MAKE THE POS CONDITIONAL
In the dashboard sidebar/nav and any home tile grid: only render the POS /
terminal entry when businesses.pos_enabled === true. When false, hide it
cleanly — no broken link, no empty POS. Every other feature stays visible
for everyone.

Add a guard on the /pos route: if pos_enabled is false, redirect to /dashboard.

## STEP 4 — PROVISIONING CONTEXT
Prompt 02's provision route already skips menu/category seeding when
business_model='service'. Do not undo that logic.

## UI RULES (locked)
- No backtick template literals inside className={...} or style={{}}
- 'use client' line 1 where needed
- Financial Trust palette, Fraunces italic headings, Inter body
- Additive only — do not remove or break any existing feature

## STEP 5 — BUILD GATE
npx tsc --noEmit, then npm run build. Both must pass. ONE commit, ONE push.

Commit message:
feat(onboarding): product-vs-service business model — service businesses (swim school, kindergarten, clinic) onboard with no POS; POS tile and route now conditional on pos_enabled
