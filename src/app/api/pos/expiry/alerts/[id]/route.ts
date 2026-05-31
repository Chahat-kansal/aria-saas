export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

type Ctx = { params: Promise<{ id: string }> | { id: string } }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = 'then' in ctx.params ? await ctx.params : ctx.params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  // Verify the user owns the business this alert belongs to
  const { data: alert } = await supabase.from('pos_expiry_alerts').select('business_id').eq('id', id).maybeSingle()
  if (!alert) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', alert.business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabase.from('pos_expiry_alerts').update({ acknowledged: body.acknowledged }).eq('id', id)
  return NextResponse.json({ ok: true })
}
