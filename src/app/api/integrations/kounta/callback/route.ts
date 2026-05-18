export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { exchangeKountaCode, runKountaFullSync, isKountaConfigured } from '@/lib/integrations/kounta'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function _GET(req: Request) {
  if (!isKountaConfigured()) {
    return NextResponse.redirect(new URL('/dashboard/integrations?error=kounta_not_configured', req.url))
  }

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') ?? ''

  if (!code || !state) {
    return NextResponse.redirect(new URL('/dashboard/integrations?error=invalid_callback', req.url))
  }

  const businessId = state.split(':')[0]
  if (!businessId) {
    return NextResponse.redirect(new URL('/dashboard/integrations?error=invalid_state', req.url))
  }

  const { data: oauthRow } = await supabaseAdmin.from('pos_oauth_integrations')
    .select('id').eq('business_id', businessId)
    .eq('integration_key', 'kounta').eq('auth_state_token', state).maybeSingle()
  if (!oauthRow) {
    return NextResponse.redirect(new URL('/dashboard/integrations?error=state_mismatch', req.url))
  }

  const tokens = await exchangeKountaCode(code)
  if (!tokens) {
    return NextResponse.redirect(new URL('/dashboard/integrations?error=token_failed', req.url))
  }

  // Fetch company ID from Kounta API
  let companyId = ''
  try {
    const r = await fetch('https://api.kounta.com/v1/companies/me.json', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` },
    })
    if (r.ok) {
      const me = await r.json() as Record<string, unknown>
      companyId = String(me.id ?? '')
    }
  } catch { /* non-fatal — store will be set later */ }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  await supabaseAdmin.from('lightspeed_connections').upsert({
    business_id: businessId,
    account_id: companyId || `kounta_${businessId}`,
    integration_type: 'kounta',
    kounta_company_id: companyId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expires_at: expiresAt,
    sync_status: 'connected',
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'business_id,account_id' })

  await supabaseAdmin.from('pos_oauth_integrations').update({
    status: 'connected', auth_state_token: null, updated_at: new Date().toISOString(),
  }).eq('business_id', businessId).eq('integration_key', 'kounta')

  if (companyId) {
    runKountaFullSync(businessId).catch(e =>
      console.error('Kounta background sync failed:', businessId, e)
    )
  }

  return NextResponse.redirect(new URL('/dashboard/integrations?success=kounta_connected', req.url))
}

export const GET = withErrorCapture('integrations/kounta/callback', _GET)
