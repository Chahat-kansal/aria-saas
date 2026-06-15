export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { runSquareFullSync, writeSquareTokens } from '@/lib/integrations/square'
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

  // SEC-5 — TRUE CSRF: `state` is a random token persisted on a pending row by /connect.
  // Look it up server-side; absence = forged/stale state → reject. This is now the primary
  // binding (replaces SEC-3's unsigned-state decode).
  const { data: pending } = await supabaseAdmin
    .from('pos_oauth_integrations')
    .select('id, business_id')
    .eq('integration_key', 'square')
    .eq('auth_state_token', state)
    .maybeSingle()
  if (!pending?.business_id) {
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=invalid_state`)
  }
  const businessId = pending.business_id as string

  // Defence in depth (SEC-3) — the live session must also own this business.
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=not_authenticated`)
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

  // SEC-5 — write ENCRYPTED tokens to pos_oauth_integrations and consume the CSRF state token.
  await writeSquareTokens(businessId, pending.id as string, {
    access_token: String(tokens.access_token ?? ''),
    refresh_token: String(tokens.refresh_token ?? ''),
    token_expires_at: (tokens.expires_at as string | null) ?? null,
    merchant_id: String(tokens.merchant_id ?? '') || null,
    scopes: typeof tokens.scope === 'string' ? (tokens.scope as string).split(' ').filter(Boolean) : null,
  })

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
