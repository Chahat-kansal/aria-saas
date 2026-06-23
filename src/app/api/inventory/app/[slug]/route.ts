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
    supabaseAdmin.from('pos_staff').select('id, name, role, color')
      .eq('business_id', bid).eq('is_active', true).order('name'),
  ])

  return NextResponse.json({
    business: { id: biz.id, name: biz.name, slug: biz.slug },
    outlets: (outlets ?? []).map(o => ({ id: o.id, name: o.name, is_default: !!o.is_default })),
    staff: (staff ?? []).map(s => ({ id: s.id, name: s.name, role: s.role, color: s.color })),
  })
}

export const GET = withErrorCapture('inventory/app/bootstrap', _GET)
