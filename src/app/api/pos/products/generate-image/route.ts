export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import sharp from 'sharp'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getImageCreditStatus } from '@/lib/pos/auto-fetch-image'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const BUCKET = 'pos-images'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

async function normalizeFromBuffer(buffer: Buffer): Promise<{ main: Buffer; thumb: Buffer }> {
  let quality = 85
  let mainBuf = await sharp(buffer)
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toBuffer()
  while (mainBuf.byteLength > 153600 && quality > 30) {
    quality -= 10
    mainBuf = await sharp(buffer)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer()
  }
  const thumbBuf = await sharp(buffer)
    .resize(200, 200, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer()
  return { main: mainBuf, thumb: thumbBuf }
}

async function _POST(req: Request) {
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    return NextResponse.json({ error: 'AI image generation is not configured (OPENAI_API_KEY missing)' }, { status: 503 })
  }

  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    productId?: string
    name: string
    description?: string
    categoryName?: string
    businessId: string
  }
  if (!body.name?.trim()) return NextResponse.json({ error: 'Product name required' }, { status: 400 })
  if (!body.businessId) return NextResponse.json({ error: 'businessId required' }, { status: 400 })

  // Verify business ownership
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', body.businessId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Gate: paid credits required for AI gen
  const sb = adminClient()
  const credits = await getImageCreditStatus(body.businessId)
  if (credits.paid_credits <= 0) {
    return NextResponse.json({ error: 'No AI generation credits. Purchase credits to generate images.', credits }, { status: 402 })
  }

  // Build a precise product prompt
  const categoryCtx = body.categoryName ? ' Category: ' + body.categoryName + '.' : ''
  const descCtx = body.description?.trim() ? ' ' + body.description.trim().slice(0, 120) + '.' : ''
  const prompt = 'Professional product photograph: ' + body.name.trim() + '.' + categoryCtx + descCtx + ' Clean white background, studio lighting, sharp focus, centered, commercial product photography.'

  // Generate via OpenAI
  const { default: OpenAI } = await import('openai')
  const openai = new OpenAI({ apiKey: openaiKey })
  const genRes = await openai.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: '1024x1024',
    quality: 'standard',
    response_format: 'url',
  })
  const imageUrl = genRes.data?.[0]?.url
  if (!imageUrl) return NextResponse.json({ error: 'AI generation returned no image' }, { status: 500 })

  // Download, normalize, upload
  const imgRes = await fetch(imageUrl)
  if (!imgRes.ok) return NextResponse.json({ error: 'Failed to download generated image' }, { status: 500 })
  const buffer = Buffer.from(await imgRes.arrayBuffer())
  const { main, thumb } = await normalizeFromBuffer(buffer)

  const ts = Date.now()
  const productId = body.productId
  const basePath = productId
    ? 'owner-products/' + productId + '-ai-' + ts
    : 'owner-products/ai-' + user.id.slice(0, 8) + '-' + ts

  const [mainUpload, thumbUpload] = await Promise.all([
    sb.storage.from(BUCKET).upload(basePath + '.webp', main, { contentType: 'image/webp', upsert: true }),
    sb.storage.from(BUCKET).upload(basePath + '-thumb.webp', thumb, { contentType: 'image/webp', upsert: true }),
  ])
  if (mainUpload.error) return NextResponse.json({ error: mainUpload.error.message }, { status: 500 })

  const image_url = sb.storage.from(BUCKET).getPublicUrl(basePath + '.webp').data.publicUrl
  const image_thumb_url = thumbUpload.error
    ? null
    : sb.storage.from(BUCKET).getPublicUrl(basePath + '-thumb.webp').data.publicUrl

  // Update pos_products if productId provided
  if (productId) {
    await sb.from('pos_products').update({
      image_url,
      image_thumb_url,
      image_source: 'ai',
      updated_at: new Date().toISOString(),
    }).eq('id', productId)
  }

  // Deduct paid credit + log transaction
  await Promise.all([
    sb.rpc('decrement_paid_credit', { bid: body.businessId }),
    sb.from('pos_image_transactions').insert({
      business_id: body.businessId,
      product_id: productId ?? null,
      type: 'ai_generate',
      bg_removed: false,
      amount_charged: 0.04,
    }),
  ])

  const remaining = Math.max(0, credits.paid_credits - 1)
  return NextResponse.json({ image_url, image_thumb_url, remaining_credits: remaining })
}

export const POST = withErrorCapture('pos/products/generate-image', _POST)
