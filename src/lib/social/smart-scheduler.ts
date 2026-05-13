import { getSocialIndustryConfig } from './industry-prompts'

export interface ScheduleSlot {
  platform: string
  datetime: Date
  reason: string
}

/**
 * Given an industry and connected platforms, returns the next
 * 7 optimal posting slots (one per day, best time per platform).
 *
 * Uses bestPostingTimes from SOCIAL_INDUSTRY_CONFIGS.
 * Avoids slots already taken by existing scheduled posts (30-min buffer).
 */
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

    // Filter times: include generic HH:MM times, plus day-specific ones that match today
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

    if (slotDate <= now) {
      slotDate.setDate(slotDate.getDate() + 7)
    }

    const isTaken = existingScheduledTimes.some(
      t => Math.abs(t.getTime() - slotDate.getTime()) < 30 * 60 * 1000
    )

    if (!isTaken) {
      slots.push({
        platform,
        datetime: slotDate,
        reason: `Best time for ${industry} on ${platform}`,
      })
    }
  }

  return slots
}

export function formatSlotTime(date: Date): string {
  return date.toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

export function formatSlotDay(date: Date): string {
  return date.toLocaleDateString('en-AU', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}