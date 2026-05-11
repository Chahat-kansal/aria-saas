/** Returns the current local hour (0–23) in the given IANA timezone. */
export function localHour(timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      hour: '2-digit',
    }).formatToParts(new Date())
    const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10)
    return h === 24 ? 0 : h  // Some runtimes emit 24 for midnight
  } catch {
    // Fall back to UTC if timezone string is unrecognised
    return new Date().getUTCHours()
  }
}

/** Returns today's local date string (YYYY-MM-DD) in the given timezone. */
export function localDateString(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date())
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
    return `${get('year')}-${get('month')}-${get('day')}`
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

export interface BriefingBusiness {
  id: string
  timezone: string | null
  closing_hour_local: number | null
  evening_briefing_lead_hours: number | null
  evening_briefing_enabled: boolean | null
  morning_briefing_enabled: boolean | null
}

export type BriefingTrigger = 'morning' | 'evening' | null

/**
 * Given a business, returns which briefing type (if any) should fire right now.
 * Morning = 2am local. Evening = (closing_hour_local - evening_briefing_lead_hours) local.
 * Returns null if this hour is not a trigger.
 */
export function checkBriefingTrigger(biz: BriefingBusiness): BriefingTrigger {
  const tz = biz.timezone || 'Australia/Melbourne'
  const hour = localHour(tz)

  if (biz.morning_briefing_enabled !== false && hour === 2) return 'morning'

  const close = biz.closing_hour_local ?? 21
  const lead  = biz.evening_briefing_lead_hours ?? 2
  const eveningHour = (close - lead + 24) % 24
  if (biz.evening_briefing_enabled !== false && hour === eveningHour) return 'evening'

  return null
}
