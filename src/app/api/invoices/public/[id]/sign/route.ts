export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { markBriefingStale } from '@/lib/aria/briefing-invalidate'

async function _POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}))
  const { signature_token, name } = body as { signature_token?: string; name?: string }

  if (!signature_token || typeof signature_token !== 'string') {
    return NextResponse.json({ error: 'signature_token required' }, { status: 400 })
  }
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return NextResponse.json({ error: 'Full name required (min 2 chars)' }, { status: 400 })
  }

  const { data: inv } = await supabaseAdmin
    .from('invoices')
    .select('id, business_id, status, signature_token, signed_at')
    .eq('id', params.id)
    .maybeSingle()

  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (inv.signature_token !== signature_token) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 403 })
  }
  if (inv.signed_at) {
    return NextResponse.json({ ok: true, already_signed: true, signed_at: inv.signed_at })
  }
  if (inv.status === 'paid' || inv.status === 'voided') {
    return NextResponse.json({ error: 'Invoice cannot be signed in current status' }, { status: 409 })
  }

  const now = new Date().toISOString()
  const { error: updateErr } = await supabaseAdmin
    .from('invoices')
    .update({ signed_at: now, signed_by_name: name.trim(), updated_at: now })
    .eq('id', params.id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  markBriefingStale(inv.business_id as string).catch(() => {})

  return NextResponse.json({ ok: true, signed_at: now, signed_by_name: name.trim() })
}

export const POST = withErrorCapture('invoices/public/[id]/sign', _POST)
