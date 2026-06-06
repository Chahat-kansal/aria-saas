export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function checkGoogleRank(keyword: string, domain: string): Promise<number | null> {
  try {
    const q = encodeURIComponent(keyword)
    const res = await fetch(`https://www.google.com/search?q=${q}&num=100`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-AU,en;q=0.9',
      },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    const html = await res.text()
    // Extract result URLs from Google's /url?q= pattern
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

  const { data: keywords } = await supabase
    .from('seo_keywords')
    .select('*')
    .eq('business_id', business_id)
    .order('search_volume', { ascending: false, nullsFirst: false })
    .order('current_rank', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  return NextResponse.json({ keywords: keywords ?? [] })
}

// Toggle rank tracking for an extracted keyword. Body: { keyword_id, tracked }
async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { keyword_id, tracked } = body as { keyword_id?: string; tracked?: boolean }
  if (!keyword_id || typeof tracked !== 'boolean') return NextResponse.json({ error: 'keyword_id and tracked required' }, { status: 400 })

  const { data: kw } = await supabase.from('seo_keywords').select('id, business_id').eq('id', keyword_id).maybeSingle()
  if (!kw) return NextResponse.json({ error: 'Keyword not found' }, { status: 404 })
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', kw.business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await supabase.from('seo_keywords').update({ tracked }).eq('id', keyword_id)
  return NextResponse.json({ ok: true, tracked })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { business_id, keyword } = body as { business_id?: string; keyword?: string }
  if (!business_id || !keyword?.trim()) return NextResponse.json({ error: 'business_id and keyword required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id, website').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Check if keyword already tracked
  const { data: existing } = await supabase.from('seo_keywords').select('id').eq('business_id', business_id).eq('keyword', keyword.trim()).maybeSingle()
  if (existing) return NextResponse.json({ error: 'Keyword already tracked' }, { status: 409 })

  // Check rank immediately
  let currentRank: number | null = null
  if (biz.website) {
    try {
      const domain = new URL(biz.website as string).hostname
      currentRank = await checkGoogleRank(keyword.trim(), domain)
    } catch (e) { console.error('[non-fatal]', e) }
  }

  const { data: kw, error: insertErr } = await supabase.from('seo_keywords').insert({
    business_id, keyword: keyword.trim(), current_rank: currentRank, previous_rank: null,
  }).select().single()

  if (insertErr || !kw) return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 })

  if (currentRank !== null) {
    try {
      await supabase.from('seo_keyword_history').insert({
        keyword_id: kw.id, business_id, keyword: keyword.trim(), rank: currentRank,
      })
    } catch (e) { console.error('[non-fatal]', e) }
  }

  return NextResponse.json({ keyword: kw })
}

export const GET = withErrorCapture('seo/keywords', _GET)
export const POST = withErrorCapture('seo/keywords', _POST)
export const PATCH = withErrorCapture('seo/keywords', _PATCH)
