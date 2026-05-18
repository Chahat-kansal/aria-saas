export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ pos_user: null, permissions: {}, is_owner: false })

  // Check ownership
  const { data: ownsBiz } = await supabase.from('businesses').select('id').eq('id', bid).eq('user_id', user.id).maybeSingle()
  const isOwner = !!ownsBiz

  // Try auth_user_id column first, then user_id fallback
  let { data: posUser } = await supabase.from('pos_users')
    .select('id, role, permissions, display_name, is_active')
    .eq('business_id', bid)
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!posUser) {
    const { data: fallback } = await supabase.from('pos_users')
      .select('id, role, permissions, display_name, is_active')
      .eq('business_id', bid)
      .eq('user_id', user.id)
      .maybeSingle()
    posUser = fallback ?? null
  }

  if (!posUser) {
    if (isOwner) {
      return NextResponse.json({
        pos_user: { id: user.id, role: 'owner', display_name: 'Owner', is_active: true },
        permissions: { is_owner: true, can_override_price: true, can_void_sales: true, can_refund: true },
        is_owner: true,
      })
    }
    return NextResponse.json({ pos_user: null, permissions: {}, is_owner: false })
  }

  return NextResponse.json({
    pos_user: posUser,
    permissions: posUser.permissions ?? {},
    is_owner: isOwner,
  })
}

export const GET = withErrorCapture('pos/users/me-permissions', _GET)
