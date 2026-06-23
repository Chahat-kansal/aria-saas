export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { setStaffCookie } from '@/lib/inventory/staff-session'

// INV-STAFF-APP-1 — per-staff PIN login. The PIN is checked SERVER-SIDE against pos_staff.pin (never sent
// to the client) for the resolved business only. On success, an HMAC-signed acting-staff cookie is set.

type Params = { params: Promise<{ slug: string }> }

async function _POST(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as { staff_id?: string; pin?: string }
  if (!body.staff_id || !body.pin) return NextResponse.json({ error: 'Pick your name and enter your PIN' }, { status: 400 })

  const { data: staff } = await supabaseAdmin.from('pos_staff')
    .select('id, name, role, color, pin').eq('id', body.staff_id).eq('business_id', bid).eq('is_active', true).maybeSingle()
  if (!staff || String(staff.pin ?? '') !== String(body.pin)) {
    return NextResponse.json({ ok: false, error: 'Incorrect PIN' }, { status: 401 })
  }

  await setStaffCookie(bid, staff.id as string, (staff.name as string) ?? 'Staff')
  return NextResponse.json({ ok: true, staff: { id: staff.id, name: staff.name, role: staff.role, color: staff.color } })
}

export const POST = withErrorCapture('inventory/app/login', _POST)
