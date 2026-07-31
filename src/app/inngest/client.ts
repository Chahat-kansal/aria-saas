import { Inngest } from 'inngest'

/**
 * INFRA-INNGEST-1 — the single Inngest client for Aria OS.
 *
 * WHY INNGEST AT ALL: the 22 Vercel cron slots are FULL (h01–h13, h15–h23), which is why every job
 * today is folded into an hourly dispatcher rather than given its own entry. Inngest schedules on
 * its own platform, so new scheduled work costs zero Vercel cron slots — and gets durable retries,
 * which `waitUntil()` and the dispatcher pattern never provided.
 *
 * This client is transport only. It does not own business logic, and functions must always reuse
 * the existing implementation rather than re-implement it (see functions/scheduled-reports-daily.ts).
 */

/**
 * Event map. Deliberately minimal — the only function so far is cron-triggered, so it sends no
 * events yet. Extend by adding entries of the form:
 *
 *   'aria/report.requested': { data: { business_id: string } }
 *
 * NOT passed to the constructor: inngest v4 removed the v3 `schemas: new EventSchemas()...` option
 * (there is no `schemas` field on ClientOptions, and `EventSchemas` is no longer exported). v4 types
 * payloads at the send/trigger site instead. The type is defined and exported now so the first
 * event-driven function has one obvious place to declare its payload, rather than inventing a
 * second convention later.
 */
export type Events = Record<never, never>

export const inngest = new Inngest({
  id: 'aria-os',
  // Undefined in local dev is fine — the Inngest dev server accepts unsigned events. In production
  // this must be set (see the env list in the sprint report) or sends will be rejected.
  eventKey: process.env.INNGEST_EVENT_KEY,
})
