import { NextResponse } from 'next/server'

// RETIRED (MS13 PHASE 2): zero callers anywhere in src/ (verified by sweep, 2026-08-22), and the
// live handler trusted a client-supplied business_id into service-role-adjacent reads — a
// cross-tenant vector on a route nobody uses. Kept as a 410 Gone (not deleted, RULE 0 +
// twilio/webhook precedent) so any stale external caller gets a clear, correct signal instead of
// a 404. The mention-tagging idea lives on in the audit trail; rebuild it ON the rail
// (withBusinessContext) if it is ever wanted again.
const GONE = { error: 'gone', message: 'aria/social-listening is retired. It had no callers and resolved tenants from the client.' }

export function POST() {
  return NextResponse.json(GONE, { status: 410 })
}
export function GET() {
  return NextResponse.json(GONE, { status: 410 })
}
