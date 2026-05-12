import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

export const GET = withErrorCapture('businesses/current', async () => {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Prefer the active business if one is pinned
  const { data: active } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const targetId = active?.business_id ?? null

  let query = supabase.from('businesses').select('*').eq('user_id', user.id)
  if (targetId) query = query.eq('id', targetId)
  else query = query.order('created_at', { ascending: true }).limit(1)

  const { data: business, error } = await query.maybeSingle()

  if (error || !business) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  }

  return NextResponse.json({ business })
})
