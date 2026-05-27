export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const AVG_REV_PER_STAFF_HOUR = 150

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { business_id } = await req.json()
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id, name').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Pull last 4 weeks of sales grouped by day-of-week and hour
  const fourWeeksAgo = new Date(Date.now() - 28 * 86400_000).toISOString()
  const { data: sales } = await supabaseAdmin
    .from('pos_sales')
    .select('created_at, total_amount')
    .eq('business_id', business_id)
    .neq('status', 'voided')
    .gte('created_at', fourWeeksAgo)
    .limit(2000)

  // Aggregate by day-of-week + hour
  const byDayHour: Record<number, Record<number, number>> = {}
  for (let d = 0; d < 7; d++) byDayHour[d] = {}
  for (const s of sales ?? []) {
    const dt = new Date(s.created_at as string)
    const dow = dt.getDay()
    const hour = dt.getHours()
    byDayHour[dow][hour] = (byDayHour[dow][hour] ?? 0) + Number(s.total_amount ?? 0)
  }

  // Average over 4 weeks per day
  const dayRevenue: Record<number, number> = {}
  for (let d = 0; d < 7; d++) {
    dayRevenue[d] = Object.values(byDayHour[d]).reduce((a, b) => a + b, 0) / 4
  }

  // Next week Mon–Sun
  const today = new Date()
  const nextMon = new Date(today)
  nextMon.setDate(today.getDate() + ((8 - today.getDay()) % 7 || 7))

  const forecast = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(nextMon)
    d.setDate(nextMon.getDate() + i)
    const dow = d.getDay()
    const rev = dayRevenue[dow] ?? 0
    const staffCount = Math.max(1, Math.ceil(rev / AVG_REV_PER_STAFF_HOUR))
    return {
      date: d.toISOString().slice(0, 10),
      day: DAYS[dow],
      predicted_revenue: Math.round(rev),
      recommended_staff: staffCount,
    }
  })

  // Fetch staff members for scheduling
  const { data: staffList } = await supabaseAdmin
    .from('staff_members')
    .select('id, first_name, last_name, position, employment_type')
    .eq('business_id', business_id)
    .eq('status', 'active')
    .limit(20)

  const staffNames = (staffList ?? []).map(s => `${s.first_name} ${s.last_name} (${s.position ?? 'staff'})`).join(', ')

  const prompt = `You are scheduling staff for ${biz.name} next week. Generate a practical weekly schedule.

Forecast & recommended staff:
${forecast.map(f => `${f.day} ${f.date}: $${f.predicted_revenue} predicted revenue → ${f.recommended_staff} staff`).join('\n')}

Available staff: ${staffNames || 'General staff roster'}

Generate a schedule. Assume 9am–5pm default hours unless demand suggests otherwise.
Return ONLY valid JSON array:
[
  {"staff_name":"name","shift_date":"YYYY-MM-DD","start_time":"09:00","end_time":"17:00","role":"staff","notes":""},
  ...
]
Rules: spread staff across days, give each person ~3-4 days/week for casual staff.`

  const msg = await trackAICall(
    { route: 'aria/staff-schedule', model: 'claude-haiku-4-5-20251001', businessId: business_id, purpose: 'staff-schedule' },
    () => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: 'You are a staff scheduling assistant. Return ONLY valid JSON arrays, no explanation.',
      messages: [{ role: 'user', content: prompt }],
    })
  )

  const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '[]'
  const jsonMatch = raw.match(/\[[\s\S]*\]/)
  let suggestedShifts: Array<Record<string, string>> = []
  try {
    suggestedShifts = jsonMatch ? JSON.parse(jsonMatch[0]) : []
  } catch { suggestedShifts = [] }

  return NextResponse.json({ forecast, suggested_shifts: suggestedShifts })
}

export const POST = withErrorCapture('aria/staff-schedule', _POST)
