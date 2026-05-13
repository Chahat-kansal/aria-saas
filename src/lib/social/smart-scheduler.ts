import { getSocialIndustryConfig } from './industry-prompts'
import type { EngagementBucket, BestTimeSlot } from '@/types/scheduler'

export type { EngagementBucket, BestTimeSlot }

// Melbourne offset: UTC+10 (AEST). DST (+1h) not accounted — close enough for scheduling.
const MELBOURNE_OFFSET_HOURS = 10

export interface ScheduleSlot {
  platform: string
  datetime: Date
  reason: string
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Picks the best ISO datetime for a post given platform + industry + target date.
 * Uses industry default times; blends with historical engagement data when available.
 *
 * @param engagementBuckets Pass pre-fetched buckets from analyzeBestTimes() for
 *   personalized results. Omit to use industry defaults.
 */
export function getBestSlotForPlatform(
  platform: string,
  industry: string,
  date: Date,
  engagementBuckets: EngagementBucket[] = []
): string {
  const cfg = getSocialIndustryConfig(industry)
  const dayOfWeek = date.getDay()

  // 1. Industry default hour
  const times = cfg.bestPostingTimes.filter(t => {
    const daySpecific = t.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s/)
    if (daySpecific) {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      return t.startsWith(days[dayOfWeek])
    }
    return true
  })
  const timeStr  = times[0]?.replace(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s/, '') ?? '12:00'
  const [defH, defM] = timeStr.split(':').map(Number)
  let bestHour   = defH
  let bestMinute = defM ?? 0

  // 2. Blend with own engagement data if enough samples (>=10 posts)
  const platformBuckets = engagementBuckets.filter(
    b => b.platform === platform && b.dayOfWeek === dayOfWeek
  )
  const totalSamples = platformBuckets.reduce((s, b) => s + b.sampleSize, 0)

  if (totalSamples >= 10 && platformBuckets.length > 0) {
    const best = platformBuckets.reduce((a, b) => b.avgEngagement > a.avgEngagement ? b : a)
    // 70% own data, 30% industry default
    bestHour   = Math.round(best.hour * 0.7 + bestHour * 0.3)
    bestMinute = 0
  }

  // 3. Convert Melbourne local time to UTC for storage
  const utcHour = ((bestHour - MELBOURNE_OFFSET_HOURS) + 24) % 24
  const slot = new Date(date)
  slot.setUTCHours(utcHour, bestMinute, 0, 0)

  // If in the past, push to next day
  if (slot <= new Date()) slot.setUTCDate(slot.getUTCDate() + 1)

  return slot.toISOString()
}

/**
 * Returns next N optimal slots for a platform, skipping already-scheduled
 * posts and respecting a 2-hour minimum gap between same-platform posts.
 */
export async function getNextAvailableSlots(
  supabase: { from: (t: string) => any },
  businessId: string,
  platform: string,
  industry: string,
  count: number,
  fromDate: Date = new Date()
): Promise<string[]> {
  // Fetch existing scheduled post times for this platform
  const { data: existing } = await supabase
    .from('social_posts')
    .select('scheduled_for')
    .eq('business_id', businessId)
    .eq('platform', platform)
    .in('status', ['scheduled', 'approved'])
    .gte('scheduled_for', fromDate.toISOString())
    .limit(50)

  const occupied = (existing ?? [])
    .filter((p: any) => p.scheduled_for)
    .map((p: any) => new Date(p.scheduled_for).getTime())

  const slots: string[] = []
  const current = new Date(fromDate)

  while (slots.length < count) {
    const candidate = getBestSlotForPlatform(platform, industry, current)
    const candidateMs = new Date(candidate).getTime()

    // Check 2-hour gap from existing and from already-chosen slots
    const allOccupied = [...occupied, ...slots.map(s => new Date(s).getTime())]
    const tooClose = allOccupied.some(t => Math.abs(t - candidateMs) < 2 * 60 * 60 * 1000)

    if (!tooClose && new Date(candidate) > new Date()) {
      slots.push(candidate)
    }

    current.setDate(current.getDate() + 1)
    if (slots.length > count * 3) break // safety valve
  }

  return slots
}

/**
 * Reads published posts with engagement data and computes
 * average engagement per (platform, dayOfWeek, hour) bucket.
 */
export async function analyzeBestTimes(
  supabase: { from: (t: string) => any },
  businessId: string
): Promise<EngagementBucket[]> {
  const { data: posts } = await supabase
    .from('social_posts')
    .select('platform, published_at, engagement_data')
    .eq('business_id', businessId)
    .eq('status', 'published')
    .not('engagement_data', 'eq', '{}')
    .limit(200)

  if (!posts || posts.length === 0) return []

  const buckets: Record<string, { total: number; count: number }> = {}

  for (const post of posts) {
    if (!post.published_at) continue
    const dt = new Date(post.published_at)
    // Convert UTC to Melbourne local for bucketing
    const localHour = (dt.getUTCHours() + MELBOURNE_OFFSET_HOURS) % 24
    const dayOfWeek = new Date(dt.getTime() + MELBOURNE_OFFSET_HOURS * 3600000).getUTCDay()
    const key = `${post.platform}:${dayOfWeek}:${localHour}`

    const eng = post.engagement_data as { likes?: number; comments?: number; shares?: number; reach?: number } | null
    const score = (eng?.likes ?? 0) + (eng?.comments ?? 0) * 3 + (eng?.shares ?? 0) * 5

    if (!buckets[key]) buckets[key] = { total: 0, count: 0 }
    buckets[key].total += score
    buckets[key].count += 1
  }

  return Object.entries(buckets).map(([key, val]) => {
    const [platform, dow, hour] = key.split(':')
    return {
      platform,
      dayOfWeek: parseInt(dow),
      hour: parseInt(hour),
      avgEngagement: Math.round(val.total / val.count),
      sampleSize: val.count,
    }
  }).sort((a, b) => b.avgEngagement - a.avgEngagement)
}

// ── Formatting helpers (used by ContentCalendar) ──────────────────────────────

export function formatSlotTime(date: Date): string {
  return date.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true })
}

export function formatSlotDay(date: Date): string {
  return date.toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric' })
}

// ── Legacy export (ContentCalendar uses this) ─────────────────────────────────

export function getNextWeekSlots(
  industry: string,
  platforms: string[],
  existingScheduledTimes: Date[] = []
): ScheduleSlot[] {
  const cfg = getSocialIndustryConfig(industry)
  const slots: ScheduleSlot[] = []
  const now = new Date()

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const day = new Date(now)
    day.setDate(day.getDate() + dayOffset)
    const platform = platforms[dayOffset % platforms.length]

    const times = cfg.bestPostingTimes.filter(t => {
      const daySpecific = t.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s/)
      if (daySpecific) {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        return t.startsWith(days[day.getDay()])
      }
      return true
    })

    const timeStr = times[0]?.replace(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s/, '') ?? '12:00'
    const [hours, minutes] = timeStr.split(':').map(Number)
    const slotDate = new Date(day)
    slotDate.setHours(hours, minutes ?? 0, 0, 0)

    if (slotDate <= now) slotDate.setDate(slotDate.getDate() + 7)

    const isTaken = existingScheduledTimes.some(
      t => Math.abs(t.getTime() - slotDate.getTime()) < 30 * 60 * 1000
    )
    if (!isTaken) {
      slots.push({ platform, datetime: slotDate, reason: `Best time for ${industry} on ${platform}` })
    }
  }
  return slots
}