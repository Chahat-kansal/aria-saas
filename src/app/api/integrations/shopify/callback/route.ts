export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { exchangeShopifyCode, runShopifyFullSync } from '@/lib/integrations/shopify'
import { supabaseAdmin } from '@/lib/supabase-admin'

// CONNECTOR-VAULT-1a — SSRF / secret-exfiltration fix. Neither Shopify's own callback signature
// nor the `shop` domain were ever checked, so a crafted callback URL with an attacker-controlled
// `shop` value made exchangeShopifyCode() POST SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET straight to
// that host. Both checks run BEFORE any DB lookup or network call — a forged callback is rejected
// at the door, not after doing work on its behalf.
const SHOPIFY_SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i

function verifyShopifyHmac(url: URL): boolean {
  const hmac = url.searchParams.get('hmac')
  const secret = process.env.SHOPIFY_CLIENT_SECRET
  if (!hmac || !secret) return false
  const params = Array.from(url.searchParams.entries()).filter(([k]) => k !== 'hmac' && k !== 'signature')
  params.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const message = params.map(([k, v]) => `${k}=${v}`).join('&')
  const digest = crypto.createHmac('sha256', secret).update(message).digest('hex')
  try {
    return digest.length === hmac.length && crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(hmac, 'hex'))
  } catch {
    return false
  }
}

async function _GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') ?? ''
  const shop = url.searchParams.get('shop') ?? ''
  const error = url.searchParams.get('error')

  if (error) return NextResponse.redirect(new URL('/dashboard/integrations?error=shopify_denied', req.url))
  if (!code || !state || !shop) return NextResponse.redirect(new URL('/dashboard/integrations?error=invalid_callback', req.url))
  if (!SHOPIFY_SHOP_RE.test(shop)) return NextResponse.redirect(new URL('/dashboard/integrations?error=invalid_shop', req.url))
  if (!verifyShopifyHmac(url)) return NextResponse.redirect(new URL('/dashboard/integrations?error=invalid_signature', req.url))

  const businessId = state.split(':')[0]
  if (!businessId) return NextResponse.redirect(new URL('/dashboard/integrations?error=invalid_state', req.url))

  const { data: oauthRow } = await supabaseAdmin.from('pos_oauth_integrations')
    .select('id').eq('business_id', businessId).eq('integration_key', 'shopify')
    .eq('auth_state_token', state).maybeSingle()
  if (!oauthRow) return NextResponse.redirect(new URL('/dashboard/integrations?error=state_mismatch', req.url))

  const tokens = await exchangeShopifyCode(shop, code)
  if (!tokens) return NextResponse.redirect(new URL('/dashboard/integrations?error=token_exchange_failed', req.url))

  const storeUrl = shop.startsWith('http') ? shop : `https://${shop}`
  await supabaseAdmin.from('shopify_connections').upsert({
    business_id: businessId,
    store_url: storeUrl,
    shop_name: shop,
    access_token: tokens.access_token,
    sync_status: 'connected',
    connected_at: new Date().toISOString(),
  }, { onConflict: 'business_id,store_url' })

  await supabaseAdmin.from('pos_oauth_integrations').update({
    status: 'connected', auth_state_token: null, updated_at: new Date().toISOString(),
  }).eq('business_id', businessId).eq('integration_key', 'shopify')

  // Fire full sync in background — do not await
  runShopifyFullSync(businessId).catch(e =>
    console.error('Shopify background sync failed:', businessId, e)
  )

  return NextResponse.redirect(new URL('/dashboard/integrations?success=shopify_connected', req.url))
}

export const GET = withErrorCapture('integrations/shopify/callback', _GET)
