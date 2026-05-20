import { callAnthropic } from '@/lib/aria/providers/anthropic'
import { parseLLMJsonOr } from '@/lib/ai-json'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { ShiftEntry } from '@/lib/staff/roster'

const ROSTERING_SYSTEM = `You are Aria's rostering specialist for an Australian SMB.
Generate a practical week roster from sales patterns, staffing rules, and available staff.

RULES:
1. Never schedule a staff member for more than 10 hours in a day.
2. Never schedule more than 38 hours per week for full-time staff. Casual/part-time: max 25h/week.
3. Always meet minimum staffing rules per hour.
4. Revenue-first: match staff levels to expected sales velocity.
5. Morning: lighter staffing. Lunch + afternoon: peak staffing.
6. Match staff roles/skills to shift requirements when possible.
7. Return ONLY valid JSON — a ShiftEntry array.
8. Use real staff from the provided list. Never invent staff.

Each ShiftEntry MUST include:
  id (e.g. 'ai-1', 'ai-2'...), staff_member_id, staff_name, staff_color,
  outlet_id, area_id: null, area_name: null, role (staff member's position),
  start_time (ISO datetime), end_time (ISO datetime),
  break_minutes (30 for shifts >5h else 0), hours (computed),
  cost_cents: 0, notes: null, ai_generated: true,
  confirmed_by_staff: false, status: "scheduled"

Return JSON: {"shifts": [...], "reasoning": "brief explanation"}`

export async function generateRosterDraft(
  businessId: string,
  weekStart: string,
  outletId: string | null,
): Promise<{ shifts: ShiftEntry[]; reasoning: string; cost_cents: number }> {
  const supabase = createServerSupabaseClient()

  const [staffQ, rulesQ, salesQ] = await Promise.all([
    supabaseAdmin.from('staff_members')
      .select('id,first_name,last_name,position,employment_type,color,pay_rate_cents')
      .eq('business_id', businessId).eq('status', 'active').limit(30),
    supabaseAdmin.from('pos_staffing_rules')
      .select('day_of_week,hour_of_day,min_staff,required_role')
      .eq('business_id', businessId).order('day_of_week').order('hour_of_day'),
    supabaseAdmin.from('pos_sales')
      .select('total_amount,created_at')
      .eq('business_id', businessId)
      .neq('status', 'voided')
      .gte('created_at', new Date(Date.now() - 56 * 86400_000).toISOString())
      .limit(5000),
  ])

  const staff = staffQ.data ?? []
  const rules = rulesQ.data ?? []
  const sales = salesQ.data ?? []

  // Aggregate avg sales by day-of-week + hour
  const salesByKey: Record<string, number[]> = {}
  for (const s of sales) {
    const d = new Date(String(s.created_at))
    const key = `${d.getDay()}-${d.getHours()}`
    if (!salesByKey[key]) salesByKey[key] = []
    salesByKey[key].push(Number(s.total_amount) || 0)
  }
  const topHours = Object.entries(salesByKey)
    .map(([k, v]) => ({ key: k, avg: v.reduce((a, b) => a + b, 0) / v.length }))
    .sort((a, b) => b.avg - a.avg).slice(0, 8)
    .map(({ key, avg }) => {
      const [dow, hr] = key.split('-').map(Number)
      const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
      return `${days[dow]} ${hr}:00 avg $${avg.toFixed(0)}`
    })

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + 'T12:00:00Z'); d.setDate(d.getDate() + i)
    return d.toISOString().slice(0, 10)
  })

  const userPrompt = `Week to roster: ${weekStart} (${weekDays.join(', ')})
Outlet ID: ${outletId ?? 'default'}

STAFF:
${staff.map(s => `- ${s.first_name} ${s.last_name} | ${s.position} | ${s.employment_type} | color:${s.color ?? '#6366f1'} | id:${s.id}`).join('\n')}

STAFFING RULES:
${rules.map(r => `Day ${r.day_of_week} at ${r.hour_of_day}:00 — min ${r.min_staff}${r.required_role ? ` (${r.required_role})` : ''}`).join('\n') || 'No rules — use business judgment.'}

TOP REVENUE HOURS (8 weeks):
${topHours.join('\n') || 'Insufficient data — use typical retail patterns.'}

Generate practical roster for 5-6 days. Return JSON: {"shifts": [...], "reasoning": "2-3 sentences"}`

  const result = await callAnthropic<{ shifts: ShiftEntry[]; reasoning: string }>(
    {
      model: 'haiku',
      systemPrompt: ROSTERING_SYSTEM,
      userPrompt,
      maxTokens: 1500,
      businessId,
      agentKey: 'rostering',
      role: 'agent',
    },
    { shifts: [], reasoning: 'Could not generate roster — try again.' },
  )

  const parsed = parseLLMJsonOr<{ shifts?: unknown[]; reasoning?: string }>(result.raw, {}, 'rostering/draft')
  const rawShifts = Array.isArray(parsed.shifts) ? parsed.shifts : (Array.isArray(result.data.shifts) ? result.data.shifts : [])

  const shifts = rawShifts.map((s, i) => {
    const sh = s as Record<string, unknown>
    return {
      id: String(sh.id ?? `ai-${i + 1}`),
      staff_member_id: String(sh.staff_member_id ?? ''),
      staff_name: String(sh.staff_name ?? ''),
      staff_color: String(sh.staff_color ?? '#6366f1'),
      outlet_id: sh.outlet_id ? String(sh.outlet_id) : null,
      area_id: null,
      area_name: null,
      role: sh.role ? String(sh.role) : null,
      start_time: String(sh.start_time ?? ''),
      end_time: String(sh.end_time ?? ''),
      break_minutes: Number(sh.break_minutes) || 0,
      hours: Number(sh.hours) || 0,
      cost_cents: 0,
      notes: null,
      ai_generated: true,
      confirmed_by_staff: false,
      status: 'scheduled' as const,
    } satisfies ShiftEntry
  }).filter(s => s.staff_member_id && s.start_time && s.end_time)

  return {
    shifts,
    reasoning: String(parsed.reasoning ?? result.data.reasoning ?? ''),
    cost_cents: result.cost_cents,
  }
}
