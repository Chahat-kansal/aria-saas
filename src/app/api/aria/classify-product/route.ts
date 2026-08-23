import { NextResponse } from 'next/server'

// RETIRED (MS13 PHASE 2): zero callers anywhere in src/ (verified by sweep, 2026-08-22 — the BAS
// classifier at /api/agents/bas/classify-products is a different, live route). This one ran a
// paid Sonnet call with NO business scoping at all (telemetry logged businessId: undefined).
// Kept as a 410 Gone (not deleted, RULE 0 + twilio/webhook precedent). Rebuild ON the rail if
// product classification is ever wanted at this path again.
const GONE = { error: 'gone', message: 'aria/classify-product is retired. It had no callers and no tenant scoping.' }

export function POST() {
  return NextResponse.json(GONE, { status: 410 })
}
export function GET() {
  return NextResponse.json(GONE, { status: 410 })
}
