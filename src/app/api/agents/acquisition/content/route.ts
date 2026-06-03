export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const { data: content, error } = await supabaseAdmin
    .from('aeo_content_pieces')
    .select('*')
    .eq('business_id', biz.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ content: content ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const { CustomerAcquisitionAgent } = await import('@/lib/agents/customer-acquisition-agent')
  const agent = new CustomerAcquisitionAgent()
  await agent.run(biz.id)

  return NextResponse.json({ ok: true })
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const body = await req.json().catch(() => null) as { published_to?: string[]; published_at?: string } | null
  if (!body) return NextResponse.json({ error: 'Body required' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('aeo_content_pieces')
    .update({
      published_to: body.published_to ?? [],
      published_at: body.published_at ?? new Date().toISOString(),
    })
    .eq('id', id)
    .eq('business_id', biz.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('agents/acquisition/content', _GET)
export const POST = withErrorCapture('agents/acquisition/content', _POST)
export const PATCH = withErrorCapture('agents/acquisition/content', _PATCH)
