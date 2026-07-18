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

async function _GET(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ groups: [] })

  const { data: groups } = await supabase
    .from('split_groups')
    .select('id, name, description, total_visits, total_spend, last_visit_at, is_active, split_group_members(id, name, is_active)')
    .eq('business_id', bid)
    .eq('is_active', true)
    .order('last_visit_at', { ascending: false, nullsFirst: false })

  return NextResponse.json({ groups: groups ?? [] })
}

async function _POST(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const { name, description, members } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const { data: group, error: groupErr } = await supabase.from('split_groups').insert({
    business_id: bid,
    name: name.trim(),
    description: description ?? null,
    is_active: true,
    total_visits: 0,
    total_spend: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select('id').single()
  if (groupErr) return NextResponse.json({ error: groupErr.message }, { status: 500 })

  if (Array.isArray(members) && members.length > 0) {
    await supabase.from('split_group_members').insert(
      members.map((m: any) => ({
        group_id: group.id,
        business_id: bid,
        name: m.name,
        phone: m.phone ?? null,
        email: m.email ?? null,
        customer_id: m.customer_id ?? null,
        avatar_color: m.avatar_color ?? '#8B5CF6',
        current_balance: 0,
        total_paid_to_date: 0,
        total_owed_to_date: 0,
        is_active: true,
        created_at: new Date().toISOString(),
      }))
    )
  }

  const { data: fullGroup } = await supabase.from('split_groups').select('*, split_group_members(*)').eq('id', group.id).maybeSingle()
  return NextResponse.json({ group: fullGroup }, { status: 201 })
}

export const GET = withErrorCapture('pos/split-groups', _GET)
export const POST = withBusinessContext('pos/split-groups', _POST)