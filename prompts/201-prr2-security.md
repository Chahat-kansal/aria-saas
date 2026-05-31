# Prompt 201 — PRR-2: Security Hardening

Second production-readiness phase. Session 6 already did the big authz work (ownership checks
on ~28 routes). PRR-2 covers what's left: secrets, dependency CVEs, security headers, PII
handling, and a systematic authz sweep to catch any route Session 6 missed.

## Pre-flight
```
git pull origin main
```
Read CLAUDE.md (RULE 0 — upgrade only) first. Read AUDIT_STATE.md.
After EVERY commit: git push origin main, then git log origin/main..HEAD (must be empty).

## Already done (do NOT redo)
- Session 6 added business-ownership checks to ~28 routes. Don't re-audit those.
- Rate limiting (PRR-1) is live with Upstash.
- Zod validation (PRR-1) on money/messaging/customer routes.
- Sentry is installed (@sentry/nextjs ^10.52.0).

## TASK 1 — Dependency vulnerability scan
```bash
npm audit --json > /tmp/audit.json
npm audit
```
For each HIGH or CRITICAL vulnerability:
- If a safe fix exists: `npm audit fix` (NOT `--force` — that can break things, violates RULE 0)
- If fix requires a major version bump: note it, test the build after, only keep if build passes
- If no fix available: document in SECURITY.md as a known accepted risk with reasoning
Run `npm run build` after any dependency change to confirm nothing broke.
Commit: "fix(security): resolve npm audit high/critical vulnerabilities"

## TASK 2 — Secrets hygiene scan
Search the entire codebase for hardcoded secrets that should be env vars:
```bash
grep -rn "sk-ant-\|sk_live\|sk_test\|AKIA\|ghp_\|Bearer [A-Za-z0-9]\{20\}" src/ --include="*.ts" --include="*.tsx"
grep -rn "password\s*=\s*[\"\x27]\|api_key\s*=\s*[\"\x27]\|secret\s*=\s*[\"\x27]" src/ --include="*.ts"
```
For each hardcoded secret found:
- Move it to an env var
- Replace with process.env.X
- Document the new env var needed
NEVER commit a secret. If one is found in git history, flag it for rotation.
Commit: "fix(security): move hardcoded [secret] to env var"

Also verify: no NEXT_PUBLIC_ prefix on any secret (those are exposed to the browser).
```bash
grep -rn "NEXT_PUBLIC_" src/ --include="*.ts" | grep -i "secret\|key\|token\|password"
```
Any NEXT_PUBLIC_ var holding a real secret is a LEAK — rename to remove the prefix (server-only).
Commit: "fix(security): remove NEXT_PUBLIC_ prefix from server-only secret"

## TASK 3 — Security headers
Update src/middleware.ts to add security headers to all responses:
```typescript
const securityHeaders = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(self)',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
}
```
Apply to the response in middleware. Note: camera/microphone MUST stay enabled for
the Go Live feature (RULE 0 — don't break it). geolocation self for store locator.

Content-Security-Policy: add a sensible CSP that allows:
- self, Vercel, Supabase, Anthropic, Bunny Stream, Cloudflare Stream, Upstash
- Stripe, Twilio, SendGrid, Google (fonts/maps)
Test thoroughly — a too-strict CSP breaks the app. Build up from report-only if unsure.
Commit: "feat(security): security headers + CSP in middleware"

## TASK 4 — Systematic authz sweep (catch what Session 6 missed)
Session 6 fixed ~28 routes. Verify completeness — find ANY remaining route that:
1. Takes business_id from request (param/body/query)
2. Queries/mutates business data
3. Does NOT verify the user owns that business

```bash
grep -rln "business_id" src/app/api/ --include="*.ts"
```
For each file: confirm there's either a getBizId/resolveBusinessId ownership check OR
an .eq('user_id', user.id) scope OR it's a public route (under /api/public/ — exempt).
Fix any gaps. This is the highest-severity check (data leaks between businesses).
Commit per fix: "fix(security): add ownership check to [route]"

## TASK 5 — PII handling audit
Aria stores customer PII (names, emails, phones, possibly payment refs).
1. Verify customer data deletion works (GDPR/Privacy Act right to erasure):
   - Check /api/customers/[id] DELETE actually removes or anonymises PII
   - If soft-delete only, ensure a hard-delete path exists for legal requests
2. Verify no PII in logs:
```bash
grep -rn "console.log" src/app/api/ --include="*.ts" | grep -i "email\|phone\|customer\|card"
```
   Remove any console.log that prints customer PII.
3. Verify PII isn't returned in error messages or sent to Sentry.
   Configure Sentry beforeSend to scrub email/phone if not already done.
Commit: "fix(security): PII handling — scrub from logs/Sentry, verify deletion path"

## TASK 6 — Auth on sensitive GET routes
Many audits focus on mutations. Also check sensitive GET routes that expose data:
- Financial reports, payroll, customer lists, sales data, bank/cash flow
Verify each requires auth AND scopes to the user's business.
Commit: "fix(security): auth + scoping on sensitive data-read routes"

## TASK 7 — Create SECURITY.md
Document the security posture:
- Auth model (Supabase auth, RLS, ownership checks)
- Rate limiting (Upstash tiers)
- Secrets management (all in Vercel env vars)
- Known accepted risks (from npm audit if any unfixable)
- PII handling + deletion policy
- How to report a vulnerability
Commit: "docs(security): SECURITY.md — security posture + vuln reporting"

## PRR-2 EXIT CHECKLIST
- [ ] npm audit: no unaddressed high/critical (or documented as accepted)
- [ ] No hardcoded secrets in code
- [ ] No NEXT_PUBLIC_ prefix on any real secret
- [ ] Security headers live in middleware
- [ ] CSP active and app still works fully (Go Live camera works, payments work)
- [ ] Every business-data route has an ownership check (or is intentionally public)
- [ ] PII scrubbed from logs + Sentry
- [ ] Customer deletion path verified
- [ ] SECURITY.md created
- [ ] npx tsc --noEmit clean + npm run build passes
- [ ] All commits pushed (git log origin/main..HEAD empty)
- [ ] Deploy green

Update PRODUCTION_READINESS.md: check off PRR-2. Next: PRR-3 (observability).

## Rules (RULE 0 applies)
- Adding security must NOT break any feature. CSP/headers especially — test camera (Go Live),
  payments, image loading, external integrations all still work.
- If a security fix would break a feature, find a way to do both — never disable the feature.
- One commit per logical change, push + verify each.
