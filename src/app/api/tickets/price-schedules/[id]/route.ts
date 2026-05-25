export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

type Params = { params: Promise<{ id: string }> | { id: string } }

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _DELETE(_req: Request, { params }: Params) {
  const { id } = 'then' in params ? await params : params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data: sched } = await supabaseAdmin.from('pos_scheduled_price_changes')
    .select('status,product_id,original_price').eq('id', id).eq('business_id', bid).maybeSingle()
  if (!sched) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (sched.status === 'active' && (sched.original_price as number | null) != null) {
    await supabaseAdmin.from('pos_products')
      .update({ price: sched.original_price, updated_at: new Date().toISOString() })
      .eq('id', sched.product_id)
  }
  await supabaseAdmin.from('pos_scheduled_price_changes').update({ status: 'cancelled' }).eq('id', id)
  return NextResponse.json({ ok: true })
}

export const DELETE = withErrorCapture('tickets/price-schedules/[id]', _DELETE)
