// CX-POLISH-1 — community notification writers.
//
// ALL functions here are fire-and-forget: callers invoke them WITHOUT awaiting (void notify...()), so a
// notification failure can never block or slow the underlying action (like/comment/follow/post). Each
// swallows its own errors. Self-notifications are skipped (you don't get pinged for your own action).
//
// Recipients:
//   new_like / new_comment / new_follower → the business OWNER, but only if they have linked a community
//     member account (businesses.user_id → community_members.user_id). Best-effort: no linked member = no row.
//   new_post → every active follower of the business (community_follows where unfollowed_at IS NULL).
import { supabaseAdmin } from '@/lib/supabase-admin'

// Resolve the owner's community member row for a business (null when the owner never linked an account).
async function ownerMemberId(businessId: string): Promise<string | null> {
  const { data: biz } = await supabaseAdmin.from('businesses').select('user_id').eq('id', businessId).maybeSingle()
  if (!biz?.user_id) return null
  const { data: m } = await supabaseAdmin.from('community_members').select('id').eq('user_id', biz.user_id).limit(1).maybeSingle()
  return m?.id ?? null
}

/** A member liked or commented on a business's post → notify the owner (if linked). */
export async function notifyEngagement(opts: {
  postId: string
  businessId: string
  actorMemberId: string | null
  kind: 'new_like' | 'new_comment'
}): Promise<void> {
  try {
    const recipient = await ownerMemberId(opts.businessId)
    if (!recipient || recipient === opts.actorMemberId) return // no recipient / no self-notify
    await supabaseAdmin.from('community_notifications').insert({
      member_id: recipient,
      type: opts.kind,
      actor_member_id: opts.actorMemberId,
      actor_business_id: opts.businessId,
      post_id: opts.postId,
    })
  } catch (e) {
    console.error('[notifications] engagement insert failed:', (e as Error).message)
  }
}

/** A member followed a business → notify the owner (if linked). */
export async function notifyFollow(opts: { businessId: string; actorMemberId: string }): Promise<void> {
  try {
    const recipient = await ownerMemberId(opts.businessId)
    if (!recipient || recipient === opts.actorMemberId) return
    await supabaseAdmin.from('community_notifications').insert({
      member_id: recipient,
      type: 'new_follower',
      actor_member_id: opts.actorMemberId,
      actor_business_id: opts.businessId,
    })
  } catch (e) {
    console.error('[notifications] follow insert failed:', (e as Error).message)
  }
}

/** A business published a post → notify every active follower. */
export async function notifyNewPost(opts: { businessId: string; postId: string }): Promise<void> {
  try {
    const { data: followers } = await supabaseAdmin.from('community_follows')
      .select('member_id')
      .eq('business_id', opts.businessId)
      .is('unfollowed_at', null)
    const rows = ((followers ?? []) as Array<{ member_id: string | null }>)
      .filter(f => !!f.member_id)
      .map(f => ({
        member_id: f.member_id as string,
        type: 'new_post' as const,
        actor_business_id: opts.businessId,
        post_id: opts.postId,
      }))
    if (rows.length === 0) return
    await supabaseAdmin.from('community_notifications').insert(rows)
  } catch (e) {
    console.error('[notifications] new_post insert failed:', (e as Error).message)
  }
}
