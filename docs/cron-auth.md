# Cron authentication (SEC-1)

Every route under `src/app/api/cron/*` is protected by **`verifyCronAuth(req)`**
(`src/lib/auth/cron.ts`). It checks the request's `Authorization` header against
`Bearer ${process.env.CRON_SECRET}` and returns **401** if the secret is unset,
missing, or wrong. The previously-trusted "vercel-cron" User-Agent is spoofable
and is **never** used for authorization.

## Required: set `CRON_SECRET` in Vercel

`CRON_SECRET` **must** be set as an Environment Variable in the Vercel project
(Production + Preview). Generate a strong value:

```bash
openssl rand -hex 32
```

Add it in **Vercel → Project → Settings → Environment Variables** as `CRON_SECRET`,
then redeploy.

### How the header gets there (no vercel.json change needed)

When `CRON_SECRET` is set, **Vercel automatically attaches**
`Authorization: Bearer <CRON_SECRET>` to every scheduled cron invocation
(see https://vercel.com/docs/cron-jobs/manage-cron-jobs). The cron entries in
`vercel.json` only support `{ path, schedule }` — there is **no `headers` field**
in the cron schema, so the Authorization header is configured via the env var,
not in `vercel.json`. Adding a `headers` key to cron entries would be invalid.

> Fail-closed: if `CRON_SECRET` is not set, **all** cron routes return 401. This
> is intentional — an unprotected cron is worse than a temporarily-disabled one.

## Internal self-calls

A few cron routes call sibling cron routes (e.g. `nightly-sync`,
`publish-scheduled`, `sync-reviews`). They forward
`Authorization: Bearer ${process.env.CRON_SECRET}`, which satisfies
`verifyCronAuth` the same way Vercel's scheduled invocations do.

## Local testing

```bash
# 401 — no auth
curl -i -X POST http://localhost:3000/api/cron/signal-engine

# 200 — with the secret from .env.local
curl -i -X POST http://localhost:3000/api/cron/signal-engine \
  -H "Authorization: Bearer $CRON_SECRET"
```
