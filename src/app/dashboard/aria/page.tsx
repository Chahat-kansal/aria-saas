'use client'
import { useState, useEffect } from 'react'

interface BrainStatus { daily_briefing_at: string | null; intelligence_signals: number; competitor_check_at: string | null; customer_scoring_at: string | null }
interface AgentBreakdown { agent: string; calls: number; tokens: number }
interface AiUsage { total_calls: number; total_tokens: number; est_cost_usd: number; by_agent: AgentBreakdown[] }
interface AutopilotAction { id: string; action_type: string | null; status: string | null; created_at: string; details?: unknown }
interface MemoryItem { id: string; kind: string | null; content: string | null; topic: string | null; importance: number | null }
interface RecentCall { agent_key: string | null; model_id: string | null; input_tokens: number | null; output_tokens: number | null; created_at: string }
interface Status { brain_status: BrainStatus; ai_usage: AiUsage; autopilot_actions: AutopilotAction[]; memory: MemoryItem[]; recent_calls: RecentCall[] }

const C = { surface: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.07)', green: '#7FB897', amber: '#f59e0b', violet: '#A78BFA', blue: '#60a5fa', red: '#ef4444', text: '#E8EDE7', dim: 'rgba(255,255,255,0.4)', muted: 'rgba(255,255,255,0.2)' }

function timeAgo(iso: string | null) {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600_000)
  if (h < 1) return Math.floor(diff / 60_000) + 'm ago'
  if (h < 24) return h + 'h ago'
  return Math.floor(h / 24) + 'd ago'
}

export default function AriaDashboardPage() {
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [tune, setTune] = useState<'conservative' | 'balanced' | 'aggressive'>('balanced')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/aria-os/status').then(r => r.json()).then(d => { setStatus(d); setLoading(false) }).catch(() => setLoading(false))
    const stored = typeof window !== 'undefined' ? localStorage.getItem('aria-tune') : null
    if (stored === 'conservative' || stored === 'balanced' || stored === 'aggressive') setTune(stored)
  }, [])

  function setTuning(v: 'conservative' | 'balanced' | 'aggressive') {
    setTune(v)
    if (typeof window !== 'undefined') localStorage.setItem('aria-tune', v)
  }

  if (loading) return <div style={{ padding: 40, color: C.dim, fontFamily: 'Manrope, sans-serif' }}>Loading…</div>

  const filteredCalls = (status?.recent_calls ?? []).filter(c => !search || (c.agent_key ?? '').toLowerCase().includes(search.toLowerCase()))

  return (
    <div style={{ padding: 24, maxWidth: 1100, color: C.text, fontFamily: 'Manrope, sans-serif' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          ✦ Aria OS Status
          <span style={{ fontSize: 10, color: C.green, padding: '2px 8px', borderRadius: 99, background: 'rgba(127,184,151,0.15)', border: '1px solid rgba(127,184,151,0.3)', fontWeight: 700 }}>OPERATIONAL</span>
        </h1>
        <p style={{ fontSize: 13, color: C.dim, marginTop: 4 }}>What Aria is doing, knows, and recently ran</p>
      </div>

      {/* Brain status */}
      <div style={{ marginBottom: 18, padding: 18, borderRadius: 12, background: C.surface, border: '1px solid ' + C.border }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Brain status</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {[
            { label: 'Daily briefing', ts: status?.brain_status.daily_briefing_at },
            { label: 'Intelligence signals', ts: null, badge: `${status?.brain_status.intelligence_signals ?? 0} active` },
            { label: 'Competitor monitoring', ts: status?.brain_status.competitor_check_at },
            { label: 'Customer scoring', ts: status?.brain_status.customer_scoring_at },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: (item.ts || item.badge) ? C.green : C.muted }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 12, fontWeight: 600 }}>{item.label}</p>
                <p style={{ fontSize: 11, color: C.dim }}>{item.badge ?? timeAgo(item.ts ?? null)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI usage this month */}
      <div style={{ marginBottom: 18, padding: 18, borderRadius: 12, background: C.surface, border: '1px solid ' + C.border }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>AI usage · this month</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
          {[
            { label: 'Total calls', value: status?.ai_usage.total_calls ?? 0, color: C.violet },
            { label: 'Tokens', value: (status?.ai_usage.total_tokens ?? 0).toLocaleString('en-AU'), color: C.blue },
            { label: 'Est. cost', value: '$' + (status?.ai_usage.est_cost_usd ?? 0).toFixed(2), color: C.green },
          ].map(m => (
            <div key={m.label}>
              <p style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase' }}>{m.label}</p>
              <p style={{ fontSize: 20, fontWeight: 700, color: m.color, marginTop: 2 }}>{m.value}</p>
            </div>
          ))}
        </div>
        {status?.ai_usage.by_agent && status.ai_usage.by_agent.length > 0 && (
          <div>
            <p style={{ fontSize: 10, color: C.dim, marginBottom: 6 }}>Breakdown by feature</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {status.ai_usage.by_agent.slice(0, 8).map(a => (
                <div key={a.agent} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
                  <span style={{ color: C.text }}>{a.agent.replace(/_/g, ' ')}</span>
                  <span style={{ color: C.dim }}>{a.calls} calls · {a.tokens.toLocaleString('en-AU')} tok</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Autopilot + Memory */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
        <div style={{ padding: 18, borderRadius: 12, background: C.surface, border: '1px solid ' + C.border }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Autopilot · this week</p>
          {(!status?.autopilot_actions || status.autopilot_actions.length === 0) ? <p style={{ fontSize: 12, color: C.dim }}>No autonomous actions yet.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {status.autopilot_actions.slice(0, 8).map(a => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <span>{a.action_type ?? 'action'}</span>
                  <span style={{ color: a.status === 'success' ? C.green : a.status === 'failed' ? C.red : C.dim }}>{a.status ?? '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding: 18, borderRadius: 12, background: C.surface, border: '1px solid ' + C.border }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>What Aria knows</p>
          {(!status?.memory || status.memory.length === 0) ? <p style={{ fontSize: 12, color: C.dim }}>No memories captured yet.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {status.memory.slice(0, 6).map(m => (
                <div key={m.id} style={{ padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <p style={{ fontSize: 12, color: C.text }}>{m.content}</p>
                  <p style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>{m.kind} · {m.topic ?? '—'} · importance {m.importance ?? 0}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tune Aria */}
      <div style={{ marginBottom: 18, padding: 18, borderRadius: 12, background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.2)' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: C.violet, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>✦ Tune Aria</p>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['conservative', 'balanced', 'aggressive'] as const).map(v => (
            <button key={v} onClick={() => setTuning(v)}
              style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: '1px solid ' + (tune === v ? C.violet : C.border), background: tune === v ? 'rgba(167,139,250,0.2)' : 'transparent', color: tune === v ? C.violet : C.dim, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
              {v}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 11, color: C.dim, marginTop: 8 }}>
          {tune === 'conservative' ? 'Aria only suggests changes — never acts automatically.'
            : tune === 'balanced' ? 'Aria handles routine work (winbacks, reorders) automatically; flags big changes for approval.'
            : 'Aria acts boldly — auto-publishes promos, adjusts prices and triggers campaigns within safe limits.'}
        </p>
      </div>

      {/* Call log */}
      <div style={{ padding: 18, borderRadius: 12, background: C.surface, border: '1px solid ' + C.border }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Recent AI calls</p>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter by agent…"
            style={{ padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid ' + C.border, color: C.text, fontSize: 11, fontFamily: 'inherit', width: 200 }} />
        </div>
        {filteredCalls.length === 0 ? <p style={{ fontSize: 12, color: C.dim }}>No matching calls.</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead><tr style={{ borderBottom: '1px solid ' + C.border }}>{['When', 'Agent', 'Model', 'Tokens'].map(h => (<th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>))}</tr></thead>
            <tbody>
              {filteredCalls.map((c, i) => (
                <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '5px 8px', color: C.dim }}>{new Date(c.created_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td style={{ padding: '5px 8px' }}>{c.agent_key ?? '—'}</td>
                  <td style={{ padding: '5px 8px', color: C.dim, fontFamily: 'monospace', fontSize: 10 }}>{(c.model_id ?? '').replace('claude-', '')}</td>
                  <td style={{ padding: '5px 8px', color: C.dim }}>{(Number(c.input_tokens ?? 0) + Number(c.output_tokens ?? 0)).toLocaleString('en-AU')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
