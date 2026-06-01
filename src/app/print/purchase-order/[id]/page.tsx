'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface POItem { product_id: string | null; product_name: string; supplier_code?: string; case_qty?: number; unit_cost?: number; qty: number }
interface PO {
  id: string; po_number: string; status: string; supplier_id: string
  total_amount: number | null; created_at: string; notes: string | null
  expected_delivery_date: string | null; items: POItem[]
}
interface Supplier {
  id: string; name: string; email: string | null; order_email: string | null
  short_code: string | null; region: string | null; phone: string | null
  custom_columns: Array<{ key: string; label: string }>
}
interface Business { name: string; abn: string | null; email: string | null }

const DEFAULT_COLUMNS = [
  { key: 'product_name', label: 'Product' },
  { key: 'supplier_code', label: 'Supplier Code' },
  { key: 'case_qty', label: 'Case Qty' },
  { key: 'unit_cost', label: 'Unit Cost' },
  { key: 'qty', label: 'Qty' },
  { key: 'total_ex', label: 'Total (ex GST)' },
  { key: 'total_inc', label: 'Total (inc GST)' },
]

function getCellValue(col: string, item: POItem): string {
  const cost = Number(item.unit_cost ?? 0)
  const qty = Number(item.qty ?? 0)
  const ex = cost * qty
  switch (col) {
    case 'product_name': return item.product_name
    case 'supplier_code': return item.supplier_code ?? '—'
    case 'product_code': return item.supplier_code ?? '—'
    case 'sku': return item.supplier_code ?? '—'
    case 'case_qty': return item.case_qty != null ? String(item.case_qty) : '—'
    case 'pack_size': return item.case_qty != null ? String(item.case_qty) : '—'
    case 'unit_cost': return cost > 0 ? '$' + cost.toFixed(2) : '—'
    case 'base_cost': return cost > 0 ? '$' + cost.toFixed(2) : '—'
    case 'cost_price': return cost > 0 ? '$' + cost.toFixed(2) : '—'
    case 'qty': return String(qty)
    case 'qty_ordered': return String(qty)
    case 'ordered_cases': return item.case_qty ? String(Math.ceil(qty / item.case_qty)) : String(qty)
    case 'total_ex': return ex > 0 ? '$' + ex.toFixed(2) : '—'
    case 'subtotal': return ex > 0 ? '$' + ex.toFixed(2) : '—'
    case 'total': return ex > 0 ? '$' + ex.toFixed(2) : '—'
    case 'gst': return ex > 0 ? '$' + (ex * 0.1).toFixed(2) : '—'
    case 'total_inc': return ex > 0 ? '$' + (ex * 1.1).toFixed(2) : '—'
    case 'gst_inc': return ex > 0 ? '$' + (ex * 1.1).toFixed(2) : '—'
    case 'received': return '—'
    case 'qty_received': return '—'
    default: return '—'
  }
}

export default function PrintPurchaseOrderPage() {
  const params = useParams()
  const poId = params?.id as string
  const [po, setPo] = useState<PO | null>(null)
  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [business, setBusiness] = useState<Business | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!poId) return
    async function fetchData() {
      try {
        const prodRes = await fetch('/api/pos/products')
        const prodData = await prodRes.json()
        const businessId: string = prodData.business_id
        if (!businessId) { setError('No active business found.'); setLoading(false); return }

        const [ordersRes, bizRes] = await Promise.all([
          fetch('/api/warehouse/purchase-orders?business_id=' + businessId),
          fetch('/api/business/profile?business_id=' + businessId).catch(() => ({ ok: false, json: () => ({}) })),
        ])
        const ordersData = await ordersRes.json()
        const bizData = bizRes.ok ? await (bizRes as Response).json() : {}

        const foundPo: PO | undefined = (ordersData.orders ?? []).find((o: PO) => o.id === poId)
        if (!foundPo) { setError('Purchase order not found.'); setLoading(false); return }
        setPo(foundPo)
        setBusiness({ name: bizData.name ?? bizData.business?.name ?? 'Your Business', abn: bizData.abn ?? bizData.business?.abn ?? null, email: bizData.email ?? bizData.business?.email ?? null })

        const supRes = await fetch('/api/warehouse/suppliers/' + foundPo.supplier_id + '/prices?business_id=' + businessId).catch(() => null)
        const supListRes = await fetch('/api/warehouse/suppliers?business_id=' + businessId)
        const supListData = await supListRes.json()
        const foundSup: Supplier | undefined = (supListData.suppliers ?? []).find((s: Supplier) => s.id === foundPo.supplier_id)
        if (foundSup) setSupplier(foundSup)
      } catch (e) {
        setError(String(e))
      }
      setLoading(false)
    }
    fetchData()
  }, [poId])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'Inter, sans-serif', background: '#f5f5f5' }}>
      <p style={{ color: '#666', fontSize: 14 }}>Loading purchase order…</p>
    </div>
  )

  if (error || !po) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Could not load purchase order</p>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>{error ?? 'Order not found'}</p>
        <button onClick={() => window.history.back()} style={{ padding: '8px 20px', borderRadius: 8, background: '#2D5240', color: '#7FB897', border: 'none', cursor: 'pointer', fontSize: 13 }}>← Go back</button>
      </div>
    </div>
  )

  const columns = supplier?.custom_columns?.length ? supplier.custom_columns : DEFAULT_COLUMNS
  const items = po.items ?? []
  const totalEx = items.reduce((s, i) => s + Number(i.unit_cost ?? 0) * Number(i.qty), 0)
  const totalInc = totalEx * 1.1
  const totalUnits = items.reduce((s, i) => s + Number(i.qty), 0)
  const poDate = new Date(po.created_at).toLocaleDateString('en-AU')

  return (
    <>
      {/* Print toolbar — hidden when printing */}
      <div className="print:hidden" style={{ background: '#2D5240', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => window.history.back()} style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.1)', color: '#7FB897', border: '1px solid rgba(127,184,151,0.3)', cursor: 'pointer', fontSize: 13 }}>← Back</button>
        <span style={{ color: '#7FB897', fontSize: 14, fontWeight: 500 }}>{po.po_number}</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => window.print()} style={{ padding: '6px 20px', borderRadius: 8, background: '#7FB897', color: '#1a2e21', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Print / Save PDF</button>
      </div>

      {/* Document */}
      <div style={{ maxWidth: 900, margin: '24px auto', padding: '0 24px', fontFamily: 'Inter, Arial, sans-serif', fontSize: 12, color: '#1a1a1a', background: '#fff' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, paddingTop: 32 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#2D5240', margin: '0 0 4px' }}>PURCHASE ORDER</h1>
            <p style={{ margin: 0, color: '#888', fontSize: 13 }}>aria.com.au</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: 16 }}>{po.po_number}</p>
            <p style={{ margin: '0 0 2px', color: '#555' }}>Date: {poDate}</p>
            {po.expected_delivery_date && <p style={{ margin: '0 0 2px', color: '#555' }}>Expected: {po.expected_delivery_date}</p>}
            <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: po.status === 'received' ? '#d1fae5' : po.status === 'sent' ? '#dbeafe' : '#f3f4f6', color: po.status === 'received' ? '#065f46' : po.status === 'sent' ? '#1e40af' : '#6b7280' }}>
              {po.status.toUpperCase()}
            </span>
          </div>
        </div>

        {/* From / To */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginBottom: 32, paddingBottom: 24, borderBottom: '2px solid #2D5240' }}>
          <div>
            <p style={{ margin: '0 0 6px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888' }}>From</p>
            <p style={{ margin: '0 0 2px', fontWeight: 600 }}>{business?.name ?? 'Your Business'}</p>
            {business?.abn && <p style={{ margin: '0 0 2px', color: '#555' }}>ABN: {business.abn}</p>}
            {business?.email && <p style={{ margin: 0, color: '#555' }}>{business.email}</p>}
          </div>
          <div>
            <p style={{ margin: '0 0 6px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888' }}>To</p>
            <p style={{ margin: '0 0 2px', fontWeight: 600 }}>{supplier?.name ?? 'Supplier'}{supplier?.short_code ? ' (' + supplier.short_code + ')' : ''}</p>
            {supplier?.phone && <p style={{ margin: '0 0 2px', color: '#555' }}>{supplier.phone}</p>}
            {(supplier?.order_email ?? supplier?.email) && <p style={{ margin: 0, color: '#555' }}>{supplier?.order_email ?? supplier?.email}</p>}
          </div>
        </div>

        {/* Items table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
          <thead>
            <tr style={{ background: '#2D5240' }}>
              {columns.map(col => (
                <th key={col.key} style={{ padding: '10px 12px', textAlign: 'left', color: '#7FB897', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #e5e7eb', background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                {columns.map(col => (
                  <td key={col.key} style={{ padding: '9px 12px', fontSize: 12 }}>
                    {getCellValue(col.key, item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 32 }}>
          <div style={{ minWidth: 260 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #e5e7eb' }}>
              <span style={{ color: '#555' }}>Total units</span>
              <span style={{ fontWeight: 500 }}>{totalUnits}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #e5e7eb' }}>
              <span style={{ color: '#555' }}>Subtotal (ex GST)</span>
              <span style={{ fontWeight: 500 }}>${totalEx.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #e5e7eb' }}>
              <span style={{ color: '#555' }}>GST (10%)</span>
              <span style={{ fontWeight: 500 }}>${(totalEx * 0.1).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', background: '#f9fafb', marginTop: 4 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>TOTAL (inc GST)</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#2D5240' }}>${totalInc.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {po.notes && (
          <div style={{ marginBottom: 24, padding: '12px 16px', background: '#f9fafb', borderLeft: '3px solid #7FB897', borderRadius: '0 6px 6px 0' }}>
            <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888' }}>Notes</p>
            <p style={{ margin: 0 }}>{po.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16, paddingBottom: 32, color: '#888', fontSize: 11 }}>
          <p style={{ margin: '0 0 2px' }}>Please confirm receipt of this order and advise expected delivery date.</p>
          <p style={{ margin: 0 }}>Sent by Aria OS — aria.com.au</p>
        </div>
      </div>
    </>
  )
}
