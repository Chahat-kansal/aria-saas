export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { getBestSlotForPlatform, analyzeBestTimes } from '@/lib/social/smart-scheduler'
import type { BestTimeSlot } from '@/types/scheduler'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  const platform    = searchParams.get('platform') ?? 'instagram'
  const days        = Math.min(parseInt(searchParams.get('days') ?? '7'), 14)

  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase
    .from('businesses').select('id, industry')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Get engagement data for blending
  const buckets = await analyzeBestTimes(supabase, business_id)
  const platformBuckets = buckets.filter(b => b.platform === platform)
  const totalSamples    = platformBuckets.reduce((s, b) => s + b.sampleSize, 0)

  const slots: BestTimeSlot[] = []
  const now = new Date()

  for (let i = 0; i < days; i++) {
    const date = new Date(now)
    date.setDate(date.getDate() + i)

    const datetime = getBestSlotForPlatform(platform, biz.industry ?? 'other', date, platformBuckets)
    const dt       = new Date(datetime)
    const hour     = dt.getUTCHours()
    const dayOfWeek = dt.getUTCDay()

    const matchingBucket = platformBuckets.find(b => b.dayOfWeek === dayOfWeek && b.hour === hour)
    const score = totalSamples >= 10 && matchingBucket
      ? Math.min(100, Math.round((matchingBucket.avgEngagement / 300) * 100))
      : 50

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const reason   = totalSamples >= 10 && matchingBucket
      ? `${dayNames[dayOfWeek]} ${hour}:00 — your audience engages ${(matchingBucket.avgEngagement / 100).toFixed(1)}× more here`
      : `Industry peak time for ${biz.industry ?? 'this industry'}`

    slots.push({ datetime, platform, score, reason, dayOfWeek, hour })
  }

  return NextResponse.json({ slots, data_quality: totalSamples >= 10 ? 'personalised' : 'industry_default' })
}

export const GET = withErrorCapture('social/scheduler/best-times', _GET)