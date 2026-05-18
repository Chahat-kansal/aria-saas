export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { getLightspeedXOAuthUrl } from '@/lib/integrations/lightspeed-x'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const url = new URL(req.url)
  const domainPrefix = (url.searchParams.get('domain') ?? '').trim()
  if (!domainPrefix) {
    return NextResponse.redirect(new URL('/dashboard/integrations?error=domain_required', req.url))
  }

  const state = `${bid}:${domainPrefix}:${Date.now()}`
  await supabaseAdmin.from('pos_oauth_integrations').upsert({
    business_id: bid,
    integration_key: 'lightspeed_x',
    status: 'pending',
    auth_state_token: state,
    config: { domain_prefix: domainPrefix },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'business_id,integration_key' })

  return NextResponse.redirect(getLightspeedXOAuthUrl(domainPrefix, state))
}

export const GET = withErrorCapture('integrations/lightspeed-x/connect', _GET)
