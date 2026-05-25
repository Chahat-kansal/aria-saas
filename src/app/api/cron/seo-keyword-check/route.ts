export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const BIZ_CAP = 10

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
      } catch { /* skip */ }
    }
    return null
  } catch { return null }
}

export async function GET(req: Request) {
  const secret = req.headers.get('x-vercel-cron-signature')
    ?? req.headers.get('authorization')?.replace('Bearer ', '')
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Load distinct businesses with keywords
  const { data: rows } = await supabaseAdmin
    .from('seo_keywords')
    .select('business_id')
    .order('business_id')
    .limit(BIZ_CAP * 20)

  const bizIds = [...new Set((rows ?? []).map((r: { business_id: string }) => r.business_id))].slice(0, BIZ_CAP)
  if (bizIds.length === 0) return NextResponse.json({ ok: true, processed: 0 })

  // Load website for each business
  const { data: bizRows } = await supabaseAdmin
    .from('businesses')
    .select('id, website')
    .in('id', bizIds)
    .not('website', 'is', null)

  const bizMap = new Map((bizRows ?? []).map((b: { id: string; website: string }) => [b.id, b.website as string]))

  let keywords_checked = 0

  for (const bizId of bizIds) {
    const website = bizMap.get(bizId)
    if (!website) continue
    let domain: string
    try { domain = new URL(website).hostname } catch { continue }

    const { data: keywords } = await supabaseAdmin
      .from('seo_keywords')
      .select('id, keyword, current_rank')
      .eq('business_id', bizId)

    for (const kw of keywords ?? []) {
      const newRank = await checkGoogleRank(kw.keyword, domain)
      await supabaseAdmin.from('seo_keywords').update({
        previous_rank: kw.current_rank,
        current_rank: newRank,
        last_checked_at: new Date().toISOString(),
      }).eq('id', kw.id)

      if (newRank !== null) {
        await supabaseAdmin.from('seo_keyword_history').insert({
          keyword_id: kw.id, business_id: bizId, keyword: kw.keyword, rank: newRank,
        }).catch(() => {/* non-fatal */})
      }
      keywords_checked++
    }
  }

  return NextResponse.json({ ok: true, businesses_processed: bizIds.length, keywords_checked })
}
