import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'

// Auth helper: verifies user owns business
async function getBid() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  // Try user_active_business first, then fall back to businesses table
  const { data: active } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return (biz?.id as string | null) ?? null
}

export async function GET() {
  const bid = await getBid()
  if (!bid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabaseAdmin
    .from('businesses')
    .select('id,name,online_ordering_enabled,accept_orders')
    .eq('id', bid)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    settings: {
      online_ordering_enabled: data?.online_ordering_enabled ?? false,
      accept_orders: data?.accept_orders ?? true,
      business_name: data?.name ?? null,
    },
  })
}

export async function PATCH(req: Request) {
  const bid = await getBid()
  if (!bid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (typeof body.online_ordering_enabled === 'boolean') {
    update.online_ordering_enabled = body.online_ordering_enabled
  }
  if (typeof body.accept_orders === 'boolean') {
    update.accept_orders = body.accept_orders
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('businesses')
    .update(update)
    .eq('id', bid)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}