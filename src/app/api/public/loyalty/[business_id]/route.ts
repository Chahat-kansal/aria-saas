export const dynamic = 'force-dynamic'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { resolveBusinessId } from '@/lib/aria/resolve-business'

type Params = { params: Promise<{ business_id: string }> | { business_id: string } }

export async function GET(_req: Request, { params }: Params) {
  const { business_id } = 'then' in params ? await params : params
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const realId = await resolveBusinessId(db, business_id)
  if (!realId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [{ data: biz }, { data: config }] = await Promise.all([
    db.from('businesses').select('name, industry').eq('id', realId).maybeSingle(),
    db.from('pos_loyalty_config')
      .select('program_type,points_per_dollar,stamps_to_reward,stamp_reward_text,public_enrol_enabled,tier_silver_points,tier_gold_points,tier_platinum_points')
      .eq('business_id', realId).maybeSingle(),
  ])
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Return the config even when enrolment is off — the page renders a friendly
  // "coming soon" state from public_enrol_enabled rather than 404ing.
  return NextResponse.json({ business: biz, config: config ?? null })
}
