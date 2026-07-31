export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// The scheduled-reports job launches headless Chromium to render PDFs. The vercel.json glob
// `src/app/api/**/*.ts` would cap this route at 60s, which is not enough — `src/app/api/cron/**`
// gets 300s for exactly this reason, and this route now carries that same work.
export const maxDuration = 300

import { serve } from 'inngest/next'
import { inngest } from '@/app/inngest/client'
import { scheduledReportsDaily } from '@/app/inngest/functions/scheduled-reports-daily'

/**
 * INFRA-INNGEST-1 — THE ONLY INNGEST SERVE ROUTE. DO NOT CREATE ANOTHER.
 *
 * Every Inngest function in Aria OS is registered here, in the `functions` array below. Inngest
 * discovers functions by introspecting a single serve endpoint; a second serve route would split
 * the registry, and functions on whichever endpoint Inngest is not syncing would silently never
 * run — no error, no log, just a job that quietly stops existing.
 *
 * To add a function: create it under src/app/inngest/functions/, import it here, add it to the
 * array. That is the whole process.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    scheduledReportsDaily,
  ],
})

// NOTE ON SIGNING: request-signature verification is ON by default and reads INNGEST_SIGNING_KEY
// straight from the environment. It is deliberately NOT passed here — in v4 `signingKey` is a
// ClientOptions field, not a serve() option, so passing it here is a type error rather than the
// extra safety it looks like. Without that env var set in Vercel, Inngest will reject the sync.
