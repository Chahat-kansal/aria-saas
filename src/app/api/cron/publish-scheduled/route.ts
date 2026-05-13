export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Find posts that are approved, scheduled, and whose time has arrived
  const { data: posts } = await supabase
    .from('social_posts')
    .select('id')
    .eq('approval_status', 'approved')
    .eq('status', 'scheduled')
    .lte('scheduled_for', new Date().toISOString())
    .limit(20)

  if (!posts || posts.length === 0) {
    return NextResponse.json({ ok: true, published: 0 })
  }

  const results = await Promise.allSettled(
    posts.map(p =>
      fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/social/posts/${p.id}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.CRON_SECRET}`,
        },
      })
    )
  )

  const succeeded = results.filter(r => r.status === 'fulfilled').length

  return NextResponse.json({ ok: true, published: succeeded, total: posts.length })
}