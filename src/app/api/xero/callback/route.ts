export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redeemOAuthState } from '@/lib/integrations/oauth-state'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://www.ariaos.site'
const REDIRECT_URI = process.env.XERO_REDIRECT_URI ?? `${BASE_URL}/api/xero/callback`
const XERO_KEY = 'xero' as const

async function exchangeCode(code: string): Promise<{
  access_token: string; refresh_token: string; expires_in: number
}> {
  const credentials = Buffer.from(
    `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`
  ).toString('base64')
  const res = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`)
  return res.json()
}

async function getTenantId(access_token: string): Promise<string | null> {
  const res = await fetch('https://api.xero.com/connections', {
    headers: { 'Authorization': `Bearer ${access_token}` },
  })
  if (!res.ok) return null
  const tenants = await res.json() as Array<{ tenantId: string; tenantName: string }>
  return tenants[0]?.tenantId ?? null
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const errorParam = searchParams.get('error')

  if (errorParam) {
    return NextResponse.redirect(`${BASE_URL}/pos/setup/integrations?error=xero_denied`)
  }
  if (!code || !state) {
    return NextResponse.redirect(`${BASE_URL}/pos/setup/integrations?error=invalid_state`)
  }
  if (!process.env.XERO_CLIENT_ID || !process.env.XERO_CLIENT_SECRET) {
    return NextResponse.redirect(`${BASE_URL}/pos/setup/integrations?error=xero_not_configured`)
  }

  // SECURITY-RESIDUE-FIX-1 PART 1 (SECURITY-CRITICAL-1's fix only reached the sibling
  // integrations/xero/* pair — this original implementation was a separate file the fix never
  // touched). state used to be decoded and trusted directly as a business_id with no proof the
  // caller completing this callback controls that business — an attacker could complete their own
  // real Xero consent through this same route's own /connect, then hit this callback with someone
  // else's business_id substituted in, linking the victim's business to the attacker's Xero
  // tenant. redeemOAuthState looks the token up server-side (never decodes it) and re-checks it
  // against the CURRENT session's business access.
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const redeemed = await redeemOAuthState(state, XERO_KEY, user?.id)
  if (!redeemed) return NextResponse.redirect(`${BASE_URL}/pos/setup/integrations?error=invalid_state`)
  const businessId = redeemed.businessId

  try {
    const tokens = await exchangeCode(code)
    const tenantId = await getTenantId(tokens.access_token)
    const now = new Date().toISOString()
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    await supabaseAdmin
      .from('businesses')
      .update({
        xero_access_token: tokens.access_token,
        xero_refresh_token: tokens.refresh_token,
        xero_tenant_id: tenantId,
        xero_connected_at: now,
      })
      .eq('id', businessId)

    // Update pos_oauth_integrations so the integrations page shows connected
    await supabaseAdmin
      .from('pos_oauth_integrations')
      .upsert({
        business_id: businessId,
        integration_key: 'xero',
        status: 'connected',
        external_account_id: tenantId,
        external_account_name: 'Xero',
        token_expires_at: expiresAt,
        last_sync_at: now,
        updated_at: now,
      }, { onConflict: 'business_id,integration_key' })

    return NextResponse.redirect(`${BASE_URL}/pos/setup/integrations?xero=connected`)
  } catch (e) {
    console.error('[xero/callback]', (e as Error).message)
    return NextResponse.redirect(`${BASE_URL}/pos/setup/integrations?error=oauth_failed`)
  }
}
