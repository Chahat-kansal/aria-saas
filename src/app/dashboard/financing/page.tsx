'use client'
// FIN-15 — read-only surface for existing `financing_opportunities` rows. Fetches the EXISTING
// GET /api/agents/financing/opportunities endpoint and renders what's there. No writes, no new table.
import { useEffect, useState } from 'react'

const INK = '#2D5240'
const SAGE = '#7FB897'
const SAND = '#C9A37A'
const AMBER = '#BA7517'

interface Opportunity {
  id: string
  opportunity_type: string | null
  description: string | null
  potential_benefit: number | null   // dollars (no _cents suffix)
  urgency: string | null
  effort_level: string | null
  expires_at: string | null
  status: string
  created_at: string
}

const URGENCY_COLOR: Record<string, string> = { high: '#E24B4A', medium: AMBER, low: SAGE }

export default function FinancingSurface() {
  const [rows, setRows] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/agents/financing/opportunities')
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(new Error(j.error || `HTTP ${r.status}`))))
      .then((j: { opportunities: Opportunity[] }) => setRows(j.opportunities ?? []))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ minHeight: '100dvh', background: '#0f1a14', color: '#fff', fontFamily: "'Outfit',system-ui,sans-serif", padding: '32px 24px' }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <h1 style={{ fontFamily: "'Cormorant',Georgia,serif", fontStyle: 'italic', fontSize: 36, margin: '0 0 4px', color: SAGE }}>Financing Opportunities</h1>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, margin: '0 0 24px' }}>Opportunities Aria has surfaced from your business activity.</p>

        {loading && <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading…</p>}
        {error && <p style={{ color: '#E24B4A' }}>Couldn’t load opportunities: {error}</p>}
        {!loading && !error && rows.length === 0 && (
          <div style={{ textAlign: 'center', padding: 48, border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 12, color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
            No financing opportunities right now.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map(o => (
            <div key={o.id} style={{ border: '1px solid rgba(255,255,255,0.1)', borderLeft: `3px solid ${URGENCY_COLOR[o.urgency ?? 'low'] ?? SAGE}`, borderRadius: 12, padding: '16px 18px', background: 'rgba(255,255,255,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{o.opportunity_type ?? 'Opportunity'}</span>
                {o.potential_benefit != null && (
                  <span style={{ fontFamily: "'Cormorant',Georgia,serif", fontStyle: 'italic', fontSize: 22, color: SAGE }}>
                    +${Number(o.potential_benefit).toLocaleString('en-AU', { minimumFractionDigits: 0 })}
                  </span>
                )}
              </div>
              {o.description && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.5, margin: '8px 0 10px' }}>{o.description}</p>}
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11.5, color: 'rgba(255,255,255,0.5)' }}>
                {o.urgency && <span>Urgency: <b style={{ color: URGENCY_COLOR[o.urgency] ?? '#fff' }}>{o.urgency}</b></span>}
                {o.effort_level && <span>Effort: <b style={{ color: SAND }}>{o.effort_level}</b></span>}
                {o.expires_at && <span>Expires: {new Date(o.expires_at).toLocaleDateString('en-AU')}</span>}
                <span>Status: {o.status}</span>
              </div>
            </div>
          ))}
        </div>

        <p style={{ marginTop: 28, fontSize: 11.5, color: 'rgba(255,255,255,0.4)', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14 }}>
          This is general information surfaced from your business data, <b>not financial advice</b>. Consider your circumstances and seek a licensed adviser before acting.
        </p>
      </div>
    </div>
  )
}
