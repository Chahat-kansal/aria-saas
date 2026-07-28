export type JobStatus = 'queued' | 'running' | 'needs_input' | 'done' | 'failed' | 'cancelled'

export interface JobStep {
  label: string
  state: 'pending' | 'active' | 'done' | 'failed'
}

export interface OwnerJob {
  id: string
  business_id: string
  title: string
  task_prompt: string
  spec: Record<string, unknown>
  status: JobStatus
  steps: JobStep[]
  progress_step: number
  output_id: string | null
  schedule: string | null
  enabled: boolean
  created_by: string
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  last_run_at: string | null
  error_message: string | null
}

export function toOwnerJob(row: Record<string, unknown>): OwnerJob {
  return {
    id: row.id as string,
    business_id: row.business_id as string,
    title: row.title as string,
    task_prompt: row.task_prompt as string,
    spec: (row.spec as Record<string, unknown>) ?? {},
    status: (row.status as JobStatus) ?? 'queued',
    steps: (row.steps as JobStep[]) ?? [],
    progress_step: (row.progress_step as number) ?? 0,
    output_id: (row.output_id as string) ?? null,
    schedule: (row.schedule as string) ?? null,
    enabled: row.enabled !== false,
    created_by: (row.created_by as string) ?? 'owner',
    started_at: (row.started_at as string) ?? null,
    completed_at: (row.completed_at as string) ?? null,
    created_at: row.created_at as string,
    updated_at: (row.updated_at as string) ?? (row.created_at as string),
    last_run_at: (row.last_run_at as string) ?? null,
    error_message: (row.error_message as string) ?? null,
  }
}

// Human-readable cadence label for the Jobs tab's STANDING section (e.g. "sun_20:00" -> "Sunday 8pm").
const DAY_LABELS: Record<string, string> = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' }
export function formatSchedule(schedule: string | null): string {
  if (!schedule) return ''
  if (schedule === 'quarterly') return 'Quarterly'
  const m = schedule.match(/^([a-z]{3})_(\d{2}):(\d{2})$/)
  if (!m) return schedule
  const [, day, hh, mm] = m
  const hour = parseInt(hh, 10)
  const ampm = hour >= 12 ? 'pm' : 'am'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return (DAY_LABELS[day] ?? day) + ' ' + hour12 + (mm === '00' ? '' : ':' + mm) + ampm
}

/** True when a standing job (schedule set) is due to run today, given its last_run_at. Day-level
 * granularity only — the stated hour is a display label for when the owner should expect
 * results, not a strict cron-precision requirement (the scan itself runs once/day, RULE4 daily-max). */
export function isStandingJobDueToday(job: { schedule: string | null; enabled: boolean; last_run_at: string | null }, now = new Date()): boolean {
  if (!job.enabled || !job.schedule) return false
  const alreadyRanToday = job.last_run_at ? new Date(job.last_run_at).toDateString() === now.toDateString() : false
  if (alreadyRanToday) return false
  if (job.schedule === 'quarterly') {
    // Due on the 1st of Jan/Apr/Jul/Oct, matching this codebase's existing onUTCDate(1)-style
    // monthly gating convention (src/app/api/cron/dispatch/h20/route.ts), extended to quarter-months.
    return now.getUTCDate() === 1 && [0, 3, 6, 9].includes(now.getUTCMonth())
  }
  const m = job.schedule.match(/^([a-z]{3})_(\d{2}):(\d{2})$/)
  if (!m) return false
  const [, day] = m
  const DAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
  return now.getUTCDay() === DAY_INDEX[day]
}
