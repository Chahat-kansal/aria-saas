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

// CX-ACCOUNT-CENTRE-1 — respect the recipient's per-type notification preference. Defaults to true
// (notify) when the column is null or the lookup fails, so missing prefs never silence notifications.
type PrefColumn = 'notif_pref_likes' | 'notif_pref_comments' | 'notif_pref_followers' | 'notif_pref_new_posts'
async function memberWantsType(memberId: string, pref: PrefColumn): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin.from('community_members').select(pref).eq('id', memberId).maybeSingle()
    const v = (data as Record<string, unknown> | null)?.[pref]
    return v !== false
  } catch { return true }
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
    const pref: PrefColumn = opts.kind === 'new_like' ? 'notif_pref_likes' : 'notif_pref_comments'
    if (!(await memberWantsType(recipient, pref))) return // recipient turned this type off
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
    if (!(await memberWantsType(recipient, 'notif_pref_followers'))) return
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
    // Join each follower's notif_pref_new_posts so we can skip the ones who turned new-post alerts off.
    const { data: followers } = await supabaseAdmin.from('community_follows')
      .select('member_id, community_members(notif_pref_new_posts)')
      .eq('business_id', opts.businessId)
      .is('unfollowed_at', null)
    const rows = ((followers ?? []) as unknown as Array<{ member_id: string | null; community_members: { notif_pref_new_posts: boolean | null } | null }>)
      .filter(f => !!f.member_id && f.community_members?.notif_pref_new_posts !== false)
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
