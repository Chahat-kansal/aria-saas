export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { ocrReceipt } from '@/lib/pos/receipt-ocr'

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
}

async function _POST(req: Request, _ctx: unknown, { supabase, businessId: bid }: BusinessContext) {
  const body = await req.json()
  const { image_base64, image_mime_type, sale_id } = body
  if (!image_base64 || !image_mime_type) return NextResponse.json({ error: 'image_base64 and image_mime_type required' }, { status: 400 })

  // Upload to Supabase Storage
  const ext = image_mime_type.split('/')[1] ?? 'jpg'
  const filename = `${bid}/${crypto.randomUUID()}.${ext}`
  let imageUrl: string | null = null
  try {
    const imageBytes = Buffer.from(image_base64, 'base64')
    const admin = adminClient()
    const { error: uploadErr } = await admin.storage.from('receipt-ocr').upload(filename, imageBytes, { contentType: image_mime_type, upsert: false })
    if (!uploadErr) {
      const { data: urlData } = admin.storage.from('receipt-ocr').getPublicUrl(filename)
      imageUrl = urlData?.publicUrl ?? null
    }
  } catch { /* storage optional — OCR still runs */ }

  // Insert scan record
  const { data: scan, error: scanErr } = await supabase.from('receipt_ocr_scans').insert({
    business_id: bid,
    sale_id: sale_id ?? null,
    image_url: imageUrl,
    ocr_status: 'scanning',
    created_at: new Date().toISOString(),
  }).select('id').single()
  if (scanErr) return NextResponse.json({ error: scanErr.message }, { status: 500 })

  // Run Claude vision OCR
  const result = await ocrReceipt(image_base64, image_mime_type)

  // Update scan with results
  await supabase.from('receipt_ocr_scans').update({
    raw_response: JSON.stringify(result),
    detected_items: result.items,
    detected_subtotal: result.subtotal,
    detected_tax: result.tax,
    detected_tip: result.tip,
    detected_total: result.total,
    confidence_score: result.confidence,
    ocr_status: result.error ? 'failed' : 'done',
    completed_at: new Date().toISOString(),
  }).eq('id', scan.id)

  return NextResponse.json({ scan_id: scan.id, items: result.items, subtotal: result.subtotal, tax: result.tax, tip: result.tip, total: result.total, confidence: result.confidence }, { status: 201 })
}

export const POST = withBusinessContext('pos/splits/ocr', _POST)
