export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

type Params = { params: Promise<{ id: string }> }

async function _POST(req: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()

  // Allow cron invocations authenticated with CRON_SECRET (no user session in cron context)
  const authHeader = req.headers.get('authorization')?.replace('Bearer ', '')
  const isCron = !!authHeader && !!process.env.CRON_SECRET && authHeader === process.env.CRON_SECRET

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let post: any = null

  if (isCron) {
    // Cron path: fetch post directly (no user ownership check needed — cron is trusted)
    const { data } = await supabase
      .from('social_posts')
      .select('*, businesses!inner(user_id, name)')
      .eq('id', id)
      .single()
    post = data as Record<string, unknown> | null
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  } else {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Fetch post with ownership check via business join
    const { data } = await supabase
      .from('social_posts')
      .select('*, businesses!inner(user_id, name)')
      .eq('id', id)
      .single()

    if (!data || (data as any).businesses?.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    post = data as Record<string, unknown>
  }

  // Get the active connection for this platform
  const { data: connection } = await supabase
    .from('social_connections')
    .select('*')
    .eq('business_id', post.business_id)
    .eq('platform', post.platform)
    .eq('is_active', true)
    .maybeSingle()

  if (!connection) {
    return NextResponse.json({ error: 'No active connection for platform' }, { status: 400 })
  }

  await supabase.from('social_posts')
    .update({ status: 'publishing' })
    .eq('id', id)

  try {
    let platformPostId: string | null = null
    let platformUrl: string | null = null

    const fullCaption = post.caption +
      (post.hashtags?.length ? '\n\n' + (post.hashtags as string[]).join(' ') : '')

    if (post.platform === 'instagram') {
      const igId = connection.instagram_account_id
      if (!igId) throw new Error('No Instagram account linked to this connection')

      // Step 1: create media container
      const containerRes = await fetch(
        `https://graph.facebook.com/v25.0/${igId}/media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_url: (post.image_urls as string[])?.[0] ?? null,
            caption: fullCaption,
            access_token: connection.access_token,
          }),
        }
      )
      const containerData = await containerRes.json()
      if (!containerData.id) {
        throw new Error(JSON.stringify(containerData.error ?? containerData))
      }

      // Step 2: publish container
      const publishRes = await fetch(
        `https://graph.facebook.com/v25.0/${igId}/media_publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            creation_id: containerData.id,
            access_token: connection.access_token,
          }),
        }
      )
      const publishData = await publishRes.json()
      if (!publishData.id) {
        throw new Error(JSON.stringify(publishData.error ?? publishData))
      }

      platformPostId = publishData.id
      platformUrl = `https://www.instagram.com/p/${publishData.id}`

    } else if (post.platform === 'facebook') {
      const pageId = connection.platform_page_id
      if (!pageId) throw new Error('No Facebook Page linked to this connection')

      const imageUrl = (post.image_urls as string[])?.[0]
      let postData: Record<string, unknown>

      if (imageUrl) {
        const photoRes = await fetch(
          `https://graph.facebook.com/v25.0/${pageId}/photos`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: imageUrl,
              caption: fullCaption,
              access_token: connection.access_token,
            }),
          }
        )
        postData = await photoRes.json()
      } else {
        const postRes = await fetch(
          `https://graph.facebook.com/v25.0/${pageId}/feed`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: fullCaption,
              access_token: connection.access_token,
            }),
          }
        )
        postData = await postRes.json()
      }

      if (!postData.id && !postData.post_id) {
        throw new Error(JSON.stringify((postData as any).error ?? postData))
      }

      platformPostId = (postData.post_id ?? postData.id) as string
      platformUrl = `https://www.facebook.com/${platformPostId}`
    }

    await supabase.from('social_posts')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        platform_post_id: platformPostId,
        platform_url: platformUrl,
        publish_error: null,
        approval_status: 'approved',
      })
      .eq('id', id)

    return NextResponse.json({ ok: true, platform_post_id: platformPostId, platform_url: platformUrl })

  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('[social/publish]', errorMsg)

    await supabase.from('social_posts')
      .update({ status: 'failed', publish_error: errorMsg.slice(0, 500) })
      .eq('id', id)

    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}

export const POST = withErrorCapture('social/posts/publish', _POST)