import { supabaseAdmin } from '@/lib/supabase-admin'
import { logSyncStart, logSyncComplete } from './sync-logger'

const HEADER_MAP: Record<string, string> = {
  'product name': 'name', 'product title': 'name', 'item name': 'name',
  'title': 'name', 'name': 'name', 'product': 'name',
  'price': 'price', 'rrp': 'price', 'sell price': 'price',
  'retail price': 'price', 'selling price': 'price', 'unit price': 'price',
  'cost': 'cost_price', 'cost price': 'cost_price', 'buy price': 'cost_price',
  'wholesale': 'cost_price', 'purchase price': 'cost_price', 'cost ex': 'cost_price',
  'sku': 'sku', 'product code': 'sku', 'item code': 'sku', 'code': 'sku', 'product sku': 'sku',
  'barcode': 'barcode', 'ean': 'barcode', 'upc': 'barcode', 'gtin': 'barcode', 'product barcode': 'barcode',
  'stock': 'stock_quantity', 'stock on hand': 'stock_quantity', 'quantity': 'stock_quantity',
  'qty': 'stock_quantity', 'on hand': 'stock_quantity', 'stock level': 'stock_quantity',
  'category': 'category', 'department': 'category', 'product type': 'category', 'type': 'category',
  'brand': 'brand', 'manufacturer': 'brand', 'vendor': 'brand',
  'supplier': 'supplier_name', 'supplier name': 'supplier_name',
  'description': 'description', 'product description': 'description', 'details': 'description',
  'abv': 'alcohol_percentage', 'alcohol %': 'alcohol_percentage',
  'alcohol percentage': 'alcohol_percentage', 'alc %': 'alcohol_percentage',
  'standard drinks': 'standard_drinks', 'std drinks': 'standard_drinks',
  'volume': 'volume', 'volume (ml)': 'volume', 'size': 'volume', 'pack size': 'volume',
  'country': 'country_of_origin', 'country of origin': 'country_of_origin', 'region': 'country_of_origin',
  'vintage': 'vintage', 'year': 'vintage',
  'active': 'is_active', 'enabled': 'is_active', 'status': 'is_active',
  'track inventory': 'track_inventory', 'track stock': 'track_inventory',
  'age restricted': 'age_restricted', 'age restriction': 'age_restricted',
  'reorder point': 'reorder_point', 'reorder level': 'reorder_point', 'min stock': 'reorder_point',
  'image': 'image_url', 'image url': 'image_url', 'image link': 'image_url',
}

function normaliseHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[_\-]/g, ' ')
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  if (!lines.length) return { headers: [], rows: [] }

  const parseRow = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim()); current = ''
      } else {
        current += ch
      }
    }
    result.push(current.trim())
    return result
  }

  const headers = parseRow(lines[0])
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = parseRow(line)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = values[idx] ?? '' })
    rows.push(row)
  }
  return { headers, rows }
}

export async function importCSV(
  businessId: string,
  csvText: string,
  source = 'csv_import',
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const eventId = await logSyncStart(businessId, source, 'csv_import')
  const { headers, rows } = parseCSV(csvText)
  const errors: string[] = []
  let imported = 0
  let skipped = 0

  const mapping: Record<string, string> = {}
  for (const h of headers) {
    const mapped = HEADER_MAP[normaliseHeader(h)]
    if (mapped) mapping[h] = mapped
  }

  const products: object[] = []

  for (const row of rows) {
    const product: Record<string, unknown> = {
      business_id: businessId,
      source,
      is_active: true,
      track_inventory: true,
      updated_at: new Date().toISOString(),
    }

    for (const [rawHeader, rawValue] of Object.entries(row)) {
      const field = mapping[rawHeader]
      if (!field || !rawValue) continue
      const value = rawValue.trim()
      switch (field) {
        case 'name': product.name = value; break
        // All CSV amounts are DOLLARS — no conversion needed
        case 'price': product.price = Number(value.replace(/[^0-9.]/g, '')) || 0; break
        case 'cost_price': product.cost_price = Number(value.replace(/[^0-9.]/g, '')) || 0; break
        case 'stock_quantity': product.stock_quantity = Math.round(Number(value) || 0); break
        case 'reorder_point': product.reorder_point = Math.round(Number(value) || 0); break
        case 'alcohol_percentage': product.alcohol_percentage = Number(value) || null; break
        case 'standard_drinks': product.standard_drinks = Number(value) || null; break
        case 'volume': product.volume = Number(value.replace(/[^0-9.]/g, '')) || null; break
        case 'vintage': product.vintage = Math.round(Number(value)) || null; break
        case 'is_active':
          product.is_active = !['false', '0', 'no', 'inactive', 'disabled'].includes(value.toLowerCase())
          break
        case 'track_inventory':
          product.track_inventory = !['false', '0', 'no'].includes(value.toLowerCase())
          break
        case 'age_restricted':
          product.age_restricted = ['true', '1', 'yes', 'y'].includes(value.toLowerCase())
          break
        default: product[field] = value
      }
    }

    if (!product.name) { skipped++; continue }
    if (product.price === undefined || product.price === null) product.price = 0
    products.push(product)
  }

  const withBarcode = products.filter(p => (p as Record<string, unknown>).barcode)
  const withSku = products.filter(p => !(p as Record<string, unknown>).barcode && (p as Record<string, unknown>).sku)
  const withNeither = products.filter(p => !(p as Record<string, unknown>).barcode && !(p as Record<string, unknown>).sku)

  try {
    for (let i = 0; i < withBarcode.length; i += 250) {
      await supabaseAdmin.from('pos_products').upsert(withBarcode.slice(i, i + 250) as never[])
      imported += Math.min(250, withBarcode.length - i)
    }
    for (let i = 0; i < withSku.length; i += 250) {
      await supabaseAdmin.from('pos_products').upsert(withSku.slice(i, i + 250) as never[])
      imported += Math.min(250, withSku.length - i)
    }
    for (let i = 0; i < withNeither.length; i += 250) {
      await supabaseAdmin.from('pos_products').insert(withNeither.slice(i, i + 250) as never[])
      imported += Math.min(250, withNeither.length - i)
    }
  } catch (e) {
    errors.push(String(e))
  }

  await logSyncComplete(eventId, imported, errors.length ? errors[0] : undefined)
  return { imported, skipped, errors }
}
