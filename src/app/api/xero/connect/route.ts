export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { issueOAuthState } from '@/lib/integrations/oauth-state'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://www.ariaos.site'
const REDIRECT_URI = process.env.XERO_REDIRECT_URI ?? `${BASE_URL}/api/xero/callback`
const XERO_KEY = 'xero' as const

export async function GET() {
  if (!process.env.XERO_CLIENT_ID) {
    return NextResponse.redirect(`${BASE_URL}/pos/setup/integrations?error=xero_not_configured`)
  }

  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${BASE_URL}/pos/setup/integrations?error=unauthorized`)

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('user_id', user.id)
    .single()
  if (!biz) return NextResponse.redirect(`${BASE_URL}/pos/setup/integrations?error=no_business`)

  // SECURITY-RESIDUE-FIX-1 PART 1 — signed, server-issued, single-use, 10-min-expiring state
  // (was the business's raw id, trusted unsigned on the way back in callback/route.ts). Same
  // CONNECTOR-VAULT-1a helper SECURITY-CRITICAL-1 already proved correct for the sibling
  // integrations/xero/* pair — reused here, not reinvented.
  const state = await issueOAuthState(biz.id as string, XERO_KEY)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.XERO_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'accounting.transactions accounting.contacts offline_access',
    state,
  })

  return NextResponse.redirect(`https://login.xero.com/identity/connect/authorize?${params}`)
}
