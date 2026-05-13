export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { post_ids, publish_now = false }: { post_ids: string[]; publish_now?: boolean } = body

  if (!Array.isArray(post_ids) || post_ids.length === 0) {
    return NextResponse.json({ error: 'post_ids array required' }, { status: 400 })
  }

  // Fetch all posts with ownership check
  const { data: posts } = await supabase
    .from('social_posts')
    .select('id, business_id, scheduled_for, businesses!inner(user_id)')
    .in('id', post_ids)

  // Filter to only posts owned by this user
  const ownedPosts = (posts ?? []).filter(
    p => (p as any).businesses?.user_id === user.id
  )

  if (ownedPosts.length === 0) {
    return NextResponse.json({ error: 'No owned posts found in provided ids' }, { status: 403 })
  }

  const ownedIds = ownedPosts.map(p => p.id)
  let approved = 0
  let published = 0

  for (const post of ownedPosts) {
    // Determine new status
    const newStatus = publish_now
      ? 'publishing'
      : post.scheduled_for
        ? 'scheduled'
        : 'approved'

    await supabase.from('social_posts')
      .update({ approval_status: 'approved', status: newStatus })
      .eq('id', post.id)

    approved++

    if (publish_now) {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL}/api/social/posts/${post.id}/publish`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // Pass along the session cookie so the publish endpoint can auth
              'x-internal-service': process.env.CRON_SECRET ?? '',
            },
          }
        )
        if (res.ok) published++
      } catch {
        // Non-fatal — post is already marked approved, can be published manually
      }
    }
  }

  return NextResponse.json({ ok: true, approved, published, total: ownedIds.length })
}

export const POST = withErrorCapture('social/posts/bulk-approve', _POST)