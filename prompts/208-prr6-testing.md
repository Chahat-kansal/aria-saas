# Prompt 208 — PRR-6: Testing (Critical Path Coverage)

Sixth production-readiness phase. Tests are the ONLY thing that proves the system works —
not audits, not code review, not "it looked fine when I tested it manually."
Playwright is already installed + configured (playwright.config.ts → ariaos.site).
6 test files already exist. This phase extends them to cover all critical paths.

## Pre-flight + MANDATORY COMMIT PROTOCOL
Read CLAUDE.md FIRST. Before EVERY commit: npx tsc --noEmit → npm run build → commit → push → verify.
ADDITIONALLY for this phase: run `npx playwright test --reporter=line` before each commit.
All tests must pass before committing. A failing test is a bug to fix, not a test to skip.

## SCOPE — Critical paths only (pragmatic v1)
Full coverage takes months. This phase targets the paths where a silent failure causes
real damage: money, data loss, or customers unable to use the system.

Priority order:
1. Authentication (can't use the app without it)
2. POS checkout + sale integrity (money)
3. Payment processing (money)
4. Customer loyalty (data integrity)
5. Aria briefing + Ask Aria (core AI value prop)
6. Community post creation (core social feature)
7. Onboarding (first impression)
8. API regression suite (non-UI, fast)

## TASK 1 — Audit + fix existing tests
Read all 6 existing test files. For each:
- Does it actually test something meaningful? (Not just "page loads")
- Does it assert specific data, not just element presence?
- Is it deterministic? (No time-dependent flakiness)
- Is it using the correct test user/business?

Fix any weak assertions. A test that always passes regardless of correctness is worse than
no test — it gives false confidence.
Commit: "test: audit + strengthen existing e2e tests"

## TASK 2 — Auth test suite (extend e2e/auth.spec.ts)
Ensure these scenarios are covered:
```typescript
test('login with valid credentials → dashboard'
test('login with invalid credentials → error message'
test('logout → redirected to login'
test('accessing /dashboard without auth → redirected to login'
test('accessing /pos without auth → redirected to login'
test('accessing /community without auth → public feed still works'
```
Each must assert the correct redirect/URL, not just that the page loads.
Commit: "test(auth): complete auth flow coverage"

## TASK 3 — POS + sale integrity (extend e2e/pos.spec.ts)
These are the most important tests — money is involved:
```typescript
test('add product to cart → correct price displayed'
test('complete cash sale → pos_sales row created with correct total_amount'
test('complete cash sale → pos_sale_items rows created with correct line_total'
test('complete cash sale → stock_quantity decremented on pos_products'
test('complete cash sale → customer loyalty_points incremented'
test('void a sale → sale status becomes voided'
test('void a sale → stock_quantity restored'
test('duplicate sale (idempotency key replay) → returns existing sale, no new row created'
```
For DB assertions: use Supabase client with service role in test helpers to query the DB
directly and assert values, not just UI state.
Commit: "test(pos): sale integrity — DB assertions on sale, items, stock, loyalty"

## TASK 4 — Payment test (extend or create e2e/payment.spec.ts)
Use Stripe test mode (STRIPE_SECRET_KEY should point to test key in test env):
```typescript
test('checkout with test card 4242424242424242 → payment_intent created'
test('checkout with declined card 4000000000000002 → error displayed, no sale created'
test('payment timeout → sale not marked paid, clear error shown'
```
NEVER use real card numbers. Only Stripe test cards.
Commit: "test(payment): Stripe test-mode card flow"

## TASK 5 — Aria + Ask Aria (extend e2e/ask-aria.spec.ts)
```typescript
test('Ask Aria: business question → response contains business name'
test('Ask Aria: strategic question → council response, not generic'
test('Ask Aria: technical question → code-related answer'
test('Ask Aria: attach image → vision response'
test('daily briefing loads → not empty, contains today's date'
test('briefing generates without error → aria_ai_calls row created'
```
Commit: "test(aria): ask aria + briefing critical path coverage"

## TASK 6 — API regression suite (fast, non-UI)
Create e2e/api.spec.ts using Playwright's request fixture (no browser, faster):
```typescript
// Health
test('GET /api/health → 200 ok'
test('GET /api/health/deep → all dependencies green'

// Auth-required routes reject unauthenticated
test('GET /api/pos/products without auth → 401'
test('GET /api/pos/sales without auth → 401'
test('POST /api/aria/ask without auth → 401'
test('GET /api/customers without auth → 401'

// Public routes work without auth
test('GET /api/public/menu/{businessId} → 200'
test('GET /api/health → 200 (no auth)'

// Rate limiting
test('POST /api/aria/ask 21 times → 21st returns 429'

// Input validation
test('POST /api/pos/sale with missing fields → 400 with error details'
test('POST /api/community/posts with invalid post_type → 400'
```
Commit: "test(api): regression suite — health, auth enforcement, rate limits, validation"

## TASK 7 — Onboarding + community (complete existing stubs)
Extend e2e/onboarding.spec.ts:
```typescript
test('complete onboarding → business created in DB'
test('complete onboarding → redirected to dashboard'
test('onboarding with invalid ABN → error displayed'
```
Create e2e/community.spec.ts:
```typescript
test('community feed loads → at least 1 post visible'
test('create text post → appears in feed'
test('follow a business → their posts appear at top of feed'
test('like a post → like count increments'
```
Commit: "test(onboarding+community): onboarding flow + community feed coverage"

## TASK 8 — Test reliability + CI readiness
1. Ensure all tests use test-specific data (not Sip's real production data)
   Create a test helper: e2e/helpers/test-business.ts that creates a fresh test business
   before tests and cleans up after.
2. Add npm script: `"test:e2e": "playwright test"` and `"test:e2e:ci": "playwright test --reporter=github"`
3. Ensure tests don't depend on order (each test is independent)
4. Document in TESTING.md: how to run tests locally, required env vars, test data policy
5. Run full suite: `npx playwright test` — all must pass
Commit: "test: test isolation helpers + CI scripts + TESTING.md"

## PRR-6 EXIT CHECKLIST
- [ ] All 6 existing tests strengthened (not just "page loads")
- [ ] Auth: all redirect scenarios covered
- [ ] POS: sale creates correct DB rows (pos_sales + items + stock + loyalty)
- [ ] POS: void restores stock
- [ ] POS: idempotency key prevents duplicate sale
- [ ] Payment: Stripe test-mode card flows
- [ ] Aria: ask aria + briefing e2e
- [ ] API: health, auth enforcement, rate limiting, validation
- [ ] Onboarding: creates DB row
- [ ] Community: post + feed + follow
- [ ] Tests isolated (test business, not production Sip data)
- [ ] `npx playwright test` → all pass
- [ ] npm run build passes
- [ ] All pushed (git log origin/main..HEAD empty)
- [ ] Deploy green

Update PRODUCTION_READINESS.md: check off PRR-6. Next: PRR-7 (CI/CD).

## Rules (RULE 0 + commit protocol)
- Tests are ADDITIVE — never delete or weaken a passing test
- A failing test = fix the code, not the test (unless the test is genuinely wrong)
- Never test against production Sip data — use test fixtures
- NEVER use real card numbers in tests
- Build + all tests must pass before every commit

## Start
TASK 1 — audit the 6 existing tests first. Understand what's there before adding more.
Then TASK 6 (API suite) — it's fast, non-flaky, and covers the most bugs with least effort.
Then TASK 3 (POS integrity) — the most important one.
