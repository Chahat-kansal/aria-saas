export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('user_id', user.id)
    .single()
  if (!biz) return NextResponse.json({ error: 'No business found' }, { status: 404 })

  await supabaseAdmin
    .from('businesses')
    .update({
      xero_access_token: null,
      xero_refresh_token: null,
      xero_tenant_id: null,
      xero_connected_at: null,
    })
    .eq('id', biz.id)

  await supabaseAdmin
    .from('pos_oauth_integrations')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('business_id', biz.id)
    .eq('integration_key', 'xero')

  return NextResponse.json({ ok: true })
}
