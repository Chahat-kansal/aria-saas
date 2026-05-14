'use client'
import { useState, useEffect } from 'react'

interface Config {
  program_type: string
  points_per_dollar: number
  point_value_cents: number
  stamps_to_reward: number
  stamp_reward_text: string
  birthday_reward_text: string | null
  winback_after_days: number | null
  winback_reward_text: string | null
}
interface TopCustomer {
  id: string; name: string; phone: string | null
  total_spent: number; points_balance: number; stamps_count: number
  visit_count: number; last_visit_at: string | null; tags: string[]
}

const PROGRAM_TYPES = [
  { key: 'points',  label: 'Points',        desc: 'Earn points per dollar, redeem for discounts' },
  { key: 'stamps',  label: 'Stamp card',    desc: 'Collect stamps, earn a reward at target' },
  { key: 'both',    label: 'Both',          desc: 'Points + stamp card' },
  { key: 'off',     label: 'Off',           desc: 'Disable loyalty for now' },
]

const inp: React.CSSProperties = {
  background: 'var(--bg-base)', border: '1px solid var(--divider)', borderRadius: 8,
  padding: '8px 12px', fontSize: 13, color: 'var(--text-primary)', outline: 'none',
  fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
}

export default function LoyaltyPage() {
  const [config,   setConfig]   = useState<Config>({
    program_type: 'points', points_per_dollar: 1, point_value_cents: 1,
    stamps_to_reward: 10, stamp_reward_text: 'Free coffee',
    birthday_reward_text: null, winback_after_days: 30, winback_reward_text: null,
  })
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [topCusts, setTopCusts] = useState<TopCustomer[]>([])

  useEffect(() => {
    Promise.all([
      fetch('/api/pos/loyalty/config').then(r => r.json()).catch(() => ({})),
      fetch('/api/pos/customers?sort=total_spent&limit=10').then(r => r.json()).catch(() => ({ customers: [] })),
    ]).then(([cfgRes, custRes]) => {
      if (cfgRes.config) setConfig(c => ({ ...c, ...cfgRes.config }))
      setTopCusts(custRes.customers ?? [])
      setLoading(false)
    })
  }, [])

  async function save() {
    setSaving(true)
    await fetch('/api/pos/loyalty/config', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    }).catch(() => {})
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const pointsValue = ((config.point_value_cents ?? 1) / 100).toFixed(2)
  const redeemExample = Math.round(1 / ((config.point_value_cents ?? 1) / 100))

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '28px 32px', maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Loyalty Program</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Configure points, stamps, birthday rewards and win-back messaging.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {saved && <span style={{ fontSize: 12, color: '#7FB897', fontWeight: 600 }}>✓ Saved</span>}
          <button onClick={save} disabled={saving}
            style={{ padding: '9px 22px', borderRadius: 9, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ height: 200, background: 'var(--bg-surface)', borderRadius: 14, animation: 'pulse 1.5s infinite' }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Program type */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 14, padding: '20px 22px' }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 14px' }}>Program Type</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 10 }}>
              {PROGRAM_TYPES.map(pt => (
                <button key={pt.key} onClick={() => setConfig(c => ({ ...c, program_type: pt.key }))}
                  style={{
                    padding: '12px 14px', borderRadius: 10, textAlign: 'left', cursor: 'pointer',
                    border: `2px solid ${config.program_type === pt.key ? 'var(--violet)' : 'var(--divider)'}`,
                    background: config.program_type === pt.key ? 'rgba(139,92,246,0.08)' : 'var(--bg-elevated)',
                    fontFamily: 'inherit',
                  }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: config.program_type === pt.key ? 'var(--violet)' : 'var(--text-primary)', marginBottom: 3 }}>{pt.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>{pt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Points config */}
          {['points','both'].includes(config.program_type) && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 14, padding: '20px 22px' }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 14px' }}>Points Settings</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Points per dollar spent</label>
                  <input type="number" min={0.1} max={100} step={0.1} style={inp}
                    value={config.points_per_dollar}
                    onChange={e => setConfig(c => ({ ...c, points_per_dollar: parseFloat(e.target.value) || 1 }))} />
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>$10 sale = {Math.floor(10 * config.points_per_dollar)} points</p>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Point value (cents each)</label>
                  <input type="number" min={0.1} max={100} step={0.1} style={inp}
                    value={config.point_value_cents}
                    onChange={e => setConfig(c => ({ ...c, point_value_cents: parseFloat(e.target.value) || 1 }))} />
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{redeemExample} points = A$1.00 off</p>
                </div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 12, background: 'rgba(139,92,246,0.06)', padding: '8px 12px', borderRadius: 8 }}>
                Preview: Customer spends A$10 → earns {Math.floor(10 * config.points_per_dollar)} points worth A${(Math.floor(10 * config.points_per_dollar) * config.point_value_cents / 100).toFixed(2)}
              </p>
            </div>
          )}

          {/* Stamps config */}
          {['stamps','both'].includes(config.program_type) && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 14, padding: '20px 22px' }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 14px' }}>Stamp Card</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Stamps to earn reward</label>
                  <input type="number" min={1} max={50} style={inp}
                    value={config.stamps_to_reward}
                    onChange={e => setConfig(c => ({ ...c, stamps_to_reward: parseInt(e.target.value) || 10 }))} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Reward text</label>
                  <input style={inp} placeholder="e.g. Free coffee" value={config.stamp_reward_text}
                    onChange={e => setConfig(c => ({ ...c, stamp_reward_text: e.target.value }))} />
                </div>
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                {Array.from({ length: config.stamps_to_reward }, (_, i) => (
                  <span key={i} style={{ fontSize: 16 }}>{i < config.stamps_to_reward - 1 ? '☕' : '🎁'}</span>
                )).slice(0, 10)}
                {config.stamps_to_reward > 10 && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>…+{config.stamps_to_reward - 10} more</span>}
              </div>
            </div>
          )}

          {/* Birthday reward */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 14, padding: '20px 22px' }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>Birthday Reward</h2>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 14px' }}>
              SMS sent automatically on customer&apos;s birthday. Requires marketing consent + phone number.
            </p>
            <input style={inp} placeholder="e.g. Free slice of cake on us! Show this message at the counter."
              value={config.birthday_reward_text ?? ''}
              onChange={e => setConfig(c => ({ ...c, birthday_reward_text: e.target.value || null }))} />
          </div>

          {/* Win-back */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 14, padding: '20px 22px' }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>Win-back Campaign</h2>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 14px' }}>
              SMS customers who haven&apos;t visited after this many days.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Days since last visit</label>
                <input type="number" min={7} max={365} style={inp}
                  value={config.winback_after_days ?? 30}
                  onChange={e => setConfig(c => ({ ...c, winback_after_days: parseInt(e.target.value) || 30 }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Message</label>
                <input style={inp} placeholder="e.g. We miss you! Come back for 20% off your next order."
                  value={config.winback_reward_text ?? ''}
                  onChange={e => setConfig(c => ({ ...c, winback_reward_text: e.target.value || null }))} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top customers */}
      {topCusts.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 14px' }}>Top Customers by Spend</h2>
          <div style={{ border: '1px solid var(--divider)', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--divider)' }}>
                  {['Name','Phone','Total Spent','Points','Stamps','Visits','Last Visit'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topCusts.map((c, i) => (
                  <tr key={c.id} style={{ borderBottom: i < topCusts.length - 1 ? '1px solid var(--divider)' : 'none' }}>
                    <td style={{ padding: '9px 12px', fontWeight: 600 }}>{c.name}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--text-secondary)' }}>{c.phone ?? '—'}</td>
                    <td style={{ padding: '9px 12px', fontWeight: 700, color: '#7FB897' }}>A${(c.total_spent ?? 0).toFixed(2)}</td>
                    <td style={{ padding: '9px 12px', color: '#8B5CF6' }}>{c.points_balance ?? 0}</td>
                    <td style={{ padding: '9px 12px', color: '#F59E0B' }}>{c.stamps_count ?? 0}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--text-secondary)' }}>{c.visit_count ?? 0}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--text-tertiary)' }}>
                      {c.last_visit_at ? new Date(c.last_visit_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}