import { createClient } from '@supabase/supabase-js'
import * as https from 'https'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const PIXABAY_KEY = process.env.PIXABAY_API_KEY
const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY
const BUCKET = 'reusable-images'

export type ImageCategory =
  | 'food' | 'business' | 'people' | 'backgrounds'
  | 'buildings' | 'computer' | 'fashion' | 'nature' | 'all'

export interface GetImageOptions {
  category?: ImageCategory
  orientation?: 'horizontal' | 'vertical' | 'all'
  preferIsolated?: boolean
  minWidth?: number
}

interface PixabayHit {
  webformatURL: string
  largeImageURL: string
  tags: string
}

/**
 * Fetch a relevant image from Pixabay and cache it in Supabase Storage.
 *
 * - First call for a query: ~1–2 s (Pixabay fetch + upload)
 * - Repeat calls: ~50 ms (cached CDN URL returned immediately)
 * - Images are stored at reusable-images/cache/{sanitized-query}.jpg
 * - Pixabay License: free for commercial use, no attribution required
 *
 * @example
 *   const url = await getRelevantImage('flat white coffee')
 *   const url = await getRelevantImage('empty inbox', { category: 'business', preferIsolated: true })
 */
export async function getRelevantImage(
  query: string,
  options: GetImageOptions = {}
): Promise<string | null> {
  if (!PIXABAY_KEY) return null

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const cacheKey = sanitizeKey(query)
  const storagePath = `cache/${cacheKey}.jpg`

  // 1. Check cache
  try {
    const { data } = await supabase.storage.from(BUCKET).list('cache', { search: `${cacheKey}.jpg` })
    if (data && data.length > 0) {
      return supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl
    }
  } catch { /* fall through */ }

  // 2. Ensure bucket exists
  try {
    const { data: buckets } = await supabase.storage.listBuckets()
    if (!buckets?.find(b => b.name === BUCKET)) {
      await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 5242880 })
    }
  } catch { /* non-fatal */ }

  // 3. Fetch from Pixabay
  const category = options.category ?? 'all'
  const orientation = options.orientation ?? 'all'
  const minWidth = options.minWidth ?? 400
  const catParam = category !== 'all' ? `&category=${category}` : ''
  const apiUrl = `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(query)}&image_type=photo&orientation=${orientation}${catParam}&safesearch=true&per_page=10&min_width=${minWidth}`

  const imageUrl = await fetchPixabayUrl(apiUrl, options.preferIsolated ?? false)
  if (!imageUrl) return fetchUnsplashUrl(query)

  // 4. Download and upload to Supabase Storage
  try {
    const buf = await downloadToBuffer(imageUrl)
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buf, { contentType: 'image/jpeg', upsert: false })
    if (error && !error.message.includes('already exists')) {
      return imageUrl // fallback: return direct Pixabay URL
    }
    return supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl
  } catch {
    return imageUrl // fallback
  }
}

/**
 * Get multiple varied images for the same topic (e.g. carousel posts).
 */
export async function getRelevantImages(
  query: string,
  count = 3,
  options: GetImageOptions = {}
): Promise<string[]> {
  const variants = [query, `${query} closeup`, `${query} fresh`, `${query} styled`]
  const results: string[] = []
  for (let i = 0; i < Math.min(count, variants.length); i++) {
    const url = await getRelevantImage(variants[i], options)
    if (url) results.push(url)
  }
  return results
}

function sanitizeKey(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}

function fetchPixabayUrl(apiUrl: string, preferIsolated: boolean): Promise<string | null> {
  return new Promise(resolve => {
    https.get(apiUrl, res => {
      let data = ''
      res.on('data', c => (data += c))
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (!json.hits?.length) { resolve(null); return }
          if (preferIsolated) {
            const isolated = json.hits.find((h: PixabayHit) =>
              h.tags.includes('isolated') ||
              h.tags.includes('white background') ||
              h.tags.includes('transparent')
            )
            if (isolated) { resolve(isolated.webformatURL); return }
          }
          resolve(json.hits[0].webformatURL)
        } catch { resolve(null) }
      })
    }).on('error', () => resolve(null))
  })
}

async function fetchUnsplashUrl(query: string): Promise<string | null> {
  if (!UNSPLASH_KEY) return null
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1`,
      { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } }
    )
    if (!res.ok) return null
    const json = await res.json() as { results: Array<{ urls: { regular: string } }> }
    return json.results[0]?.urls?.regular ?? null
  } catch {
    return null
  }
}

function downloadToBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        downloadToBuffer(res.headers.location!).then(resolve).catch(reject)
        return
      }
      const chunks: Buffer[] = []
      res.on('data', c => chunks.push(c as Buffer))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}