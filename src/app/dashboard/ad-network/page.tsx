'use client'
import { useState, useEffect, useCallback } from 'react'
import { AriaSays } from '@/components/dashboard/AriaSays'

interface Campaign {
  id: string
  advertiser_name: string
  advertiser_contact: string | null
  ad_title: string
  ad_body: string | null
  ad_image_url: string | null
  weekly_rate: number | null
  start_date: string | null
  end_date: string | null
  status: 'pending' | 'active' | 'paused' | 'ended'
  impressions: number
  impressions_30d: number
  created_at: string
}

const C = {
  bg: '#0d0d14', card: '#13131a', border: 'rgba(255,255,255,0.07)',
  text: '#e8ede7', muted: 'rgba(255,255,255,0.5)', dim: 'rgba(255,255,255,0.3)',
  green: '#7FB897', sage: '#2D5240', amber: '#F59E0B', red: '#EF4444',
}

const STATUS_COLOR: Record<string, string> = {
  pending: C.amber, active: C.green, paused: C.dim, ended: C.dim,
}

const inp: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)', border: '1px solid ' + C.border,
  borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 13,
  width: '100%', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
}

const blankForm = {
  advertiser_name: '', advertiser_contact: '', ad_title: '', ad_body: '',
  ad_image_url: '', weekly_rate: 0, start_date: '', end_date: '',
}

export default function AdNetworkPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [monthRevenue, setMonthRevenue] = useState(0)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ ...blankForm })
  const [editId, setEditId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await fetch('/api/pos/ad-campaigns').then(r => r.json())
      setCampaigns(d.campaigns ?? [])
      setMonthRevenue(d.month_revenue_aud ?? 0)
    } catch (e: unknown) {
      setError((e as Error).message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function save() {
    setSaving(true)
    setError('')
    try {
      const method = editId ? 'PATCH' : 'POST'
      const body = editId ? { ...form, id: editId } : form
      const res = await fetch('/api/pos/ad-campaigns', {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed')
      setShowForm(false)
      setEditId(null)
      setForm({ ...blankForm })
      load()
    } catch (e: unknown) {
      setError((e as Error).message)
    }
    setSaving(false)
  }

  async function updateStatus(id: string, status: Campaign['status']) {
    await fetch('/api/pos/ad-campaigns', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    load()
  }

  async function remove(id: string) {
    if (!confirm('Delete this campaign?')) return
    await fetch('/api/pos/ad-campaigns?id=' + id, { method: 'DELETE' })
    load()
  }

  function edit(c: Campaign) {
    setEditId(c.id)
    setForm({
      advertiser_name: c.advertiser_name ?? '',
      advertiser_contact: c.advertiser_contact ?? '',
      ad_title: c.ad_title ?? '',
      ad_body: c.ad_body ?? '',
      ad_image_url: c.ad_image_url ?? '',
      weekly_rate: Number(c.weekly_rate ?? 0),
      start_date: c.start_date ?? '',
      end_date: c.end_date ?? '',
    })
    setShowForm(true)
  }

  const activeCount = campaigns.filter(c => c.status === 'active').length
  const pendingCount = campaigns.filter(c => c.status === 'pending').length
  const totalImpressions30d = campaigns.reduce((s, c) => s + (c.impressions_30d ?? 0), 0)

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, color: C.text, fontFamily: 'Inter, sans-serif' }}>
      <AriaSays businessId={null} page="ad-network" />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>In-Store Ad Network</h1>
          <p style={{ fontSize: 13, color: C.muted, margin: '4px 0 0' }}>Sell your customer display + kiosk screen space to local brands. Pure-margin income.</p>
        </div>
        <button onClick={() => { setEditId(null); setForm({ ...blankForm }); setShowForm(true) }}
          style={{ padding: '10px 18px', background: C.sage, color: C.green, border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          + New ad campaign
        </button>
      </div>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Revenue this month', value: 'A$' + monthRevenue.toFixed(0), color: C.green },
          { label: 'Active campaigns', value: String(activeCount), color: C.text },
          { label: 'Pending approval', value: String(pendingCount), color: pendingCount > 0 ? C.amber : C.dim },
          { label: 'Impressions (30d)', value: totalImpressions30d.toLocaleString(), color: C.text },
        ].map(m => (
          <div key={m.label} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 10, padding: 14 }}>
            <p style={{ fontSize: 11, color: C.muted, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</p>
            <p style={{ fontSize: 22, fontWeight: 700, color: m.color, margin: '6px 0 0', fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Form */}
      {showForm && (
        <section style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 14px' }}>{editId ? 'Edit campaign' : 'New ad campaign'}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label>
              <span style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Advertiser name *</span>
              <input value={form.advertiser_name} onChange={e => setForm({ ...form, advertiser_name: e.target.value })} style={inp} />
            </label>
            <label>
              <span style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Advertiser contact</span>
              <input value={form.advertiser_contact} onChange={e => setForm({ ...form, advertiser_contact: e.target.value })} style={inp} placeholder="email or phone" />
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              <span style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Ad headline *</span>
              <input value={form.ad_title} onChange={e => setForm({ ...form, ad_title: e.target.value })} style={inp} placeholder="e.g. New Shiraz from McLaren Vale" />
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              <span style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Body text</span>
              <textarea value={form.ad_body} onChange={e => setForm({ ...form, ad_body: e.target.value })} rows={2} style={{ ...inp, resize: 'vertical' }} placeholder="One short line that looks good on a screen." />
            </label>
            <label>
              <span style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Image URL</span>
              <input value={form.ad_image_url} onChange={e => setForm({ ...form, ad_image_url: e.target.value })} style={inp} placeholder="https://..." />
            </label>
            <label>
              <span style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Weekly rate (A$)</span>
              <input type="number" value={form.weekly_rate} onChange={e => setForm({ ...form, weekly_rate: Number(e.target.value) })} style={inp} />
            </label>
            <label>
              <span style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Start date</span>
              <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} style={inp} />
            </label>
            <label>
              <span style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>End date</span>
              <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} style={inp} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
            <button onClick={save} disabled={saving || !form.advertiser_name || !form.ad_title}
              style={{ padding: '9px 18px', background: C.sage, color: C.green, border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : (editId ? 'Save changes' : 'Create campaign')}
            </button>
            <button onClick={() => { setShowForm(false); setEditId(null); setForm({ ...blankForm }) }}
              style={{ padding: '9px 18px', background: 'transparent', color: C.muted, border: '1px solid ' + C.border, borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
              Cancel
            </button>
            {error && <span style={{ fontSize: 12, color: C.red }}>{error}</span>}
          </div>
        </section>
      )}

      {/* List */}
      <section style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <p style={{ padding: 20, color: C.muted }}>Loading…</p>
        ) : campaigns.length === 0 ? (
          <p style={{ padding: 32, textAlign: 'center', color: C.muted, fontSize: 14 }}>No campaigns yet. Create one above.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid ' + C.border }}>
                {['Advertiser', 'Ad', 'Rate / wk', 'Dates', 'Status', 'Impressions (30d)', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, textAlign: 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campaigns.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13 }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>{c.advertiser_name}</p>
                    {c.advertiser_contact && <p style={{ margin: '2px 0 0', fontSize: 11, color: C.dim }}>{c.advertiser_contact}</p>}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13 }}>
                    <p style={{ margin: 0 }}>{c.ad_title}</p>
                    {c.ad_body && <p style={{ margin: '2px 0 0', fontSize: 11, color: C.dim, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.ad_body}</p>}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: C.green, fontWeight: 600 }}>A${Number(c.weekly_rate ?? 0).toFixed(0)}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: C.muted }}>{c.start_date ?? '—'} → {c.end_date ?? 'ongoing'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12, background: STATUS_COLOR[c.status] + '22', color: STATUS_COLOR[c.status], textTransform: 'uppercase' }}>{c.status}</span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13 }}>{c.impressions_30d ?? 0}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {c.status === 'pending' && <button onClick={() => updateStatus(c.id, 'active')} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid ' + C.green, background: 'transparent', color: C.green, fontSize: 11, cursor: 'pointer' }}>Approve</button>}
                      {c.status === 'active' && <button onClick={() => updateStatus(c.id, 'paused')} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid ' + C.amber, background: 'transparent', color: C.amber, fontSize: 11, cursor: 'pointer' }}>Pause</button>}
                      {c.status === 'paused' && <button onClick={() => updateStatus(c.id, 'active')} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid ' + C.green, background: 'transparent', color: C.green, fontSize: 11, cursor: 'pointer' }}>Resume</button>}
                      <button onClick={() => edit(c)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid ' + C.border, background: 'transparent', color: C.muted, fontSize: 11, cursor: 'pointer' }}>Edit</button>
                      <button onClick={() => remove(c.id)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: C.red, fontSize: 11, cursor: 'pointer' }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
