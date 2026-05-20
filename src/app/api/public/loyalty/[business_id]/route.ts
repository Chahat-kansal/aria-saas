export const dynamic = 'force-dynamic'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ business_id: string }> | { business_id: string } }

export async function GET(_req: Request, { params }: Params) {
  const { business_id } = 'then' in params ? await params : params
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const [{ data: biz }, { data: config }] = await Promise.all([
    db.from('businesses').select('name, industry').eq('id', business_id).maybeSingle(),
    db.from('pos_loyalty_config')
      .select('program_type,points_per_dollar,stamps_to_reward,stamp_reward_text,public_enrol_enabled')
      .eq('business_id', business_id).maybeSingle(),
  ])
  if (!biz || !config?.public_enrol_enabled) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ business: biz, config })
}
