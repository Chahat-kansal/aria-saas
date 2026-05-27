export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, xero_access_token, xero_connected_at')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [{ data: pending }, { data: history }] = await Promise.all([
    supabaseAdmin
      .from('xero_sync_queue')
      .select('id, sync_date, status, line_items, total_sales, total_gst, total_refunds, payment_breakdown, prepared_at, notes')
      .eq('business_id', business_id)
      .eq('status', 'pending_review')
      .order('sync_date', { ascending: false })
      .limit(5),
    supabaseAdmin
      .from('xero_sync_queue')
      .select('id, sync_date, status, total_sales, total_gst, sent_at, xero_invoice_id')
      .eq('business_id', business_id)
      .neq('status', 'pending_review')
      .order('sync_date', { ascending: false })
      .limit(30),
  ])

  return NextResponse.json({
    connected: !!biz.xero_access_token,
    connected_at: biz.xero_connected_at,
    pending: pending ?? [],
    history: history ?? [],
  })
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabaseAdmin.from('businesses').update({
    xero_access_token: null,
    xero_refresh_token: null,
    xero_tenant_id: null,
    xero_connected_at: null,
  }).eq('id', biz.id)

  return NextResponse.json({ ok: true })
}

export const GET    = withErrorCapture('integrations/xero/status', _GET)
export const DELETE = withErrorCapture('integrations/xero/status', _DELETE)
