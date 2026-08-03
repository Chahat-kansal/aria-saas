export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Params = { params: { id: string } }

// SEC-PIXEL-1 — DECISION RECORDED, DELIBERATELY NOT FIXED (issue #34, batch 3, option B).
//
// This is an unauthenticated write keyed only on an enumerable invoice UUID: anyone who guesses an
// id can set viewed_at. Accepted for now, on these grounds:
//   · No money moves and nothing is disclosed — the response is a fixed 1x1 GIF either way, and the
//     update is `.is('viewed_at', null)`, so it fires at most once per invoice.
//   · The only harm is a corrupted "client has seen it" signal used for chasing.
//   · The sibling route /invoices/public/[id]/paid WAS hardened, because it flips a FINANCIAL
//     state. This one flips a read receipt. That difference is the whole reason for the split.
//
// Why not fix it now: any signature scheme breaks tracking for every invoice already emailed,
// because those pixel URLs are sitting in inboxes without a token and no schema change retrofits
// them. The fix (HMAC on `?s=`, compared with timingSafeEqual, always returning the GIF so the
// result never leaks) belongs in the next invoicing sprint, when the email template is being
// edited anyway and both halves can ship together.
export async function GET(_req: NextRequest, { params }: Params) {
  await supabaseAdmin
    .from('invoices')
    .update({ viewed_at: new Date().toISOString() })
    .eq('id', params.id)
    .is('viewed_at', null)

  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
  return new NextResponse(gif, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}
