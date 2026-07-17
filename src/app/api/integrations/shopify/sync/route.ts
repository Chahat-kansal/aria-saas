export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { runShopifyFullSync } from '@/lib/integrations/shopify'

async function _POST(_req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  try {
    const result = await runShopifyFullSync(bid)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export const POST = withBusinessContext('integrations/shopify/sync', _POST)
