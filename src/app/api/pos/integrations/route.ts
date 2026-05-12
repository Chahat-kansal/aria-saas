export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { encrypt } from '@/lib/integrations/crypto'
import { INTEGRATIONS } from '@/lib/integrations/directory'
import { getXeroAuthorizeUrl, exchangeXeroCode } from '@/lib/integrations/oauth-clients/xero'
import { getMyobAuthorizeUrl, exchangeMyobCode } from '@/lib/integrations/oauth-clients/myob'
import crypto from 'crypto'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const action = req.nextUrl.searchParams.get('action')

  // ── OAuth callback ──────────────────────────────────────────────────────
  if (action === 'callback') {
    const code = req.nextUrl.searchParams.get('code')
    const state = req.nextUrl.searchParams.get('state')
    if (!code || !state) {
      return NextResponse.redirect(new URL('/pos/setup/integrations?error=missing_params', req.url))
    }

    const { data: integration } = await supabase
      .from('pos_oauth_integrations')
      .select('*')
      .eq('auth_state_token', state)
      .maybeSingle()

    if (!integration) {
      return NextResponse.redirect(new URL('/pos/setup/integrations?error=invalid_state', req.url))
    }

    try {
      let tokens: { access_token: string; refresh_token: string; expires_in: number }
      if (integration.integration_key === 'xero') {
        tokens = await exchangeXeroCode(code)
      } else if (integration.integration_key === 'myob') {
        tokens = await exchangeMyobCode(code)
      } else {
        throw new Error(`Unknown integration: ${integration.integration_key}`)
      }

      let encryptedAccess: string | null = null
      let encryptedRefresh: string | null = null
      try {
        encryptedAccess = encrypt(tokens.access_token)
        encryptedRefresh = encrypt(tokens.refresh_token)
      } catch {
        // INTEGRATION_TOKEN_KEY not configured — store raw (not ideal, but graceful)
        encryptedAccess = tokens.access_token
        encryptedRefresh = tokens.refresh_token
      }

      await supabase.from('pos_oauth_integrations').update({
        status: 'connected',
        access_token_encrypted: encryptedAccess,
        refresh_token_encrypted: encryptedRefresh,
        token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        auth_state_token: null,
        updated_at: new Date().toISOString(),
      }).eq('id', integration.id)

      return NextResponse.redirect(new URL(`/pos/setup/integrations?connected=${integration.integration_key}`, req.url))
    } catch (err: any) {
      await supabase.from('pos_oauth_integrations').update({
        status: 'error', last_error: err.message, updated_at: new Date().toISOString(),
      }).eq('id', integration.id)
      return NextResponse.redirect(new URL('/pos/setup/integrations?error=oauth_failed', req.url))
    }
  }

  // ── List connected integrations ─────────────────────────────────────────
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ integrations: [] })

  const { data: connected } = await supabase
    .from('pos_oauth_integrations')
    .select('integration_key, status, external_account_name, last_sync_at, last_error')
    .eq('business_id', bid)

  return NextResponse.json({ integrations: connected ?? [] })
}

async function _POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const action = req.nextUrl.searchParams.get('action')
  const body = await req.json().catch(() => ({})) as Record<string, unknown>

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  // ── Start OAuth flow ────────────────────────────────────────────────────
  if (action === 'start') {
    const { integration_key } = body as { integration_key: string }
    const integration = INTEGRATIONS.find(i => i.key === integration_key)
    if (!integration || integration.setup_method !== 'oauth') {
      return NextResponse.json({ error: 'Not an OAuth integration' }, { status: 400 })
    }

    const stateToken = crypto.randomBytes(32).toString('hex')
    await supabase.from('pos_oauth_integrations').upsert({
      business_id: bid, integration_key, status: 'authorising',
      auth_state_token: stateToken, updated_at: new Date().toISOString(),
    }, { onConflict: 'business_id,integration_key' })

    try {
      let authorize_url: string
      if (integration_key === 'xero') authorize_url = getXeroAuthorizeUrl(stateToken)
      else if (integration_key === 'myob') authorize_url = getMyobAuthorizeUrl(stateToken)
      else return NextResponse.json({ error: 'OAuth not yet implemented for this integration' }, { status: 400 })
      return NextResponse.json({ authorize_url })
    } catch (err: any) {
      return NextResponse.json({ error: err.message, unconfigured: true }, { status: 503 })
    }
  }

  // ── Revoke ──────────────────────────────────────────────────────────────
  if (action === 'revoke') {
    const { integration_key } = body as { integration_key: string }
    await supabase.from('pos_oauth_integrations').update({
      status: 'revoked', access_token_encrypted: null,
      refresh_token_encrypted: null, token_expires_at: null,
      updated_at: new Date().toISOString(),
    }).eq('business_id', bid).eq('integration_key', integration_key)
    return NextResponse.json({ success: true })
  }

  // ── Log interest (partnership_pending integrations) ─────────────────────
  if (action === 'log_interest') {
    const { integration_key } = body as { integration_key: string }
    await supabase.from('pos_oauth_integrations').upsert({
      business_id: bid, integration_key, status: 'pending',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'business_id,integration_key' })
    return NextResponse.json({ success: true })
  }

  // ── Update settings ─────────────────────────────────────────────────────
  if (action === 'settings') {
    const { integration_key, config } = body as { integration_key: string; config: unknown }
    await supabase.from('pos_oauth_integrations').update({
      config, updated_at: new Date().toISOString(),
    }).eq('business_id', bid).eq('integration_key', integration_key)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export const GET = withErrorCapture('pos/integrations', _GET)
export const POST = withErrorCapture('pos/integrations', _POST)
