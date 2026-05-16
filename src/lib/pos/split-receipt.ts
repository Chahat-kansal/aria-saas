export interface SplitForReceipt {
  split_number: number
  person_label: string
  subtotal: number
  tax_amount: number
  tip_amount: number
  total_amount: number
  status: string
  paid_at?: string | null
  split_method: string
}

export interface SaleForReceipt {
  sale_number: string
  created_at: string
  payment_method?: string
}

export interface BusinessForReceipt {
  name: string
  city?: string | null
  email?: string | null
  phone?: string | null
  abn?: string | null
}

export interface ItemForReceipt {
  product_name: string
  quantity: number
  unit_price: number
  line_total: number
}

export function generateSplitReceiptHTML(
  split: SplitForReceipt,
  sale: SaleForReceipt,
  business: BusinessForReceipt,
  items: ItemForReceipt[],
): string {
  const date = new Date(sale.created_at).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  const itemRows = items.map(i => `
    <tr>
      <td style="padding:3px 0">${i.product_name}</td>
      <td style="padding:3px 0;text-align:right">${i.quantity}×</td>
      <td style="padding:3px 0;text-align:right">A$${i.unit_price.toFixed(2)}</td>
      <td style="padding:3px 0;text-align:right">A$${i.line_total.toFixed(2)}</td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: 'Courier New', monospace; font-size: 12px; max-width: 300px; margin: 0 auto; padding: 16px; color: #111; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 4px; }
  .center { text-align: center; }
  .muted { color: #666; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  .divider { border-top: 1px dashed #ccc; margin: 8px 0; }
  .total-row td { font-weight: bold; padding-top: 4px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px;
           background: ${split.status === 'paid' ? '#d1fae5' : '#fef3c7'};
           color: ${split.status === 'paid' ? '#065f46' : '#92400e'}; }
</style>
</head>
<body>
  <h1>${business.name}</h1>
  ${business.city ? `<p class="center muted">${business.city}</p>` : ''}
  ${business.phone ? `<p class="center muted">${business.phone}</p>` : ''}
  <div class="divider"></div>

  <p class="center"><strong>SPLIT RECEIPT</strong></p>
  <p class="center muted">Sale ${sale.sale_number} · Split ${split.split_number}</p>
  <p class="center"><strong>${split.person_label}</strong></p>
  <p class="center muted">${date}</p>

  <div class="divider"></div>

  ${items.length > 0 ? `
  <table>
    <tbody>${itemRows}</tbody>
  </table>
  <div class="divider"></div>` : ''}

  <table>
    <tr><td>Subtotal</td><td style="text-align:right">A$${split.subtotal.toFixed(2)}</td></tr>
    <tr><td>GST (incl.)</td><td style="text-align:right">A$${split.tax_amount.toFixed(2)}</td></tr>
    ${split.tip_amount > 0 ? `<tr><td>Tip</td><td style="text-align:right">A$${split.tip_amount.toFixed(2)}</td></tr>` : ''}
    <tr class="total-row"><td>TOTAL</td><td style="text-align:right">A$${split.total_amount.toFixed(2)}</td></tr>
  </table>

  <div class="divider"></div>
  <p class="center"><span class="badge">${split.status === 'paid' ? '✓ PAID' : 'UNPAID'}</span></p>
  ${split.paid_at ? `<p class="center muted">Paid ${new Date(split.paid_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</p>` : ''}
  ${business.abn ? `<p class="center muted">ABN: ${business.abn}</p>` : ''}
  <p class="center muted">Thank you for dining with us!</p>
</body>
</html>`
}