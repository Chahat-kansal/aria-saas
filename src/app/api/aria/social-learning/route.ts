export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const biz = await supabaseAdmin.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz.data) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let items: Array<{ post_type: string; likes_count: number; comments_count: number; saves_count: number; created_at: string; content: string }> = []
  try {
    const { data: posts } = await supabaseAdmin
      .from('community_posts')
      .select('post_type, likes_count, comments_count, saves_count, created_at, content')
      .eq('business_id', business_id)
      .order('created_at', { ascending: false })
      .limit(30)
    items = (posts ?? []) as Array<{ post_type: string; likes_count: number; comments_count: number; saves_count: number; created_at: string; content: string }>
  } catch {
    return NextResponse.json({ insights: ['Post at least 5 times to unlock Aria learning insights'], top_content_type: null, best_day: null, best_hour: null })
  }

  if (items.length < 3) {
    return NextResponse.json({ insights: ['Post at least 5 times to unlock Aria learning insights'], top_content_type: null, best_day: null, best_hour: null })
  }

  const dayEng: Record<number, number[]> = {}
  const hourEng: Record<number, number[]> = {}
  const typeEng: Record<string, number[]> = {}
  for (const p of items) {
    const d = new Date(p.created_at)
    const day = d.getDay(), hour = d.getHours()
    const eng = (p.likes_count ?? 0) + (p.comments_count ?? 0) + (p.saves_count ?? 0)
    if (!dayEng[day]) dayEng[day] = []; dayEng[day].push(eng)
    if (!hourEng[hour]) hourEng[hour] = []; hourEng[hour].push(eng)
    const t = p.post_type ?? 'text'
    if (!typeEng[t]) typeEng[t] = []; typeEng[t].push(eng)
  }

  const avgArr = (obj: Record<number, number[]>) => Object.entries(obj).map(([k, v]) => ({ k: Number(k), avg: v.reduce((s, x) => s + x, 0) / v.length })).sort((a, b) => b.avg - a.avg)
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const bestDayIdx = avgArr(dayEng)[0]?.k
  const best_day = bestDayIdx !== undefined ? dayNames[bestDayIdx] : null
  const best_hour = avgArr(hourEng)[0]?.k ?? null
  const topTypes = Object.entries(typeEng).map(([t, v]) => ({ type: t, avg: v.reduce((s, x) => s + x, 0) / v.length })).sort((a, b) => b.avg - a.avg)
  const top_content_type = topTypes[0]?.type ?? null

  const prompt = 'Community post performance data:\n- Best posting day: ' + best_day + '\n- Best posting hour: ' + (best_hour !== null ? best_hour + ':00' : 'unknown') + '\n- Top content type: ' + top_content_type + '\n- Posts analysed: ' + items.length + '\n\nGenerate 3 specific, actionable insights for this business to improve their social media engagement. Be concrete and specific.\n\nReturn JSON only:\n{\n  "insights": ["string", "string", "string"]\n}'

  let insights = ['Post more content to build engagement data', 'Try posting at different times to find your peak audience', 'Respond to comments quickly to boost engagement signals']
  try {
    const msg = await trackAICall(
      { route: 'aria/social-learning', model: 'claude-haiku-4-5-20251001', businessId: business_id, purpose: 'social-intelligence' },
      () => anthropic.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, messages: [{ role: 'user', content: prompt }] })
    )
    const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '{}'
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
    if (Array.isArray(parsed.insights) && parsed.insights.length > 0) insights = parsed.insights.slice(0, 3).map(String)
  } catch { /* use fallback */ }

  return NextResponse.json({ insights, top_content_type, best_day, best_hour })
}

export const GET = withErrorCapture('aria/social-learning', _GET)
