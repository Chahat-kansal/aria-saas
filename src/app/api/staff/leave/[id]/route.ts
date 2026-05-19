export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

type Params = { params: Promise<{ id: string }> | { id: string } }

async function _PATCH(req: Request, { params }: Params) {
  const { id } = 'then' in params ? await params : params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { status?: string }

  // Verify this leave belongs to a business owned by user
  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const { data, error: e } = await supabaseAdmin.from('staff_leave')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('business_id', biz.id)
    .select('*, staff_members(first_name, last_name)')
    .single()
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })

  return NextResponse.json({ leave: data })
}

export const PATCH = withErrorCapture('staff/leave/[id]', _PATCH)
