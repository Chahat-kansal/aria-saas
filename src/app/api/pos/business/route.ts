export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Try active business first
  const { data: active } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const bid = active?.business_id as string | null

  if (!bid) {
    const { data: biz } = await supabase
      .from('businesses')
      .select('id,name,created_at,business_type,plan')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    return NextResponse.json({ business: biz ?? null })
  }

  const { data: biz } = await supabase
    .from('businesses')
    .select('id,name,created_at,business_type,plan')
    .eq('id', bid)
    .maybeSingle()

  return NextResponse.json({ business: biz ?? null })
}
