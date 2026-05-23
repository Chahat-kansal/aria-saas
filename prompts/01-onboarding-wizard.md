# Aria OS — Prompt 01: Real Business Onboarding Wizard
ONE task, ONE commit, ONE push.

## STEP 0 — SYNC FIRST (critical)
```
pwd                        # must be C:\Users\kansa\aria-saas-audit
git status                 # must be clean — if not, STOP and report
git pull origin main
git log --oneline -3
```
If the pull reports conflicts, STOP and report back.

## STEP 1 — READ BEFORE WRITING
Search src/app for the existing onboarding page/route (currently a single
basic form). Read it in full. Read src/lib/supabase* helpers, the
BusinessProvider context, and how a businesses row is currently created on
signup. Do NOT write code before reading.

## CONTEXT — DB IS ALREADY BUILT, do not create/alter tables
businesses has: abn, acn, legal_name, trading_name, entity_type, abn_status,
abn_verified, abn_verified_at, abn_verification_method, gst_registered,
gst_registered_from, business_state, postcode, year_established, industry,
industry_subtype, owner_name, address, city, phone, email, staff_count,
monthly_revenue, biggest_challenge, website, google_business_url,
access_status (default 'active'), access_blocked_reason, business_model
(default 'product'), pos_enabled (default true).

Table business_onboarding: business_id (unique), user_id, current_step,
completed_steps (jsonb), step_data (jsonb), provisioning_status,
provisioning_steps (jsonb), provisioning_started_at, provisioning_finished_at,
provisioning_error.

Table business_review_requests: business_id, user_id, reason, submitted_abn,
submitted_acn, owner_explanation, supporting_detail (jsonb), status
('pending'|'approved'|'rejected'), reviewed_by, reviewed_at, review_notes.

## STEP 2 — BUILD THE 6-STEP WIZARD
Each step saves to business_onboarding (step_data merged, current_step
advanced, completed_steps appended) via an API route.

RESUME: on load, read business_onboarding.current_step and open the wizard
at that step — a half-finished onboarding must resume, not restart.

Steps:
1. 'identity' — legal_name, trading_name, owner_name, email, phone,
   entity_type (select: Sole Trader / Partnership / Company (Pty Ltd) /
   Trust / Other).
2. 'abn' — ABN input + optional ACN + GST-registered select. On blur,
   validate ABN with the checksum below: green tick if valid, amber warning
   if not. Owner can press Next either way — result is handled at final submit.
3. 'details' — industry (select: liquor / cafe / convenience / bakery /
   restaurant / retail / warehouse / other), industry_subtype, address, city,
   business_state (AU states select), postcode, year_established.
4. 'operations' — staff_count, monthly_revenue (range selects), website,
   google_business_url.
5. 'goals' — biggest_challenge (multi-select chips: cash flow, staffing,
   marketing, stock, compliance, time, winning customers back, knowing my
   numbers) + optional free-text textarea.
6. 'provisioning' — handled by Prompt 02.

ABN CHECKSUM: strip spaces, must be 11 digits. Subtract 1 from first digit.
Weights [10,1,3,5,7,9,11,13,15,17,19]. Multiply each digit by its weight,
sum. Valid if sum % 89 === 0.

## STEP 3 — API ROUTE + FINAL-SUBMIT ROUTING
Auth via Supabase — user only touches their own business. On each step, upsert
business_onboarding.

On FINAL SUBMIT, branch on the ABN checksum result:
- ABN VALID: write all fields onto the businesses row, access_status='active',
  current_step='provisioning'. Go to the provisioning screen.
- ABN INVALID or empty: write fields onto businesses BUT set
  access_status='pending_review',
  access_blocked_reason='abn_validation_failed'. Insert a
  business_review_requests row (reason='abn_validation_failed',
  status='pending'). Do NOT provision. Route to the review-request screen.

THE REVIEW-REQUEST SCREEN: owner re-confirms details + writes an
owner_explanation ("why did your ABN not verify?"). On submit, update the
business_review_requests row, then show a holding screen:
"Your account is under review — we'll email you within one business day."
Owner stays on this screen while access_status is 'pending_review' or
'rejected'.

ACCESS GUARD: in the dashboard layout, if access_status is 'pending_review'
or 'rejected', redirect /dashboard to the holding screen. Only 'active' or
'approved' may enter. Do not break existing auth flow.

## UI RULES (locked)
- Financial Trust palette: #2D5240 forest green, #7FB897 sage
- Fraunces italic for headings, Inter for body
- Visible "Step X of 6" progress bar
- NO backtick template literals inside className={...} or style={{}} — use string concatenation only
- 'use client' line 1 where needed

## STEP 4 — BUILD GATE
npx tsc --noEmit, then npm run build. Both must pass. Fix only TS/build
errors. ONE commit, ONE push.

Commit message:
feat(onboarding): real 6-step Australian business onboarding wizard with resume, ABN checksum validation, and ABN-fail review routing
