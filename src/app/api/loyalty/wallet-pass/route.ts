export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getLoyaltyMembership } from '@/lib/loyalty/auth'
import { buildPassData, googleWalletSaveUrl, googleConfigured, appleConfigured, buildApplePassJson } from '@/lib/loyalty/wallet-pass'

// LOY-WALLET-PASS — GET ?business_id=… → the signed-in member's wallet pass for that business. Identity +
// business scoped (a member only ever gets their OWN pass). Returns the Google Wallet save link (when
// configured) + the Apple pass payload / configured flag. ?format=apple_json returns the pass.json.

async function _GET(req: Request) {
  const url = new URL(req.url)
  const bidParam = url.searchParams.get('business_id')
  const realId = bidParam ? await resolveBusinessId(supabaseAdmin, bidParam) : null
  if (!realId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const m = await getLoyaltyMembership(realId)
  if (!m) return NextResponse.json({ error: 'Sign in to add your card to your wallet' }, { status: 401 })

  const pass = await buildPassData(m.identity_id, realId, m.customer_id, m.name)

  if (url.searchParams.get('format') === 'apple_json') {
    if (!appleConfigured()) return NextResponse.json({ error: 'Apple Wallet not configured', configured: false }, { status: 503 })
    return NextResponse.json(buildApplePassJson(pass))
  }

  return NextResponse.json({
    barcode: pass.barcode,
    business_name: pass.business_name,
    tier: pass.tier,
    points: pass.points,
    preload_balance: pass.preload_balance,
    google: { configured: googleConfigured(), save_url: googleWalletSaveUrl(pass) },
    apple: { configured: appleConfigured() },
  })
}

export const GET = withErrorCapture('loyalty/wallet-pass', _GET)
