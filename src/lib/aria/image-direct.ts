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
  // Fetch real business details to ground the prompt
  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('name, city, phone, address, industry')
    .eq('id', businessId)
    .single()

  const bizName = (biz as any)?.name ?? ''
  const bizCity = (biz as any)?.city ?? ''
  const bizPhone = (biz as any)?.phone ?? ''
  const bizIndustry = (biz as any)?.industry ?? 'cafe'

  // Build a grounded prompt that always includes the real business name
  // Strip filler from user message
  const userIntent = message
    .replace(/^(generate|create|make|design|build)\s+(a\s+)?/i, '')
    .replace(/\b(for my business|for us|please|can you|could you|use my business info|and include our name|include.*business info)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  // Always ground with real business name — prevents hallucination of fake business names
  const locationPart = bizCity ? `Located in ${bizCity}.` : ''
  const prompt = bizName
    ? `Professional marketing poster for "${bizName}" (a ${bizIndustry}). ${userIntent}. Business name "${bizName}" must appear prominently. ${locationPart} Clean, modern design.`
    : userIntent

  const GEMINI_KEY = process.env.GEMINI_API_KEY
  const OPENAI_KEY = process.env.OPENAI_API_KEY

  console.log('[image-direct] generating for business:', bizName, 'prompt:', prompt.slice(0, 120))

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
        console.error('[image-direct] Imagen 3 FULL ERROR:', res.status, res.statusText, err.slice(0, 500))
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
        console.error('[image-direct] gpt-image-1 FULL ERROR:', res.status, res.statusText, err.slice(0, 500))
      }
    } catch (e) {
      console.error('[image-direct] gpt-image-1 exception:', String(e).slice(0, 200))
    }
  }

  // Strategy 3: SVG poster fallback — always works, no external API needed
  console.log('[image-direct] falling back to SVG poster generation')
  const svgResult = await generateSVGPoster(message, businessId, { name: bizName, city: bizCity, phone: bizPhone, industry: bizIndustry })
  if (svgResult) return svgResult

  return { ok: false, error: 'All image generation strategies failed. Keys set: gemini=' + !!GEMINI_KEY + ' openai=' + !!OPENAI_KEY }
}

async function generateSVGPoster(message: string, businessId: string, bizData?: { name: string; city: string; phone: string; industry: string }): Promise<ImageDirectResult | null> {
  try {
    // Extract key info from the message
    const timeMatch = message.match(/(\d{1,2}(?::\d{2})?(?:am|pm)?\s*[-–]\s*\d{1,2}(?::\d{2})?(?:am|pm)?)/i)
    const time = timeMatch?.[1] ?? ''
    const isOpen = /open|opening|hours/i.test(message)
    const isAnnouncement = /announce|new|launch|introducing/i.test(message)

    // Use pre-fetched business info
    const bizName = bizData?.name ?? 'Our Business'
    const city = bizData?.city ?? ''
    const phone = bizData?.phone ?? ''

    const headline = isOpen
      ? (time ? `Open ${time}` : 'Now Open')
      : isAnnouncement ? 'Big Announcement' : 'Special Notice'

    // Build the tagline from user intent — strip meta-instructions
    const tagline = message
      .replace(/^(generate|create|make|design)\s+(a\s+)?(poster|flyer|banner|image|graphic)\s+(that\s+)?(says?\s+)?/i, '')
      .replace(/and include.*business info.*/i, '')
      .replace(/use my business info.*/i, '')
      .replace(/for (my|our) business/i, '')
      .replace(/include our name/i, '')
      .trim()
      .slice(0, 80)

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a2e1a"/>
      <stop offset="100%" style="stop-color:#0d1f0d"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#7FB897"/>
      <stop offset="100%" style="stop-color:#22C55E"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="800" height="600" fill="url(#bg)" rx="0"/>
  <!-- Top accent bar -->
  <rect x="0" y="0" width="800" height="8" fill="url(#accent)"/>
  <!-- Bottom accent bar -->
  <rect x="0" y="592" width="800" height="8" fill="url(#accent)"/>
  <!-- Left accent line -->
  <rect x="60" y="60" width="4" height="480" fill="#7FB897" opacity="0.4"/>
  <!-- Right accent line -->
  <rect x="736" y="60" width="4" height="480" fill="#7FB897" opacity="0.4"/>
  <!-- Corner decorations -->
  <rect x="60" y="60" width="40" height="4" fill="#7FB897" opacity="0.6"/>
  <rect x="700" y="60" width="40" height="4" fill="#7FB897" opacity="0.6"/>
  <rect x="60" y="536" width="40" height="4" fill="#7FB897" opacity="0.6"/>
  <rect x="700" y="536" width="40" height="4" fill="#7FB897" opacity="0.6"/>
  <!-- Business name -->
  <text x="400" y="150" font-family="Georgia, serif" font-size="52" font-weight="bold" 
    fill="#7FB897" text-anchor="middle" letter-spacing="6">${bizName.toUpperCase()}</text>
  <!-- Divider -->
  <rect x="160" y="175" width="480" height="2" fill="url(#accent)" opacity="0.5"/>
  <!-- Main headline -->
  <text x="400" y="270" font-family="Georgia, serif" font-size="72" font-weight="bold"
    fill="#FFFFFF" text-anchor="middle">${headline}</text>
  <!-- Tagline -->
  <text x="400" y="340" font-family="Arial, sans-serif" font-size="26"
    fill="#A8D5B5" text-anchor="middle">${tagline}</text>
  <!-- Divider -->
  <rect x="200" y="390" width="400" height="1" fill="#7FB897" opacity="0.3"/>
  <!-- Contact info -->
  ${city ? `<text x="400" y="440" font-family="Arial, sans-serif" font-size="20" fill="#7FB897" text-anchor="middle">${city}</text>` : ''}
  ${phone ? `<text x="400" y="470" font-family="Arial, sans-serif" font-size="18" fill="#6B9B7A" text-anchor="middle">${phone}</text>` : ''}
  <!-- Footer -->
  <text x="400" y="545" font-family="Arial, sans-serif" font-size="14" fill="#3D6B4A" text-anchor="middle" letter-spacing="2">ARIAOS.SITE</text>
</svg>`

    const buf = Buffer.from(svg, 'utf-8')
    const filename = `poster_${Date.now()}.svg`
    const path = `aria-generated/${businessId}/${filename}`

    const { error: upErr } = await supabaseAdmin.storage
      .from('reusable-images')
      .upload(path, buf, { contentType: 'image/svg+xml', upsert: true })

    if (upErr) {
      console.error('[image-direct] SVG upload failed:', upErr.message)
      return null
    }

    const { data: pub } = supabaseAdmin.storage.from('reusable-images').getPublicUrl(path)
    if (!pub?.publicUrl) return null

    console.log('[image-direct] SVG poster generated and uploaded:', pub.publicUrl.slice(0, 80))
    return { ok: true, filename, download_url: pub.publicUrl, strategy: 'svg-poster' }
  } catch (e) {
    console.error('[image-direct] SVG generation failed:', String(e))
    return null
  }
}

async function uploadImage(buf: Buffer, businessId: string, strategy: string): Promise<ImageDirectResult | null> {
  try {
    const filename = `poster_${Date.now()}.png`
    // Upload to reusable-images (public bucket) so the URL is permanent and works in <img> tags
    const path = `aria-generated/${businessId}/${filename}`
    const { error: upErr } = await supabaseAdmin.storage
      .from('reusable-images')
      .upload(path, buf, { contentType: 'image/png', upsert: true })
    if (upErr) {
      console.error('[image-direct] upload failed:', upErr.message, 'path:', path)
      return null
    }
    const { data: pub } = supabaseAdmin.storage
      .from('reusable-images')
      .getPublicUrl(path)
    if (!pub?.publicUrl) return null
    console.log('[image-direct] uploaded successfully via', strategy, 'url:', pub.publicUrl.slice(0, 80))
    return { ok: true, filename, download_url: pub.publicUrl, strategy }
  } catch (e) {
    console.error('[image-direct] upload exception:', String(e))
    return null
  }
}
