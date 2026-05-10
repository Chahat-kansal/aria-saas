export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import Papa from 'papaparse'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

interface MappingItem {
  source: string
  target: string | null
  confidence: number
  reason?: string
}

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

function mapRow(row: Record<string, string>, mapping: MappingItem[]): Record<string, unknown> | null {
  const out: Record<string, unknown> = {}
  for (const m of mapping) {
    if (!m.target || m.target === 'skip' || m.target === '') continue
    const raw = row[m.source]
    if (raw === undefined || raw === null || raw === '') continue
    const val = String(raw).trim()
    if (m.target === 'unit_price') {
      const n = parseFloat(val.replace(/[^0-9.-]/g, ''))
      if (!isNaN(n)) out.price = n
    } else if (m.target === 'cost_price') {
      const n = parseFloat(val.replace(/[^0-9.-]/g, ''))
      if (!isNaN(n)) out.cost_price = n
    } else if (m.target === 'stock_quantity') {
      const n = parseInt(val.replace(/[^0-9-]/g, ''), 10)
      if (!isNaN(n)) { out.stock_quantity = n; out.track_stock = true }
    } else {
      out[m.target] = val
    }
  }
  if (!out.name) return null
  out.is_active = true
  return out
}

async function processMigration(
  migration_id: string,
  business_id: string,
  csvText: string,
  mapping: MappingItem[],
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  let imported = 0
  let updated = 0
  const errors: string[] = []

  const results = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true })
  const rows = results.data
  const total = rows.length
  const BATCH = 100

  for (let i = 0; i < rows.length; i += BATCH) {
    const { data: cancelled } = await supabase.from('pos_migrations').select('status').eq('id', migration_id).single()
    if (cancelled?.status === 'cancelled') return

    const batch = rows.slice(i, i + BATCH)
    for (const row of batch) {
      const product = mapRow(row, mapping)
      if (!product) continue

      const productWithBiz = { ...product, business_id }
      if (product.barcode) {
        // Upsert on barcode (most reliable unique key)
        const { error, data } = await supabase.from('pos_products')
          .upsert(productWithBiz, { onConflict: 'business_id,barcode', ignoreDuplicates: false })
          .select('id')
        if (error) {
          if (errors.length < 20) errors.push(`${product.name}: ${error.message}`)
        } else {
          // If data was returned, it was an update (record existed)
          const existed = data && data.length > 0
          if (existed) updated++; else imported++
        }
      } else if (product.sku) {
        // Fallback: upsert on SKU
        const { error, data } = await supabase.from('pos_products')
          .upsert(productWithBiz, { onConflict: 'business_id,sku', ignoreDuplicates: false })
          .select('id')
        if (error) {
          if (errors.length < 20) errors.push(`${product.name}: ${error.message}`)
        } else {
          const existed = data && data.length > 0
          if (existed) updated++; else imported++
        }
      } else {
        // No unique key — insert only
        const { error } = await supabase.from('pos_products').insert(productWithBiz)
        if (error) {
          if (errors.length < 20) errors.push(`${product.name}: ${error.message}`)
        } else {
          imported++
        }
      }
    }

    await supabase.from('pos_migrations').update({
      progress: Math.min(98, Math.round(((i + BATCH) / total) * 100)),
      products_imported: imported,
      products_updated: updated,
      updated_at: new Date().toISOString(),
    }).eq('id', migration_id)
  }

  await supabase.from('pos_migrations').update({
    status: 'done',
    progress: 100,
    products_imported: imported,
    products_updated: updated,
    error: errors.length > 0 ? errors.join('; ') : null,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', migration_id)
}

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const action = formData.get('action') as string

  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'no_business' }, { status: 404 })

  if (action === 'suggest_mapping') {
    const headers = JSON.parse(formData.get('headers') as string) as string[]
    const samples = JSON.parse(formData.get('samples') as string) as Record<string, string[]>

    const prompt = `Source columns: ${JSON.stringify(headers)}
Sample values (first 3 per column): ${JSON.stringify(samples)}

Return JSON only — no markdown fences:
{"mappings":[{"source":"col","target":"field_or_null","confidence":0.0,"reason":"brief reason"}]}`

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: `You are mapping CSV column headers to a POS database schema.
Given these source columns and sample values, map each to the closest target field.
Be conservative — only map if confident (>80%). Return JSON only.

Target fields: name, sku, barcode, brand, category, supplier_name, unit_price, cost_price, on_hand, description, tags (comma-separated).

If a column doesn't match any target, set target: null.
{ "mappings": [{ "source": "col", "target": "field", "confidence": 0.9 }] }`,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '{}'
    try {
      const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
      const { firstBrace, lastBrace } = { firstBrace: cleaned.indexOf('{'), lastBrace: cleaned.lastIndexOf('}') }
      const parsed = JSON.parse(firstBrace >= 0 && lastBrace >= 0 ? cleaned.slice(firstBrace, lastBrace + 1) : cleaned)
      return NextResponse.json(parsed)
    } catch {
      return NextResponse.json({ mappings: headers.map((h: string) => ({ source: h, target: null, confidence: 0, reason: 'parse error' })) })
    }
  }

  if (action === 'start_import') {
    const file = formData.get('file') as File
    const source = (formData.get('source') as string) || 'custom_csv'
    const mapping = JSON.parse(formData.get('mapping') as string) as MappingItem[]

    const { data: migration, error } = await supabase.from('pos_migrations').insert({
      business_id: bid,
      source,
      status: 'importing',
      field_mapping: mapping,
      started_at: new Date().toISOString(),
      progress: 0,
    }).select().single()

    if (error || !migration) return NextResponse.json({ error: error?.message ?? 'insert_failed' }, { status: 500 })

    const csvText = await file.text()
    void processMigration(migration.id, bid, csvText, mapping)

    return NextResponse.json({ migration_id: migration.id })
  }

  if (action === 'cancel') {
    const migration_id = formData.get('migration_id') as string
    if (migration_id) {
      await supabase.from('pos_migrations').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', migration_id).eq('business_id', bid)
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'unknown_action' }, { status: 400 })
}

export async function GET(request: NextRequest) {
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 })

  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabase.from('pos_migrations').select('*').eq('id', id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ migration: data })
}
