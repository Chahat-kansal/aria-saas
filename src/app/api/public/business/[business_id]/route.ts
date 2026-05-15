export const dynamic = 'force-dynamic'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const getDb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Params = { params: Promise<{ business_id: string }> | { business_id: string } }

export async function GET(_req: Request, { params }: Params) {
  const { business_id } = 'then' in params ? await params : params
  const db = getDb()

  const { data: biz } = await db
    .from('businesses')
    .select('id, name, address, city, phone, logo_url, timezone, industry')
    .eq('id', business_id)
    .eq('is_active', true)
    .maybeSingle()

  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: outlet } = await db
    .from('pos_outlets')
    .select('id, name, accepts_online_orders, pickup_ready_estimate_minutes, online_order_throttle_per_15min')
    .eq('business_id', business_id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ business: biz, outlet: outlet ?? null })
}