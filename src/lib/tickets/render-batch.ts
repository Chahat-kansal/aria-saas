// TICKETS-FIX+BATCH-1 — render a saved batch to printable HTML using the template's canvas_elements (the real
// design from the fixed editor), substituting each product's snapshotted price/promo. width_mm/height_mm hold
// the editor's canvas dimensions (px); elements are absolutely positioned within that box.

export interface CanvasEl { id: string; type: string; x: number; y: number; w: number; h: number; text: string; color: string; bg: string; fontSize: number; bold: boolean }
export interface BatchTemplate { name: string; width_mm: number; height_mm: number; background_color: string | null; canvas_elements: CanvasEl[] | null }
export interface BatchRenderItem { name: string; sku: string | null; barcode: string | null; qty: number; price_snapshot: number; was_price_snapshot: number | null; promo_label: string | null }

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
const money = (n: number) => `$${(Number(n) || 0).toFixed(2)}`

function elContent(el: CanvasEl, it: BatchRenderItem): string {
  switch (el.type) {
    case 'promo_band': return esc(it.promo_label || el.text || 'PRICE')
    case 'product_name': return esc(it.name)
    case 'price_block':
      return it.was_price_snapshot != null
        ? `<span style="font-size:${Math.round(el.fontSize * 0.5)}px;text-decoration:line-through;opacity:.6;display:block">${money(it.was_price_snapshot)}</span>${money(it.price_snapshot)}`
        : money(it.price_snapshot)
    case 'member_price': return money(it.price_snapshot)
    case 'savings': return it.was_price_snapshot != null ? `Save ${money(it.was_price_snapshot - it.price_snapshot)}` : esc(el.text)
    case 'barcode': return esc(it.barcode || it.sku || el.text)
    case 'per_unit':
    case 'logo':
    case 'custom_text':
    default: return esc(el.text)
  }
}

function renderTicket(tpl: BatchTemplate, it: BatchRenderItem): string {
  const cw = Number(tpl.width_mm) || 283, ch = Number(tpl.height_mm) || 198
  const els = (tpl.canvas_elements ?? []).map(el => {
    const bg = el.bg && el.bg !== 'transparent' ? `background:${esc(el.bg)};` : ''
    return `<div style="position:absolute;left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;${bg}display:flex;align-items:center;justify-content:center;text-align:center;overflow:hidden;box-sizing:border-box">`
      + `<span style="font-size:${el.fontSize}px;color:${esc(el.color)};font-weight:${el.bold ? 700 : 400};line-height:1.15">${elContent(el, it)}</span></div>`
  }).join('')
  return `<div class="ticket" style="position:relative;width:${cw}px;height:${ch}px;background:${esc(tpl.background_color || '#ffffff')};border:1px solid #e5e7eb;overflow:hidden;page-break-inside:avoid">${els}</div>`
}

/** Render the whole batch (each item × its qty copies) to a self-printing HTML document. */
export function renderBatchHtml(tpl: BatchTemplate, items: BatchRenderItem[]): string {
  const tickets = items.flatMap(it => Array.from({ length: Math.max(1, Math.round(it.qty)) }, () => renderTicket(tpl, it))).join('\n')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tickets — ${esc(tpl.name)}</title>`
    + `<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#f3f4f6;font-family:Arial,sans-serif}`
    + `.page{display:flex;flex-wrap:wrap;gap:6px;padding:16px;align-items:flex-start}`
    + `@media print{body{background:#fff}.page{gap:4px;padding:0}.ticket{page-break-inside:avoid}}</style></head>`
    + `<body><div class="page">${tickets}</div><script>window.onload=()=>{window.print()}<\/script></body></html>`
}
