# Security Policy

## Authentication & Authorisation Model

**Authentication** is handled by Supabase Auth (JWTs, session cookies managed via `@supabase/ssr`).
Every API route that accesses business data calls `supabase.auth.getUser()` and returns 401 if no session exists.

**Ownership checks** are enforced at the application layer on every route that accepts a `business_id`:
```
supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle()
```
Routes that operate on sub-resources (recipe, ingredient, ticket, split…) traverse the chain to the owning business before mutating data.

**Row-Level Security (RLS)** is enabled on all Supabase tables as a second layer of defence.
Server-side admin operations use the service-role key (`supabaseAdmin`) only after the user-level ownership check passes.

**Admin routes** (`/admin/*`) require both a valid Supabase session and an email listed in the `ADMIN_EMAILS` environment variable.

**POS staff** authenticate via a separate `pos_staff` cookie mechanism handled client-side by `POSAuthGate`.
Staff portal API routes (`/api/staff/portal/*`) use `resolvePortalIdentity()` to scope responses to the individual staff member.

---

## Rate Limiting

All public API routes (`/api/public/*`) are rate-limited by IP using Upstash Redis (via `@upstash/ratelimit`).
AI and messaging routes apply per-user rate limits. The limits gracefully degrade to "allow all" if Upstash env vars are absent (safe for local development).

---

## Security Headers

Applied in `src/middleware.ts` to all responses:

| Header | Value |
|--------|-------|
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(self), microphone=(self), geolocation=(self)` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |

A Content Security Policy is applied via `next.config.mjs` headers to all routes.
Camera and microphone permissions are intentionally enabled for the Go Live streaming feature.

---

## Secrets Management

All secrets are stored as environment variables in Vercel. No secret is hardcoded in the codebase.

Variables that MUST NOT have the `NEXT_PUBLIC_` prefix (server-only):
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `STRIPE_SECRET_KEY`
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
- `SENTRY_AUTH_TOKEN`
- `CLICKSEND_API_KEY` / `CLICKSEND_USERNAME`
- `BASIQ_API_KEY`

---

## PII Handling

**Customer data** (name, email, phone) is stored in the `customers` table.

**Right to erasure (GDPR/Privacy Act):**
- Default DELETE on `/api/customers/[id]` performs a soft-delete (`archived: true`).
- Pass `?permanent=true` to perform a hard-delete that removes the record entirely.

**Logs:** No API route logs customer PII (email, phone, card numbers) to console.

**Error reporting (Sentry):** `beforeSend` scrubs `email`, `phone`, `password`, `card_number`, and `cvv` from request body data, and removes `user.email` and `user.ip_address` from error events.

---

## Known Accepted Risks (npm audit)

The following vulnerabilities remain unfixed as of 2026-06-01 because no safe upgrade path exists:

| Package | Severity | Advisory | Reason not fixed |
|---------|----------|----------|-----------------|
| `xlsx` | High | GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9 | No fix available upstream; used only for user-initiated export (not attacker-controlled input) |
| `@ai-sdk/provider-utils` (via `ai@6.x`) | Moderate | GHSA-qh7v-c4j6-g3p5 | Fix requires ai@7 which is a breaking API change |
| `axios` (via `@mendable/firecrawl-js`) | Moderate | CSRF/SSRF | No non-breaking upgrade path in firecrawl dependency tree |
| `glob` (via `eslint`) | Low | ReDoS | Dev-only dependency, no production exposure |
| `jsondiffpatch` (via AI SDK) | Low | Prototype Pollution | Dev-only; no fix available without major version bump |

Total remaining: 26 vulnerabilities (6 low, 9 moderate, 11 high, 0 critical).

---

## Vulnerability Reporting

To report a security vulnerability, please email **kansalkashish78@gmail.com** with:
- Description of the vulnerability
- Steps to reproduce
- Potential impact

Do **not** open a public GitHub issue for security vulnerabilities.
We aim to acknowledge reports within 48 hours and resolve critical issues within 7 days.