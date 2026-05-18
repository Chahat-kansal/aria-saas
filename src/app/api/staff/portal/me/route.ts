export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolvePortalIdentity, getOwnLeaveBalances } from '@/lib/staff/portal'

async function _GET(_req: Request) {
  const identity = await resolvePortalIdentity()
  if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const balances = await getOwnLeaveBalances(identity.staff_member_id)
  return NextResponse.json({ identity, balances })
}

export const GET = withErrorCapture('staff/portal/me', _GET)
