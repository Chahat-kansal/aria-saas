import { parseLLMJsonOr } from '@/lib/ai-json'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { ShiftEntry } from '@/lib/staff/roster'

const ROSTERING_SYSTEM = `You are Aria's rostering specialist for an Australian SMB.
Generate a practical week roster from sales patterns, staffing rules, and available staff.

RULES:
1. Never schedule more than 10 hours in a day per staff member.
2. Full-time max 38h/week. Casual/part-time max 25h/week.
3. Match staff levels to expected sales velocity.
4. Morning: lighter staffing. Lunch + afternoon: peak staffing.
5. Use real staff from the provided list only. Never invent staff.
6. Return ONLY valid JSON — no markdown, no explanation.
7. Never schedule staff who are on approved leave — skip them entirely for those dates.
8. Respect availability: don't schedule staff outside their available hours or on unavailable days.
9. Prefer staff whose skills match the required role when skill data is provided.

Each ShiftEntry MUST include:
  id (e.g. 'ai-1'), staff_member_id, staff_name, staff_color,
  outlet_id, area_id: null, area_name: null, role,
  start_time (ISO datetime), end_time (ISO datetime),
  break_minutes (30 for shifts >5h else 0), hours (number),
  cost_cents: 0, notes: null, ai_generated: true,
  confirmed_by_staff: false, status: "scheduled"

Return JSON: {"shifts": [...], "reasoning": "brief explanation"}`

export async function generateRosterDraft(
  businessId: string,
  weekStart: string,
  outletId: string | null,
): Promise<{ shifts: ShiftEntry[]; reasoning: string; cost_cents: number; conflicts: string[] }> {
  const [wy, wm, wd] = weekStart.split('-').map(Number)
  const weekEnd = new Date(Date.UTC(wy, wm - 1, wd + 6)).toISOString().slice(0, 10)

  const [staffQ, rulesQ, salesQ, leaveQ, availQ, skillsQ] = await Promise.all([
    supabaseAdmin.from('staff_members')
      .select('id,first_name,last_name,position,employment_type,color,pay_rate_cents')
      .eq('business_id', businessId).eq('status', 'active').limit(50),
    supabaseAdmin.from('pos_staffing_rules')
      .select('day_of_week,hour_of_day,min_staff,required_role')
      .eq('business_id', businessId).order('day_of_week').order('hour_of_day'),
    supabaseAdmin.from('pos_sales')
      .select('total_amount,created_at')
      .eq('business_id', businessId)
      .neq('status', 'voided')
      .gte('created_at', new Date(Date.now() - 56 * 86400_000).toISOString())
      .limit(2000),
    supabaseAdmin.from('staff_leave')
      .select('staff_id,start_date,end_date,leave_type')
      .eq('business_id', businessId)
      .eq('status', 'approved')
      .lte('start_date', weekEnd)
      .gte('end_date', weekStart),
    supabaseAdmin.from('staff_availability')
      .select('staff_member_id,day_of_week,available,start_time,end_time')
      .eq('business_id', businessId),
    supabaseAdmin.from('staff_members')
      .select('id,staff_member_skills(staff_skills(name))')
      .eq('business_id', businessId)
      .eq('status', 'active')
      .limit(50),
  ])

  const staff = staffQ.data ?? []
  const rules = rulesQ.data ?? []
  const sales = salesQ.data ?? []
  const approvedLeave = leaveQ.data ?? []
  const avail = availQ.data ?? []

  const memberSkillMap: Record<string, string[]> = {}
  for (const sm of skillsQ.data ?? []) {
    const skills = ((sm.staff_member_skills as unknown) as Array<{ staff_skills: { name: string } | null }> ?? [])
      .map(sk => sk.staff_skills?.name).filter((n): n is string => Boolean(n))
    if (skills.length) memberSkillMap[String(sm.id)] = skills
  }

  if (staff.length === 0) {
    return { shifts: [], reasoning: 'No active staff found — add staff members first.', cost_cents: 0, conflicts: [] }
  }

  // Aggregate avg sales by day-of-week
  const salesByDay: Record<number, number[]> = {}
  for (const s of sales) {
    const dow = new Date(String(s.created_at)).getDay()
    if (!salesByDay[dow]) salesByDay[dow] = []
    salesByDay[dow].push(Number(s.total_amount) || 0)
  }
  // Hourly sales pattern
  const salesByHour: Record<number, number[]> = {}
  for (const s of sales) {
    const hour = new Date(String(s.created_at)).getHours()
    if (!salesByHour[hour]) salesByHour[hour] = []
    salesByHour[hour].push(Number(s.total_amount) || 0)
  }
  const topHours = Object.entries(salesByHour)
    .map(([h, vals]) => {
      const avg = vals.reduce((a: number, b: number) => a + b, 0) / vals.length
      return { hour: Number(h), avg, count: vals.length }
    })
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 6)
    .map(h => h.hour + ':00 avg A$' + h.avg.toFixed(0) + '/sale (' + h.count + ' txns)')
    .join(', ')

  const topDays = Object.entries(salesByDay)
    .map(([dow, vals]) => {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length
      const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
      return `${days[Number(dow)]} avg $${avg.toFixed(0)}/sale (${vals.length} sales)`
    }).join(', ')

  // Build weekDays by pure string arithmetic — no Date objects, no timezone drift
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(wy, wm - 1, wd + i))
    return d.toISOString().slice(0, 10)
  })

  const leaveLines = approvedLeave.map(l =>
    `- staff_id:${l.staff_id} | ${String(l.leave_type).replace(/_/g, ' ')} | ${l.start_date} to ${l.end_date}`
  ).join('\n') || 'None'

  const days7 = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const availLines = [...new Set(avail.map(a => a.staff_member_id))].map(sid => {
    const rows = avail.filter(a => a.staff_member_id === sid)
    const unavailDays = rows.filter(a => !a.available).map(a => days7[a.day_of_week]).join(',')
    const partial = rows.filter(a => a.available && (a.start_time || a.end_time))
      .map(a => `${days7[a.day_of_week]}(${a.start_time ?? ''}–${a.end_time ?? ''})`).join(',')
    const parts: string[] = []
    if (unavailDays) parts.push(`unavailable: ${unavailDays}`)
    if (partial) parts.push(`limited: ${partial}`)
    return parts.length ? `- staff_id:${sid} | ${parts.join(' | ')}` : null
  }).filter(Boolean).join('\n') || 'No constraints'

  const skillLines = Object.entries(memberSkillMap)
    .map(([id, skills]) => `- staff_id:${id} | ${skills.join(', ')}`).join('\n') || 'None'

  const userPrompt = `Week: ${weekStart}
Exact dates to use for start_time/end_time (CRITICAL — use these exact dates, not day names):
${weekDays.map((d, i) => `  ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]}: ${d}`).join('\n')}
Outlet ID: ${outletId ?? 'default'} (use this exact value for outlet_id in all shifts)

STAFF:
${staff.map(s => `- ${s.first_name} ${s.last_name} | ${s.position} | ${s.employment_type} | color:${s.color ?? '#6366f1'} | id:${s.id}`).join('\n')}

APPROVED LEAVE (do not schedule these staff on these dates):
${leaveLines}

STAFF AVAILABILITY:
${availLines}

STAFF SKILLS:
${skillLines}

STAFFING RULES:
${rules.map(r => `Day ${r.day_of_week} at ${r.hour_of_day}:00 — min ${r.min_staff}${r.required_role ? ` (${r.required_role})` : ''}`).join('\n') || 'No rules set — use typical cafe/retail patterns.'}

SALES PATTERN:
${topDays || 'No sales data — use standard Mon-Sat patterns.'}

PEAK HOURS (schedule extra staff):
${topHours || '10:00-14:00 and 17:00-20:00 standard peaks'}

Generate a practical 5-6 day roster. Return JSON: {"shifts": [...], "reasoning": "2-3 sentences"}`

  const staffLeaveMap: Record<string, Array<{ start: string; end: string; type: string }>> = {}
  for (const l of approvedLeave) {
    const sid = String(l.staff_id)
    if (!staffLeaveMap[sid]) staffLeaveMap[sid] = []
    staffLeaveMap[sid].push({ start: String(l.start_date), end: String(l.end_date), type: String(l.leave_type) })
  }

  let rawShifts: unknown[] = []
  let reasoningText = 'Could not generate roster — try again.'

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8000,
      system: ROSTERING_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    })
    const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    const parsed = parseLLMJsonOr<{ shifts?: unknown[]; reasoning?: string }>(cleaned, {}, 'rostering/draft')
    rawShifts = Array.isArray(parsed.shifts) ? parsed.shifts : []
    reasoningText = String(parsed.reasoning ?? 'Roster generated.')
  } catch (e) {
    console.error('[rostering-agent] Claude call failed:', String(e))
    return { shifts: [], reasoning: 'Roster generation failed — please try again.', cost_cents: 0, conflicts: [] }
  }

  const shifts = rawShifts.map((s, i) => {
    const sh = s as Record<string, unknown>
    return {
      id: String(sh.id ?? `ai-${i + 1}`),
      staff_member_id: String(sh.staff_member_id ?? ''),
      staff_name: String(sh.staff_name ?? ''),
      staff_color: String(sh.staff_color ?? '#6366f1'),
      outlet_id: sh.outlet_id && sh.outlet_id !== 'main' && sh.outlet_id !== 'default' ? String(sh.outlet_id) : (outletId ?? null),
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

  const aiConflicts: string[] = []
  const cleanShifts = shifts.filter(s => {
    const shiftDate = s.start_time.slice(0, 10)
    const leaves = staffLeaveMap[s.staff_member_id] ?? []
    const onLeave = leaves.find(l => shiftDate >= l.start && shiftDate <= l.end)
    if (onLeave) {
      aiConflicts.push(`${s.staff_name} auto-removed from ${shiftDate} — on ${onLeave.type.replace(/_/g, ' ')} leave`)
      return false
    }
    return true
  })

  return { shifts: cleanShifts, reasoning: reasoningText, cost_cents: 0, conflicts: aiConflicts }
}
