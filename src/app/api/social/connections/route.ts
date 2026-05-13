export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const businessId = searchParams.get('business_id')
  if (!businessId) return NextResponse.json({ connections: [] })

  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabase.from('businesses')
    .select('id').eq('id', businessId).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ connections: [] })

  const { data: connections } = await supabase
    .from('social_connections')
    .select('id,platform,platform_account_name,account_handle,profile_picture,follower_count,is_active,last_synced_at,connected_at')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('platform')

  return NextResponse.json({ connections: connections ?? [] })
}

export const GET = withErrorCapture('social/connections', _GET)