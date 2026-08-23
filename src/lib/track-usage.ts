import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * MS14 PHASE 3 — METERING THAT ACTUALLY WRITES.
 *
 * THE BUG THIS FIXES (live since the file was written): the insert was dispatched as
 * `void db.from('usage_logs').insert({...})`. A PostgREST query builder is LAZY — the HTTP
 * request is issued inside its `then()` (verified in the installed source,
 * node_modules/@supabase/postgrest-js/src/PostgrestBuilder.ts:255-441), so a builder that is
 * never awaited and never `.then()`-ed is simply discarded. Five routes called trackUsage and
 * `usage_logs` held ZERO rows. Nothing errored, nothing logged, nothing was measured — the
 * "exists, looks correct, does nothing" pattern, on the one table that was supposed to tell us
 * what businesses actually use.
 *
 * The fix is `.then()`: the request is now dispatched, while the CALLER still never waits.
 *
 * NON-BLOCKING IS A HARD REQUIREMENT, not a preference. This returns `void` synchronously — it
 * is not async, it cannot be awaited into a hot path, and a failed write can never fail the
 * action being measured. The sale path must never wait on telemetry.
 *
 * PRIVACY: event type and counts only. No customer identifiers, no message content, no free
 * text. `sanitiseMetadata` enforces it rather than trusting call sites — a caller that passes a
 * customer name gets it dropped, not stored.
 */

/** Metadata keys a usage row may carry. Anything else is dropped, not stored. */
const ALLOWED_METADATA_KEYS = new Set([
  'mode', 'count', 'surface', 'tier', 'limit', 'source', 'kind', 'result', 'agent_key', 'ms',
]);

/** Keys that must never reach the log even if they were somehow allow-listed. */
const FORBIDDEN_KEY_RE = /email|phone|name|address|message|content|customer|note|text|body/i;

export function sanitiseMetadata(metadata: object | undefined): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!metadata) return out;
  for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
    if (!ALLOWED_METADATA_KEYS.has(key)) continue;
    if (FORBIDDEN_KEY_RE.test(key)) continue;
    if (typeof value === 'number' || typeof value === 'boolean') { out[key] = value; continue; }
    if (typeof value === 'string') { out[key] = value.slice(0, 64); continue; }
    // objects/arrays are dropped — a nested payload is how personal data sneaks into telemetry
  }
  return out;
}

export function trackUsage(params: {
  business_id: string;
  event_type: string;
  metadata?: object;
}): void {
  // Fire and forget — dispatched, never awaited, never throws into the caller.
  try {
    if (!params.business_id || !params.event_type) return;
    void supabaseAdmin
      .from('usage_logs')
      .insert({
        business_id: params.business_id,
        event_type: params.event_type.slice(0, 64),
        metadata: sanitiseMetadata(params.metadata),
        created_at: new Date().toISOString(),
      })
      // .then() is what DISPATCHES the request (see the header note). The rejection handler is
      // mandatory: without it a failed insert becomes an unhandled rejection, which in Node can
      // take down the process — i.e. telemetry would crash the action it was measuring.
      .then(
        () => {},
        (err: unknown) => { console.error('[track-usage] insert failed (non-fatal):', err instanceof Error ? err.message : String(err)); },
      );
  } catch (err) {
    console.error('[track-usage] dispatch failed (non-fatal):', err instanceof Error ? err.message : String(err));
  }
}
