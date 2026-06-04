import { supabaseAdmin } from '@/lib/supabase-admin'
import type { AgentType, AgentRunResult } from './types'
import { BaseAgent } from './base-agent'

// Australian state school holiday dates 2026
const SCHOOL_HOLIDAYS_2026: Record<string, Array<{ start: Date; end: Date }>> = {
  VIC: [
    { start: new Date('2026-03-28'), end: new Date('2026-04-13') },
    { start: new Date('2026-06-27'), end: new Date('2026-07-13') },
    { start: new Date('2026-09-19'), end: new Date('2026-10-05') },
    { start: new Date('2026-12-18'), end: new Date('2027-01-27') },
  ],
  NSW: [
    { start: new Date('2026-04-09'), end: new Date('2026-04-24') },
    { start: new Date('2026-07-06'), end: new Date('2026-07-17') },
    { start: new Date('2026-09-28'), end: new Date('2026-10-09') },
    { start: new Date('2026-12-22'), end: new Date('2027-01-27') },
  ],
  QLD: [
    { start: new Date('2026-03-28'), end: new Date('2026-04-15') },
    { start: new Date('2026-06-20'), end: new Date('2026-07-05') },
    { start: new Date('2026-09-19'), end: new Date('2026-10-04') },
    { start: new Date('2026-12-12'), end: new Date('2027-01-25') },
  ],
  SA: [
    { start: new Date('2026-04-10'), end: new Date('2026-04-26') },
    { start: new Date('2026-07-04'), end: new Date('2026-07-19') },
    { start: new Date('2026-09-26'), end: new Date('2026-10-11') },
    { start: new Date('2026-12-19'), end: new Date('2027-01-27') },
  ],
  WA: [
    { start: new Date('2026-04-09'), end: new Date('2026-04-26') },
    { start: new Date('2026-07-04'), end: new Date('2026-07-17') },
    { start: new Date('2026-09-26'), end: new Date('2026-10-11') },
    { start: new Date('2026-12-17'), end: new Date('2027-01-31') },
  ],
  TAS: [
    { start: new Date('2026-04-09'), end: new Date('2026-04-26') },
    { start: new Date('2026-07-04'), end: new Date('2026-07-19') },
    { start: new Date('2026-09-26'), end: new Date('2026-10-11') },
    { start: new Date('2026-12-18'), end: new Date('2027-01-27') },
  ],
}

function weatherCodeToAdjustment(code: number): number {
  if (code === 0) return 5
  if (code >= 1 && code <= 3) return 3
  if (code >= 45 && code <= 48) return -5
  if (code >= 51 && code <= 57) return -10
  if (code >= 61 && code <= 67) return -15
  if (code >= 71 && code <= 77) return -30
  if (code >= 80 && code <= 82) return -12
  if (code >= 95 && code <= 99) return -25
  return 0
}

function isInHoliday(date: Date, holidays: Array<{ start: Date; end: Date }>): boolean {
  const t = date.getTime()
  return holidays.some(h => t >= h.start.getTime() && t <= h.end.getTime())
}

function roundToHalf(n: number): number {
  return Math.ceil(n * 2) / 2
}

interface StaffMember {
  id: string
  first_name: string
  last_name: string
  hourly_rate: number | null
  skills: string[] | null
  availability_days: number[] | null
  max_hours_per_week: number | null
  performance_score: number | null
  phone: string | null
  is_active: boolean
}

interface GapBlock {
  date: string
  start_hour: number
  end_hour: number
  gap: number
  estimated_cost: number
  rostered_staff_ids: string[]
}

export class LabourOptimisationAgent extends BaseAgent {
  type: AgentType = 'labour_optimisation'

  async run(business_id: string): Promise<AgentRunResult> {
    const t0 = Date.now()
    const errors: Error[] = []

    try {
      const settings = await this.getSettings(business_id)
      if (!settings.enabled) {
        return { decisions: [], errors: [], duration_ms: Date.now() - t0 }
      }

      const cfg = settings.config as {
        target_revenue_per_staff_hour?: number
        minimum_staff?: number
        labour_pct_threshold?: number
        target_labour_pct?: number
        mode?: string
      }
      const targetRevPerStaffHour = Number(cfg.target_revenue_per_staff_hour ?? 120)
      const minimumStaff = Number(cfg.minimum_staff ?? 1)
      const labourPctThreshold = Number(cfg.labour_pct_threshold ?? 38)
      const agentMode = String(cfg.mode ?? 'suggest')

      // STEP 1: Fetch business data
      const { data: biz } = await supabaseAdmin
        .from('businesses')
        .select('name,latitude,longitude,state,industry')
        .eq('id', business_id)
        .maybeSingle()
      if (!biz) return { decisions: [], errors: [], duration_ms: Date.now() - t0 }

      const lat = Number(biz.latitude ?? -33.8688)
      const lng = Number(biz.longitude ?? 151.2093)
      const state = String(biz.state ?? 'VIC').toUpperCase()
      const businessName = String(biz.name)
      const industry = String(biz.industry ?? 'retail')
      const holidays = SCHOOL_HOLIDAYS_2026[state] ?? SCHOOL_HOLIDAYS_2026.VIC

      const { data: staffRows } = await supabaseAdmin
        .from('staff_members')
        .select('id,first_name,last_name,hourly_rate,skills,availability_days,max_hours_per_week,performance_score,phone,is_active')
        .eq('business_id', business_id)
        .eq('is_active', true)

      const staff: StaffMember[] = (staffRows ?? []) as StaffMember[]
      const avgHourlyRate = staff.length > 0
        ? staff.reduce((s, m) => s + Number(m.hourly_rate ?? 25), 0) / staff.length
        : 25

      // STEP 2: Weather forecast from Open-Meteo
      let hourlyWeatherCodes: number[] = []
      try {
        const weatherUrl = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lng + '&hourly=weathercode&timezone=Australia%2FSydney&forecast_days=14'
        const weatherRes = await fetch(weatherUrl)
        if (weatherRes.ok) {
          const weatherData = await weatherRes.json() as { hourly?: { weathercode?: number[] } }
          hourlyWeatherCodes = weatherData.hourly?.weathercode ?? []
        }
      } catch { /* non-fatal — weather enrichment best-effort */ }

      // STEP 3: School holiday check already handled via `holidays` array above

      // STEP 4: Event adjustments
      const now = new Date()
      const twoWeeksOut = new Date(now.getTime() + 14 * 86400000).toISOString()
      const { data: events } = await supabaseAdmin
        .from('intelligence_events')
        .select('event_date,scale')
        .eq('business_id', business_id)
        .eq('event_type', 'local_event')
        .gte('event_date', now.toISOString().slice(0, 10))
        .lte('event_date', twoWeeksOut.slice(0, 10))
        .then(r => r, () => ({ data: null }))

      const eventByDate: Record<string, number> = {}
      for (const ev of events ?? []) {
        const adj = ev.scale === 'large' ? 50 : ev.scale === 'medium' ? 30 : 15
        const key = String(ev.event_date).slice(0, 10)
        eventByDate[key] = Math.max(eventByDate[key] ?? 0, adj)
      }

      // STEP 5: Build 14-day hourly forecast
      // Fetch historical POS sales (last 12 weeks)
      const twelveWeeksAgo = new Date(now.getTime() - 84 * 86400000).toISOString()
      const { data: historicalSales } = await supabaseAdmin
        .from('pos_sales')
        .select('total_amount,created_at')
        .eq('business_id', business_id)
        .gte('created_at', twelveWeeksAgo)
        .neq('status', 'voided')

      // Build lookup: dow -> hour -> [revenue values]
      const historicalByDowHour: Record<string, number[]> = {}
      for (const sale of historicalSales ?? []) {
        const d = new Date(sale.created_at)
        const saleDow = (d.getDay() + 6) % 7
        const saleHour = d.getHours()
        const key = saleDow + ':' + saleHour
        if (!historicalByDowHour[key]) historicalByDowHour[key] = []
        historicalByDowHour[key].push(Number(sale.total_amount ?? 0))
      }

      function median(arr: number[]): number {
        if (arr.length === 0) return 0
        const sorted = [...arr].sort((a, b) => a - b)
        const mid = Math.floor(sorted.length / 2)
        return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
      }

      const forecastRows: Record<string, unknown>[] = []
      const forecastByDateHour: Record<string, { required: number; revenue: number }> = {}

      for (let d = 1; d <= 14; d++) {
        const forecastDate = new Date(now.getTime() + d * 86400000)
        const dateStr = forecastDate.toISOString().slice(0, 10)
        const dow = (forecastDate.getDay() + 6) % 7
        const inHoliday = isInHoliday(forecastDate, holidays)
        const eventAdj = eventByDate[dateStr] ?? 0

        for (let h = 0; h < 24; h++) {
          const weatherIdx = (d - 1) * 24 + h
          const weatherCode = hourlyWeatherCodes[weatherIdx] ?? 0
          const weatherAdj = weatherCodeToAdjustment(weatherCode)
          const holidayAdj = inHoliday
            ? ['cafe', 'retail', 'restaurant', 'bakery'].includes(industry) ? 20 : -10
            : 0

          const key = dow + ':' + h
          const historicalRevs = historicalByDowHour[key] ?? []
          const baseRevenue = historicalRevs.length >= 3
            ? median(historicalRevs)
            : (historicalByDowHour[dow + ':avg'] ? median(historicalByDowHour[dow + ':avg']) : 0)

          const totalAdjPct = 1 + (weatherAdj + holidayAdj + eventAdj) / 100
          const adjustedRevenue = baseRevenue * Math.max(0, totalAdjPct)
          const rawRequired = adjustedRevenue / targetRevPerStaffHour
          const requiredStaff = Math.max(minimumStaff, roundToHalf(rawRequired))
          const optimalCost = requiredStaff * avgHourlyRate

          forecastByDateHour[dateStr + ':' + h] = { required: requiredStaff, revenue: adjustedRevenue }

          forecastRows.push({
            business_id,
            forecast_date: dateStr,
            hour_of_day: h,
            day_of_week: dow,
            predicted_revenue: Math.round(baseRevenue * 100) / 100,
            weather_adjustment_pct: weatherAdj,
            event_adjustment_pct: eventAdj,
            school_holiday_adjustment_pct: holidayAdj,
            adjusted_predicted_revenue: Math.round(adjustedRevenue * 100) / 100,
            required_staff_count: requiredStaff,
            optimal_labour_cost: Math.round(optimalCost * 100) / 100,
          })
        }
      }

      // Batch upsert forecast
      for (let i = 0; i < forecastRows.length; i += 100) {
        await supabaseAdmin
          .from('labour_demand_forecast')
          .upsert(forecastRows.slice(i, i + 100), { onConflict: 'business_id,forecast_date,hour_of_day' })
      }

      // STEP 6: Fetch current roster (pos_timesheets next 14 days)
      const twoWeeksOutDt = new Date(now.getTime() + 14 * 86400000).toISOString()
      const { data: timesheets } = await supabaseAdmin
        .from('pos_timesheets')
        .select('staff_member_id,clock_in,clock_out,hours_worked')
        .eq('business_id', business_id)
        .gte('clock_in', now.toISOString())
        .lte('clock_in', twoWeeksOutDt)

      // Build roster: date+hour -> staff IDs
      const rosterByDateHour: Record<string, Set<string>> = {}
      for (const ts of timesheets ?? []) {
        if (!ts.staff_member_id || !ts.clock_in) continue
        const inTime = new Date(ts.clock_in)
        const outTime = ts.clock_out ? new Date(ts.clock_out) : new Date(inTime.getTime() + 8 * 3600000)
        const dateStr = inTime.toISOString().slice(0, 10)
        const startH = inTime.getHours()
        const endH = outTime.getHours()
        for (let h = startH; h <= Math.min(endH, 23); h++) {
          const key = dateStr + ':' + h
          if (!rosterByDateHour[key]) rosterByDateHour[key] = new Set()
          rosterByDateHour[key].add(ts.staff_member_id)
        }
      }

      // STEP 7: Gap analysis — group contiguous blocks
      const overstaffedBlocks: GapBlock[] = []
      const understaffedBlocks: GapBlock[] = []

      for (let d = 1; d <= 14; d++) {
        const forecastDate = new Date(now.getTime() + d * 86400000)
        const dateStr = forecastDate.toISOString().slice(0, 10)
        let currentBlock: GapBlock | null = null
        let blockType: 'over' | 'under' | null = null

        for (let h = 6; h <= 22; h++) {
          const fKey = dateStr + ':' + h
          const forecast = forecastByDateHour[fKey]
          if (!forecast) continue
          const rostered = rosterByDateHour[fKey]?.size ?? 0
          const required = forecast.required
          const gap = rostered - required

          const newType: 'over' | 'under' | null = gap > 0.4 ? 'over' : gap < -0.4 ? 'under' : null

          if (newType && newType === blockType && currentBlock) {
            currentBlock.end_hour = h + 1
            currentBlock.gap += Math.abs(gap)
            currentBlock.estimated_cost += Math.abs(gap) * avgHourlyRate
            if (rostered > 0) {
              for (const sid of rosterByDateHour[fKey] ?? []) {
                if (!currentBlock.rostered_staff_ids.includes(sid)) {
                  currentBlock.rostered_staff_ids.push(sid)
                }
              }
            }
          } else {
            if (currentBlock && blockType === 'over') overstaffedBlocks.push(currentBlock)
            if (currentBlock && blockType === 'under') understaffedBlocks.push(currentBlock)
            if (newType) {
              currentBlock = {
                date: dateStr, start_hour: h, end_hour: h + 1,
                gap: Math.abs(gap), estimated_cost: Math.abs(gap) * avgHourlyRate,
                rostered_staff_ids: [...(rosterByDateHour[fKey] ?? [])],
              }
              blockType = newType
            } else {
              currentBlock = null
              blockType = null
            }
          }
        }
        if (currentBlock && blockType === 'over') overstaffedBlocks.push(currentBlock)
        if (currentBlock && blockType === 'under') understaffedBlocks.push(currentBlock)
      }

      const decisions: Parameters<typeof this.saveDecisions>[0] = []

      // STEP 8: Early finish offers
      for (const block of overstaffedBlocks) {
        const blockHours = block.end_hour - block.start_hour
        if (block.estimated_cost < 30 || blockHours < 1.5) continue
        if (block.rostered_staff_ids.length === 0) continue

        const candidates = staff
          .filter(s => block.rostered_staff_ids.includes(s.id))
          .sort((a, b) => (a.performance_score ?? 0.7) - (b.performance_score ?? 0.7))
        const target = candidates[0]
        if (!target) continue

        const saving = blockHours * Number(target.hourly_rate ?? 25)
        const dayName = new Date(block.date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'long' })
        const firstName = target.first_name
        const msg = 'Hi ' + firstName + '! ' + dayName + ' ' + block.start_hour + 'pm is looking quiet at ' + businessName + '. Would you like to finish at ' + block.start_hour + 'pm instead of ' + block.end_hour + 'pm? Your weekly pay won\'t be affected — we\'ll schedule you extra hours next week 💚'

        await supabaseAdmin.from('labour_optimisation_actions').insert({
          business_id,
          action_type: 'early_finish_offer',
          staff_member_id: target.id,
          target_date: block.date,
          target_hour_start: block.start_hour,
          target_hour_end: block.end_hour,
          message_sent: msg,
          reasoning: 'Overstaffed by ' + block.gap.toFixed(1) + ' staff × ' + blockHours + 'h — estimated waste $' + block.estimated_cost.toFixed(0),
          staff_response: 'pending',
          labour_cost_saving: Math.round(saving * 100) / 100,
        })

        if (agentMode === 'auto' && target.phone && process.env.TWILIO_ACCOUNT_SID) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const twilio = require('twilio') as { default: (sid: string, token: string | undefined) => { messages: { create: (opts: Record<string, string>) => Promise<unknown> } } }
            const client = twilio.default(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
            await client.messages.create({ body: msg, from: process.env.TWILIO_FROM_NUMBER ?? '', to: target.phone })
          } catch { /* SMS non-fatal — twilio may not be installed */ }
        }

        decisions.push({
          agent_type: 'labour_optimisation',
          business_id,
          decision_data: { action_type: 'early_finish_offer', staff_name: firstName, date: block.date, start: block.start_hour, end: block.end_hour, saving },
          reasoning: 'Overstaffed block detected — early finish offer to ' + firstName,
          confidence_score: 0.8,
          projected_impact_cents: Math.round(saving * 100),
          expires_at: new Date(block.date + 'T' + block.start_hour + ':00:00').toISOString(),
        })
      }

      // STEP 9: Shift offers for understaffed blocks
      for (const block of understaffedBlocks) {
        const blockHours = block.end_hour - block.start_hour
        if (blockHours < 1) continue

        const blockDate = new Date(block.date + 'T12:00:00')
        const dow = (blockDate.getDay() + 6) % 7

        const available = staff
          .filter(s => {
            const avDays = s.availability_days ?? [0, 1, 2, 3, 4, 5, 6]
            if (!avDays.includes(dow)) return false
            if (block.rostered_staff_ids.includes(s.id)) return false
            return true
          })
          .sort((a, b) => {
            const perf = (b.performance_score ?? 0.7) - (a.performance_score ?? 0.7)
            if (Math.abs(perf) > 0.05) return perf
            return Number(a.hourly_rate ?? 25) - Number(b.hourly_rate ?? 25)
          })

        if (available.length === 0) {
          await supabaseAdmin.from('labour_optimisation_actions').insert({
            business_id,
            action_type: 'understaffed_alert',
            staff_member_id: null,
            target_date: block.date,
            target_hour_start: block.start_hour,
            target_hour_end: block.end_hour,
            reasoning: 'Understaffed ' + block.gap.toFixed(1) + ' staff — no available staff to fill',
          })
          continue
        }

        const target = available[0]
        const estPay = Number(target.hourly_rate ?? 25) * blockHours
        const dayName = blockDate.toLocaleDateString('en-AU', { weekday: 'long' })
        const msg = 'Hi ' + target.first_name + '! A shift is available at ' + businessName + ' on ' + dayName + ' ' + block.start_hour + ':00–' + block.end_hour + ':00. Pay: $' + estPay.toFixed(0) + ' ($' + (target.hourly_rate ?? 25) + '/hr). Reply YES to confirm ✅'

        await supabaseAdmin.from('labour_optimisation_actions').insert({
          business_id,
          action_type: 'shift_offer',
          staff_member_id: target.id,
          target_date: block.date,
          target_hour_start: block.start_hour,
          target_hour_end: block.end_hour,
          message_sent: msg,
          reasoning: 'Understaffed by ' + block.gap.toFixed(1) + ' — shift offered to ' + target.first_name + ' (score: ' + (target.performance_score ?? 0.7) + ')',
          staff_response: 'pending',
          labour_cost_saving: 0,
        })

        if (agentMode === 'auto' && target.phone && process.env.TWILIO_ACCOUNT_SID) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const twilio = require('twilio') as { default: (sid: string, token: string | undefined) => { messages: { create: (opts: Record<string, string>) => Promise<unknown> } } }
            const client = twilio.default(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
            await client.messages.create({ body: msg, from: process.env.TWILIO_FROM_NUMBER ?? '', to: target.phone })
          } catch { /* SMS non-fatal — twilio may not be installed */ }
        }
      }

      // STEP 10: Real-time labour % monitoring
      const midnight = new Date(now)
      midnight.setHours(0, 0, 0, 0)

      const [activeStaffRes, revTodayRes] = await Promise.all([
        supabaseAdmin
          .from('pos_timesheets')
          .select('clock_in,staff_member_id,staff_members(hourly_rate)')
          .eq('business_id', business_id)
          .is('clock_out', null),
        supabaseAdmin
          .from('pos_sales')
          .select('total_amount')
          .eq('business_id', business_id)
          .gte('created_at', midnight.toISOString())
          .neq('status', 'voided'),
      ])

      const nowSec = now.getTime() / 1000
      let activeLaborCost = 0
      for (const ts of activeStaffRes.data ?? []) {
        if (!ts.clock_in) continue
        const hoursElapsed = (nowSec - new Date(ts.clock_in).getTime() / 1000) / 3600
        const rate = Number((ts as { staff_members?: { hourly_rate?: number } }).staff_members?.hourly_rate ?? avgHourlyRate)
        activeLaborCost += hoursElapsed * rate
      }
      const revenueToday = (revTodayRes.data ?? []).reduce((s: number, r: { total_amount: number }) => s + Number(r.total_amount ?? 0), 0)
      const labourPct = revenueToday > 0 ? (activeLaborCost / revenueToday) * 100 : 0

      if (labourPct > labourPctThreshold) {
        const activeCount = (activeStaffRes.data ?? []).length
        const alertMsg = 'Labour cost is ' + labourPct.toFixed(1) + '% of today\'s revenue. Target: ' + labourPctThreshold + '%. ' + activeCount + ' staff clocked in. Options: (1) Send 1 staff home early, (2) Run a flash promotion to increase revenue.'
        const aiLabourReasoning = await this.claudeStructured<{ reasoning: string; priority_action: string }>({
          system: 'You are a labour cost advisor for an Australian small business. Give a 1-sentence recommendation prioritising the most impactful action to take right now.',
          user: JSON.stringify({
            labour_pct: labourPct.toFixed(1),
            threshold_pct: labourPctThreshold,
            revenue_today: Math.round(revenueToday),
            active_staff: activeCount,
            avg_hourly_rate: Math.round(avgHourlyRate),
          }),
          maxTokens: 100,
          agent_key: 'labour_optimisation',
          role: 'forecast',
          business_id,
        });
        await supabaseAdmin.from('labour_optimisation_actions').insert({
          business_id,
          action_type: 'labour_pct_alert',
          staff_member_id: null,
          target_date: now.toISOString().slice(0, 10),
          reasoning: alertMsg,
          message_sent: alertMsg,
        })
        decisions.push({
          agent_type: 'labour_optimisation',
          business_id,
          decision_data: { action_type: 'labour_pct_alert', labour_pct: labourPct, threshold: labourPctThreshold, revenue_today: revenueToday, active_staff: activeCount, priority_action: aiLabourReasoning?.priority_action },
          reasoning: aiLabourReasoning?.reasoning ?? alertMsg,
          confidence_score: 0.95,
          projected_impact_cents: 0,
          expires_at: new Date(now.getTime() + 4 * 3600000).toISOString(),
        })
      }

      // STEP 11: What-if retrospective (only on Sunday)
      if (now.getDay() === 0) {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10)
        const { data: lastWeekForecasts } = await supabaseAdmin
          .from('labour_demand_forecast')
          .select('actual_labour_cost,optimal_labour_cost,actual_revenue,adjusted_predicted_revenue,required_staff_count,actual_staff_count')
          .eq('business_id', business_id)
          .gte('forecast_date', sevenDaysAgo)
          .lt('forecast_date', now.toISOString().slice(0, 10))
          .not('actual_revenue', 'is', null)

        if (lastWeekForecasts && lastWeekForecasts.length > 0) {
          let overstaffedHours = 0, costWaste = 0, understaffedHours = 0, revRisk = 0
          for (const f of lastWeekForecasts) {
            const actual = Number(f.actual_staff_count ?? 0)
            const required = Number(f.required_staff_count ?? 0)
            if (actual > required + 0.4) {
              overstaffedHours++
              costWaste += (actual - required) * avgHourlyRate
            } else if (actual < required - 0.4) {
              understaffedHours++
              revRisk += Number(f.adjusted_predicted_revenue ?? 0) * 0.15
            }
          }
          const potentialSaving = costWaste + revRisk
          await supabaseAdmin.from('agent_settings').upsert({
            business_id,
            agent_type: 'labour_optimisation',
            config: { ...settings.config, last_week_potential_saving: potentialSaving, last_week_overstaffed_hours: overstaffedHours, last_week_understaffed_hours: understaffedHours },
          }, { onConflict: 'business_id,agent_type' })
        }
      }

      // STEP 12: Fill in actuals for yesterday
      const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10)
      const { data: yesterdayForecasts } = await supabaseAdmin
        .from('labour_demand_forecast')
        .select('id,hour_of_day')
        .eq('business_id', business_id)
        .eq('forecast_date', yesterday)
        .is('actual_revenue', null)

      for (const f of yesterdayForecasts ?? []) {
        const hourStart = new Date(yesterday + 'T' + String(f.hour_of_day).padStart(2, '0') + ':00:00.000Z')
        const hourEnd = new Date(hourStart.getTime() + 3600000)
        const [salesRes, tsRes] = await Promise.all([
          supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', business_id).gte('created_at', hourStart.toISOString()).lt('created_at', hourEnd.toISOString()).neq('status', 'voided'),
          supabaseAdmin.from('pos_timesheets').select('staff_member_id').eq('business_id', business_id).lte('clock_in', hourEnd.toISOString()).or('clock_out.gte.' + hourStart.toISOString() + ',clock_out.is.null'),
        ])
        const actualRevenue = (salesRes.data ?? []).reduce((s: number, r: { total_amount: number }) => s + Number(r.total_amount ?? 0), 0)
        const actualStaffCount = (tsRes.data ?? []).length
        const update: Record<string, unknown> = {
          actual_revenue: actualRevenue,
          actual_staff_count: actualStaffCount,
          actual_labour_cost: actualStaffCount * avgHourlyRate,
        }
        if (actualRevenue > 0) {
          update.forecast_accuracy_pct = 0
        }
        await supabaseAdmin.from('labour_demand_forecast').update(update).eq('id', f.id)
      }

      const savedDecisions = await this.saveDecisions(decisions)
      await this.logRun(business_id, { decisions: savedDecisions, errors, duration_ms: Date.now() - t0 })
      return { decisions: savedDecisions, errors, duration_ms: Date.now() - t0 }
    } catch (e: unknown) {
      errors.push(e instanceof Error ? e : new Error(String(e)))
      return { decisions: [], errors, duration_ms: Date.now() - t0 }
    }
  }
}
