export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { getKountaOAuthUrl, isKountaConfigured } from '@/lib/integrations/kounta'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  if (!isKountaConfigured()) {
    return NextResponse.json({
      error: 'Kounta API access pending certification approval. Check back soon.',
      status: 'pending_certification',
    }, { status: 503 })
  }

  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const state = `${bid}:${Date.now()}`
  await supabaseAdmin.from('pos_oauth_integrations').upsert({
    business_id: bid,
    integration_key: 'kounta',
    status: 'pending',
    auth_state_token: state,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'business_id,integration_key' })

  return NextResponse.redirect(getKountaOAuthUrl(state))
}

export const GET = withErrorCapture('integrations/kounta/connect', _GET)
