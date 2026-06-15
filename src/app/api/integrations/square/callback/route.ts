export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { runSquareFullSync } from '@/lib/integrations/square'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { verifyBusinessAccess } from '@/lib/auth/verify-business-access'

const SQUARE_BASE = process.env.SQUARE_ENVIRONMENT === 'production'
  ? 'https://connect.squareup.com'
  : 'https://connect.squareupsandbox.com'

async function _GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') ?? ''
  const error = url.searchParams.get('error')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  if (error) return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=${encodeURIComponent(error)}`)
  if (!code || !state) return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=missing_params`)

  // Decode state — supports both base64url ({bid,uid,ts}) and "bid:timestamp" formats
  let businessId: string
  let stateUid: string | undefined
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'))
    businessId = decoded.bid
    stateUid = decoded.uid
    if (!businessId) throw new Error('No bid')
    if (Date.now() - (decoded.ts ?? 0) > 600_000) throw new Error('State expired')
  } catch {
    // Fallback for "bid:timestamp" format
    businessId = state.split(':')[0]
    if (!businessId) return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=invalid_state`)
  }

  // SEC-3 — the state value is unsigned and client-forgeable, so trust nothing in it until
  // the LIVE session is confirmed to own the target business. This binds the Square connection
  // to the authenticated user and rejects cross-business / cross-user (CSRF) binding.
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=not_authenticated`)
  if (stateUid && stateUid !== user.id) {
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=state_user_mismatch`)
  }
  const denied = await verifyBusinessAccess(user.id, businessId)
  if (denied) return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=forbidden_business`)

  // Exchange code for tokens
  const tokenRes = await fetch(`${SQUARE_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Square-Version': '2024-01-17' },
    body: JSON.stringify({
      client_id: process.env.SQUARE_APPLICATION_ID,
      client_secret: process.env.SQUARE_APPLICATION_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${appUrl}/api/integrations/square/callback`,
    }),
  })

  if (!tokenRes.ok) {
    console.error('Square token exchange failed:', await tokenRes.text())
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=token_exchange_failed`)
  }

  const tokens = await tokenRes.json() as Record<string, unknown>

  await supabaseAdmin.from('square_connections').upsert({
    business_id: businessId,
    square_merchant_id: String(tokens.merchant_id ?? ''),
    access_token: String(tokens.access_token ?? ''),
    refresh_token: String(tokens.refresh_token ?? ''),
    token_expires_at: tokens.expires_at ?? null,
    sync_status: 'connected',
    connected_at: new Date().toISOString(),
  }, { onConflict: 'business_id' })

  await supabaseAdmin.from('businesses').update({
    square_connected: true,
  }).eq('id', businessId)

  // Fire full sync in background — do not await
  runSquareFullSync(businessId).catch(e =>
    console.error('Square background sync failed:', businessId, e)
  )

  return NextResponse.redirect(`${appUrl}/dashboard/integrations?connected=square`)
}

export const GET = withErrorCapture('integrations/square/callback', _GET)
