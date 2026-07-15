export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { verifyBusinessAccess } from '@/lib/auth/verify-business-access'
import { issueOAuthState } from '@/lib/integrations/oauth-state'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://www.ariaos.site'
const XERO_KEY = 'xero' as const

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.redirect(`${BASE_URL}/dashboard/integrations?error=unauthorized`)
  }

  const { searchParams } = new URL(req.url)
  let business_id = searchParams.get('business_id')

  if (!business_id) {
    const { data: biz } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)
      .single()
    if (!biz) return NextResponse.redirect(`${BASE_URL}/dashboard/integrations?error=no_business`)
    business_id = biz.id as string
  } else {
    // SECURITY-CRITICAL-1 — a client-supplied business_id was previously trusted with no ownership
    // check at all before being embedded in the (also unsigned) OAuth state. Same fix as
    // CONNECTOR-VAULT-1a's Slack/Shopify migration.
    const denied = await verifyBusinessAccess(user.id, business_id)
    if (denied) return NextResponse.redirect(`${BASE_URL}/dashboard/integrations?error=unauthorized`)
  }

  if (!process.env.XERO_CLIENT_ID) {
    return NextResponse.redirect(`${BASE_URL}/dashboard/integrations?error=xero_not_configured`)
  }

  // SECURITY-CRITICAL-1 — signed, server-issued, single-use, expiring state (was unsigned base64url
  // JSON, decoded and trusted blindly on the way back in the callback).
  const state = await issueOAuthState(business_id, XERO_KEY)
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.XERO_CLIENT_ID,
    redirect_uri: `${BASE_URL}/api/integrations/xero/callback`,
    scope: 'accounting.transactions.read accounting.transactions.create accounting.settings.read offline_access',
    state,
  })
  return NextResponse.redirect(`https://login.xero.com/identity/connect/authorize?${params}`)
}
