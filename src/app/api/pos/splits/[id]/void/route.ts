export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

type Ctx = { params: Promise<{ id: string }> | { id: string } }

async function _POST(_req: Request, ctx: Ctx) {
  const { id } = 'then' in ctx.params ? await ctx.params : ctx.params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: split } = await supabase.from('pos_sale_splits').select('status, sale_id, business_id').eq('id', id).maybeSingle()
  if (!split) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (split.status === 'paid') return NextResponse.json({ error: 'Cannot void a paid split' }, { status: 400 })

  await supabase.from('pos_sale_splits').update({ status: 'void' }).eq('id', id)
  return NextResponse.json({ ok: true })
}

export const POST = withErrorCapture('pos/splits/[id]/void', _POST)