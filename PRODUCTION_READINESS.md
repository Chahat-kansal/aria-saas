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
- No rate limiting (PRR-1)
- No systematic input validation (PRR-1)

## Progress
- [ ] PRR-1 API hardening
- [ ] PRR-2 Security
- [ ] PRR-3 Observability
- [ ] PRR-4 Reliability
- [ ] PRR-5 Data safety
- [ ] PRR-6 Testing
- [ ] PRR-7 CI/CD

Run PRR-1 first (prompt 200).
