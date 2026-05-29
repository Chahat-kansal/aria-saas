'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

interface ShareLink {
  id: string; token: string; url: string; label: string
  recipient_name: string | null; recipient_email: string | null
  pages_allowed: string[]; expires_at: string | null
  is_active: boolean; access_count: number
  last_accessed_at: string | null; created_at: string
}
interface ShareablePage { key: string; label: string }

const EXPIRY_OPTIONS = [
  { label: 'Never expires', value: null },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '1 year', value: 365 },
]

function timeAgo(d: string) {
  const h = Math.round((Date.now() - new Date(d).getTime()) / 3600000)
  if (h < 1) return 'just now'; if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function SharingSettingsPage() {
  const { business } = useBusinessContext()
  const [links, setLinks] = useState<ShareLink[]>([])
  const [pages, setPages] = useState<ShareablePage[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [newLink, setNewLink] = useState<{ label: string; recipientName: string; recipientEmail: string; pagesAllowed: string[]; expiresInDays: number | null }>({
    label: '', recipientName: '', recipientEmail: '', pagesAllowed: [], expiresInDays: null,
  })

  const load = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    const d = await fetch(`/api/share-links?business_id=${business.id}`).then(r => r.json()).catch(() => ({}))
    setLinks(d.links ?? [])
    setPages(d.shareable_pages ?? [])
    setLoading(false)
  }, [business?.id])

  useEffect(() => { load() }, [load])

  async function create() {
    if (!business?.id || !newLink.label || !newLink.pagesAllowed.length) return
    setCreating(true)
    const res = await fetch('/api/share-links', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id, label: newLink.label, recipient_name: newLink.recipientName || undefined, recipient_email: newLink.recipientEmail || undefined, pages_allowed: newLink.pagesAllowed, expires_in_days: newLink.expiresInDays }),
    })
    const d = await res.json()
    if (res.ok && d.url) {
      await navigator.clipboard.writeText(d.url).catch(() => {})
      setCopied(d.url)
      setShowForm(false)
      setNewLink({ label: '', recipientName: '', recipientEmail: '', pagesAllowed: [], expiresInDays: null })
      load()
    }
    setCreating(false)
  }

  async function deactivate(id: string) {
    await fetch(`/api/share-links/${id}`, { method: 'DELETE' })
    setLinks(ls => ls.map(l => l.id === id ? { ...l, is_active: false } : l))
  }

  async function toggleActive(id: string, is_active: boolean) {
    await fetch(`/api/share-links/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active }) })
    setLinks(ls => ls.map(l => l.id === id ? { ...l, is_active } : l))
  }

  function togglePage(key: string) {
    setNewLink(l => ({ ...l, pagesAllowed: l.pagesAllowed.includes(key) ? l.pagesAllowed.filter(p => p !== key) : [...l.pagesAllowed, key] }))
  }

  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'var(--bg-input,rgba(255,255,255,0.05))', border: '1px solid var(--divider,rgba(255,255,255,0.1))', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: 'var(--text-primary,#fff)', outline: 'none', fontFamily: 'inherit' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 800 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Share with external people</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Generate read-only links for your accountant, business partner, or landlord. No login required.</p>
        </div>
        <button onClick={() => setShowForm(s => !s)} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: '#7FB897', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
          + Create share link
        </button>
      </div>

      {copied && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(127,184,151,0.08)', border: '1px solid rgba(127,184,151,0.25)', borderRadius: 10, fontSize: 13, color: '#7FB897' }}>
          ✓ Link copied to clipboard: <code style={{ fontSize: 11, background: 'rgba(127,184,151,0.1)', padding: '2px 6px', borderRadius: 4 }}>{copied}</code>
        </div>
      )}

      {showForm && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '20px 24px', marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 18 }}>New share link</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={lbl}>Label *</label>
              <input style={inp} value={newLink.label} onChange={e => setNewLink(l => ({ ...l, label: e.target.value }))} placeholder="e.g. My accountant — BAS review" />
            </div>
            <div>
              <label style={lbl}>Recipient name (optional)</label>
              <input style={inp} value={newLink.recipientName} onChange={e => setNewLink(l => ({ ...l, recipientName: e.target.value }))} placeholder="e.g. Jane Smith" />
            </div>
            <div>
              <label style={lbl}>Recipient email (optional)</label>
              <input style={inp} type="email" value={newLink.recipientEmail} onChange={e => setNewLink(l => ({ ...l, recipientEmail: e.target.value }))} placeholder="jane@example.com" />
            </div>
            <div>
              <label style={lbl}>Expiry</label>
              <select style={inp} value={newLink.expiresInDays ?? ''} onChange={e => setNewLink(l => ({ ...l, expiresInDays: e.target.value === '' ? null : Number(e.target.value) }))}>
                {EXPIRY_OPTIONS.map(o => <option key={String(o.value)} value={o.value ?? ''}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={lbl}>Pages to include *</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {pages.map(p => {
                const checked = newLink.pagesAllowed.includes(p.key)
                return (
                  <button key={p.key} onClick={() => togglePage(p.key)} style={{ padding: '5px 12px', borderRadius: 99, border: `1px solid ${checked ? '#7FB897' : 'rgba(255,255,255,0.12)'}`, background: checked ? 'rgba(127,184,151,0.1)' : 'transparent', color: checked ? '#7FB897' : 'rgba(255,255,255,0.6)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {checked ? '✓ ' : ''}{p.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={create} disabled={creating || !newLink.label || !newLink.pagesAllowed.length} style={{ padding: '9px 22px', borderRadius: 9, border: 'none', background: '#7FB897', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: creating || !newLink.label || !newLink.pagesAllowed.length ? 0.5 : 1, fontFamily: 'inherit' }}>
              {creating ? 'Generating…' : 'Generate & copy link'}
            </button>
            <button onClick={() => setShowForm(false)} style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.4)', padding: '40px 0', textAlign: 'center' }}>Loading…</div>
      ) : links.length === 0 ? (
        <div style={{ color: 'rgba(255,255,255,0.4)', padding: '60px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🔗</div>
          <p>No share links yet. Create one to share your dashboard with your accountant or partners.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {links.map(link => (
            <div key={link.id} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${link.is_active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}`, borderRadius: 12, padding: '14px 18px', opacity: link.is_active ? 1 : 0.5 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{link.label}</span>
                    {!link.is_active && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' }}>Inactive</span>}
                  </div>
                  {link.recipient_name && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: '0 0 4px' }}>For: {link.recipient_name}{link.recipient_email ? ` · ${link.recipient_email}` : ''}</p>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                    {link.pages_allowed.map(p => <span key={p} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(127,184,151,0.08)', color: 'rgba(127,184,151,0.7)' }}>{p}</span>)}
                  </div>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: 0 }}>
                    {link.access_count} access{link.access_count !== 1 ? 'es' : ''}{link.last_accessed_at ? ` · Last ${timeAgo(link.last_accessed_at)}` : ''}
                    {link.expires_at ? ` · Expires ${new Date(link.expires_at).toLocaleDateString('en-AU')}` : ' · No expiry'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => { navigator.clipboard.writeText(link.url); setCopied(link.url) }} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Copy link</button>
                  <button onClick={() => toggleActive(link.id, !link.is_active)} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>{link.is_active ? 'Pause' : 'Enable'}</button>
                  <button onClick={() => deactivate(link.id)} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)', color: '#F87171', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
