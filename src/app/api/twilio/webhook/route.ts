import { NextResponse } from 'next/server'

// RETIRED (MSG-COMPLIANCE-2): Twilio was dropped; inbound SMS now arrives via ClickSend at
// /api/webhooks/clicksend-inbound (which feeds sms_suppression on STOP). This orphaned endpoint
// previously logged replies to the legacy `customers` table and did no opt-out handling. Kept as a
// 410 Gone (not deleted) so any stale Twilio config gets a clear, correct signal instead of a 404.
const GONE = { error: 'gone', message: 'Twilio inbound is retired. Inbound SMS is handled at /api/webhooks/clicksend-inbound.' }

export function POST() {
  return NextResponse.json(GONE, { status: 410 })
}
export function GET() {
  return NextResponse.json(GONE, { status: 410 })
}
