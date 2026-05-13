export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const business_id = new URL(req.url).searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase
    .from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let { data: credits } = await supabase
    .from('pos_image_credits').select('*').eq('business_id', business_id).maybeSingle()

  if (!credits) {
    const { data: newCredits } = await supabase
      .from('pos_image_credits').insert({ business_id }).select('*').single()
    credits = newCredits
  }

  return NextResponse.json({
    free_used:       credits?.free_used      ?? 0,
    free_limit:      credits?.free_limit     ?? 5,
    paid_credits:    credits?.paid_credits   ?? 0,
    free_remaining:  Math.max(0, (credits?.free_limit ?? 5) - (credits?.free_used ?? 0)),
    total_images:    credits?.total_images   ?? 0,
  })
}

export const GET = withErrorCapture('pos/image-credits', _GET)