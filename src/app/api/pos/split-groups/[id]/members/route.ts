export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

type Ctx = { params: Promise<{ id: string }> | { id: string } }

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST(req: Request, ctx: Ctx) {
  const { id } = 'then' in ctx.params ? await ctx.params : ctx.params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json()
  const { name, phone, email, customer_id, avatar_color } = body
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const { data: member, error: e } = await supabase.from('split_group_members').insert({
    group_id: id,
    business_id: bid,
    name: name.trim(),
    phone: phone ?? null,
    email: email ?? null,
    customer_id: customer_id ?? null,
    avatar_color: avatar_color ?? '#8B5CF6',
    current_balance: 0,
    total_paid_to_date: 0,
    total_owed_to_date: 0,
    is_active: true,
    joined_at: new Date().toISOString(),
  }).select().single()
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  return NextResponse.json({ member }, { status: 201 })
}

export const POST = withErrorCapture('pos/split-groups/[id]/members', _POST)