export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ alerts: [] })

  const { searchParams } = new URL(req.url)
  const bid = searchParams.get('business_id')
  if (!bid) return NextResponse.json({ alerts: [] })

  // Ownership check
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', bid).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ alerts: [] })

  const { data } = await supabase
    .from('pos_expiry_alerts')
    .select('*')
    .eq('business_id', bid)
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ alerts: data ?? [] })
}
