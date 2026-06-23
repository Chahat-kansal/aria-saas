export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { runDispatcher } from '@/lib/cron/dispatch'
import { GET as kioskTokenRotate } from '@/app/api/cron/kiosk-token-rotate/route'
import { GET as expireCheckoutCarts } from '@/app/api/cron/expire-checkout-carts/route'

// BUGFIX-CRON-1 — dispatcher for 18:00 UTC. Runs each job in-process (auth forwarded, per-job isolated).
export const GET = (req: Request) => runDispatcher(req, 'h18', [
  { name: 'kiosk-token-rotate', fn: kioskTokenRotate },
  { name: 'expire-checkout-carts', fn: expireCheckoutCarts },
])
