export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

// Fast phone/name lookup for checkout autocomplete
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ customers: [] })

  const { query } = await req.json() as { query: string }
  if (!query || query.trim().length < 2) return NextResponse.json({ customers: [] })

  const q = query.trim()

  const { data: customers } = await supabase
    .from('pos_customers')
    .select('id, name, phone, email, points_balance, stamps_count, total_spent, visit_count, last_visit_at, tags')
    .eq('business_id', bid)
    .or(`phone.ilike.%${q}%,name.ilike.%${q}%`)
    .order('last_visit_at', { ascending: false, nullsFirst: false })
    .limit(8)

  return NextResponse.json({ customers: customers ?? [] })
}

export const POST = withErrorCapture('pos/customers/lookup', _POST)