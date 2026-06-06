'use client'
import { useState, useEffect } from 'react'
import { SUPPLIERS, SupplierKey, SupplierIntegration } from '@/lib/suppliers/types'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { AriaMark } from '@/components/ui/AriaMark'

interface Integration {
  id: string
  supplier_key: string
  account_number: string | null
  contact_email: string
  contact_name: string | null
  contact_phone: string | null
  notes: string | null
  status: string
}

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  available:        { label: 'Available',        color: '#7FB897', bg: 'rgba(127,184,151,0.12)' },
  pending_approval: { label: 'Partnership TBD',  color: '#D4A95E', bg: 'rgba(212,169,94,0.12)' },
  connected:        { label: 'Connected',        color: '#65B179', bg: 'rgba(101,177,121,0.12)' },
  manual:           { label: 'Custom',           color: '#6E7C6E', bg: 'rgba(110,124,110,0.12)' },
}

function statusFor(sup: SupplierIntegration, integrations: Integration[]): string {
  const existing = integrations.find(i => i.supplier_key === sup.key && i.status === 'connected')
  if (existing) return 'connected'
  return sup.status
}

export default function SuppliersPage() {
  useEffect(() => { document.title = 'Supplier Integrations | Aria POS' }, [])

  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ key: SupplierKey; existing?: Integration } | null>(null)
  const [form, setForm] = useState({ account_number: '', contact_email: '', contact_name: '', contact_phone: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/pos/suppliers/integrations').then(r => r.json()).then(d => {
      setIntegrations(d.integrations ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  function openModal(key: SupplierKey) {
    const existing = integrations.find(i => i.supplier_key === key && i.status === 'connected')
    setForm({
      account_number: existing?.account_number ?? '',
      contact_email: existing?.contact_email ?? '',
      contact_name: existing?.contact_name ?? '',
      contact_phone: existing?.contact_phone ?? '',
      notes: existing?.notes ?? '',
    })
    setModal({ key, existing })
  }

  async function handleSave() {
    if (!modal) return
    setSaving(true)
    try {
      const res = await fetch('/api/pos/suppliers/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier_key: modal.key, ...form }),
      })
      if (res.ok) {
        const d = await res.json() as { integration?: Integration }
        setIntegrations(prev => {
          const filtered = prev.filter(i => i.supplier_key !== modal.key)
          return d.integration ? [...filtered, d.integration] : filtered
        })
        setModal(null)
        showToast('Supplier connected ✓')
      }
    } catch (e) { console.warn('[non-fatal]', e) }
    setSaving(false)
  }

  async function handleDisconnect(key: SupplierKey) {
    await fetch('/api/pos/suppliers/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'disconnect', supplier_key: key }),
    })
    setIntegrations(prev => prev.filter(i => i.supplier_key !== key))
    showToast('Supplier disconnected')
  }

  async function handlePartnershipApply(sup: SupplierIntegration) {
    // Send partnership request email
    await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: 'partnerships@ariaos.site', subject: `Partnership application: ${sup.display_name}`, message: `User is applying for partnership with ${sup.display_name}.` }),
    }).catch(() => {})
    showToast('Application sent — we\'ll be in touch within 2 business days')
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const btn: React.CSSProperties = { padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--violet)', color: 'var(--text-inverse)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }
  const btnSec: React.CSSProperties = { ...btn, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--divider)' }
  const input: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--divider)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '24px 28px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Supplier Integrations</h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Connect <AriaMark size={13} /> to your suppliers so purchase orders send automatically.</p>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {[1, 2, 3].map(i => <div key={i} style={{ height: 100, background: 'var(--bg-surface)', borderRadius: 14 }} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {Object.values(SUPPLIERS).map(sup => {
            const currentStatus = statusFor(sup, integrations)
            const badge = STATUS_BADGE[currentStatus] ?? STATUS_BADGE.available
            const existing = integrations.find(i => i.supplier_key === sup.key && i.status === 'connected')

            return (
              <GlassPanel key={sup.key} elevated style={{ padding: '20px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ fontFamily: 'var(--font-display), Georgia, serif', fontStyle: 'italic', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{sup.display_name}</span>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: badge.bg, color: badge.color, fontWeight: 700 }}>{badge.label}</span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px' }}>{sup.setup_instructions}</p>
                    {existing && (
                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>
                        {existing.contact_email} {existing.account_number ? `· Acct: ${existing.account_number}` : ''}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    {currentStatus === 'connected' && (
                      <>
                        <button style={btnSec} onClick={() => openModal(sup.key)}>Edit</button>
                        <button style={{ ...btnSec, color: 'var(--destructive)' }} onClick={() => handleDisconnect(sup.key)}>Disconnect</button>
                      </>
                    )}
                    {(currentStatus === 'available' || currentStatus === 'manual') && (
                      <button style={btn} onClick={() => openModal(sup.key)}>
                        {sup.status === 'manual' ? 'Add supplier' : 'Connect'}
                      </button>
                    )}
                    {currentStatus === 'pending_approval' && (
                      <button style={btnSec} onClick={() => handlePartnershipApply(sup)}>Apply for partnership</button>
                    )}
                  </div>
                </div>
              </GlassPanel>
            )
          })}
        </div>
      )}

      {/* Setup modal */}
      {modal && (
        <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-elevated)', borderRadius: 16, padding: 28, maxWidth: 440, width: '90vw', boxShadow: 'var(--shadow-lg)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>{SUPPLIERS[modal.key].display_name}</h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 20px' }}>{SUPPLIERS[modal.key].setup_instructions}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(modal.key === 'alm' || modal.key === 'ilg') && (
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Account number *
                  <input style={{ ...input, marginTop: 4 }} value={form.account_number} onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))} placeholder="e.g. ALM-12345" />
                </label>
              )}
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                Contact email *
                <input type="email" style={{ ...input, marginTop: 4 }} value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="orders@yoursupplier.com.au" />
              </label>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                Contact name
                <input style={{ ...input, marginTop: 4 }} value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Account rep name" />
              </label>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                Contact phone
                <input style={{ ...input, marginTop: 4 }} value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="0400 000 000" />
              </label>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                Notes
                <textarea style={{ ...input, marginTop: 4, minHeight: 60, resize: 'vertical' }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any special instructions..." />
              </label>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button style={btnSec} onClick={() => setModal(null)}>Cancel</button>
              <button style={{ ...btn, flex: 1, opacity: saving ? 0.6 : 1 }} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save connection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 100, background: '#34D399', color: '#000', padding: '12px 20px', borderRadius: 12, fontSize: 13, fontWeight: 700, boxShadow: 'var(--shadow-lg)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
