export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { waitUntil } from '@vercel/functions'

async function checkRankForDomain(keyword: string, domain: string): Promise<number | null> {
  try {
    const q = encodeURIComponent(keyword)
    const res = await fetch('https://www.google.com/search?q=' + q + '&num=100&hl=en-AU', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-AU,en;q=0.9',
      },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    const html = await res.text()
    const pattern = /href="\/url\?q=(https?:\/\/[^"&]+)/g
    let pos = 0
    let m: RegExpExecArray | null
    while ((m = pattern.exec(html)) !== null) {
      try {
        const resultHost = new URL(decodeURIComponent(m[1])).hostname.replace(/^www\./, '')
        const target = domain.replace(/^www\./, '')
        pos++
        if (resultHost === target || resultHost.endsWith('.' + target)) return pos
        if (pos >= 100) break
      } catch { /* skip malformed */ }
    }
    return null
  } catch { return null }
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: rankings } = await supabaseAdmin
    .from('seo_keyword_rankings')
    .select('id, keyword, current_position, volume, difficulty, target_url, position_history, last_checked_at, created_at')
    .eq('business_id', business_id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ rankings: rankings ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { business_id, keyword, target_url } = body as { business_id?: string; keyword?: string; target_url?: string }
  if (!business_id || !keyword?.trim()) return NextResponse.json({ error: 'business_id and keyword required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id, website').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: existing } = await supabaseAdmin
    .from('seo_keyword_rankings')
    .select('id, current_position, position_history')
    .eq('business_id', business_id)
    .eq('keyword', keyword.trim())
    .maybeSingle()

  const website = (biz.website as string | null) || (target_url ?? null)
  let position: number | null = null
  if (website) {
    try {
      const domain = new URL(website).hostname
      position = await checkRankForDomain(keyword.trim(), domain)
    } catch { /* non-fatal */ }
  }

  const now = new Date().toISOString()

  if (existing) {
    const history = Array.isArray(existing.position_history) ? (existing.position_history as Array<{ position: number | null; checked_at: string }>) : []
    history.push({ position, checked_at: now })
    if (history.length > 30) history.splice(0, history.length - 30)

    const { data: updated } = await supabaseAdmin
      .from('seo_keyword_rankings')
      .update({ current_position: position, position_history: history, last_checked_at: now })
      .eq('id', existing.id)
      .select('*')
      .single()

    waitUntil((async () => { await supabaseAdmin.from('aria_ai_calls').insert({
      business_id, agent_key: 'seo_keyword_tracking', model_id: 'system', role: 'other',
      success: true, request_summary: 'rank check: ' + keyword.trim(),
      response_summary: 'position: ' + (position ?? 'not ranked'),
    }) })())

    return NextResponse.json({ ranking: updated })
  }

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('seo_keyword_rankings')
    .insert({
      business_id,
      keyword: keyword.trim(),
      target_url: target_url || website || null,
      current_position: position,
      position_history: position !== null ? [{ position, checked_at: now }] : [],
      last_checked_at: now,
    })
    .select('*')
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  waitUntil((async () => { await supabaseAdmin.from('aria_ai_calls').insert({
    business_id, agent_key: 'seo_keyword_tracking', model_id: 'system', role: 'other',
    success: true, request_summary: 'add + rank check: ' + keyword.trim(),
    response_summary: 'position: ' + (position ?? 'not ranked'),
  }) })())

  return NextResponse.json({ ranking: inserted }, { status: 201 })
}

// PATCH: refresh positions for all tracked keywords (up to 10 at once)
async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { business_id } = body as { business_id?: string }
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id, website').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const website = biz.website as string | null
  if (!website) return NextResponse.json({ error: 'No website URL set — connect your website in SEO settings' }, { status: 400 })

  const domain = (() => { try { return new URL(website).hostname } catch { return null } })()
  if (!domain) return NextResponse.json({ error: 'Invalid website URL' }, { status: 400 })

  const { data: rankings } = await supabaseAdmin
    .from('seo_keyword_rankings')
    .select('id, keyword, position_history')
    .eq('business_id', business_id)

  const now = new Date().toISOString()
  const results: Array<{ keyword: string; position: number | null }> = []

  for (const r of (rankings ?? []).slice(0, 10)) {
    const position = await checkRankForDomain(r.keyword, domain)
    const history = Array.isArray(r.position_history) ? (r.position_history as Array<{ position: number | null; checked_at: string }>) : []
    history.push({ position, checked_at: now })
    if (history.length > 30) history.splice(0, history.length - 30)
    await supabaseAdmin
      .from('seo_keyword_rankings')
      .update({ current_position: position, position_history: history, last_checked_at: now })
      .eq('id', r.id)
    results.push({ keyword: r.keyword, position })
  }

  waitUntil((async () => { await supabaseAdmin.from('aria_autopilot_actions').insert({
    business_id, action_type: 'seo_keyword_scan', status: 'executed',
    action_data: { keywords_scanned: results.length, results },
  }) })())

  return NextResponse.json({ ok: true, updated_count: results.length, results })
}

export const GET   = withErrorCapture('seo/keyword-tracking', _GET)
export const POST  = withErrorCapture('seo/keyword-tracking', _POST)
export const PATCH = withErrorCapture('seo/keyword-tracking', _PATCH)
