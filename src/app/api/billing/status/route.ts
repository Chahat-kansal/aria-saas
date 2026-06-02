export const runtime = 'nodejs'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!business) return NextResponse.json({ subscription: null })

  const { data: sub } = await supabase
    .from('business_subscriptions')
    .select('tier, status, trial_ends_at, current_period_start, current_period_end, cancel_at_period_end, cancelled_at, stripe_customer_id')
    .eq('business_id', business.id)
    .maybeSingle()

  return NextResponse.json({ subscription: sub ?? null })
}
