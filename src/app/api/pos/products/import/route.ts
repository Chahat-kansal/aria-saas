export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Papa from 'papaparse'

const HEADER_MAP: Record<string, string> = {
  // Name
  'product name': 'name', 'item name': 'name', 'product title': 'name',
  'title': 'name', 'name': 'name', 'product': 'name',
  // Price (DOLLARS)
  'rrp': 'price', 'sell price': 'price', 'selling price': 'price',
  'retail price': 'price', 'price': 'price', 'unit price': 'price', 'sale price': 'price',
  // Cost (DOLLARS)
  'cost price': 'cost_price', 'cost': 'cost_price', 'buy price': 'cost_price',
  'wholesale': 'cost_price', 'purchase price': 'cost_price', 'cost ex': 'cost_price',
  // SKU
  'sku': 'sku', 'product code': 'sku', 'item code': 'sku', 'code': 'sku', 'product sku': 'sku',
  // Barcode
  'barcode': 'barcode', 'ean': 'barcode', 'upc': 'barcode', 'gtin': 'barcode',
  'product barcode': 'barcode', 'ean/upc': 'barcode',
  // Stock
  'stock on hand': 'stock_quantity', 'stock qty': 'stock_quantity', 'quantity': 'stock_quantity',
  'qty': 'stock_quantity', 'on hand': 'stock_quantity', 'stock level': 'stock_quantity',
  'current stock': 'stock_quantity', 'available': 'stock_quantity', 'stock': 'stock_quantity',
  // Reorder
  'reorder point': 'reorder_point', 'reorder level': 'reorder_point', 'min stock': 'reorder_point',
  'minimum stock': 'reorder_point', 'reorder qty': 'reorder_point',
  // Category
  'category': 'category', 'department': 'category', 'product type': 'category',
  'type': 'category', 'product category': 'category',
  // Brand
  'brand': 'brand', 'manufacturer': 'brand', 'supplier brand': 'brand',
  'product brand': 'brand', 'label': 'brand',
  // Supplier
  'supplier': 'supplier_name', 'supplier name': 'supplier_name', 'vendor': 'supplier_name',
  'distributor': 'supplier_name',
  // Description
  'description': 'description', 'product description': 'description',
  'details': 'description', 'notes': 'description',
  // Alcohol
  'alcohol %': 'alcohol_percentage', 'abv': 'alcohol_percentage',
  'alcohol percentage': 'alcohol_percentage', 'alc %': 'alcohol_percentage',
  'alcohol': 'alcohol_percentage', 'alc. %': 'alcohol_percentage',
  // Standard drinks
  'standard drinks': 'standard_drinks', 'std drinks': 'standard_drinks',
  'std. drinks': 'standard_drinks', 'standard drink units': 'standard_drinks',
  // Volume
  'volume (ml)': 'volume', 'volume': 'volume', 'size': 'volume',
  'pack size': 'volume', 'capacity': 'volume', 'ml': 'volume', 'size (ml)': 'volume',
  // Country
  'country': 'country_of_origin', 'country of origin': 'country_of_origin',
  'region': 'country_of_origin', 'origin': 'country_of_origin',
  // Vintage
  'vintage': 'vintage', 'year': 'vintage', 'vintage year': 'vintage',
  // Booleans
  'active': 'is_active', 'enabled': 'is_active', 'status': 'is_active',
  'is active': 'is_active', 'active?': 'is_active',
  'track inventory': 'track_inventory', 'track stock': 'track_inventory',
  'inventory tracked': 'track_inventory', 'tracked': 'track_inventory',
  'age restricted': 'age_restricted', 'age restriction': 'age_restricted',
  'age verify': 'age_restricted', 'restricted': 'age_restricted',
  // Case
  'items per case': 'items_per_case', 'case quantity': 'items_per_case',
  'case qty': 'items_per_case', 'pack qty': 'items_per_case',
  // Images
  'image': 'image_url', 'image url': 'image_url', 'image link': 'image_url', 'photo': 'image_url',
}

function normalise(h: string): string {
  return h.toLowerCase().trim().replace(/[_\-]/g, ' ')
}

function parseBool(v: string): boolean {
  return !['false', '0', 'no', 'inactive', 'disabled', 'n', ''].includes(v.toLowerCase().trim())
}

function parseMoney(v: string): number {
  return Number(v.replace(/[^0-9.-]/g, '')) || 0
}

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST(req: Request) {
  const t0 = Date.now()
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'File exceeds 10MB limit' }, { status: 413 })

  const csvText = await file.text()

  // Parse CSV with papaparse
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim(),
  })

  if (!parsed.data.length) {
    return NextResponse.json({ error: 'CSV is empty or invalid' }, { status: 400 })
  }

  // Build header mapping from actual CSV headers
  const rawHeaders = parsed.meta.fields ?? []
  const mapping: Record<string, string> = {}
  for (const h of rawHeaders) {
    const mapped = HEADER_MAP[normalise(h)]
    if (mapped) mapping[h] = mapped
  }

  const errors: string[] = []
  let skipped = 0
  let imported = 0

  const withBarcode: object[] = []
  const withSku: object[] = []
  const withNeither: object[] = []

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i]
    const product: Record<string, unknown> = {
      business_id: bid,
      source: 'import',
      is_active: true,
      track_inventory: true,
      volume_unit: 'ml',
    }

    for (const [rawHeader, rawValue] of Object.entries(row)) {
      const field = mapping[rawHeader]
      if (!field || rawValue === undefined || rawValue === null) continue
      const value = String(rawValue).trim()
      if (!value) continue

      switch (field) {
        case 'name': product.name = value; break
        case 'price': product.price = parseMoney(value); break
        case 'cost_price': product.cost_price = parseMoney(value); break
        case 'sku': product.sku = value; break
        case 'barcode': product.barcode = value; break
        case 'stock_quantity': product.stock_quantity = Math.round(Number(value) || 0); break
        case 'reorder_point': product.reorder_point = Math.round(Number(value) || 0); break
        case 'items_per_case': product.items_per_case = Math.round(Number(value) || 0); break
        case 'alcohol_percentage': product.alcohol_percentage = Number(value) || null; break
        case 'standard_drinks': product.standard_drinks = Number(value) || null; break
        case 'volume': product.volume = Number(value.replace(/[^0-9.]/g, '')) || null; break
        case 'vintage': product.vintage = Math.round(Number(value)) || null; break
        case 'is_active': product.is_active = parseBool(value); break
        case 'track_inventory': product.track_inventory = parseBool(value); break
        case 'age_restricted':
          product.age_restricted = ['true','1','yes','y'].includes(value.toLowerCase())
          product.is_age_restricted = product.age_restricted
          break
        default: product[field] = value
      }
    }

    // Validate required fields
    if (!product.name) {
      skipped++
      if (errors.length < 10) errors.push(`Row ${i + 2}: missing product name`)
      continue
    }
    if (product.price === undefined || product.price === null) product.price = 0

    // Route to correct upsert bucket
    const barcode = product.barcode as string | undefined
    const sku = product.sku as string | undefined
    if (barcode && barcode.length > 0) {
      withBarcode.push(product)
    } else if (sku && sku.length > 0) {
      withSku.push(product)
    } else {
      withNeither.push(product)
    }
  }

  // Batch upsert: barcode conflict
  for (let i = 0; i < withBarcode.length; i += 250) {
    const chunk = withBarcode.slice(i, i + 250)
    const { error } = await supabaseAdmin.from('pos_products')
      .upsert(chunk as never[], { onConflict: 'business_id,barcode', ignoreDuplicates: false })
    if (error) {
      errors.push(`Barcode batch ${Math.floor(i / 250) + 1}: ${error.message}`)
    } else {
      imported += chunk.length
    }
  }

  // Batch upsert: sku conflict
  for (let i = 0; i < withSku.length; i += 250) {
    const chunk = withSku.slice(i, i + 250)
    const { error } = await supabaseAdmin.from('pos_products')
      .upsert(chunk as never[], { onConflict: 'business_id,sku', ignoreDuplicates: false })
    if (error) {
      errors.push(`SKU batch ${Math.floor(i / 250) + 1}: ${error.message}`)
    } else {
      imported += chunk.length
    }
  }

  // Batch insert: no unique key (plain insert — may create duplicates on re-import)
  for (let i = 0; i < withNeither.length; i += 250) {
    const chunk = withNeither.slice(i, i + 250)
    const { error } = await supabaseAdmin.from('pos_products').insert(chunk as never[])
    if (error) {
      errors.push(`Insert batch ${Math.floor(i / 250) + 1}: ${error.message}`)
    } else {
      imported += chunk.length
    }
  }

  return NextResponse.json({
    imported,
    skipped,
    errors: errors.slice(0, 10),
    total_rows: parsed.data.length,
    duration_ms: Date.now() - t0,
    mapped_headers: Object.values(mapping),
  })
}

export const POST = withErrorCapture('pos/products/import', _POST)
