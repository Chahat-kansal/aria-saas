export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getActingStaff } from '@/lib/inventory/staff-session'
import { resolveOutletId } from '@/lib/inventory/outlet-stock'
import { listRecipes, depleteForPrep, proposeMarkdowns, logTemp, tempStatus } from '@/lib/inventory/fresh'

// INV-7 — fresh/production endpoint (staff-scoped). GET: recipes / markdowns / temp status (or all). POST: prep
// (deplete ingredients via canonical adjustOutletStock, attributed) | log_temp (attributed compliance reading).
// Markdown is PROPOSE-only; depletion is the only write here and goes through the canonical stock path.

type Params = { params: Promise<{ slug: string }> }

async function _GET(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const acting = await getActingStaff(bid)
  if (!acting) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const outletId = await resolveOutletId(supabaseAdmin, bid, sp.get('outlet_id'))

  if (sp.get('markdowns') === '1') return NextResponse.json(await proposeMarkdowns(supabaseAdmin, bid, outletId))
  if (sp.get('temp') === '1') return NextResponse.json(await tempStatus(supabaseAdmin, bid, outletId))
  if (sp.get('recipes') === '1') return NextResponse.json({ recipes: await listRecipes(supabaseAdmin, bid) })

  const [recipes, markdowns, temp] = await Promise.all([
    listRecipes(supabaseAdmin, bid), proposeMarkdowns(supabaseAdmin, bid, outletId), tempStatus(supabaseAdmin, bid, outletId),
  ])
  return NextResponse.json({ acting: { id: acting.staff_id, name: acting.staff_name }, recipes, markdowns, temp })
}

async function _POST(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const acting = await getActingStaff(bid)
  if (!acting) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { action?: string; recipe_id?: string; batches?: number; outlet_id?: string | null; location?: string; reading_c?: number; threshold_c?: number | null }
  const outletId = await resolveOutletId(supabaseAdmin, bid, body.outlet_id ?? null)

  if (body.action === 'prep') {
    if (!body.recipe_id) return NextResponse.json({ error: 'recipe_id required' }, { status: 400 })
    const res = await depleteForPrep(supabaseAdmin, bid, outletId, body.recipe_id, Number(body.batches) || 1, acting.staff_name)
    return NextResponse.json({ ok: true, ...res })
  }
  if (body.action === 'log_temp') {
    if (!body.location || body.reading_c == null) return NextResponse.json({ error: 'location and reading_c required' }, { status: 400 })
    const res = await logTemp(supabaseAdmin, bid, outletId, body.location, Number(body.reading_c), body.threshold_c != null ? Number(body.threshold_c) : null, acting.staff_id, acting.staff_name)
    return NextResponse.json(res)
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export const GET = withErrorCapture('inventory/app/fresh:get', _GET)
export const POST = withErrorCapture('inventory/app/fresh:post', _POST)
