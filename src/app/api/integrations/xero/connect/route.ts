export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://www.ariaos.site'

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
  }

  if (!process.env.XERO_CLIENT_ID) {
    return NextResponse.redirect(`${BASE_URL}/dashboard/integrations?error=xero_not_configured`)
  }

  const state = Buffer.from(JSON.stringify({ business_id })).toString('base64url')
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.XERO_CLIENT_ID,
    redirect_uri: `${BASE_URL}/api/integrations/xero/callback`,
    scope: 'accounting.transactions.read accounting.transactions.create accounting.settings.read offline_access',
    state,
  })
  return NextResponse.redirect(`https://login.xero.com/identity/connect/authorize?${params}`)
}
