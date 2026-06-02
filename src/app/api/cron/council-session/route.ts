export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { runCouncilSession } from '@/lib/agents/council'

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization') ?? ''
    if (auth !== 'Bearer ' + cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const { data: businesses } = await supabaseAdmin
    .from('business_subscriptions')
    .select('business_id')
    .in('status', ['active', 'trialing'])

  const bizIds = (businesses ?? []).map((b: { business_id: string }) => b.business_id)
  if (bizIds.length === 0) {
    return NextResponse.json({ processed: 0, sessions_created: 0, errors: [] })
  }

  const errors: string[] = []
  let sessionsCreated = 0

  await Promise.allSettled(
    bizIds.map(async (bizId: string) => {
      try {
        const result = await Promise.race([
          runCouncilSession(bizId),
          new Promise<null>((_, rej) => setTimeout(() => rej(new Error('timeout')), 30000)),
        ])
        if (result && result.session) {
          sessionsCreated++
          if (result.plan_narrative) {
            const { data: tokens } = await supabaseAdmin
              .from('push_tokens')
              .select('token')
              .eq('business_id', bizId)
              .limit(5)
            if (tokens && tokens.length > 0) {
              console.log('[council-cron] push notification queued for', bizId, '- plan ready')
            }
          }
        }
      } catch (e) {
        errors.push(bizId + ': ' + (e as Error).message)
      }
    })
  )

  return NextResponse.json({
    processed: bizIds.length,
    sessions_created: sessionsCreated,
    errors,
  })
}
