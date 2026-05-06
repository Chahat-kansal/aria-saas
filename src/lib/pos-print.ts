'use client'

// Fetches the business's default receipt template and renders it to a print window.
// Falls back gracefully if no template exists or the table isn't created yet.

interface SaleData {
  id?: string
  sale_number?: string
  created_at?: string
  total_amount?: number
  payment_method?: string
  cash_tendered?: number
  change_given?: number
  cartSnapshot?: Array<{ product?: { name: string }; label?: string; qty: number; unitPrice: number; discount_percent?: number }>
  customerSnapshot?: { name: string; loyalty_points?: number } | null
  loyaltyEarned?: number
  served_by?: string
}

interface Comp {
  type: string
  config: Record<string, unknown>
}

function renderCompHTML(comp: Comp, sale: SaleData, businessName: string): string {
  const ROW = (l: string, r: string) => `<div style="display:flex;justify-content:space-between"><span>${l}</span><span>${r}</span></div>`
  const LINE = `<div style="border-top:1px dashed #000;margin:5px 0"></div>`
  const fmt = (n: number) => `A$${n.toFixed(2)}`

  const total    = sale.total_amount ?? 0
  const items    = sale.cartSnapshot ?? []
  const subTotal = items.length > 0
    ? items.reduce((s, i) => s + i.unitPrice * i.qty * (1 - (i.discount_percent ?? 0) / 100), 0)
    : total
  const gst      = subTotal - subTotal / 1.1
  const date     = sale.created_at ? new Date(sale.created_at) : new Date()
  const dateStr  = date.toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const saleRef  = sale.sale_number ?? (sale.id ? `#${String(sale.id).slice(-6).toUpperCase()}` : '#------')
  const pmLabel  = (sale.payment_method ?? 'card').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())

  switch (comp.type) {
    case 'header':
      return `<div style="text-align:center"><strong style="font-size:13px">${businessName}</strong></div>${LINE}<div style="text-align:center"><strong>TAX INVOICE</strong></div><div style="text-align:center">${dateStr}</div><div style="text-align:center">Inv ${saleRef}</div>`

    case 'products': {
      const rows = items.map(i => {
        const lineTotal = i.unitPrice * i.qty * (1 - (i.discount_percent ?? 0) / 100)
        return `<div style="display:flex;justify-content:space-between"><span style="flex:1">${i.label ?? i.product?.name ?? 'Item'}</span><span style="width:25px;text-align:center">${i.qty}</span><span style="width:60px;text-align:right">${fmt(lineTotal)}</span></div>`
      }).join('')
      return `${LINE}<div style="display:flex;justify-content:space-between;font-weight:bold"><span style="flex:1">Item</span><span>Qty</span><span>Total</span></div>${LINE}${rows || '<div>No items</div>'}`
    }

    case 'tax':
      return `${LINE}${ROW('GST (10% incl.):', fmt(gst))}`

    case 'totals':
      return `${LINE}${ROW('Subtotal:', fmt(subTotal))}<div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px"><span>TOTAL:</span><span>${fmt(total)}</span></div>`

    case 'payments': {
      const lines = [ROW(`${pmLabel}:`, fmt(total))]
      if (sale.cash_tendered) lines.push(ROW('Cash tendered:', fmt(sale.cash_tendered)))
      if (sale.change_given)  lines.push(ROW('Change:', fmt(sale.change_given)))
      return `${LINE}${lines.join('')}`
    }

    case 'loyalty':
      if (!sale.loyaltyEarned && !sale.customerSnapshot?.loyalty_points) return ''
      return `${LINE}${sale.loyaltyEarned ? ROW('Points earned:', String(sale.loyaltyEarned)) : ''}${sale.customerSnapshot?.loyalty_points ? ROW('Total points:', String(sale.customerSnapshot.loyalty_points)) : ''}`

    case 'account':
      if (!sale.customerSnapshot) return ''
      return `${LINE}<div>Account: ${sale.customerSnapshot.name}</div>`

    case 'tax_indicator':
      return `<div style="font-size:9px;color:#666">* = GST applicable</div>`

    case 'barcode':
      return `<div style="text-align:center"><div style="font-size:18px;letter-spacing:2px">${'|'.repeat(24)}</div><div>${saleRef}</div></div>`

    case 'spacer':
      return `<div style="height:${(comp.config.height as number) || 12}px"></div>`

    case 'text':
      return `<div style="text-align:${(comp.config.align as string) || 'center'};font-weight:${comp.config.bold ? 'bold' : 'normal'}">${(comp.config.text as string) || ''}</div>`

    default:
      return ''
  }
}

export async function printReceiptWithTemplate(
  sale: SaleData,
  businessName: string,
  businessId?: string,
): Promise<boolean> {
  // Try to fetch the default template for this business
  try {
    const endpoint = businessId
      ? `/api/pos/receipt-templates?business_id=${businessId}`
      : '/api/pos/receipt-templates'
    const res  = await fetch(endpoint)
    const data = await res.json()
    const templates: Array<{ id: string; components: Comp[]; is_default: boolean }> = data.templates ?? []

    // Use the default template, or the first one if no default is set
    const template = templates.find(t => t.is_default) ?? templates[0]
    if (!template || !template.components?.length) return false

    // Render each component to HTML using real sale data
    const body = template.components
      .map(c => renderCompHTML(c, sale, businessName))
      .filter(Boolean)
      .join('\n')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Courier New',monospace;font-size:11px;width:300px;padding:12px;background:#fff;color:#000}
  @media print{@page{size:80mm auto;margin:0}body{width:80mm;padding:4mm}}
</style>
</head><body>${body}</body></html>`

    const w = window.open('', '_blank', 'width=400,height=700')
    if (!w) return false
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print(); w.close() }, 400)
    return true
  } catch {
    return false
  }
}
