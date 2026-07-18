export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ ious: [] })

  const { searchParams } = new URL(req.url)
  const groupId = searchParams.get('group_id')
  const memberId = searchParams.get('member_id')
  const status = searchParams.get('status')

  let q = supabase.from('split_ious').select('*').eq('business_id', bid)
  if (groupId) q = q.eq('group_id', groupId)
  if (memberId) q = q.or(`from_member_id.eq.${memberId},to_member_id.eq.${memberId}`)
  if (status) q = q.eq('status', status)
  q = q.order('created_at', { ascending: false }).limit(50)

  const { data: ious } = await q
  return NextResponse.json({ ious: ious ?? [] })
}

async function _POST(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const { group_id, from_member_id, to_member_id, amount, notes } = await req.json()
  if (!from_member_id || !to_member_id || !amount) {
    return NextResponse.json({ error: 'from_member_id, to_member_id, and amount required' }, { status: 400 })
  }

  // Fetch member names
  const [{ data: from }, { data: to }] = await Promise.all([
    supabase.from('split_group_members').select('name').eq('id', from_member_id).maybeSingle(),
    supabase.from('split_group_members').select('name').eq('id', to_member_id).maybeSingle(),
  ])

  const { data: iou, error: e } = await supabase.from('split_ious').insert({
    business_id: bid,
    group_id: group_id ?? null,
    from_member_id,
    to_member_id,
    from_name: from?.name ?? 'Unknown',
    to_name: to?.name ?? 'Unknown',
    amount,
    status: 'pending',
    notes: notes ?? null,
    created_at: new Date().toISOString(),
  }).select().single()
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  return NextResponse.json({ iou }, { status: 201 })
}

export const GET = withErrorCapture('pos/split-ious', _GET)
export const POST = withBusinessContext('pos/split-ious', _POST)