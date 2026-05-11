# E2E Testing Setup

Aria POS uses Playwright + GitHub Actions for end-to-end testing.
Tests run automatically after every production deploy.

## One-time setup (DO THIS BEFORE FIRST RUN)

### 1. Create a test user in Supabase
- Supabase Dashboard → Authentication → Users → **Invite User**
- Email: `test@ariaos.site` (or any address you control)
- After creation, reset the password via **Reset Password**
- In your `businesses` table, ensure this user is linked to a
  test business with at least 1 active product (so product tests
  can click into something)

### 2. Add GitHub secrets
- GitHub repo → Settings → Secrets and variables → Actions →
  **New repository secret**
- `TEST_USER_EMAIL` = `test@ariaos.site`
- `TEST_USER_PASSWORD` = (the password you set above)

### 3. Enable Vercel → GitHub repository_dispatch
- Vercel Dashboard → your project → Settings → Git → **Notifications**
- Enable `repository_dispatch` for deployment events on `production`

## Running tests locally (optional)

```bash
# Install browsers once
npx playwright install

# Add to .env.local:
TEST_USER_EMAIL=test@ariaos.site
TEST_USER_PASSWORD=yourpassword
BASE_URL=https://www.ariaos.site   # or http://localhost:3000

# Run all tests
npm run test:e2e

# Run with visual browser UI
npm run test:e2e:ui

# Run with visible browser
npm run test:e2e:headed
```

## What gets tested (15 smoke tests across 6 spec files)

| File | Tests |
|------|-------|
| `01-marketing.spec.ts` | Homepage title, Log in link, login form, no console errors |
| `02-terminal.spec.ts` | Pulse Rail visible, no 500s, empty cart, Ask Aria FAB |
| `03-products.spec.ts` | Product list, edit page opens, Loyalty tab no crash |
| `04-sales-history.spec.ts` | History list, date filters, void page loads |
| `05-reports.spec.ts` | Reports index, cashier/commission/sales no crash |
| `06-orders.spec.ts` | Orders list, new order, draft save, market price resolves |

## When tests fail

1. GitHub Actions tab → click the failed workflow run
2. Download the **playwright-report** artifact (zip)
3. Extract → open `index.html`
4. Click the failed test → see screenshot, video trace, exact step

## Adding new tests

Create `tests/e2e/NN-feature.spec.ts` following the pattern.

**Rules:**
- Each test must be independent — no shared state between tests
- Use stable selectors: `getByRole`, `getByLabel`, `data-testid`
  over CSS class names (which change frequently)
- Keep each test under 50 lines
- Use `test.skip(!condition, 'reason')` for tests that need data

## Cron job URLs (related setup)

While you're setting things up — the correct cron URLs for cron-job.org are:

| Job | URL | Header |
|-----|-----|--------|
| Reorder | `https://www.ariaos.site/api/cron/reorder-daily` | `Authorization: Bearer CRON_SECRET` |
| Briefings | `https://www.ariaos.site/api/cron/generate-briefings` | `Authorization: Bearer CRON_SECRET` |
