export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { getBid } from '@/lib/auth/get-bid'

async function _GET(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ areas: [] }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ areas: [] })
  const { data } = await supabase.from('staff_areas')
    .select('id,name,color').eq('business_id', bid).order('sort_order').limit(50)
  return NextResponse.json({ areas: data ?? [] })
}

export const GET = withErrorCapture('staff/areas', _GET)
