export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json() as { id: string }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Verify ownership via business_id
  const { data: conv } = await supabaseAdmin
    .from('aria_conversations')
    .select('id, business_id')
    .eq('id', id)
    .maybeSingle()

  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Verify user owns this business
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', conv.business_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await supabaseAdmin.from('aria_conversations').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
