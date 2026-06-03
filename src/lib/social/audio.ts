/**
 * Fetches royalty-free background music from Pixabay API.
 * Uses existing PIXABAY_KEY — no new credentials needed.
 * Pixabay License: free for commercial use, no attribution required.
 * Tracks are 2-4 min; ffmpeg -shortest flag trims to Reel duration automatically.
 */

const MOOD_QUERIES: Record<string, string> = {
  upbeat:    'upbeat happy background commercial',
  warm:      'warm acoustic cafe cosy',
  minimal:   'minimal ambient calm background',
  energetic: 'energetic exciting bold upbeat',
}

export async function getBackgroundMusicUrl(mood: string): Promise<string | null> {
  if (mood === 'none') return null
  const key = process.env.PIXABAY_KEY
  if (!key) return null

  const q = encodeURIComponent(MOOD_QUERIES[mood] ?? MOOD_QUERIES.upbeat)
  try {
    const res = await fetch(
      'https://pixabay.com/api/?key=' + key + '&q=' + q + '&media_type=music&per_page=10&safesearch=true'
    )
    if (!res.ok) return null
    const data = await res.json() as {
      hits?: Array<{ audio?: { mp3?: string }; previewURL?: string }>
    }
    const hits = data.hits ?? []
    if (!hits.length) return null
    const pick = hits[Math.floor(Math.random() * Math.min(hits.length, 5))]
    return pick?.audio?.mp3 ?? pick?.previewURL ?? null
  } catch {
    return null
  }
}
