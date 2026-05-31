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

## Progress
- [~] PRR-1 API hardening (code complete; Upstash env vars + Vercel deploy pending user action)
- [ ] PRR-2 Security
- [ ] PRR-3 Observability
- [ ] PRR-4 Reliability
- [ ] PRR-5 Data safety
- [ ] PRR-6 Testing
- [ ] PRR-7 CI/CD

Run PRR-1 first (prompt 200).
