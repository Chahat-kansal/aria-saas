export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ integrations: [] })

  const { data } = await supabase
    .from('pos_oauth_integrations')
    .select('*')
    .eq('business_id', bid)
    .order('created_at', { ascending: false })

  return NextResponse.json({ integrations: data ?? [] })
}

async function _POST(request: NextRequest) {
  const body = await request.json() as {
    supplier_key?: string
    account_number?: string
    contact_email?: string
    contact_name?: string
    contact_phone?: string
    notes?: string
    action?: string
  }
  const { supplier_key, account_number, contact_email, contact_name, contact_phone, notes, action } = body

  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'no_business' }, { status: 404 })

  if (action === 'disconnect' && supplier_key) {
    await supabase
      .from('pos_oauth_integrations')
      .update({ status: 'disconnected', updated_at: new Date().toISOString() })
      .eq('business_id', bid)
      .eq('integration_key', supplier_key)
    return NextResponse.json({ ok: true })
  }

  if (!supplier_key || !contact_email) {
    return NextResponse.json({ error: 'missing_required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('pos_oauth_integrations')
    .upsert({
      business_id: bid,
      integration_key: supplier_key,
      external_account_id: account_number ?? null,
      external_account_name: contact_name ?? null,
      config: { contact_email, contact_phone: contact_phone ?? null, notes: notes ?? null },
      status: 'connected',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'business_id,integration_key' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ integration: data })
}

export const GET = withErrorCapture('pos/suppliers/integrations', _GET)
export const POST = withErrorCapture('pos/suppliers/integrations', _POST)
