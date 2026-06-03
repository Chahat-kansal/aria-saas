import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

const MOOD_QUERIES: Record<string, string> = {
  upbeat:    'upbeat happy energetic pop background',
  chill:     'chill lofi calm relaxing cafe',
  energetic: 'energetic exciting bold powerful',
  warm:      'warm acoustic cosy heartfelt',
  cinematic: 'cinematic epic dramatic orchestral',
  corporate: 'corporate professional uplifting business',
  romantic:  'romantic soft gentle love',
  party:     'party fun dance upbeat',
}

export async function GET(req: NextRequest) {
  const key = process.env.PIXABAY_KEY
  if (!key) return NextResponse.json({ error: 'PIXABAY_KEY not set' }, { status: 503 })

  const mood = req.nextUrl.searchParams.get('mood') ?? 'upbeat'
  const query = req.nextUrl.searchParams.get('q') ?? MOOD_QUERIES[mood] ?? MOOD_QUERIES.upbeat
  const encoded = encodeURIComponent(query)

  try {
    const res = await fetch(
      `https://pixabay.com/api/?key=${key}&q=${encoded}&media_type=music&per_page=20&safesearch=true&order=popular`
    )
    if (!res.ok) return NextResponse.json({ error: 'Pixabay error' }, { status: 502 })
    const data = await res.json() as { hits?: any[]; totalHits?: number }
    const hits = (data.hits ?? []).map((h: any) => ({
      id: h.id,
      title: h.tags?.split(',')[0]?.trim() ?? 'Track ' + h.id,
      duration: h.duration ?? 0,
      url: h.audio?.mp3 ?? h.previewURL ?? null,
      preview: h.previewURL ?? null,
      bpm: h.bpm ?? null,
      artist: h.user ?? 'Unknown',
    })).filter((h: any) => h.url)  // only tracks with actual audio
    return NextResponse.json({ tracks: hits, total: data.totalHits ?? 0 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
