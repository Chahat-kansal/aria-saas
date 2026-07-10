export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getCxSession } from '@/lib/cx/get-cx-session'
import { buildPassData, googleWalletSaveUrl, googleConfigured, appleConfigured, buildApplePassJson } from '@/lib/loyalty/wallet-pass'

// LOYALTY-FINISH — CX-app-scoped equivalent of /api/loyalty/wallet-pass. The
// CX app (src/app/[slug]/**) authenticates via the cx_session cookie
// (getCxSession) — a completely separate mechanism from the parallel
// /loyalty/[business_id] portal's loyalty_identity.session_token cookie
// (getLoyaltyMembership), which the existing wallet-pass route checks. That
// route can't authenticate a CX-app customer at all. WalletClient.tsx's
// "Add to Wallet" buttons previously pointed at /api/public/wallet-pass/
// {slug} and /api/public/google-pass/{slug} — neither route exists anywhere
// in the codebase (dead links). This one reuses the same pass-building
// functions (buildPassData/buildApplePassJson/googleWalletSaveUrl), which
// are auth-agnostic, just gated on a different session check.
async function _GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const bid = await resolveBusinessId(supabaseAdmin, params.slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const session = await getCxSession(req, bid)
  if (!session) return NextResponse.json({ error: 'Sign in to add your card to your wallet' }, { status: 401 })

  const { data: cust } = await supabaseAdmin
    .from('pos_customers')
    .select('id, name')
    .eq('loyalty_identity_id', session.identity_id)
    .eq('business_id', bid)
    .maybeSingle()
  if (!cust?.id) return NextResponse.json({ error: 'Not a member here yet' }, { status: 404 })

  const pass = await buildPassData(session.identity_id, bid, cust.id as string, (cust.name as string | null) ?? null)
  const format = new URL(req.url).searchParams.get('format')

  if (format === 'apple_json') {
    if (!appleConfigured()) return NextResponse.json({ error: 'Apple Wallet not configured', configured: false }, { status: 503 })
    return NextResponse.json(buildApplePassJson(pass))
  }

  if (format === 'google_redirect') {
    const saveUrl = googleWalletSaveUrl(pass)
    if (!saveUrl) return NextResponse.json({ error: 'Google Wallet not configured', configured: false }, { status: 503 })
    return NextResponse.redirect(saveUrl)
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

export const GET = withErrorCapture('public/cx/wallet-pass', _GET)
