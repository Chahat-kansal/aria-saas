export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * S2B PHASE 2 — SOFT DELETE. THE URGENT FIX.
 *
 * This route used to do `.delete().eq('id', id)`. A mis-click on the 🗑 in the thread list
 * PERMANENTLY DESTROYED that conversation and every message in it — no tombstone, no undo, no
 * recovery short of a database backup. That was live on every deployment until this commit.
 *
 * It now writes a tombstone. The row and its messages survive; the thread leaves the list and stops
 * being searchable because both of those paths filter on `deleted_at IS NULL`.
 *
 * ── WHY A TOMBSTONE AND NOT A DELETE ───────────────────────────────────────────────────────────
 * Owners mis-click, and their business records are not disposable. A conversation can contain the
 * reasoning behind a price change, a supplier decision, or a roster — the kind of thing someone
 * needs to look up months later, sometimes to settle a dispute. "I deleted it by accident" should
 * cost a support request, not the record.
 *
 * ── AND WHY THE OWNERSHIP CHECK STAYS EXACTLY AS IT WAS ────────────────────────────────────────
 * The first SELECT reads `id, business_id` for one purpose: to check the caller owns the business.
 * It is deliberately NOT a content read — S2's isolation rail distinguishes the two, because an
 * ownership probe that returns no message text cannot leak a conversation even if the id is
 * someone else's. The 403 below is what actually stops the write.
 */
export async function DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json() as { id: string }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Verify ownership via business_id. Returns no message content — an ownership probe, not a read.
  const { data: conv } = await supabaseAdmin
    .from('aria_conversations')
    .select('id, business_id')
    .eq('id', id)
    .maybeSingle()

  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Verify user owns this business
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', conv.business_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // THE TOMBSTONE. Not a DELETE. The explicit business_id filter is deliberate belt-and-braces:
  // supabaseAdmin bypasses RLS, so this query's own scope is the only thing constraining it, and a
  // destructive-looking write is the last place to rely on a check three lines further up.
  const { error } = await supabaseAdmin
    .from('aria_conversations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('business_id', conv.business_id)
    .is('deleted_at', null)

  if (error) {
    console.error('[aria/ask/delete] soft delete failed:', error.message)
    return NextResponse.json({ error: 'Could not delete that thread' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, soft: true })
}
