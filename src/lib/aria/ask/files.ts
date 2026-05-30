import { supabaseAdmin } from '@/lib/supabase-admin'

export type ExportFormat = 'csv' | 'excel' | 'pdf'
export type ExportSubject = 'sales' | 'inventory' | 'staff' | 'customers' | 'products'

export interface ExportResult {
  url: string
  filename: string
  format: ExportFormat
  row_count: number
}

// ─── Data fetchers ──────────────────────────────────────────────────────────

async function fetchSales(businessId: string, period: string) {
  const since = periodToDate(period)
  const { data } = await supabaseAdmin
    .from('pos_sales')
    .select('id,created_at,total_price,payment_method,register_id,pos_users(name)')
    .eq('business_id', businessId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(2000)
  return (data ?? []).map((r: Record<string, unknown>) => ({
    date: String(r.created_at ?? '').slice(0, 19).replace('T', ' '),
    total: (Number(r.total_price) || 0).toFixed(2),
    payment: String(r.payment_method ?? ''),
    staff: String((r.pos_users as Record<string,unknown> | null)?.name ?? ''),
  }))
}

async function fetchInventory(businessId: string) {
  const { data } = await supabaseAdmin
    .from('pos_outlet_inventory')
    .select('items_on_hand,items_reorder_level,pos_products(name,sku)')
    .eq('business_id', businessId)
    .limit(2000)
  return (data ?? []).map((r: Record<string, unknown>) => ({
    name: String((r.pos_products as Record<string,unknown> | null)?.name ?? ''),
    sku: String((r.pos_products as Record<string,unknown> | null)?.sku ?? ''),
    qty: String(Number(r.items_on_hand) || 0),
    reorder_point: r.items_reorder_level != null ? String(r.items_reorder_level) : '',
  }))
}

async function fetchStaff(businessId: string) {
  const { data } = await supabaseAdmin
    .from('pos_users')
    .select('name,email,role,created_at')
    .eq('business_id', businessId)
    .limit(500)
  return (data ?? []).map((r: Record<string, unknown>) => ({
    name: String(r.name ?? ''),
    email: String(r.email ?? ''),
    role: String(r.role ?? ''),
    joined: String(r.created_at ?? '').slice(0, 10),
  }))
}

async function fetchCustomers(businessId: string) {
  const { data } = await supabaseAdmin
    .from('pos_customers')
    .select('first_name,last_name,email,phone,created_at,loyalty_points')
    .eq('business_id', businessId)
    .limit(2000)
  return (data ?? []).map((r: Record<string, unknown>) => ({
    name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
    email: String(r.email ?? ''),
    phone: String(r.phone ?? ''),
    loyalty_points: String(Number(r.loyalty_points) || 0),
    joined: String(r.created_at ?? '').slice(0, 10),
  }))
}

async function fetchProducts(businessId: string) {
  const { data } = await supabaseAdmin
    .from('pos_products')
    .select('name,sku,price,cost_price,stock_quantity,category_id,brand_id')
    .eq('business_id', businessId)
    .limit(2000)
  return (data ?? []).map((r: Record<string, unknown>) => ({
    name: String(r.name ?? ''),
    sku: String(r.sku ?? ''),
    price: (Number(r.price) || 0).toFixed(2),
    cost: (Number(r.cost_price) || 0).toFixed(2),
    stock: String(Number(r.stock_quantity) || 0),
  }))
}

// ─── Format builders ────────────────────────────────────────────────────────

function toCsv(headers: string[], rows: Record<string, string>[]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  const head = headers.map(escape).join(',')
  const body = rows.map(r => headers.map(h => escape(r[h] ?? '')).join(',')).join('\n')
  return `${head}\n${body}`
}

function toExcel(headers: string[], rows: Record<string, string>[]): string {
  const cell = (v: string) => `<Cell><Data ss:Type="String">${v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</Data></Cell>`
  const headerRow = `<Row>${headers.map(h => cell(h)).join('')}</Row>`
  const dataRows = rows.map(r => `<Row>${headers.map(h => cell(r[h] ?? '')).join('')}</Row>`).join('\n')
  return `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Export">
  <Table>
   ${headerRow}
   ${dataRows}
  </Table>
 </Worksheet>
</Workbook>`
}

function toPdf(title: string, headers: string[], rows: Record<string, string>[]): string {
  const tableRows = rows.slice(0, 500).map(r =>
    `<tr>${headers.map(h => `<td style="border:1px solid #ccc;padding:4px 8px;font-size:11px">${(r[h] ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')}</td>`).join('')}</tr>`
  ).join('\n')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:sans-serif;padding:24px}h1{font-size:18px;margin-bottom:12px}table{border-collapse:collapse;width:100%}th{background:#2D5240;color:#fff;padding:6px 8px;text-align:left;font-size:12px}</style>
</head><body><h1>${title}</h1><p style="font-size:12px;color:#666">Generated ${new Date().toLocaleString()} · ${rows.length} rows</p>
<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${tableRows}</tbody></table></body></html>`
}

// ─── Period helper ───────────────────────────────────────────────────────────

function periodToDate(period: string): string {
  const now = new Date()
  if (period === 'today') { const d = new Date(now); d.setHours(0,0,0,0); return d.toISOString() }
  if (period === 'week') return new Date(now.getTime() - 7 * 86400_000).toISOString()
  return new Date(now.getTime() - 30 * 86400_000).toISOString()
}

// ─── Main export function ────────────────────────────────────────────────────

export async function generateExport(
  businessId: string,
  subject: ExportSubject,
  format: ExportFormat,
  period = 'month',
): Promise<ExportResult> {
  let headers: string[]
  let rows: Record<string, string>[]

  switch (subject) {
    case 'sales':
      rows = await fetchSales(businessId, period)
      headers = ['date', 'total', 'payment', 'staff']
      break
    case 'inventory':
      rows = await fetchInventory(businessId)
      headers = ['name', 'sku', 'qty', 'reorder_point']
      break
    case 'staff':
      rows = await fetchStaff(businessId)
      headers = ['name', 'email', 'role', 'joined']
      break
    case 'customers':
      rows = await fetchCustomers(businessId)
      headers = ['name', 'email', 'phone', 'loyalty_points', 'joined']
      break
    case 'products':
    default:
      rows = await fetchProducts(businessId)
      headers = ['name', 'sku', 'price', 'cost', 'stock']
      break
  }

  const ts = Date.now()
  let content: string
  let mimeType: string
  let ext: string

  if (format === 'excel') {
    content = toExcel(headers, rows)
    mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ext = 'xlsx'
  } else if (format === 'pdf') {
    content = toPdf(`${subject} report`, headers, rows)
    mimeType = 'text/html'
    ext = 'html'
  } else {
    content = toCsv(headers, rows)
    mimeType = 'text/csv'
    ext = 'csv'
  }

  const filename = `${businessId}/${subject}-${period}-${ts}.${ext}`
  const bytes = Buffer.from(content, 'utf-8')

  const { error: uploadErr } = await supabaseAdmin.storage
    .from('aria-exports')
    .upload(filename, bytes, { contentType: mimeType, upsert: true })

  if (uploadErr) throw new Error(`Export upload failed: ${uploadErr.message}`)

  const { data: urlData, error: urlErr } = await supabaseAdmin.storage
    .from('aria-exports')
    .createSignedUrl(filename, 3600)

  if (urlErr || !urlData?.signedUrl) throw new Error(`Could not generate download URL: ${urlErr?.message}`)

  // Schedule deletion after 24h — fire and forget
  setTimeout(async () => {
    await supabaseAdmin.storage.from('aria-exports').remove([filename]).catch(() => { /* non-fatal */ })
  }, 24 * 3600_000)

  return {
    url: urlData.signedUrl,
    filename: `${subject}-${period}.${ext}`,
    format,
    row_count: rows.length,
  }
}
