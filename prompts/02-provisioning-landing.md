# Aria OS — Prompt 02: Provisioning Screen + Landing Page Fix
ONE task, ONE commit, ONE push.

## STEP 0 — SYNC FIRST
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
```

## STEP 1 — READ BEFORE WRITING
Read the landing page (src/app/page.tsx or wherever the marketing landing
lives) IN FULL — note how its scroll/nav-hide behaviour works, that must NOT
change. Read the onboarding flow from Prompt 01. Read the existing cafe menu
seed logic, and how business_hours, compliance_items, pos_categories,
aria_daily_briefings rows are created. Do NOT write code before reading.

## PART A — PROVISIONING SCREEN
After onboarding's final step, a full-screen "Aria is setting up your
business" experience that calls a new API route /api/onboarding/provision.
That route runs these REAL steps server-side, updating
business_onboarding.provisioning_steps after each so the UI shows true
progress:

1. "Setting up your menu & categories" — if industry='cafe' run the existing
   cafe menu seed; otherwise create default pos_categories only. If
   business_model='service' skip menu/categories entirely.
2. "Configuring your trading hours" — insert default business_hours Mon-Sun.
3. "Preparing compliance tracking" — seed compliance_items for the industry.
4. "Briefing Aria on your business" — generate the first aria_daily_briefing
   row from the onboarding answers.
5. "Finalising" — businesses.onboarding_complete=true,
   business_onboarding.current_step='complete',
   provisioning_status='complete'.

Each step in its own try/catch. On failure: provisioning_status='failed',
provisioning_error set, and the UI shows a RETRY button that re-calls the
route (idempotent — use upsert/exists checks so running twice does not
duplicate). If industry is missing, use generic setup (no cafe seed) — never
error. The screen polls business_onboarding every ~2s. Fraunces heading
"Aria is setting up [business name]". On complete, route to /dashboard.

## PART B — LANDING PAGE FIX
The current landing wrongly presents Aria as a POS. Aria OS is an AI business
co-operator; POS is ONE feature inside it.

Rewrite COPY and SECTIONS only — do NOT touch the scroll/nav-hide mechanic:
- Hero: lead with Aria OS as an AI co-owner that runs the back office of an
  Australian small business — daily briefings, customer win-back, reviews,
  profit-leak analysis, bookings, compliance, competitor tracking, marketing,
  AND point-of-sale among them.
- Remove any POS-led headline. POS appears as ONE capability tile.
- A capabilities section listing the breadth (10 dashboard areas) so
  "one-stop solution" is concrete, not a slogan.
- Keep plans: Starter $297 / Growth $597 / Pro $997, 14-day trial.
- Keep design system. Do not break routing, the signup CTA, or auth links.
  Verify the signup button still points to the real signup route.

## UI RULES (locked)
- No backtick template literals inside className={...} or style={{}}
- 'use client' line 1 where needed
- Financial Trust palette, Fraunces italic headings, Inter body

## STEP 2 — BUILD GATE
npx tsc --noEmit, then npm run build. Both must pass. ONE commit, ONE push.

Commit message:
feat(onboarding+landing): Aria-sets-up-your-business provisioning screen with real seeding + retry; rewrite landing to position Aria OS as an all-in-one AI business operating system, not a POS
