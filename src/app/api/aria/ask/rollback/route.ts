export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { rollbackAction } from '@/lib/aria/ask/action-rollback'

async function _POST(req: Request, _context: unknown, { userId, businessId: bid }: BusinessContext) {
  const body = await req.json().catch(() => ({})) as { log_id?: string }
  const logId = String(body.log_id ?? '').trim()
  if (!logId) return NextResponse.json({ error: 'log_id required' }, { status: 400 })

  const result = await rollbackAction(logId, bid, userId)
  return NextResponse.json(result)
}

export const POST = withBusinessContext('aria/ask/rollback', _POST)
