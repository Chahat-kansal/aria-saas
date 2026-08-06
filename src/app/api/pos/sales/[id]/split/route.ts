export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'

// RETIRED (FIX-SPLIT-DEAD-ROUTE-1, 6 Aug 2026): a second, fictional split system.
//
// NO CALLER ANYWHERE IN src/ — verified before retiring, not assumed. The live split flow is
// SplitModal.tsx:178,217 -> /api/pos/splits/* (12 route files), which stores splits in
// pos_sale_splits / pos_split_items / pos_split_payments and moves the PARENT sale through
// completed -> 'open' -> 'partial_paid' -> 'completed'. It never writes parent_sale_id and never
// writes 'split'.
//
// Had this route ever run it would have been wrong three ways:
//   1. wrote status:'split' at the old :69 — pos_sales_status_check FORBIDS that value, so the
//      update failed to a console.error while the route still returned ok:true. A silent no-op
//      reported as success.
//   2. COPIED pos_sale_items to the children while leaving the originals on the parent — a
//      product-level double count in every item-based report.
//   3. left the parent 'completed' at its full amount alongside children carrying partials, so
//      the money was counted twice at the sale level too.
//
// Live data agrees it never ran: status='split' 0 rows, parent_sale_id set 0 rows,
// pos_audit_log action='split' 0 rows.
//
// Kept as a 410 rather than deleted (RULE 0, and the same precedent as twilio/webhook) so anything
// that finds this path gets a correct signal and a pointer, not a 404 and a guess.
const GONE = {
  error: 'gone',
  message: 'This split endpoint is retired and never had a caller. Use /api/pos/splits/* (see SplitModal).',
}

export function POST() {
  return NextResponse.json(GONE, { status: 410 })
}
export function GET() {
  return NextResponse.json(GONE, { status: 410 })
}
