export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://www.ariaos.site'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const errorParam = searchParams.get('error')

  if (errorParam) return NextResponse.redirect(`${BASE_URL}/dashboard/integrations?error=${errorParam}`)
  if (!code || !state) return NextResponse.redirect(`${BASE_URL}/dashboard/integrations?error=missing_params`)

  let business_id: string
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString()) as { business_id: string }
    business_id = decoded.business_id
  } catch {
    return NextResponse.redirect(`${BASE_URL}/dashboard/integrations?error=invalid_state`)
  }

  if (!process.env.XERO_CLIENT_ID || !process.env.XERO_CLIENT_SECRET) {
    return NextResponse.redirect(`${BASE_URL}/dashboard/integrations?error=xero_not_configured`)
  }

  const credentials = Buffer.from(
    `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`
  ).toString('base64')

  const tokenRes = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${BASE_URL}/api/integrations/xero/callback`,
    }),
  })
  if (!tokenRes.ok) {
    return NextResponse.redirect(`${BASE_URL}/dashboard/integrations?error=token_exchange_failed`)
  }
  const tokens = await tokenRes.json() as { access_token: string; refresh_token: string }

  const tenantsRes = await fetch('https://api.xero.com/connections', {
    headers: { 'Authorization': `Bearer ${tokens.access_token}` },
  })
  if (!tenantsRes.ok) {
    return NextResponse.redirect(`${BASE_URL}/dashboard/integrations?error=tenant_fetch_failed`)
  }
  const tenants = await tenantsRes.json() as Array<{ tenantId: string }>
  const tenant = tenants[0]
  if (!tenant) return NextResponse.redirect(`${BASE_URL}/dashboard/integrations?error=no_tenant`)

  await supabaseAdmin.from('businesses').update({
    xero_access_token: tokens.access_token,
    xero_refresh_token: tokens.refresh_token,
    xero_tenant_id: tenant.tenantId,
    xero_connected_at: new Date().toISOString(),
  }).eq('id', business_id)

  return NextResponse.redirect(`${BASE_URL}/dashboard/integrations?connected=xero`)
}
