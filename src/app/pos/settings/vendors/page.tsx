'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Supplier { id: string; name: string; email: string | null; phone: string | null; contact_person: string | null; payment_terms: string | null }

export default function VendorConnectionsPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/pos/suppliers').then(r => r.json()).then(d => { setSuppliers(d.suppliers ?? []); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  return (
    <div style={{ padding: '24px 28px', maxWidth: 860, color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Vendor Connections</h1>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 24px' }}>Connect your suppliers for automated purchase orders and invoice matching.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { name: 'Email Integration', desc: 'Automatically send purchase orders via email to suppliers', icon: '📧', status: 'available' },
          { name: 'EDI (EDIFACT)', desc: 'Electronic data interchange for large suppliers', icon: '🔗', status: 'coming_soon' },
          { name: 'Supplier Portal', desc: 'Let suppliers confirm orders and update lead times', icon: '🏭', status: 'coming_soon' },
        ].map(card => (
          <div key={card.name} style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 14, padding: '18px 20px' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>{card.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{card.name}</div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px' }}>{card.desc}</p>
            {card.status === 'available' ? (
              <Link href="/pos/setup/suppliers" style={{ display: 'inline-block', padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>Configure</Link>
            ) : (
              <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 99, background: 'var(--bg-base)', color: 'var(--text-tertiary)', fontWeight: 600 }}>Coming Soon</span>
            )}
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 14px' }}>Your Suppliers</h2>
      {loading ? <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
      : suppliers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
          No suppliers yet. <Link href="/pos/suppliers" style={{ color: 'var(--violet)' }}>Add your first supplier</Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {suppliers.map(s => (
            <div key={s.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  {[s.contact_person, s.email, s.phone].filter(Boolean).join(' · ')}
                </div>
              </div>
              <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: 'rgba(34,197,94,0.12)', color: '#22c55e', fontWeight: 700 }}>Active</span>
              <Link href={`/pos/orders?supplier=${s.id}`} style={{ fontSize: 12, color: 'var(--violet)', textDecoration: 'none', fontWeight: 600 }}>Orders →</Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
