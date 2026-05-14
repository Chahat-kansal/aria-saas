'use client'
import { useState, useEffect } from 'react'

interface Briefing { id: string; created_at: string; content?: string; summary?: string; sections?: Record<string, string>; business_id: string }

export default function DailyBriefingPage() {
  const [briefings, setBriefings] = useState<Briefing[]>([])
  const [loading, setLoading]     = useState(true)
  const [selected, setSelected]   = useState<Briefing | null>(null)
  const [businessId, setBusinessId] = useState<string | null>(null)

  useEffect(() => {
    // Get business ID then fetch briefings
    fetch('/api/pos/products')
      .then(r => r.json())
      .then(d => {
        const bid = d.business_id ?? d.products?.[0]?.business_id ?? null
        setBusinessId(bid)
        if (!bid) { setLoading(false); return }
        return fetch(`/api/aria/daily-briefing?business_id=${bid}`)
          .then(r => r.json())
          .then(data => {
            const list: Briefing[] = data.briefings ?? (data.briefing ? [data.briefing] : [])
            setBriefings(list)
            if (list.length > 0) setSelected(list[0])
            setLoading(false)
          })
      })
      .catch(() => setLoading(false))
  }, [])

  const fmt = (d: string) => new Date(d).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })

  if (loading) return (
    <div style={{ padding: '40px 32px', color: 'var(--text-tertiary)', fontFamily: "'Manrope',sans-serif", fontSize: 13 }}>Loading briefings…</div>
  )

  return (
    <div style={{ display: 'flex', height: '100%', fontFamily: "'Manrope',sans-serif", background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      {/* Sidebar: list of briefings */}
      <div style={{ width: 240, borderRight: '1px solid var(--divider)', display: 'flex', flexDirection: 'column', overflowY: 'auto', flexShrink: 0 }}>
        <div style={{ padding: '20px 16px 10px', fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Daily Briefings
        </div>
        {briefings.length === 0 ? (
          <div style={{ padding: '16px', fontSize: 13, color: 'var(--text-tertiary)' }}>
            Your first briefing will appear tomorrow morning.
          </div>
        ) : (
          briefings.map(b => (
            <button key={b.id} onClick={() => setSelected(b)}
              style={{ padding: '12px 16px', textAlign: 'left', border: 'none', borderBottom: '1px solid var(--divider)', background: selected?.id === b.id ? 'var(--bg-elevated)' : 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(b.created_at)}</div>
            </button>
          ))
        )}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
        {selected ? (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>{fmt(selected.created_at)}</h1>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 24px' }}>Daily business briefing from Aria</p>
            {selected.sections ? (
              Object.entries(selected.sections).map(([title, body]) => (
                <div key={title} style={{ marginBottom: 24 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>{title}</h2>
                  <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-primary)', margin: 0, whiteSpace: 'pre-wrap' }}>{body}</p>
                </div>
              ))
            ) : (
              <div style={{ fontSize: 14, lineHeight: 1.75, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>
                {selected.content ?? selected.summary ?? 'No content available.'}
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📰</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>No briefings yet</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 320, margin: '0 auto' }}>
              Aria generates your daily briefing each morning with insights about your sales, stock, and upcoming tasks.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}