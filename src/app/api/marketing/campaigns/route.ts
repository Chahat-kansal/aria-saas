export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getActiveBid(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  return data?.business_id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getActiveBid(user.id)
  if (!bid) return NextResponse.json({ error: 'No active business' }, { status: 400 })

  const url = new URL(req.url)
  const type = url.searchParams.get('type')
  const status = url.searchParams.get('status')
  const page = parseInt(url.searchParams.get('page') ?? '1')
  const limit = 20

  let q = supabaseAdmin.from('campaigns')
    .select('*', { count: 'exact' })
    .eq('business_id', bid)
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1)

  if (type) q = (q as typeof q).eq('type', type)
  if (status) q = (q as typeof q).eq('status', status)

  const { data, count } = await q
  return NextResponse.json({ campaigns: data ?? [], total: count ?? 0 })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getActiveBid(user.id)
  if (!bid) return NextResponse.json({ error: 'No active business' }, { status: 400 })

  const body = await req.json() as Record<string, unknown>
  const { name, type, channel, target_type, target_segment, target_tag, message, subject, email_body, template_id, scheduled_at, aria_generated, aria_rationale } = body

  if (!name || !type || !channel || !message) {
    return NextResponse.json({ error: 'name, type, channel, message required' }, { status: 400 })
  }

  const { data: campaign, error } = await supabaseAdmin.from('campaigns').insert({
    business_id: bid,
    name, type, channel,
    target_type: target_type ?? 'manual',
    target_segment: target_segment ?? null,
    target_tag: target_tag ?? null,
    message, subject: subject ?? null,
    email_body: email_body ?? null,
    template_id: template_id ?? null,
    scheduled_at: scheduled_at ?? null,
    status: scheduled_at ? 'scheduled' : 'draft',
    aria_generated: aria_generated ?? false,
    aria_rationale: aria_rationale ?? null,
  }).select().maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campaign })
}

export const GET  = withErrorCapture('marketing/campaigns', _GET)
export const POST = withErrorCapture('marketing/campaigns', _POST)
