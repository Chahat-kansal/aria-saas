export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { MAX_TITLE } from '@/lib/aria/thread-title'

/**
 * S2B PHASE 3 — RENAME AND PIN.
 *
 * ── WHY A RENAME CANNOT BE CLOBBERED BY THE AUTO-TITLER, WITHOUT A SECOND MECHANISM ────────────
 *
 * S1 phase 6 established the guarantee structurally: the title is written EXACTLY ONCE, on the
 * INSERT that creates the conversation, and `/api/aria/ask` issues no title UPDATE anywhere — a
 * test in thread-title.test.ts pulls every `.update({...})` out of that route and asserts none of
 * them writes `title`.
 *
 * So this route is the ONLY place a title is ever updated, and there is nothing to defend against.
 * Building a "don't overwrite manual titles" check here would be a second mechanism guarding a door
 * that is already welded shut — and a second mechanism is a second thing to get wrong.
 *
 * `title_edited_at` is still recorded, because a FUTURE titler (a re-title feature, a backfill)
 * would need an explicit signal rather than having to infer one. It is a fact on the record, not a
 * guard this code relies on.
 *
 * ── EVERY QUERY CARRIES ITS OWN business_id ────────────────────────────────────────────────────
 * supabaseAdmin bypasses RLS. The ownership gate below returns 403, and the writes ALSO scope
 * themselves — a write is the last place to lean on a check further up the function.
 */

/**
 * BUSINESS CONTEXT COMES FROM THE CANON RAIL (CANON-RAIL-1), NOT A LOCAL RESOLVER.
 *
 * This route originally carried its own five-line `getBid`. The canon rail guard caught it on
 * push, and it was RIGHT to — this codebase's failure pattern #4 is "N copies drift", and it
 * already has six independently-invented business-id resolvers.
 *
 * The migration is a CORRECTNESS GAIN, not just deduplication. withBusinessContext resolves
 * through resolveOwnerBusinessId(), which re-validates that the active-business row still
 * EXISTS, is OWNED by this user and is ACTIVE before trusting it. The inline version trusted
 * user_active_business.business_id directly — a stale or foreign row would have been believed.
 */
async function _PATCH(req: Request, _ctx: unknown, { businessId: bid }: BusinessContext) {
  const body = await req.json().catch(() => ({})) as {
    id?: string; title?: string; pinned?: boolean
  }
  const id = body.id
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const patch: Record<string, string | null> = {}

  if (typeof body.title === 'string') {
    const title = body.title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE)
    // An empty rename is a mistake, not an instruction to erase the name.
    if (!title) return NextResponse.json({ error: 'A thread needs a name' }, { status: 400 })
    patch.title = title
    patch.title_edited_at = new Date().toISOString()
  }

  if (typeof body.pinned === 'boolean') {
    // A timestamp, not a flag: pinned threads order among themselves by when they were pinned.
    patch.pinned_at = body.pinned ? new Date().toISOString() : null
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to change' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('aria_conversations')
    .update(patch)
    .eq('id', id)
    .eq('business_id', bid)        // the door: supabaseAdmin does not reach RLS
    .is('deleted_at', null)        // a tombstoned thread is not renameable or pinnable
    .select('id, title, pinned_at, title_edited_at')
    .maybeSingle()

  if (error) {
    console.error('[aria/ask/thread] update failed:', error.message)
    return NextResponse.json({ error: 'Could not update that thread' }, { status: 500 })
  }
  // No row came back: it belongs to another business, or it is deleted. Same answer either way —
  // never confirm the existence of a thread the caller cannot see.
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ ok: true, thread: data })
}

export const PATCH = withBusinessContext('aria/ask/thread', _PATCH)
