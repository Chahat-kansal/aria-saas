'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

interface LapsedCustomer { id: string; name: string; phone: string | null; email: string | null; last_visit_at: string | null; total_spend: number | null }
interface Campaign { id: string; name: string | null; type: string; message: string | null; status: string | null; sms_sent: boolean | null; created_at: string; error: string | null }

function daysAgo(date: string | null) {
  if (!date) return null
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
}

const C = {
  bg: 'var(--bg-base)', card: 'var(--bg-surface)', text: 'var(--text-primary)',
  muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)',
  green: '#22C55E', amber: '#F59E0B', violet: '#8B5CF6', red: '#EF4444',
  border: 'rgba(255,255,255,0.07)',
}

export default function WinbackPage() {
  const { business } = useBusinessContext()
  const [customers, setCustomers] = useState<LapsedCustomer[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [generating, setGenerating] = useState(false)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number; noPhone: number } | null>(null)
  const [activeTab, setActiveTab] = useState<'customers' | 'campaigns'>('customers')
  // Single source of truth — lapsedDays only, no lapsedFilter
  const [lapsedDays, setLapsedDays] = useState(60)

  const load = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    const cutoff = new Date(Date.now() - lapsedDays * 86400000).toISOString()
    const [custRes, campRes] = await Promise.all([
      fetch('/api/pos/customers?business_id=' + business.id + '&limit=200').then(r => r.json()).catch(() => ({ customers: [] })),
      fetch('/api/campaigns?business_id=' + business.id + '&type=winback').then(r => r.json()).catch(() => ({ campaigns: [] })),
    ])
    const all: LapsedCustomer[] = custRes.customers ?? custRes.data ?? []
    const lapsed = all.filter(c => !c.last_visit_at || c.last_visit_at < cutoff)
    setCustomers(lapsed)
    setCampaigns(campRes.campaigns ?? campRes.data ?? [])
    const initSel: Record<string, boolean> = {}
    lapsed.forEach((c: LapsedCustomer) => { if (c.phone) initSel[c.id] = true })
    setSelected(initSel)
    setLoading(false)
  }, [business?.id, lapsedDays])

  useEffect(() => { load() }, [load])

  async function generateMessage() {
    if (!business?.id) return
    setGenerating(true)
    try {
      const res = await fetch('/api/aria/winback-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id }),
      }).then(r => r.json())
      if (res.message) setMessage(res.message)
    } catch { /* keep existing */ }
    setGenerating(false)
  }

  useEffect(() => { if (business?.id && !message) generateMessage() }, [business?.id])

  async function sendCampaign() {
    if (!business?.id || !message.trim()) return
    const targets = customers.filter(c => selected[c.id] && c.phone)
    if (targets.length === 0) return
    if (!window.confirm('Send this SMS to ' + targets.length + ' customer' + (targets.length !== 1 ? 's' : '') + '?')) return
    setSending(true)
    try {
      const res = await fetch('/api/aria/winback-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, customer_ids: targets.map(c => c.id), message }),
      }).then(r => r.json())
      setSendResult(res)
      load()
    } catch { /* ignore */ }
    setSending(false)
  }

  const selectedCount = Object.values(selected).filter(Boolean).length
  const withPhone = customers.filter(c => c.phone).length

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Inter',sans-serif", padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Customer Winback</h1>
          <p style={{ fontSize: 13, color: C.muted }}>Re-engage customers who haven't visited in a while.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: C.muted }}>Lapsed after</span>
          {[30, 60, 90].map(d => (
            <button key={d} onClick={() => setLapsedDays(d)}
              style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid ' + (lapsedDays === d ? C.violet : C.border), background: lapsedDays === d ? 'rgba(139,92,246,0.12)' : 'transparent', color: lapsedDays === d ? C.violet : C.muted, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Lapsed customers', value: customers.length, color: C.amber },
          { label: 'Reachable by SMS', value: withPhone, color: C.green },
          { label: 'Selected to contact', value: selectedCount, color: C.violet },
        ].map(s => (
          <div key={s.label} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid ' + C.border, marginBottom: 20 }}>
        {(['customers', 'campaigns'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            style={{ padding: '10px 16px', border: 'none', borderBottom: '2px solid ' + (activeTab === t ? C.violet : 'transparent'), background: 'transparent', color: activeTab === t ? C.text : C.muted, fontSize: 13, fontWeight: activeTab === t ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
            {t === 'customers' ? 'Lapsed Customers (' + customers.length + ')' : 'Past Campaigns (' + campaigns.length + ')'}
          </button>
        ))}
      </div>

      {activeTab === 'customers' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20 }}>
          {/* Customer list */}
          <div>
            {loading ? (
              <div style={{ color: C.muted, textAlign: 'center', padding: '40px 0' }}>Loading...</div>
            ) : customers.length === 0 ? (
              <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '32px', textAlign: 'center' }}>
                <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No lapsed customers</p>
                <p style={{ fontSize: 13, color: C.muted }}>All your customers have visited within the last {lapsedDays} days.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <button onClick={() => {
                    const allSelected = customers.filter(c => c.phone).every(c => selected[c.id])
                    const newSel: Record<string, boolean> = {}
                    if (!allSelected) customers.filter(c => c.phone).forEach(c => { newSel[c.id] = true })
                    setSelected(newSel)
                  }}
                    style={{ fontSize: 11, color: C.violet, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                    {customers.filter(c => c.phone).every(c => selected[c.id]) ? 'Deselect all' : 'Select all with phone'}
                  </button>
                  <span style={{ fontSize: 11, color: C.dim }}>{selectedCount} selected</span>
                </div>
                {customers.map(c => {
                  const days = daysAgo(c.last_visit_at)
                  const isSelected = selected[c.id]
                  return (
                    <div key={c.id} onClick={() => c.phone && setSelected(prev => ({ ...prev, [c.id]: !prev[c.id] }))}
                      style={{ background: isSelected ? 'rgba(139,92,246,0.08)' : C.card, border: '1px solid ' + (isSelected ? 'rgba(139,92,246,0.3)' : C.border), borderRadius: 10, padding: '12px 14px', cursor: c.phone ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 16, height: 16, borderRadius: 4, border: '1px solid ' + (isSelected ? C.violet : C.border), background: isSelected ? C.violet : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isSelected && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: C.muted }}>{c.phone ?? 'No phone'}{c.total_spend ? ' · A$' + Number(c.total_spend).toFixed(0) + ' lifetime' : ''}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: (days ?? 0) > 90 ? C.red : C.amber }}>{days != null ? days + 'd ago' : 'Never'}</div>
                        {!c.phone && <div style={{ fontSize: 10, color: C.dim }}>no SMS</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Message + send */}
          <div>
            <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.text }}>SMS Message</p>
                <button onClick={generateMessage} disabled={generating}
                  style={{ fontSize: 11, color: C.violet, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, opacity: generating ? 0.5 : 1 }}>
                  {generating ? '✨ Writing...' : '✨ Regenerate'}
                </button>
              </div>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={5}
                style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid ' + C.border, borderRadius: 8, padding: '10px 12px', color: C.text, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                placeholder="AI-generated winback message will appear here..."
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, marginBottom: 16 }}>
                <span style={{ fontSize: 11, color: C.dim }}>{message.length}/160 chars</span>
                <span style={{ fontSize: 11, color: message.length > 160 ? C.red : C.dim }}>{message.length > 160 ? 'Too long for 1 SMS' : '1 SMS'}</span>
              </div>
              <button onClick={sendCampaign} disabled={sending || selectedCount === 0 || !message.trim()}
                style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: selectedCount > 0 && message.trim() ? C.green : 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: selectedCount > 0 ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: sending ? 0.6 : 1 }}>
                {sending ? 'Sending...' : 'Send SMS to ' + selectedCount + ' customer' + (selectedCount !== 1 ? 's' : '')}
              </button>
              {sendResult && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, fontSize: 12, color: C.green }}>
                  ✓ Sent: {sendResult.sent} · Failed: {sendResult.failed} · No phone: {sendResult.noPhone}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'campaigns' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {campaigns.length === 0 ? (
            <div style={{ color: C.muted, textAlign: 'center', padding: '40px 0' }}>No campaigns sent yet.</div>
          ) : campaigns.map(c => (
            <div key={c.id} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{c.name ?? 'Winback Campaign'}</p>
                <p style={{ fontSize: 12, color: C.muted }}>{c.message?.slice(0, 80)}{(c.message?.length ?? 0) > 80 ? '...' : ''}</p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: c.status === 'sent' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)', color: c.status === 'sent' ? C.green : C.muted }}>
                  {c.status ?? 'draft'}
                </span>
                <p style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>{new Date(c.created_at).toLocaleDateString('en-AU')}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
