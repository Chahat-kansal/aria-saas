export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

interface ClassificationResult {
  gst_treatment: 'taxable' | 'gst_free' | 'input_taxed' | 'out_of_scope'
  ato_tax_code: string
  confidence: number
  reasoning: string
}

async function _POST() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id,industry').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  // Get unclassified products
  const { data: classified } = await supabaseAdmin
    .from('product_tax_classifications')
    .select('product_id')
    .eq('business_id', biz.id)

  const classifiedIds = new Set((classified ?? []).map(c => c.product_id))

  const { data: products } = await supabaseAdmin
    .from('pos_products')
    .select('id,name,category,description')
    .eq('business_id', biz.id)
    .eq('is_active', true)

  const unclassified = (products ?? []).filter(p => !classifiedIds.has(p.id))

  const needsReview: Array<{ id: string; name: string; confidence: number; reasoning: string }> = []
  let classified_count = 0

  // Process in batches of 20
  for (let i = 0; i < unclassified.length; i += 20) {
    const batch = unclassified.slice(i, i + 20)
    const rows: Array<Record<string, unknown>> = []

    for (const product of batch) {
      try {
        const resp = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 150,
          system: 'You are an Australian tax classification expert. Classify this product for GST purposes under Australian tax law. Respond with JSON only.',
          messages: [{
            role: 'user',
            content: 'Product: ' + product.name + '. Category: ' + (product.category ?? 'unknown') + '. Industry: ' + (biz.industry ?? 'retail') + '.\n' +
              'Respond: {"gst_treatment":"taxable|gst_free|input_taxed|out_of_scope","ato_tax_code":"1A|5A|7A","confidence":0.0-1.0,"reasoning":"brief"}',
          }],
        })

        const text = (resp.content[0] as { type: string; text: string }).type === 'text'
          ? (resp.content[0] as { text: string }).text : '{}'

        let result: ClassificationResult
        try {
          result = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as ClassificationResult
        } catch {
          result = { gst_treatment: 'taxable', ato_tax_code: '1A', confidence: 0.5, reasoning: 'Parse error' }
        } // JSON parse failure handled with default

        rows.push({
          business_id: biz.id,
          product_id: product.id,
          gst_treatment: result.gst_treatment ?? 'taxable',
          ato_tax_code: result.ato_tax_code ?? '1A',
          classification_source: 'ai_suggested',
          ai_confidence: result.confidence ?? 0.5,
          notes: result.reasoning ?? '',
          classified_by: 'ai',
        })

        if ((result.confidence ?? 0.5) < 0.7) {
          needsReview.push({ id: product.id, name: product.name, confidence: result.confidence ?? 0.5, reasoning: result.reasoning ?? '' })
        }

        classified_count++
      } catch (e) { console.error('[bas/classify-products] per-product classification error:', e) }
    }

    if (rows.length > 0) {
      await supabaseAdmin
        .from('product_tax_classifications')
        .upsert(rows as Parameters<typeof supabaseAdmin.from>[0] extends never ? never : never[], { onConflict: 'business_id,product_id' })
    }
  }

  return NextResponse.json({ classified: classified_count, needs_review: needsReview })
}

export const POST = withErrorCapture('agents/bas/classify-products', _POST)
