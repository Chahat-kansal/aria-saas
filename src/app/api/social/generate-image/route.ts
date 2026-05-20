export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function uploadBuffer(buf: Buffer, path: string, mime: string): Promise<string | null> {
  try {
    const sb = serviceClient()
    const { error } = await sb.storage.from('media').upload(path, buf, { contentType: mime, upsert: true })
    if (error) return null
    return sb.storage.from('media').getPublicUrl(path).data.publicUrl
  } catch { return null }
}

async function tryStabilityAI(prompt: string): Promise<Buffer | null> {
  const key = process.env.STABILITY_AI_KEY
  if (!key) return null
  try {
    const res = await fetch(
      'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          text_prompts: [{ text: prompt, weight: 1 }],
          cfg_scale: 7, height: 1024, width: 1024, steps: 30, samples: 1,
        }),
      }
    )
    if (!res.ok) return null
    const d = await res.json()
    const b64 = d.artifacts?.[0]?.base64
    return b64 ? Buffer.from(b64, 'base64') : null
  } catch { return null }
}

async function tryDallE3(prompt: string): Promise<Buffer | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'dall-e-3', prompt: prompt.slice(0, 1000), n: 1, size: '1024x1024', quality: 'standard' }),
    })
    if (!res.ok) return null
    const d = await res.json()
    const url = d.data?.[0]?.url
    if (!url) return null
    const imgRes = await fetch(url)
    if (!imgRes.ok) return null
    return Buffer.from(await imgRes.arrayBuffer())
  } catch { return null }
}

async function tryUnsplash(query: string): Promise<{ url: string; credit: string } | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY
  if (!key || !query) return null
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=square`,
      { headers: { Authorization: `Client-ID ${key}` } }
    )
    const d = await res.json()
    const photo = d.results?.[0]
    if (!photo) return null
    return { url: photo.urls?.regular ?? photo.urls?.small, credit: photo.user?.name ?? 'Unsplash' }
  } catch { return null }
}

async function _POST(req: Request) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { prompt, search_query, post_id, business_id } = await req.json() as {
      prompt?: string; search_query?: string; post_id?: string; business_id?: string
    }
    if (!prompt && !search_query) return NextResponse.json({ error: 'prompt or search_query required' }, { status: 400 })

    let imageUrl: string | null = null
    let credit: string | null = null
    let provider = 'none'
    const prefix = `social/${business_id ?? user.id}/${Date.now()}`

    if (prompt) {
      const buf = await tryStabilityAI(prompt)
      if (buf) {
        const url = await uploadBuffer(buf, `${prefix}_sdxl.png`, 'image/png')
        if (url) { imageUrl = url; provider = 'stability_ai' }
      }
    }

    if (!imageUrl && prompt) {
      const buf = await tryDallE3(prompt)
      if (buf) {
        const url = await uploadBuffer(buf, `${prefix}_dalle3.png`, 'image/png')
        if (url) { imageUrl = url; provider = 'dalle3' }
      }
    }

    if (!imageUrl) {
      const q = search_query || prompt?.split(' ').slice(0, 4).join(' ') || ''
      const result = await tryUnsplash(q)
      if (result) { imageUrl = result.url; credit = result.credit; provider = 'unsplash' }
    }

    // Pixabay fallback — free, no upload needed
    if (!imageUrl) {
      const pixabayKey = process.env.PIXABAY_API_KEY
      const q = search_query || prompt?.split(' ').slice(0, 3).join(' ') || 'business'
      if (pixabayKey) {
        try {
          const pRes = await fetch(
            `https://pixabay.com/api/?key=${pixabayKey}&q=${encodeURIComponent(q)}&image_type=photo&orientation=horizontal&per_page=3&safesearch=true`
          )
          const pData = await pRes.json() as { hits?: Array<{ webformatURL?: string }> }
          const hit = pData.hits?.[0]
          if (hit?.webformatURL) { imageUrl = hit.webformatURL; credit = 'Pixabay'; provider = 'pixabay' }
        } catch { /* fall through */ }
      }
    }

    // Free Unsplash source — no key, always works
    if (!imageUrl) {
      const q = encodeURIComponent(search_query || prompt?.split(' ').slice(0, 3).join(' ') || 'cafe food')
      imageUrl = `https://source.unsplash.com/featured/800x800/?${q}`
      credit = 'Unsplash'; provider = 'unsplash_free'
    }

    if (post_id && imageUrl) {
      const { supabaseAdmin } = await import('@/lib/supabase-admin')
      await supabaseAdmin.from('social_posts')
        .update({ image_url: imageUrl, image_credit: credit })
        .eq('id', post_id)
    }

    return NextResponse.json({ image_url: imageUrl, credit, provider })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

export const POST = withErrorCapture('social/generate-image', _POST)
