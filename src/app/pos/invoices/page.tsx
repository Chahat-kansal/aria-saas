'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Sale {
  id: string
  sale_number: string
  total_amount: number
  created_at: string
  payment_method: string
  pos_customers?: { name: string; email: string | null; phone: string | null } | null
}

export default function InvoicesPage() {
  const router = useRouter()
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/pos/reports/sales?from=' + new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10) + '&to=' + new Date().toISOString().slice(0, 10) + '&limit=100')
      .then(r => r.json())
      .then(d => { setSales(d.sales ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const generateInvoice = async (sale: Sale) => {
    setGenerating(sale.id)
    try {
      const r = await fetch('/api/documents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'invoice',
          data: {
            sale_number: sale.sale_number,
            total: 'A$' + sale.total_amount.toFixed(2),
            date: new Date(sale.created_at).toLocaleDateString('en-AU'),
            customer: sale.pos_customers?.name ?? 'Walk-in Customer',
            customer_email: sale.pos_customers?.email ?? '',
            payment_method: sale.payment_method,
          },
        }),
      })
      const d = await r.json()
      if (d.html) {
        const win = window.open('', '_blank')
        if (win) { win.document.write(d.html); win.document.close() }
      }
    } finally {
      setGenerating(null)
    }
  }

  const filtered = sales.filter(s =>
    !search || s.sale_number?.toLowerCase().includes(search.toLowerCase()) ||
    s.pos_customers?.name?.toLowerCase().includes(search.toLowerCase())
  )

  const C = { bg: 'var(--bg-base)', card: 'var(--bg-surface)', border: 'var(--border-default)', text: 'var(--text-primary)', muted: 'var(--text-secondary)', violet: 'var(--violet)' }

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif", padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 2 }}>Invoices</h1>
          <p style={{ fontSize: 12, color: C.muted }}>Generate PDF invoices from completed sales</p>
        </div>
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by sale number or customer..."
        style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid ' + C.border, background: C.card, color: C.text, fontSize: 13, marginBottom: 16, boxSizing: 'border-box' as const, outline: 'none' }}
      />

      {loading ? (
        <p style={{ color: C.muted, fontSize: 13 }}>Loading sales...</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: C.muted, fontSize: 13 }}>No sales found.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(sale => (
            <div key={sale.id} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>#{sale.sale_number}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                  {sale.pos_customers?.name ?? 'Walk-in'} &middot; {new Date(sale.created_at).toLocaleDateString('en-AU')} &middot; {sale.payment_method}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>A${sale.total_amount.toFixed(2)}</span>
                <button
                  onClick={() => generateInvoice(sale)}
                  disabled={generating === sale.id}
                  style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: C.violet, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: generating === sale.id ? 0.6 : 1 }}
                >
                  {generating === sale.id ? 'Generating...' : 'PDF Invoice'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
