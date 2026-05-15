export const dynamic = 'force-dynamic'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const getDb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Params = { params: Promise<{ business_id: string }> | { business_id: string } }

export async function GET(_req: Request, { params }: Params) {
  const { business_id: id } = 'then' in params ? await params : params
  const db = getDb()

  const { data: order } = await db
    .from('pos_online_orders')
    .select('id, order_number, status, pickup_time, customer_name, notes, created_at, updated_at')
    .eq('id', id)
    .maybeSingle()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const STATUS_MESSAGES: Record<string, string> = {
    pending:    'Your order has been received and is waiting to be confirmed.',
    confirmed:  'Your order has been confirmed and will be prepared shortly.',
    preparing:  'Your order is being prepared.',
    ready:      'Your order is ready for collection! 🎉',
    collected:  'Your order has been collected. Enjoy!',
    cancelled:  'Your order has been cancelled. Please contact us.',
  }

  return NextResponse.json({
    ...order,
    message: STATUS_MESSAGES[order.status] ?? 'Processing your order…',
  })
}
