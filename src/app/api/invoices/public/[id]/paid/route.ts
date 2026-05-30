export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}))
  const method = String(body.method ?? '').trim()
  if (!['cash', 'bank_transfer'].includes(method)) {
    return NextResponse.json({ error: 'method must be cash or bank_transfer' }, { status: 400 })
  }

  const { data: inv } = await supabaseAdmin
    .from('invoices')
    .select('id, status')
    .eq('id', params.id)
    .maybeSingle()
  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (inv.status === 'paid') return NextResponse.json({ ok: true, already_paid: true })

  await supabaseAdmin.from('invoices').update({
    status: 'pending_payment_confirm',
    payment_method_hint: method,
    updated_at: new Date().toISOString(),
  }).eq('id', params.id)

  return NextResponse.json({ ok: true })
}

export const POST = withErrorCapture('invoices/public/[id]/paid', _POST)
