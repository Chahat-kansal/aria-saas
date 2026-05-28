export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const TARGETS = new Set(['hub_view', 'loyalty', 'booking', 'community', 'review', 'website', 'order'])

async function _POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { business_id?: string; target?: string; visitor_id?: string; referrer?: string }
  if (!body.business_id || !body.target || !TARGETS.has(body.target)) {
    return NextResponse.json({ error: 'business_id and valid target required' }, { status: 400 })
  }
  await supabaseAdmin.from('customer_hub_clicks').insert({
    business_id: body.business_id,
    target: body.target,
    visitor_id: (body.visitor_id ?? '').toString().slice(0, 64) || null,
    referrer: (body.referrer ?? '').toString().slice(0, 300) || null,
    user_agent: (req.headers.get('user-agent') ?? '').slice(0, 300) || null,
  })
  return NextResponse.json({ ok: true })
}

export const POST = withErrorCapture('hub/click', _POST)
