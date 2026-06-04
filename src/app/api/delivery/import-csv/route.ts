export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: a } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (a?.business_id) return a.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

function parseNum(v: string | undefined): number {
  if (!v) return 0
  return parseFloat(v.replace(/[^0-9.-]/g, '')) || 0
}

function detectPlatform(headers: string[]): string {
  const h = headers.map(x => x.toLowerCase())
  if (h.some(x => x.includes('uber service fee') || x.includes('food sales'))) return 'uber_eats'
  if (h.some(x => x.includes('dasher') || x.includes('error charge') || x.includes('doordash'))) return 'doordash'
  if (h.some(x => x.includes('menulog') || x.includes('order reference'))) return 'menulog'
  if (h.some(x => x.includes('deliveroo'))) return 'deliveroo'
  return 'custom'
}

function parseRow(row: Record<string, string>, platform: string, commissionRate: number): {
  platform_order_id: string; platform_order_number: string; total: number;
  commission: number; net_payout: number; status: string; created_at: string;
  customer_name: string;
} | null {
  if (platform === 'uber_eats') {
    const orderId = row['Order ID'] ?? row['order_id'] ?? row['Trip/Eats ID']
    if (!orderId) return null
    const foodSales = parseNum(row['Food Sales'] ?? row['Subtotal'])
    const serviceFee = parseNum(row['Uber Service Fee'] ?? row['Service Fee'])
    const adjustments = parseNum(row['Adjustments'] ?? '0')
    const commission = serviceFee - adjustments
    const netPayout = parseNum(row['Total Payout'] ?? row['Net Payout'])
    const orderStatus = (row['Order Status'] ?? '').toLowerCase()
    const status = orderStatus.includes('cancel') || orderStatus.includes('refund') ? 'cancelled' : 'delivered'
    const dateStr = row['Order Date'] ?? row['Transaction Date'] ?? row['Request Date (UTC)']
    const timeStr = row['Order Time'] ?? row['Request Time (UTC)'] ?? ''
    return {
      platform_order_id: orderId.trim(),
      platform_order_number: orderId.trim().slice(-8),
      total: foodSales, commission: Math.max(0, commission),
      net_payout: netPayout || foodSales - commission,
      status, created_at: dateStr ? new Date(`${dateStr} ${timeStr}`.trim()).toISOString() : new Date().toISOString(),
      customer_name: 'Uber Eats Customer',
    }
  }

  if (platform === 'doordash') {
    const orderId = row['Order ID'] ?? row['order_id'] ?? row['doordash_id']
    if (!orderId) return null
    const subtotal = parseNum(row['Subtotal'] ?? row['order_value'])
    const commission = parseNum(row['Commission'] ?? row['drive_fee'])
    const errorCharge = parseNum(row['Error Charge'] ?? '0')
    const marketingFee = parseNum(row['Marketing Fee'] ?? '0')
    const estimatedPayout = parseNum(row['Estimated Payout'] ?? row['Net Payout'])
    const totalCommission = commission + errorCharge + marketingFee
    const net = estimatedPayout || subtotal - totalCommission
    const orderStatus = (row['Order Status'] ?? '').toLowerCase()
    const status = orderStatus.includes('cancel') ? 'cancelled' : 'delivered'
    const dateStr = row['Delivery Date'] ?? row['Order Date'] ?? row['Transaction Date']
    return {
      platform_order_id: orderId.trim(),
      platform_order_number: orderId.trim().slice(-8),
      total: subtotal, commission: Math.max(0, totalCommission), net_payout: net,
      status, created_at: dateStr ? new Date(dateStr).toISOString() : new Date().toISOString(),
      customer_name: 'DoorDash Customer',
    }
  }

  if (platform === 'menulog') {
    const orderId = row['Order Reference'] ?? row['Order ID'] ?? row['order_id']
    if (!orderId) return null
    const subtotal = parseNum(row['Subtotal'] ?? row['Order Value'])
    const commission = parseNum(row['Commission'])
    const netPayout = parseNum(row['Net Payout'] ?? row['Payout'])
    const net = netPayout || subtotal - commission
    const dateStr = row['Order Date'] ?? row['Date']
    return {
      platform_order_id: orderId.trim(),
      platform_order_number: orderId.trim().slice(-8),
      total: subtotal, commission: Math.max(0, commission), net_payout: net,
      status: 'delivered',
      created_at: dateStr ? new Date(dateStr).toISOString() : new Date().toISOString(),
      customer_name: 'Menulog Customer',
    }
  }

  // Generic/custom — best-effort mapping
  const orderId = row['Order ID'] ?? row['order_id'] ?? row['id'] ?? row['Reference']
  if (!orderId) return null
  const total = parseNum(row['Total'] ?? row['Subtotal'] ?? row['Amount'] ?? row['Revenue'])
  const commissionCalc = total * (commissionRate / 100)
  const net = parseNum(row['Net'] ?? row['Net Payout'] ?? row['Payout']) || total - commissionCalc
  const dateStr = row['Date'] ?? row['Order Date'] ?? row['Created At']
  return {
    platform_order_id: orderId.trim(),
    platform_order_number: orderId.trim().slice(-8),
    total, commission: commissionCalc, net_payout: net, status: 'delivered',
    created_at: dateStr ? new Date(dateStr).toISOString() : new Date().toISOString(),
    customer_name: 'Customer',
  }
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []; let field = ''; let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === ',' && !inQuotes) { result.push(field.trim()); field = '' }
    else { field += ch }
  }
  result.push(field.trim())
  return result
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const platformOverride = formData.get('platform') as string | null

  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })

  const text = await file.text()
  const lines = text.split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return NextResponse.json({ error: 'CSV has no data rows' }, { status: 400 })

  const headers = parseCsvLine(lines[0])
  const platform = platformOverride || detectPlatform(headers)

  const { data: conn } = await supabaseAdmin.from('third_party_delivery_connections')
    .select('id, commission_rate').eq('business_id', bid).eq('platform', platform).maybeSingle()
  const commissionRate = Number(conn?.commission_rate ?? 30)

  let imported = 0; let skipped = 0; const errors: string[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i])
    if (values.every(v => !v)) continue
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = values[idx] ?? '' })

    const parsed = parseRow(row, platform, commissionRate)
    if (!parsed) { skipped++; continue }

    const { error } = await supabaseAdmin.from('third_party_delivery_orders').upsert({
      business_id: bid,
      connection_id: conn?.id ?? null,
      platform,
      platform_order_id: parsed.platform_order_id,
      platform_order_number: parsed.platform_order_number,
      status: parsed.status,
      customer_name: parsed.customer_name,
      total: parsed.total,
      commission: parsed.commission,
      net_payout: parsed.net_payout,
      subtotal: parsed.total,
      created_at: parsed.created_at,
      updated_at: new Date().toISOString(),
      items: [],
    }, { onConflict: 'business_id,platform,platform_order_id' })

    if (error) { errors.push(`Row ${i}: ${error.message}`); skipped++ }
    else imported++
  }

  if (imported > 0) {
    waitUntil((async () => { try { await supabaseAdmin.from('aria_autopilot_actions').insert({ business_id: bid, action_type: 'delivery_csv_imported', summary: `Imported ${imported} ${platform} orders from CSV. Commission data now available in Aria briefings.`, confidence: 1.0, status: 'executed' }) } catch {} })())
  }

  return NextResponse.json({ imported, skipped, platform, errors: errors.slice(0, 10) })
}

export const POST = withErrorCapture('delivery/import-csv', _POST)
