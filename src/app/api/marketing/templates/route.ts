export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: uab } = await supabaseAdmin.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
  const bid = uab?.business_id

  let q = supabaseAdmin.from('campaign_templates').select('*').eq('is_global', true)
  if (bid) q = supabaseAdmin.from('campaign_templates').select('*').or(`business_id.eq.${bid},is_global.eq.true`)

  const { data } = await q.order('is_global', { ascending: false }).order('created_at', { ascending: false })
  return NextResponse.json({ templates: data ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: uab } = await supabaseAdmin.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
  const bid = uab?.business_id
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json()
  const { data, error } = await supabaseAdmin.from('campaign_templates').insert({
    ...body,
    business_id: bid,
    is_global: false,
  }).select().maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data })
}

export const GET  = withErrorCapture('marketing/templates', _GET)
export const POST = withErrorCapture('marketing/templates', _POST)
