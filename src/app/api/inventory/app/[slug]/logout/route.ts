export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { clearStaffCookie } from '@/lib/inventory/staff-session'

// INV-STAFF-APP-1 — log out / switch staff (clears the acting-staff cookie).
async function _POST() {
  await clearStaffCookie()
  return NextResponse.json({ ok: true })
}

export const POST = withErrorCapture('inventory/app/logout', _POST)
