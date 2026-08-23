export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
type AllowedMime = typeof ALLOWED_MIMES[number]

const MAX_B64_LEN = 5 * 1024 * 1024 // ~3.75 MB original file

// MS13 PHASE 2 — the tenant is resolved ON THE RAIL before the paid vision call runs
// (pre-authorised fix): auth alone let any logged-in user spend vision tokens with no business
// membership at all. Tenant-shaped body fields are rejected — this route takes file bytes only.
async function _POST(req: Request, _ctx: unknown, _biz: BusinessContext) {
  let body: { base64?: string; mime?: string; name?: string; business_id?: unknown; businessId?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (body.business_id !== undefined || body.businessId !== undefined) {
    return NextResponse.json({ error: 'business_id is resolved server-side — do not send it' }, { status: 400 })
  }

  const { base64, mime, name = 'image' } = body
  if (!base64 || !mime) return NextResponse.json({ error: 'Missing base64 or mime' }, { status: 422 })
  if (!ALLOWED_MIMES.includes(mime as AllowedMime)) {
    return NextResponse.json({ error: 'Unsupported file type. Only JPEG, PNG, GIF, WEBP allowed.' }, { status: 422 })
  }
  if (base64.length > MAX_B64_LEN) {
    return NextResponse.json({ error: 'File too large (max ~3.75 MB).' }, { status: 413 })
  }

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mime as AllowedMime, data: base64 },
        },
        {
          type: 'text',
          text: `You are helping a small business owner analyse an image they've uploaded to their business dashboard. Describe what you see concisely in 2–4 sentences, focusing on any business-relevant information (receipts, invoices, menus, stockrooms, signage, products, handwritten notes, etc.). File name: ${name}`,
        },
      ],
    }],
  })

  const description = (response.content[0] as { type: string; text?: string }).text?.trim() ?? 'Image attached.'
  return NextResponse.json({ description })
}

export const POST = withBusinessContext('aria/upload', _POST)
