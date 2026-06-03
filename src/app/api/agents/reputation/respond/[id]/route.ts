export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const body = await req.json().catch(() => null) as { action?: string; edited_text?: string } | null
  if (!body?.action) return NextResponse.json({ error: 'action required' }, { status: 400 })

  const { data: review } = await supabaseAdmin
    .from('business_reviews')
    .select('id,is_crisis,response_text')
    .eq('id', params.id)
    .eq('business_id', biz.id)
    .maybeSingle()
  if (!review) return NextResponse.json({ error: 'Review not found' }, { status: 404 })
  if (review.is_crisis) return NextResponse.json({ error: 'Crisis reviews require manual handling' }, { status: 422 })

  if (body.action === 'skip') {
    await supabaseAdmin.from('business_reviews').update({ response_status: 'skipped' }).eq('id', params.id)
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'approve' || body.action === 'edit') {
    const responseText = body.edited_text ?? review.response_text
    await supabaseAdmin.from('business_reviews').update({
      response_status: 'posted',
      response_text: responseText,
      response_posted_at: new Date().toISOString(),
      response_drafted_by: body.action === 'edit' ? 'owner' : 'agent',
    }).eq('id', params.id)
    // Note: actual Google posting requires OAuth — shows as posted for copy-paste workflow
    return NextResponse.json({ ok: true, response_text: responseText })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

export const POST = withErrorCapture('agents/reputation/respond/[id]', _POST)
