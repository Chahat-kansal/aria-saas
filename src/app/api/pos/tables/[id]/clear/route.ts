export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

type Params = { params: Promise<{ id: string }> }

async function _POST(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: _ab } = await supabase.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
  const bid = (_ab?.business_id as string) ?? null
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  const { data: _tableCheck } = await supabase.from('pos_tables').select('id').eq('id', id).eq('business_id', bid).maybeSingle()
  if (!_tableCheck) return NextResponse.json({ error: 'Table not found' }, { status: 404 })

  const { data: table, error } = await supabase
    .from('pos_tables')
    .update({
      status: 'dirty',
      current_sale_id: null,
      seated_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, table })
}

export const POST = withErrorCapture('pos/tables/[id]/clear', _POST)