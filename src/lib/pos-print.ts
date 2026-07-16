'use client'

// Fetches the business's default receipt template and renders a print window.
// Returns true if a template was found and printed; false to fall back to Receipt modal.

interface SaleData {
  id?: string
  sale_number?: string
  created_at?: string
  total_amount?: number
  payment_method?: string
  cash_tendered?: number
  change_given?: number
  // INTEL-COMPUTE-3 — this printer never read the sale's real persisted tax figures at all
  // (structurally incapable of reflecting them), always recomputing a flat 10%-inclusive estimate
  // from the client cart snapshot regardless of whether the real sale had a GST-free/WET/LCT
  // breakdown. The caller (terminal.tsx) already passes the real pos_sales row (which does carry
  // these columns) as `sale` — these fields were just never declared/read.
  tax_amount?: number
  tax_breakdown?: Array<{ tax_amount?: number }> | null
  cartSnapshot?: Array<{
    product?: { name: string }
    label?: string
    qty: number
    unitPrice: number
    discount_percent?: number
  }>
  customerSnapshot?: { name: string; loyalty_points?: number } | null
  loyaltyEarned?: number
}

interface Comp { type: string; config: Record<string, unknown> }

function compToHTML(comp: Comp, sale: SaleData, businessName: string): string {
  const total  = sale.total_amount ?? 0
  const items  = sale.cartSnapshot ?? []
  const estimatedSub = items.length > 0
    ? items.reduce((s, i) => s + i.unitPrice * i.qty * (1 - (i.discount_percent ?? 0) / 100), 0)
    : total
  // INTEL-COMPUTE-3 — prefer the real persisted tax_amount (reflects the sale's actual tax-code
  // breakdown, including any GST-free/WET/LCT line) over the flat 10%-inclusive estimate, which is
  // only used as a last resort when no real figure is available (e.g. a pre-sale preview). When the
  // real figure is used, subtotal is derived as total-gst so Subtotal+GST reconciles to TOTAL exactly.
  const gst    = sale.tax_amount != null ? sale.tax_amount : estimatedSub - estimatedSub / 1.1
  const sub    = sale.tax_amount != null ? total - gst : estimatedSub
  const date   = sale.created_at ? new Date(sale.created_at) : new Date()
  const ds     = date.toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const ref    = sale.sale_number ?? (sale.id ? `#${String(sale.id).slice(-6).toUpperCase()}` : '#------')
  const pm     = (sale.payment_method ?? 'card').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  const fmt    = (n: number) => `A$${n.toFixed(2)}`
  const row    = (l: string, r: string) => `<div style="display:flex;justify-content:space-between"><span>${l}</span><span>${r}</span></div>`
  const line   = `<div style="border-top:1px dashed #000;margin:5px 0"></div>`

  const bizName = (comp.config.business_name as string) || businessName || 'Your Business'
  const footer  = (comp.config.footer as string) || ''

  switch (comp.type) {
    case 'header':
      return `<div style="text-align:center"><strong style="font-size:13px">${bizName}</strong></div>${line}<div style="text-align:center"><strong>TAX INVOICE</strong></div><div style="text-align:center">${ds}</div><div style="text-align:center">${ref}</div>${footer ? `<div style="text-align:center;font-size:10px;color:#444;margin-top:4px">${footer}</div>` : ''}`

    case 'products': {
      const rows = items.map(i => {
        const ln = i.unitPrice * i.qty * (1 - (i.discount_percent ?? 0) / 100)
        return `<div style="display:flex;justify-content:space-between"><span style="flex:1">${i.label ?? i.product?.name ?? 'Item'}</span><span style="width:20px;text-align:center">${i.qty}</span><span style="width:60px;text-align:right">${fmt(ln)}</span></div>`
      }).join('')
      return `${line}<div style="display:flex;justify-content:space-between;font-weight:bold"><span style="flex:1">Item</span><span>Qty</span><span style="margin-left:8px">Total</span></div>${line}${rows || '<div>No items</div>'}`
    }

    case 'tax':
      return `${line}${row('GST (10% incl.):', fmt(gst))}`

    case 'totals':
      return `${line}${row('Subtotal:', fmt(sub))}<div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px"><span>TOTAL:</span><span>${fmt(total)}</span></div>`

    case 'payments': {
      const lines = [row(`${pm}:`, fmt(total))]
      if (sale.cash_tendered) lines.push(row('Cash tendered:', fmt(sale.cash_tendered)))
      if (sale.change_given)  lines.push(row('Change:', fmt(sale.change_given)))
      return `${line}${lines.join('')}`
    }

    case 'loyalty':
      return (sale.loyaltyEarned || sale.customerSnapshot?.loyalty_points)
        ? `${line}${sale.loyaltyEarned ? row('Points earned:', String(sale.loyaltyEarned)) : ''}${sale.customerSnapshot?.loyalty_points ? row('Total points:', String(sale.customerSnapshot.loyalty_points)) : ''}`
        : ''

    case 'tax_indicator':
      return `<div style="font-size:9px;color:#666">* = GST applicable</div>`

    case 'surcharge':
      return row('Card surcharge:', '')

    case 'account':
      return sale.customerSnapshot ? `${line}<div>Account – ${sale.customerSnapshot.name}</div>` : ''

    case 'barcode':
      return `<div style="text-align:center"><div style="font-size:18px;letter-spacing:2px">${'|'.repeat(24)}</div><div>${ref}</div></div>`

    case 'spacer':
      return `<div style="height:${(comp.config.height as number) || 12}px"></div>`

    case 'text':
      return (comp.config.text as string)
        ? `<div style="text-align:${(comp.config.align as string) || 'center'};font-weight:${comp.config.bold ? 'bold' : 'normal'};font-size:${comp.config.size === 'large' ? 14 : comp.config.size === 'small' ? 9 : 11}px">${comp.config.text}</div>`
        : ''

    case 'image':
      return (comp.config.url as string)
        ? `<img src="${comp.config.url}" alt="${(comp.config.alt as string) || ''}" style="width:100%;max-height:${(comp.config.height as number) || 80}px;object-fit:contain">`
        : ''

    default:
      return ''
  }
}

export async function printReceiptWithTemplate(
  sale: SaleData,
  businessName: string,
): Promise<boolean> {
  try {
    const res  = await fetch('/api/pos/receipt-templates')
    if (!res.ok) return false
    const data = await res.json()
    const templates: Array<{ id: string; components: Comp[]; is_default: boolean }> = data.templates ?? []
    if (!templates.length) return false

    // Prefer the marked default; fall back to the first template
    const template = templates.find(t => t.is_default) ?? templates[0]
    if (!template?.components?.length) return false

    const body = template.components
      .map(c => compToHTML(c, sale, businessName))
      .filter(Boolean)
      .join('\n')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:11px;width:300px;padding:12px;background:#fff;color:#000}@media print{@page{size:80mm auto;margin:0}body{width:80mm;padding:4mm}}</style>
</head><body>${body}</body></html>`

    const w = window.open('', '_blank', 'width=420,height=700')
    if (!w) return false
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print(); w.close() }, 500)
    return true
  } catch {
    return false
  }
}
