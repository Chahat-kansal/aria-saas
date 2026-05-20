export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

// GET — list all supplier price lists for a business
export async function GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: lists } = await supabaseAdmin
    .from('supplier_price_lists')
    .select('id,supplier_name,supplier_type,file_name,uploaded_at,parsed_at,item_count,is_active')
    .eq('business_id', business_id)
    .eq('is_active', true)
    .order('uploaded_at', { ascending: false })

  return NextResponse.json({ lists: lists ?? [] })
}

// POST — upload + parse a price list (CSV/Excel text content or manual JSON)
export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    business_id: string
    supplier_name: string
    supplier_type?: string
    content: string        // CSV text, paste from PDF, or product list
    file_name?: string
  }

  const { business_id, supplier_name, content, file_name } = body
  if (!business_id || !supplier_name || !content) {
    return NextResponse.json({ error: 'business_id, supplier_name, content required' }, { status: 400 })
  }

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Use Claude to parse the price list — handles any format (CSV, PDF paste, table, list)
  const parsePrompt = `You are a price list parser for an Australian retail/liquor business. Parse this supplier price list and extract every product with its pricing.

Supplier: ${supplier_name}
Content:
${content.slice(0, 8000)}

Extract every product. Return ONLY valid JSON array, no other text:
[
  {
    "product_name": "Full product name",
    "sku": "supplier SKU or null",
    "barcode": "barcode/EAN or null",
    "unit_price": 12.99,
    "case_price": 155.88,
    "case_qty": 12,
    "unit_of_measure": "750ml",
    "category": "Wine",
    "brand": "Brand name or null",
    "in_stock": true
  }
]
- unit_price = price per single unit in AUD (number, not string)
- case_price = price per carton/case in AUD (or null if not given)
- case_qty = units per case (or null)
- If only case price given, leave unit_price null
- Return [] if content is not a price list`

  let items: Array<{
    product_name: string; sku?: string; barcode?: string
    unit_price?: number; case_price?: number; case_qty?: number
    unit_of_measure?: string; category?: string; brand?: string; in_stock?: boolean
  }> = []

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: parsePrompt }],
    })
    const text = response.content.filter(b => b.type === 'text').map(b => (b as {type:'text';text:string}).text).join('')
    const clean = text.replace(/```json|```/g, '').trim()
    items = JSON.parse(clean)
    if (!Array.isArray(items)) items = []
  } catch {
    return NextResponse.json({ error: 'Failed to parse price list — try a cleaner CSV format' }, { status: 400 })
  }

  // Save price list record
  const { data: list, error: listErr } = await supabaseAdmin.from('supplier_price_lists').insert({
    business_id,
    supplier_name,
    supplier_type: body.supplier_type ?? 'custom',
    file_name: file_name ?? supplier_name,
    item_count: items.length,
    parsed_at: new Date().toISOString(),
  }).select('id').single()

  if (listErr || !list) return NextResponse.json({ error: 'Failed to save price list' }, { status: 500 })

  // Save items
  if (items.length > 0) {
    const rows = items.map(item => ({
      list_id: list.id,
      business_id,
      supplier_name,
      product_name: item.product_name,
      sku: item.sku ?? null,
      barcode: item.barcode ?? null,
      unit_price: item.unit_price ?? null,
      case_price: item.case_price ?? null,
      case_qty: item.case_qty ?? null,
      unit_of_measure: item.unit_of_measure ?? null,
      category: item.category ?? null,
      brand: item.brand ?? null,
      in_stock: item.in_stock ?? true,
      effective_date: new Date().toISOString().slice(0, 10),
    }))

    // Insert in batches of 100
    for (let i = 0; i < rows.length; i += 100) {
      await supabaseAdmin.from('supplier_price_items').insert(rows.slice(i, i + 100))
    }
  }

  return NextResponse.json({ ok: true, list_id: list.id, items_parsed: items.length, supplier_name })
}

// DELETE — deactivate a price list
export async function DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json() as { id: string }
  await supabaseAdmin.from('supplier_price_lists').update({ is_active: false }).eq('id', id)
  return NextResponse.json({ ok: true })
}
