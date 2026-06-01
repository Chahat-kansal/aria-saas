# Prompt 212 — PRR-8: Launch Readiness

Eighth and final production-readiness phase before soft launch.
PRR-1 through PRR-7 hardened the system. PRR-8 makes it launchable:
real user onboarding, billing enforcement, error UX, and the pre-launch checklist.

## Pre-flight + MANDATORY COMMIT PROTOCOL
Read CLAUDE.md FIRST. Before EVERY commit: npx tsc --noEmit → npm run build → commit → push → verify.
One commit per task. No rapid-fire commits.

---

## TASK 1 — Trial enforcement gate

Right now a user can sign up, trial expires, and they keep using the product for free.
Fix this by enforcing the trial gate at the middleware level.

Read `src/middleware.ts`. Find where `/dashboard` routes are protected. Add trial check:

```typescript
// After auth check, before allowing dashboard access:
const { data: sub } = await supabaseAdmin
  .from('business_subscriptions')
  .select('status, trial_ends_at')
  .eq('business_id', bid)
  .maybeSingle()

const trialExpired = sub?.status === 'trialing' &&
  sub.trial_ends_at &&
  new Date(sub.trial_ends_at) < new Date()

const noActiveSub = !sub || (sub.status !== 'active' && sub.status !== 'trialing')

if (trialExpired || noActiveSub) {
  return NextResponse.redirect(new URL('/billing?reason=trial_expired', req.url))
}
```

Exceptions — do NOT gate these paths even if trial expired:
- `/dashboard/billing` (they need to upgrade)
- `/dashboard/settings` (they need to cancel/manage)
- `/api/stripe/*` (webhook handling)
- `/api/billing/*` (billing API)
- `/pos` (POS terminal — staff can't be locked out mid-shift)

Create a `/billing` page that shows:
- "Your 14-day trial has ended"
- The 3 pricing tiers (Starter $297 / Growth $597 / Pro $997)
- Stripe Checkout link for each tier
- "Continue with current plan" link if they have an active sub

Commit: "feat(billing): trial enforcement gate in middleware + /billing upgrade page"

---

## TASK 2 — Stripe webhook → subscription status sync

When a customer pays via Stripe, their `business_subscriptions` row must be updated.
Read `src/app/api/stripe/webhook/route.ts`. Ensure these events are handled:

- `checkout.session.completed` → set status='active', clear trial_ends_at, set plan from metadata
- `customer.subscription.updated` → sync status, current_period_end
- `customer.subscription.deleted` → set status='canceled'
- `invoice.payment_failed` → set status='past_due', trigger email warning
- `invoice.payment_succeeded` → set status='active' (recover from past_due)

For each event, update `business_subscriptions` using `supabaseAdmin` (service role — RLS bypassed).

If the webhook handler is missing any of these events, add them.
If the handler exists but doesn't update the DB, fix the update logic.

Commit: "feat(billing): Stripe webhook → subscription status sync for all billing events"

---

## TASK 3 — Error boundary + fallback UI

Right now if any dashboard page crashes (uncaught React error), the user sees a white screen.
For a launch product this is unacceptable.

Add `error.tsx` files for the key dashboard routes that use AI or external data:

```typescript
// src/app/dashboard/error.tsx (covers all dashboard pages)
'use client'
export default function DashboardError({
  error, reset
}: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-6">
      <div className="text-4xl">⚠️</div>
      <h2 className="text-lg font-semibold text-white">Something went wrong</h2>
      <p className="text-sm text-[rgba(255,255,255,0.45)] max-w-sm">
        Aria hit an unexpected error. Your data is safe.
      </p>
      <button onClick={reset}
        className="px-4 py-2 rounded-lg bg-[#7FB897] text-[#0E1411] text-sm font-semibold">
        Try again
      </button>
      {process.env.NODE_ENV === 'development' && (
        <pre className="text-xs text-red-400 text-left max-w-lg overflow-auto mt-4">
          {error.message}
        </pre>
      )}
    </div>
  )
}
```

Add the same pattern for:
- `src/app/dashboard/ask-aria/error.tsx`
- `src/app/dashboard/daily-briefing/error.tsx`
- `src/app/pos/error.tsx`

Also add a root `src/app/error.tsx` for non-dashboard crashes.

Commit: "feat(ux): error boundaries for dashboard + ask-aria + briefing + pos + root"

---

## TASK 4 — Onboarding completion check

New users who skip onboarding steps end up with a broken dashboard (no business data,
no industry set, blank briefing). Fix by checking onboarding completeness on first
dashboard load and redirecting incomplete accounts.

Read `src/app/dashboard/page.tsx`. At the top of the server component (or in middleware),
check:

```typescript
const required = [
  business.name,
  business.industry,
  business.abn ?? business.phone, // at least one contact
]
const incomplete = required.some(f => !f)
if (incomplete) redirect('/onboarding?step=business-details&from=dashboard')
```

Also check the onboarding wizard (`src/app/onboarding/`) — if it exists and has a
completion flag, use that instead of re-checking individual fields.

Do NOT redirect if the user is more than 3 days old (they've clearly used the product,
just haven't filled everything in — don't annoy them).

Commit: "feat(onboarding): redirect incomplete new accounts to onboarding on first dashboard load"

---

## TASK 5 — 404 and not-found pages

Read `src/app/not-found.tsx`. If it doesn't exist or just shows the Next.js default, replace it:

```typescript
// src/app/not-found.tsx
import Link from 'next/link'
export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center px-6"
      style={{ background: '#0E1411' }}>
      <div style={{ fontFamily: "'Cormorant', Georgia, serif", fontSize: 80, color: '#7FB897', opacity: 0.3, fontStyle: 'italic', lineHeight: 1 }}>404</div>
      <h1 className="text-xl font-semibold text-white">Page not found</h1>
      <p className="text-sm text-[rgba(255,255,255,0.4)] max-w-xs">
        This page doesn't exist or you don't have access to it.
      </p>
      <Link href="/dashboard"
        className="px-4 py-2 rounded-lg bg-[#7FB897] text-[#0E1411] text-sm font-semibold mt-2">
        Back to dashboard
      </Link>
    </div>
  )
}
```

Commit: "feat(ux): branded 404 not-found page"

---

## TASK 6 — Pre-launch smoke test script

Write a script at `scripts/smoke-test.ts` that can be run with
`npx tsx scripts/smoke-test.ts` to verify the 10 most critical system paths
are working before any deployment.

The script should:
1. Hit `/api/ping` → expect 200
2. Hit `/api/aria/daily-briefing` with a valid test business_id → expect 200 + `briefing` key
3. Hit `/api/aria/ask` with a simple question → expect 200 + `response` key
4. Hit `/api/aria/reorder-forecast` → expect 200 + `items` key
5. Query Supabase: `SELECT COUNT(*) FROM businesses WHERE is_active = true` → expect > 0
6. Query Supabase: `SELECT COUNT(*) FROM pos_products WHERE business_id = TEST_BID` → expect > 0
7. Check Stripe connection: hit Stripe API for the test customer → expect 200
8. Check ANTHROPIC_API_KEY is set and valid: tiny Haiku call → expect 200
9. Check TWILIO credentials: hit Twilio account info → expect 200
10. Check Resend credentials: verify domain → expect 200

Each check prints `✓ name (Xms)` or `✗ name — error message`.
Exit code 0 if all pass, 1 if any fail.

Use environment variables from `.env.local`. Never hardcode credentials.

Commit: "feat(ops): pre-launch smoke test script — 10 critical path checks"

---

## TASK 7 — Launch checklist document

Write `docs/launch-checklist.md` — the exact steps to go through on launch day,
in order, with checkboxes. Should cover:

```markdown
# Aria OS Soft Launch Checklist

## 48 hours before
- [ ] Run `npx tsx scripts/smoke-test.ts` — all 10 checks green
- [ ] Verify Stripe is in live mode (not test mode)
- [ ] Verify Twilio sender ID approved for AU
- [ ] Verify Resend domain DNS records (SPF, DKIM, DMARC)
- [ ] Check Anthropic API key has sufficient credit for 100 businesses × 30 days
- [ ] Verify ariaos.site SSL cert expiry > 90 days
- [ ] Confirm Vercel Enhanced Builds is OFF (switch to Standard to save cost)
- [ ] Backup Supabase: Settings → Backups → Download latest

## Day of launch
- [ ] Run smoke test one final time
- [ ] Set NEXT_PUBLIC_LAUNCH_MODE=true in Vercel env vars
- [ ] Post to Aria's social accounts
- [ ] Monitor Vercel runtime logs for first hour (watch for 500s)
- [ ] Monitor Anthropic API dashboard for unusual spend
- [ ] Have Stripe dashboard open for first payment

## First 24 hours
- [ ] Check daily briefing cron ran at 9am AEST (check cron_logs table)
- [ ] Check signal engine ran (check aria_ai_calls for signal_engine_synth)
- [ ] Respond to any support tickets within 2 hours
- [ ] Check Sentry (if configured) for any new errors
- [ ] Verify at least one business completed onboarding end-to-end

## Week 1
- [ ] Review aria_ai_calls for unusual patterns or cost spikes
- [ ] Check council_cache hit rate (SELECT COUNT(*) FROM council_cache WHERE expires_at > now())
- [ ] Review pos_sales for any businesses with 0 sales (might need POS help)
- [ ] Send check-in email to all trial users on day 3
```

Commit: "docs(launch): launch checklist — 48h before, day of, first 24h, week 1"

---

## ACCEPTANCE CRITERIA

Before marking PRR-8 complete:

- [ ] Trial-expired users are redirected to /billing, not stuck on dashboard
- [ ] Stripe webhook handler covers all 5 billing events
- [ ] Dashboard crash shows Aria error page with "Try again", not white screen
- [ ] Incomplete onboarding accounts (< 3 days old) are redirected to onboarding
- [ ] 404 page is branded (not Next.js default)
- [ ] Smoke test script runs and passes all 10 checks
- [ ] Launch checklist document exists at docs/launch-checklist.md
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` passes

---

## WHAT NOT TO DO

- Do not gate the POS terminal behind the trial check — staff can't be locked out mid-shift
- Do not redirect users who are > 3 days old back to onboarding
- Do not use real Stripe live keys in the smoke test — use test mode for the script
- Do not add new features in this phase — fix gaps and ship
