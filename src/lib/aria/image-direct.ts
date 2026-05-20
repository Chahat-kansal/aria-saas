/**
 * Direct image generation — bypasses Anthropic tool loop entirely.
 * The tool loop (2 API calls + image gen) takes 20-50s and hits Vercel's 60s limit.
 * This calls the image API directly and returns in 8-20s.
 */

import { supabaseAdmin } from '@/lib/supabase-admin'

export interface ImageDirectResult {
  ok: boolean
  filename?: string
  download_url?: string
  strategy?: string
  error?: string
}

export async function generateImageDirect(
  message: string,
  businessId: string,
): Promise<ImageDirectResult> {
  // Extract a clean prompt from the user's message
  // Remove common filler phrases so the image API gets a clean prompt
  const prompt = message
    .replace(/^(generate|create|make|design|build)\s+(a\s+)?/i, '')
    .replace(/\b(for my business|for us|please|can you|could you)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  const GEMINI_KEY = process.env.GEMINI_API_KEY
  const OPENAI_KEY = process.env.OPENAI_API_KEY

  console.log('[image-direct] generating:', prompt.slice(0, 100), 'gemini:', !!GEMINI_KEY, 'openai:', !!OPENAI_KEY)

  // Strategy 1: Imagen 3 via Gemini (fastest, ~8-12s)
  if (GEMINI_KEY) {
    try {
      const t0 = Date.now()
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances: [{ prompt }],
            parameters: { sampleCount: 1, aspectRatio: '1:1', safetyFilterLevel: 'block_few' },
          }),
          signal: AbortSignal.timeout(20_000),
        }
      )
      console.log('[image-direct] Imagen 3 response:', res.status, 'in', Date.now() - t0, 'ms')
      if (res.ok) {
        const d = await res.json() as { predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }> }
        const b64 = d.predictions?.[0]?.bytesBase64Encoded
        if (b64) {
          const result = await uploadImage(Buffer.from(b64, 'base64'), businessId, 'imagen-3')
          if (result) return result
        }
      } else {
        const err = await res.text()
        console.error('[image-direct] Imagen 3 failed:', res.status, err.slice(0, 200))
      }
    } catch (e) {
      console.error('[image-direct] Imagen 3 exception:', String(e).slice(0, 200))
    }
  }

  // Strategy 2: gpt-image-1 (fallback, ~15-30s)
  if (OPENAI_KEY) {
    try {
      const t0 = Date.now()
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-image-1', prompt, n: 1, size: '1024x1024' }),
        signal: AbortSignal.timeout(30_000),
      })
      console.log('[image-direct] gpt-image-1 response:', res.status, 'in', Date.now() - t0, 'ms')
      if (res.ok) {
        const d = await res.json() as { data?: Array<{ b64_json?: string; url?: string }> }
        const item = d.data?.[0]
        let buf: Buffer | null = null
        if (item?.b64_json) {
          buf = Buffer.from(item.b64_json, 'base64')
        } else if (item?.url) {
          const imgRes = await fetch(item.url, { signal: AbortSignal.timeout(10_000) })
          if (imgRes.ok) buf = Buffer.from(await imgRes.arrayBuffer())
        }
        if (buf) {
          const result = await uploadImage(buf, businessId, 'gpt-image-1')
          if (result) return result
        }
      } else {
        const err = await res.text()
        console.error('[image-direct] gpt-image-1 failed:', res.status, err.slice(0, 200))
      }
    } catch (e) {
      console.error('[image-direct] gpt-image-1 exception:', String(e).slice(0, 200))
    }
  }

  return { ok: false, error: 'All image generation strategies failed. Keys set: gemini=' + !!GEMINI_KEY + ' openai=' + !!OPENAI_KEY }
}

async function uploadImage(buf: Buffer, businessId: string, strategy: string): Promise<ImageDirectResult | null> {
  try {
    const filename = `image_${Date.now()}.png`
    const path = `aria-images/${businessId}/${filename}`
    const { error: upErr } = await supabaseAdmin.storage
      .from('reports')
      .upload(path, buf, { contentType: 'image/png' })
    if (upErr) {
      console.error('[image-direct] upload failed:', upErr.message)
      return null
    }
    const { data: signed } = await supabaseAdmin.storage
      .from('reports')
      .createSignedUrl(path, 86400)
    if (!signed?.signedUrl) return null
    console.log('[image-direct] uploaded successfully via', strategy)
    return { ok: true, filename, download_url: signed.signedUrl, strategy }
  } catch (e) {
    console.error('[image-direct] upload exception:', String(e))
    return null
  }
}
