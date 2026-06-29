export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { callGemini } from '@/lib/aria/providers/gemini'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 10 * 1024 * 1024  // 10 MB

type RawItem = Record<string, unknown>
export type ExtractedItem = {
  _id: string
  name: string
  price: number
  category: string
  description: string
  removed: boolean
}

// Single extraction prompt used by both Gemini and OpenAI
const EXTRACT_PROMPT =
  'Extract ALL menu items from this menu image. ' +
  'Return ONLY a JSON array (no prose, no markdown, no code fences) where each element has exactly these keys: ' +
  '{"name": string, "price": number (dollars as a decimal number — e.g. 4.5 not "$4.50"), ' +
  '"category": string (the section or category name, e.g. "Drinks", "Mains", "Desserts"), ' +
  '"description": string (empty string if not present on the menu)}. ' +
  'If you cannot read the menu clearly, return []. ' +
  'Include every visible item. Do not invent items not visible in the image. ' +
  'Return ONLY the JSON array, nothing else.'

function parseExtraction(raw: string): ExtractedItem[] {
  try {
    let s = raw.trim()
    // Strip markdown code fences if the model wrapped the JSON anyway
    if (s.startsWith('```')) {
      s = s.replace(/^```[a-z]*\n?/i, '').replace(/\n?```\s*$/, '').trim()
    }
    // Find the first JSON array — handle cases where the model adds prose
    const match = s.match(/\[[\s\S]*\]/)
    if (!match) return []
    const arr = JSON.parse(match[0]) as unknown[]
    if (!Array.isArray(arr)) return []
    return arr
      .filter((x): x is RawItem => typeof x === 'object' && x !== null)
      .map((item, i) => ({
        _id: String(i),
        name:        String(item.name        ?? '').trim(),
        price:       Math.max(0, parseFloat(String(item.price ?? 0)) || 0),
        category:    String(item.category    ?? 'General').trim() || 'General',
        description: String(item.description ?? '').trim(),
        removed:     false,
      }))
      // Filter out rows with empty name or zero price (unreadable/garbage rows)
      .filter(item => item.name.length > 0 && item.price > 0)
  } catch {
    return []
  }
}

async function callOpenAIVision(imageBase64: string, mimeType: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('no_openai_key')

  const { default: OpenAI } = await import('openai')
  const openai = new OpenAI({ apiKey })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [
    { type: 'image_url', image_url: { url: 'data:' + mimeType + ';base64,' + imageBase64, detail: 'high' } },
    { type: 'text', text: EXTRACT_PROMPT },
  ]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [{ role: 'user', content }]

  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 2000,
    messages,
  })
  return res.choices[0]?.message?.content ?? ''
}

async function _POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({
      error: 'File must be JPEG, PNG, or WebP. To use a PDF menu, take a screenshot first.',
    }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File must be ≤10 MB' }, { status: 400 })
  }

  // Normalize: keep up to 1600 px on longest side for text readability in OCR
  const buffer = Buffer.from(await file.arrayBuffer())
  const normalized = await sharp(buffer)
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer()
  const imageBase64 = normalized.toString('base64')
  const mimeType = 'image/jpeg'

  // ── 1. Try Gemini (cheaper, vision-capable, primary) ─────────────────────
  let rawText = ''
  let provider = 'none'

  if (process.env.GEMINI_API_KEY) {
    const result = await callGemini({
      agentKey:      'document_vision',
      role:          'document',
      systemPrompt:  'You are a menu digitizer. Extract menu items as structured JSON only.',
      userPrompt:    EXTRACT_PROMPT,
      imageBase64,
      imageMimeType: mimeType,
      maxTokens:     2000,
    })
    if (result.success && result.raw.trim()) {
      rawText  = result.raw
      provider = 'gemini'
    }
  }

  // ── 2. Fall back to OpenAI gpt-4o if Gemini unavailable or failed ────────
  if (!rawText && process.env.OPENAI_API_KEY) {
    try {
      rawText  = await callOpenAIVision(imageBase64, mimeType)
      provider = 'openai'
    } catch (e) {
      console.error('[menu-extract] openai vision failed:', (e as Error).message)
    }
  }

  // ── 3. No provider available or both failed ───────────────────────────────
  if (!rawText) {
    const noKey = !process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY
    return NextResponse.json({
      error: noKey
        ? 'AI extraction unavailable — add GEMINI_API_KEY or OPENAI_API_KEY to enable menu import.'
        : 'AI extraction failed — try a well-lit, straight-on photo of the full menu page.',
    }, { status: 503 })
  }

  const items = parseExtraction(rawText)
  if (items.length === 0) {
    return NextResponse.json({
      error: "Couldn't read any items from this photo. Try a clearer, well-lit shot — or add items manually in your POS.",
      provider,
    }, { status: 422 })
  }

  return NextResponse.json({ items, provider })
}

export const POST = withErrorCapture('pos/menu-extract', _POST)
