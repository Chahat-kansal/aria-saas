export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveBusinessId } from '@/lib/aria/resolve-business'

// INV-STAFF-APP-1 — public bootstrap for the staff PWA login screen. Resolves the slug to ONE business and
// returns only that business's outlets + active staff (id/name/role/color — NEVER the PIN). Scoped to the
// resolved business, so another business's slug can only ever read its own staff/outlets.

type Params = { params: Promise<{ slug: string }> }

async function _GET(_req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabaseAdmin.from('businesses').select('id, name, slug').eq('id', bid).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [{ data: outlets }, { data: staff }] = await Promise.all([
    supabaseAdmin.from('pos_outlets').select('id, name, is_default, is_global')
      .eq('business_id', bid).eq('is_active', true).order('is_default', { ascending: false }),
    // SEC-PIN-3 §1 — selects pin_hash, not pin. This endpoint is PUBLIC (it feeds the staff PWA's
    // login screen before anyone has authenticated), so the plaintext column must not be read here
    // at all — the has_pin boolean below is the only thing it was ever used for, and pin_hash
    // answers the same question. Once §1 stops writing plaintext, deriving it from `pin` would also
    // be WRONG: a newly created staff member with a hash and no plaintext would show as "no PIN"
    // and the owner would be told to set one they already set.
    supabaseAdmin.from('pos_staff').select('id, name, role, color, pin_hash')
      .eq('business_id', bid).eq('is_active', true).order('name'),
  ])

  return NextResponse.json({
    business: { id: biz.id, name: biz.name, slug: biz.slug },
    outlets: (outlets ?? []).map(o => ({ id: o.id, name: o.name, is_default: !!o.is_default })),
    // has_pin: true = staff can log in; false = owner must set a PIN first. PIN itself never leaves the server.
    staff: (staff ?? []).map(s => ({ id: s.id, name: s.name, role: s.role, color: s.color, has_pin: s.pin_hash != null })),
  })
}

export const GET = withErrorCapture('inventory/app/bootstrap', _GET)
