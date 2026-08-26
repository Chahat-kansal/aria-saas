export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
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

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase
    .from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data: biz } = await supabase
    .from('businesses').select('id').eq('user_id', userId).limit(1).maybeSingle()
  return (biz?.id as string) ?? null
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 403 })

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

export const PATCH = withErrorCapture('aria/ask/thread', _PATCH)
