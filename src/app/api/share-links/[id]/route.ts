export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function verifyOwnership(linkId: string, userId: string) {
  const { data: link } = await supabaseAdmin
    .from('dashboard_share_links').select('id, business_id')
    .eq('id', linkId).maybeSingle()
  if (!link) return null

  const supabase = createServerSupabaseClient()
  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', link.business_id as string).eq('user_id', userId).maybeSingle()
  return biz ? link : null
}

async function _DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const link = await verifyOwnership(params.id, user.id)
  if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabaseAdmin.from('dashboard_share_links').update({ is_active: false }).eq('id', params.id)
  return NextResponse.json({ ok: true })
}

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const link = await verifyOwnership(params.id, user.id)
  if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as { is_active?: boolean }
  await supabaseAdmin.from('dashboard_share_links').update({ is_active: body.is_active }).eq('id', params.id)
  return NextResponse.json({ ok: true })
}

export const DELETE = withErrorCapture('share-links/[id]', _DELETE)
export const PATCH = withErrorCapture('share-links/[id]', _PATCH)
