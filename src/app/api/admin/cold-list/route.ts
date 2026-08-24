export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin'
import { buildColdList } from '@/lib/ops/cold-list'

/**
 * MS15 PHASE 6 — THE COLD LIST, SURFACED.
 *
 * Every cold writer, cron and guard, oldest first, with when it was deployed. GENERATED LIVE on
 * every request from the registry crossed with the database — never a hardcoded list, because a
 * hardcoded inventory of not-working things is itself a thing that stops working.
 *
 * Nothing on this list is fixed here. It is the backlog, discovered in one place.
 */
async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return NextResponse.json(await buildColdList())
}

export const GET = _GET
