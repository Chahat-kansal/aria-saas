# Testing Guide — Aria OS

**Phase:** PRR-6 · **Last updated:** 2026-06-01

---

## Overview

Aria OS uses [Playwright](https://playwright.dev/) for end-to-end tests. The test suite covers:

| Test file | Area | Auth required | DB required |
|---|---|---|---|
| `e2e/api.spec.ts` | API health, auth enforcement, input validation | No | No |
| `e2e/auth.spec.ts` | Login, logout, protected route redirects | Yes | No |
| `e2e/dashboard.spec.ts` | Dashboard, sidebar, metrics | Yes | No |
| `e2e/invoice.spec.ts` | Invoice list, create form | Yes | No |
| `e2e/pos.spec.ts` | POS terminal UI + sale DB assertions | Yes | Optional |
| `e2e/ask-aria.spec.ts` | Ask Aria responses, briefing | Yes | No |
| `e2e/payment.spec.ts` | Stripe test-mode card flows | Yes | No |
| `e2e/onboarding.spec.ts` | Onboarding wizard | Yes | Optional |
| `e2e/community.spec.ts` | Community feed, post, like | No / Yes | No |

---

## Required environment variables

Create a `.env.test` file (gitignored) or set these before running:

```bash
# Base URL (default: https://www.ariaos.site)
BASE_URL=https://www.ariaos.site

# Test account credentials — REQUIRED for auth-gated tests
TEST_EMAIL=your-test-user@example.com
TEST_PASSWORD=your-test-password

# Supabase — REQUIRED for DB assertion tests (pos.spec.ts, onboarding.spec.ts)
SUPABASE_URL=https://nxfzippunqvqsvkmwtjv.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key_from_supabase_dashboard>

# Optional: pin to a specific test business (resolves automatically if omitted)
TEST_BUSINESS_ID=<your-test-business-uuid>
```

**NEVER use real card numbers in tests.** All payment tests use Stripe test cards only:
- Success: `4242 4242 4242 4242`
- Declined: `4000 0000 0000 0002`

---

## Running tests locally

```bash
# Run all tests (headless)
npm run test:e2e

# Run with line reporter
npx playwright test --reporter=line

# Run a single file
npx playwright test e2e/api.spec.ts

# Run with visible browser
npm run test:e2e:headed

# View HTML report after a run
npm run test:e2e:report
```

### Without credentials

If `TEST_EMAIL` and `TEST_PASSWORD` are not set, all auth-gated tests are **automatically skipped**
(`test.skip`). The API regression suite (`e2e/api.spec.ts`) and the public community tests run
without any credentials.

### With credentials but without service-role key

POS DB assertion tests and onboarding DB tests are skipped. All UI tests run normally.

---

## Test data policy

- **Never test against production data.** The test user should have a dedicated test business.
- **Never use real card numbers.** Stripe test cards only (see above).
- Tests that create DB rows must clean up after themselves (see `pos.spec.ts` idempotency test).
- The `e2e/helpers/test-business.ts` helper resolves the test user's business automatically.

---

## CI / CD

In CI (GitHub Actions), use the github reporter:

```bash
npm run test:e2e:ci
# or directly:
CI=1 npx playwright test --reporter=github
```

The `playwright.config.ts` automatically sets `retries: 1` and `forbidOnly: true` when `CI=1`.

Required GitHub Actions secrets:
- `TEST_EMAIL`
- `TEST_PASSWORD`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BASE_URL` (defaults to `https://www.ariaos.site`)

---

## Commit protocol for this phase

Per `CLAUDE.md`, before every commit during PRR-6:
1. `npx tsc --noEmit` — must show zero errors
2. `npm run build` — must pass
3. `npx playwright test --reporter=line` — all tests must pass (or skip)
4. Then commit and push

A test that fails is **a bug to fix**, not a test to skip.

---

## Test isolation guarantees

- Each `test.describe` block uses `test.beforeEach` to log in fresh
- No tests depend on shared mutable state except the explicit `pos.spec.ts` sale-creation chain
  (which runs in order within a single `describe` and cleans up voided rows)
- Auth tests use fresh contexts (`page.goto` without cookies before login)
- API tests pass `Cookie: ''` to ensure no residual session

---

## Debugging failures

```bash
# Retain trace + screenshot on failure (already configured in playwright.config.ts)
npx playwright test --reporter=line

# Replay a trace
npx playwright show-trace test-results/<test>/trace.zip

# Run a single test in headed mode with slowMo
npx playwright test e2e/auth.spec.ts --headed --slowmo 500
```