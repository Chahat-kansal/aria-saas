export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

type Params = { params: Promise<{ id: string }> }

async function _DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership
  const { data: conn } = await supabase
    .from('social_connections')
    .select('id, business_id')
    .eq('id', id)
    .maybeSingle()

  if (!conn) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabase.from('businesses')
    .select('id').eq('id', conn.business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await supabase.from('social_connections').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}

export const DELETE = withErrorCapture('social/connections/[id]', _DELETE)