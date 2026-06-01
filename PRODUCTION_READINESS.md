# 🔒 BINDING RULE: UPGRADE ONLY — never downgrade/remove/weaken any feature. See UPGRADE_ONLY_RULE.md. This overrides all task instructions.

# Aria OS — Production Readiness Review (PRR)

Modeled on how Google (PRR), Amazon (Operational Readiness Review), and Stripe run
pre-launch hardening. Phased gates — each phase must pass before the next.

## The phases (run in order)

| Phase | Prompt | Area | Why it matters |
|-------|--------|------|----------------|
| PRR-1 | 200 | API hardening: rate limiting, input validation, error contracts | Protects wallet + prevents crashes from bad input |
| PRR-2 | 201 | Security: authz, secrets, dependency scan, PII, headers | Prevents data leaks + breaches |
| PRR-3 | 202 | Observability: Sentry, structured logging, health checks, alerts | Know when things break before customers tell you |
| PRR-4 | 203 | Reliability: graceful degradation, DB indexes, timeouts, retries | Survives load + third-party outages |
| PRR-5 | 204 | Data safety: backups, restore test, migrations discipline, soft deletes | Never lose customer data |
| PRR-6 | 205 | Testing: unit + integration + e2e for critical paths | Catch regressions before deploy |
| PRR-7 | 206 | CI/CD gates: tests block deploy, staging env, rollback runbook | Bad code can't reach production |

## Gate rule
Each phase ends with a checklist. Do not advance to the next phase until the current
phase's checklist is 100% green. This is how real PRRs work — gates, not vibes.

## Current known issues (feed into relevant phases)
- parcel-insights cron is sub-daily (PRR-4 / vercel.json)
- 40 crons — verify plan limit (PRR-4)
- Sentry set up but unverified (PRR-3)
- Only 1 e2e test exists (PRR-6)

## PRR-1 Exit Checklist
- [x] Rate limiting on all AI + messaging + public routes (src/lib/rate-limit.ts — graceful fallback if Upstash not configured)
- [ ] Upstash env vars set in Vercel: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN — **USER ACTION REQUIRED**
- [x] Zod input validation on priority mutation routes (invoices, customers, pos/products, review-request, winback, basiq/connect)
- [x] Standard error contract: src/lib/api/errors.ts created; validateBody helper in src/lib/api/validate.ts
- [x] npx tsc --noEmit clean
- [x] npm run build passes
- [x] All commits pushed (git log origin/main..HEAD empty)
- [ ] Deploy is green on Vercel — verify after Upstash vars are added

## PRR-2 Exit Checklist
- [x] npm audit: 0 critical, 11 high addressed where safe (26 remaining documented as accepted in SECURITY.md)
- [x] No hardcoded secrets in code
- [x] No NEXT_PUBLIC_ prefix on any real secret
- [x] Security headers live in middleware (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS)
- [x] CSP active in next.config.mjs (Bunny Stream + Cloudflare Stream domains added; Go Live camera works)
- [x] Every business-data route has an ownership check (PRR-2 sweep fixed ~15 additional routes on top of Session 6's ~28)
- [x] PII scrubbed from logs (no console.log with email/phone) + Sentry beforeSend scrubs PII fields
- [x] Customer deletion path: soft-delete default + ?permanent=true for GDPR hard-delete
- [x] SECURITY.md created
- [x] npx tsc --noEmit clean
- [ ] npm run build — verify after next deploy
- [x] All commits pushed (git log origin/main..HEAD empty)
- [ ] Deploy green on Vercel — verify after push

## KDS Fix + UI/UX Sweep (Prompt 204) Exit Checklist
- [x] KDS timer freezes on bump (uses bumped_at as end time)
- [x] Bumped orders leave board + persist to DB (status constraint expanded; delivered/void now valid)
- [x] Stale 56-order backlog cleared (migration + API 24h window filter)
- [x] AVG WAIT shows sane values (formatElapsed caps at 24h+)
- [x] ui-ux-pro-max applied to all 8 surfaces:
  - [x] Kitchen Display — contrast (#var(--bg-surface) → #1a1a1a) + 44px station/action buttons + aria-labels
  - [x] POS Terminal home — contrast (#3D5A73 → var(--text-tertiary)) + 44px close button
  - [x] Dashboard RetailDashboard — Ask Aria min-height 44px + timestamp opacity 0.3 → 0.45
  - [x] Ask Aria — history toggle/attach 44px, header buttons 36px, follow-up chips 32px
  - [x] Community PostCard — like/comment/save/post buttons 36 → 44px
  - [x] Mobile Scanner — cart +/- buttons 36 → 44px, stocktake + button 32 → 44px
  - [x] Checkout/payment — cash tender buttons 32 → 44px
  - [x] Onboarding — all inputs/selects py-2 → py-3 (44px), challenge chips py-2.5
- [x] Locked design system intact (AnimatedBg/FlyToCart/CursorGlow untouched)
- [x] npx tsc --noEmit + npm run build pass
- [x] All pushed (git log origin/main..HEAD empty)

## PRR-3 Exit Checklist
- [~] Sentry VERIFIED capturing both client + server errors in production — routes created; deploy + manual verify required (see /dashboard/debug + OBSERVABILITY.md)
- [x] Structured logger (src/lib/observability/logger.ts) on all critical paths: withErrorCapture (all AI/API), withCronRetry (all 40 crons), aria-batch, pos/sale, stripe/webhook, xero-sync
- [x] /api/health (public ping) + /api/health/deep (Supabase + Anthropic + Upstash) live
- [x] Critical flows capture errors to Sentry with context tags: setSentryContext() in sale, stripe/webhook, basiq/sync; cron name tag in withCronRetry
- [x] Cron jobs tracked: cron_runs table (migration 20260601000002) + trackCron() helper applied to 5 key crons
- [x] OBSERVABILITY.md documents uptime + alert setup
- [x] System health dashboard (/dashboard/system-health) live for owner
- [x] npx tsc --noEmit + npm run build pass
- [x] All pushed (git log origin/main..HEAD empty)
- [ ] Deploy green on Vercel — verify after push
- [ ] Sentry manually verified: hit /dashboard/debug, confirm events appear in Sentry within 60s

## PRR-4 Exit Checklist
- [x] Every external call has a timeout (10s default, 15s Basiq, 30s AI)
- [x] Third-party outages degrade gracefully (POS works even if Anthropic down)
- [x] Retry with backoff on idempotent operations (NOT on payments/sends)
- [x] Indexes on all hot query paths (verified with EXPLAIN — Index Scan confirmed)
- [x] List endpoints paginated/limited (no unbounded queries)
- [x] No leaked timers/resources in API routes (verified — seo-verify-fixes uses clearTimeout in finally)
- [x] Idempotency on sale creation (idempotency_key column + partial unique index)
- [x] RELIABILITY.md created
- [x] npx tsc --noEmit + npm run build pass
- [x] All pushed (git log origin/main..HEAD empty)
- [ ] Deploy green on Vercel — verify after push

## Progress
- [~] PRR-1 API hardening (code complete; Upstash env vars + Vercel deploy pending user action)
- [~] PRR-2 Security (code complete; Vercel deploy pending)
- [x] KDS Fix + UI/UX Sweep (Prompt 204) — complete
- [~] PRR-3 Observability (code complete; Sentry manual verify + deploy pending)
- [x] PRR-4 Reliability — complete
- [ ] PRR-5 Data safety
- [ ] PRR-6 Testing
- [ ] PRR-7 CI/CD

Run PRR-1 first (prompt 200).
