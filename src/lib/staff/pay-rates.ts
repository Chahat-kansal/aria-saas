import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function resolveHourlyRateCents(
  businessId: string,
  staffMemberId: string,
  onDate: Date,
  atTime?: string,
): Promise<number> {
  const supabase = createServerSupabaseClient()
  const dateStr = onDate.toISOString().slice(0, 10)
  const dayIndex = onDate.getDay()

  const { data: rates } = await supabase
    .from('staff_pay_rates')
    .select('*')
    .eq('business_id', businessId)
    .eq('staff_member_id', staffMemberId)
    .lte('effective_from', dateStr)
    .or(`effective_until.is.null,effective_until.gte.${dateStr}`)
    .order('effective_from', { ascending: false })

  if (!rates || rates.length === 0) {
    const { data: sm } = await supabase.from('staff_members')
      .select('pay_rate_cents').eq('id', staffMemberId).maybeSingle()
    return Number(sm?.pay_rate_cents) || 0
  }

  const isWeekend = dayIndex === 0 || dayIndex === 6
  const matchesDay = (r: Record<string, unknown>) => {
    const days = r.applies_to_days as number[] | null
    if (!days || days.length === 0) return true
    return days.includes(dayIndex)
  }

  if (atTime) {
    const evening = rates.find(r =>
      String(r.rate_type) === 'evening' &&
      r.applies_from_time && r.applies_until_time &&
      atTime >= String(r.applies_from_time) &&
      atTime <= String(r.applies_until_time) &&
      matchesDay(r as Record<string, unknown>)
    )
    if (evening) return Number(evening.hourly_rate_cents) || 0
  }

  const weekend = isWeekend
    ? rates.find(r => String(r.rate_type) === 'weekend' && matchesDay(r as Record<string, unknown>))
    : null
  if (weekend) return Number(weekend.hourly_rate_cents) || 0

  const weekday = !isWeekend
    ? rates.find(r => String(r.rate_type) === 'weekday' && matchesDay(r as Record<string, unknown>))
    : null
  if (weekday) return Number(weekday.hourly_rate_cents) || 0

  const defaultRate = rates.find(r => String(r.rate_type) === 'default')
  if (defaultRate) return Number(defaultRate.hourly_rate_cents) || 0

  return Number(rates[0].hourly_rate_cents) || 0
}

export function centsToDisplay(cents: number): string {
  return ((Number(cents) || 0) / 100).toFixed(2)
}

export function dollarsToCents(dollars: number | string): number {
  return Math.round((Number(dollars) || 0) * 100)
}
