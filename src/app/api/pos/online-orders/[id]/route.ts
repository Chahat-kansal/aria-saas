export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

type Params = { params: Promise<{ id: string }> | { id: string } }

async function _PATCH(req: Request, { params }: Params) {
  const { id } = 'then' in params ? await params : params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json()
  const allowed: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.status !== undefined) allowed.status = body.status

  const { error } = await supabase.from('pos_online_orders').update(allowed).eq('id', id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If marking as ready: send SMS via Twilio (non-blocking)
  if (body.status === 'ready') {
    const { data: order } = await supabase.from('pos_online_orders')
      .select('customer_name, customer_phone, order_number, business_id').eq('id', id).maybeSingle()
    if (order?.customer_phone) {
      const sid   = process.env.TWILIO_ACCOUNT_SID
      const token = process.env.TWILIO_AUTH_TOKEN
      const from  = process.env.TWILIO_PHONE_NUMBER
      const { data: biz } = await supabase.from('businesses').select('name').eq('id', order.business_id).maybeSingle()
      if (sid && token && from) {
        const msg = `Hi ${order.customer_name?.split(' ')[0] ?? 'there'}, your order ${order.order_number} at ${biz?.name ?? 'the cafe'} is ready for collection! 🎉`
        fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: 'POST',
          headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ From: from, To: order.customer_phone, Body: msg }),
        }).then(() => null, () => null)
      }
    }
  }

  return NextResponse.json({ ok: true })
}

export const PATCH = withErrorCapture('pos/online-orders/[id]', _PATCH)
