const ESC = 0x1B
const GS  = 0x1D
const LF  = 0x0A

export interface ReceiptLineItem {
  name: string
  qty: number
  unit_price: number
  line_total: number
}

export interface ReceiptInput {
  business_name: string
  abn?: string | null
  outlet_name?: string | null
  header_text?: string | null
  footer_text?: string | null
  sale_number: string
  sale_date: string
  items: ReceiptLineItem[]
  subtotal: number
  tax_breakdown?: Array<{ code: string; rate: number; tax_amount: number }>
  total: number
  payment_method?: string
  amount_tendered?: number | null
  change_due?: number | null
  loyalty_balance?: number | null
  width_mm?: 58 | 76 | 80 | 112
  paper_cut_mode?: 'full' | 'partial' | 'none'
  show_qr_code?: boolean
  show_tax_breakdown?: boolean
}

const CHARS_PER_LINE: Record<number, number> = { 58: 32, 76: 42, 80: 48, 112: 64 }

export function buildReceiptBytes(input: ReceiptInput): Uint8Array {
  const chars = CHARS_PER_LINE[input.width_mm ?? 80] ?? 48
  const out: number[] = []

  function write(s: string) { for (const c of s) out.push(c.charCodeAt(0)) }
  function center(s: string) {
    const pad = Math.max(0, Math.floor((chars - s.length) / 2))
    write(' '.repeat(pad) + s)
    out.push(LF)
  }
  function line(left: string, right: string) {
    const space = Math.max(1, chars - left.length - right.length)
    write(left + ' '.repeat(space) + right)
    out.push(LF)
  }
  function divider() { write('-'.repeat(chars)); out.push(LF) }

  // Initialize
  out.push(ESC, 0x40) // ESC @ — reset
  out.push(ESC, 0x61, 0x01) // center align

  // Header
  out.push(ESC, 0x21, 0x30) // double height/width
  center(input.business_name)
  out.push(ESC, 0x21, 0x00) // normal
  if (input.outlet_name) center(input.outlet_name)
  if (input.abn) center(`ABN ${input.abn}`)
  if (input.header_text) {
    for (const ln of input.header_text.split('\n')) center(ln)
  }
  divider()

  // Sale info — left aligned
  out.push(ESC, 0x61, 0x00)
  line(`Sale ${input.sale_number}`, input.sale_date)
  divider()

  // Items
  for (const it of input.items) {
    const qtyName = `${it.qty} x ${it.name}`.slice(0, chars - 10)
    line(qtyName, `$${(Number(it.line_total) || 0).toFixed(2)}`)
    if (it.qty > 1) {
      line(`  @ $${(Number(it.unit_price) || 0).toFixed(2)}`, '')
    }
  }
  divider()

  // Totals
  line('Subtotal', `$${(Number(input.subtotal) || 0).toFixed(2)}`)
  if (input.show_tax_breakdown && input.tax_breakdown && input.tax_breakdown.length > 0) {
    for (const t of input.tax_breakdown) {
      line(`${t.code} (${(Number(t.rate) || 0).toFixed(1)}%)`, `$${(Number(t.tax_amount) || 0).toFixed(2)}`)
    }
  }
  out.push(ESC, 0x21, 0x10) // double height for total
  line('TOTAL', `$${(Number(input.total) || 0).toFixed(2)}`)
  out.push(ESC, 0x21, 0x00)
  if (input.payment_method) line('Paid by', input.payment_method)
  if (input.amount_tendered != null) line('Tendered', `$${(Number(input.amount_tendered) || 0).toFixed(2)}`)
  if (input.change_due != null && input.change_due > 0) line('Change', `$${(Number(input.change_due) || 0).toFixed(2)}`)
  divider()

  if (input.loyalty_balance != null) {
    out.push(ESC, 0x61, 0x01)
    center(`Loyalty: ${input.loyalty_balance} pts`)
    out.push(ESC, 0x61, 0x00)
    divider()
  }

  // Footer
  if (input.footer_text) {
    out.push(ESC, 0x61, 0x01)
    for (const ln of input.footer_text.split('\n')) center(ln)
    out.push(ESC, 0x61, 0x00)
  }

  // Feed + cut
  out.push(LF, LF, LF, LF)
  if (input.paper_cut_mode === 'full') {
    out.push(GS, 0x56, 0x00)
  } else if (input.paper_cut_mode !== 'none') {
    out.push(GS, 0x56, 0x01)
  }

  return new Uint8Array(out)
}

export function buildKitchenTicketBytes(
  saleNumber: string,
  station: string,
  items: ReceiptLineItem[],
  notes?: string,
  widthMm: 58 | 76 | 80 | 112 = 80,
): Uint8Array {
  const out: number[] = []
  out.push(ESC, 0x40)
  out.push(ESC, 0x61, 0x01)
  out.push(ESC, 0x21, 0x30)
  for (const c of station.toUpperCase()) out.push(c.charCodeAt(0))
  out.push(LF)
  out.push(ESC, 0x21, 0x00)
  for (const c of `Order ${saleNumber}`) out.push(c.charCodeAt(0))
  out.push(LF)
  for (const c of new Date().toLocaleTimeString()) out.push(c.charCodeAt(0))
  out.push(LF, LF)
  out.push(ESC, 0x61, 0x00)
  for (const it of items) {
    out.push(ESC, 0x21, 0x10)
    for (const c of `${it.qty} x ${it.name}`) out.push(c.charCodeAt(0))
    out.push(LF)
    out.push(ESC, 0x21, 0x00)
  }
  if (notes) {
    out.push(LF)
    for (const c of `NOTES: ${notes}`) out.push(c.charCodeAt(0))
    out.push(LF)
  }
  out.push(LF, LF, LF, LF, GS, 0x56, 0x01)
  // widthMm is accepted but not used in this simple implementation
  void widthMm
  return new Uint8Array(out)
}

export function buildDrawerPulseBytes(pulseMs: number = 60): Uint8Array {
  const t = Math.max(1, Math.min(255, Math.round(pulseMs / 2)))
  return new Uint8Array([ESC, 0x70, 0x00, t, t])
}
