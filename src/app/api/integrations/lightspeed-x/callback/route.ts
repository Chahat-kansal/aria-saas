export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { exchangeLightspeedXCode, runLightspeedXFullSync } from '@/lib/integrations/lightspeed-x'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function _GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') ?? ''
  const domainFromCallback = url.searchParams.get('domain_prefix') ?? ''

  if (!code || !state) {
    return NextResponse.redirect(new URL('/dashboard/integrations?error=invalid_callback', req.url))
  }

  const parts = state.split(':')
  const businessId = parts[0]
  const domainPrefix = domainFromCallback || parts[1] || ''

  if (!businessId || !domainPrefix) {
    return NextResponse.redirect(new URL('/dashboard/integrations?error=invalid_state', req.url))
  }

  const { data: oauthRow } = await supabaseAdmin.from('pos_oauth_integrations')
    .select('config').eq('business_id', businessId)
    .eq('integration_key', 'lightspeed_x').eq('auth_state_token', state).maybeSingle()
  if (!oauthRow) {
    return NextResponse.redirect(new URL('/dashboard/integrations?error=state_mismatch', req.url))
  }

  const tokens = await exchangeLightspeedXCode(domainPrefix, code)
  if (!tokens) {
    return NextResponse.redirect(new URL('/dashboard/integrations?error=token_failed', req.url))
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  await supabaseAdmin.from('lightspeed_connections').upsert({
    business_id: businessId,
    account_id: domainPrefix,
    domain_prefix: domainPrefix,
    integration_type: 'x_series',
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expires_at: expiresAt,
    sync_status: 'connected',
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'business_id,account_id' })

  await supabaseAdmin.from('pos_oauth_integrations').update({
    status: 'connected', auth_state_token: null, updated_at: new Date().toISOString(),
  }).eq('business_id', businessId).eq('integration_key', 'lightspeed_x')

  runLightspeedXFullSync(businessId).catch(e =>
    console.error('Lightspeed X background sync failed:', businessId, e)
  )

  return NextResponse.redirect(new URL('/dashboard/integrations?success=lightspeed_connected', req.url))
}

export const GET = withErrorCapture('integrations/lightspeed-x/callback', _GET)
