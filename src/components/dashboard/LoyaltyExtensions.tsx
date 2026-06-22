'use client'
import { useEffect, useState } from 'react'

interface Tier { id: string; tier_name: string; tier_order: number; min_spend: number; points_multiplier: number; perks: string | null; color: string }
interface Referral { id: string; referral_code: string | null; referral_date: string; referrer_points_awarded: number | null; referred_points_awarded: number | null }
interface LeaderEntry { customer_id: string; name: string; referrals: number; points_earned: number }
interface Rule { id: string; rule_type: string; points_value: number; is_active: boolean }
interface FraudFlag { customer_id: string; customer_name: string; flag_type: string; details: Record<string, unknown> }
interface ForecastSummary { loyalty_members: number; non_loyalty: number; avg_loyalty_spend: number; avg_non_loyalty_spend: number; spend_multiplier: number; at_risk: Record<string, { count: number; annual_revenue_at_risk: number }> }
interface Offer { id: string; title: string; description: string | null; image_url: string | null; offer_type: string; point_cost: number | null; active: boolean; starts_at: string | null; ends_at: string | null }

const OFFER_TYPES = [
  { key: 'info', label: 'Announcement' },
  { key: 'points_reward', label: 'Points reward' },
  { key: 'bonus', label: 'Bonus' },
]

// LOY-OFFERS — owner CRUD for loyalty offers shown on customers' dashboards.
export function OffersTab() {
  const [offers, setOffers] = useState<Offer[]>([])
  const [form, setForm] = useState({ title: '', description: '', image_url: '', offer_type: 'info', point_cost: '', ends_at: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const r = await fetch('/api/loyalty/offers').then(r => r.json()).catch(() => ({ offers: [] }))
    setOffers(r.offers ?? [])
  }
  useEffect(() => { load() }, [])

  async function add() {
    if (!form.title.trim()) { setError('Title is required.'); return }
    setSaving(true); setError('')
    const body = {
      title: form.title, description: form.description || null, image_url: form.image_url || null,
      offer_type: form.offer_type, point_cost: form.point_cost === '' ? null : Number(form.point_cost),
      ends_at: form.ends_at || null, active: true,
    }
    const res = await fetch('/api/loyalty/offers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()).catch(() => ({}))
    if (res.offer) { setOffers(o => [res.offer, ...o]); setForm({ title: '', description: '', image_url: '', offer_type: 'info', point_cost: '', ends_at: '' }) }
    else setError(res.error || 'Could not create offer.')
    setSaving(false)
  }

  async function toggleActive(o: Offer) {
    const res = await fetch('/api/loyalty/offers', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: o.id, active: !o.active }) }).then(r => r.json()).catch(() => ({}))
    if (res.offer) setOffers(list => list.map(x => x.id === o.id ? res.offer : x))
  }

  async function remove(id: string) {
    await fetch(`/api/loyalty/offers?id=${id}`, { method: 'DELETE' })
    setOffers(list => list.filter(x => x.id !== id))
  }

  const inp = { width: '100%', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(127,184,151,0.2)', color: '#fff', fontSize: 12, fontFamily: 'inherit' } as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Offers</h2>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>Post offers your members see on their loyalty dashboard. Redemption happens in store.</p>
      </div>

      {offers.length === 0 ? (
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>No offers yet — create your first below.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
          {offers.map(o => (
            <div key={o.id} style={{ padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', opacity: o.active ? 1 : 0.55 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <p style={{ fontSize: 13, fontWeight: 700 }}>{o.title}</p>
                <span style={{ fontSize: 10, color: o.active ? '#7FB897' : 'rgba(255,255,255,0.4)' }}>{o.active ? 'Active' : 'Hidden'}</span>
              </div>
              {o.description && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{o.description}</p>}
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 6 }}>{OFFER_TYPES.find(t => t.key === o.offer_type)?.label ?? o.offer_type}{o.point_cost != null ? ` · ${o.point_cost} pts` : ''}{o.ends_at ? ` · ends ${new Date(o.ends_at).toLocaleDateString('en-AU')}` : ''}</p>
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button onClick={() => toggleActive(o)} style={{ fontSize: 11, color: '#7FB897', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>{o.active ? 'Deactivate' : 'Activate'}</button>
                <button onClick={() => remove(o.id)} style={{ fontSize: 11, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: 14, borderRadius: 12, background: 'rgba(127,184,151,0.06)', border: '1px solid rgba(127,184,151,0.2)' }}>
        <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Create offer</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input style={inp} placeholder="Title (e.g. Double points weekend)" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <textarea style={{ ...inp, minHeight: 50, resize: 'vertical' }} placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.8fr 1fr', gap: 6 }}>
            <input style={inp} placeholder="Image URL (https://, optional)" value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} />
            <select style={inp} value={form.offer_type} onChange={e => setForm(f => ({ ...f, offer_type: e.target.value }))}>
              {OFFER_TYPES.map(t => <option key={t.key} value={t.key} style={{ color: '#000' }}>{t.label}</option>)}
            </select>
            <input style={inp} type="number" min={0} placeholder="Point cost" value={form.point_cost} onChange={e => setForm(f => ({ ...f, point_cost: e.target.value }))} />
            <input style={inp} type="date" value={form.ends_at} onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))} />
          </div>
          {error && <p style={{ fontSize: 12, color: '#EF4444' }}>{error}</p>}
          <button onClick={add} disabled={saving || !form.title.trim()} style={{ padding: '9px 14px', borderRadius: 8, border: 'none', background: '#7FB897', color: '#0E1812', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: saving || !form.title.trim() ? 0.5 : 1, alignSelf: 'flex-start' }}>{saving ? 'Creating…' : 'Create offer'}</button>
        </div>
      </div>
    </div>
  )
}

const RULE_TYPES = [
  { key: 'review_left', label: 'Review left' },
  { key: 'birthday_visit', label: 'Birthday visit' },
  { key: 'referral_made', label: 'Referral made' },
  { key: 'fifth_visit', label: '5th visit milestone' },
  { key: 'spending_milestone', label: 'Spending milestone' },
]

export function TiersTab() {
  const [tiers, setTiers] = useState<Tier[]>([])
  const [form, setForm] = useState({ tier_name: '', tier_order: 1, min_spend: 0, points_multiplier: 1, perks: '', color: '#7FB897' })
  const [saving, setSaving] = useState(false)

  async function load() {
    const r = await fetch('/api/loyalty/tiers').then(r => r.json()).catch(() => ({ tiers: [] }))
    setTiers(r.tiers ?? [])
  }
  useEffect(() => { load() }, [])

  async function add() {
    if (!form.tier_name.trim()) return
    setSaving(true)
    const res = await fetch('/api/loyalty/tiers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, tier_order: Number(form.tier_order), min_spend: Number(form.min_spend), points_multiplier: Number(form.points_multiplier), perks: form.perks || null }),
    }).then(r => r.json()).catch(() => ({}))
    if (res.tier) { setTiers(t => [...t, res.tier].sort((a, b) => a.tier_order - b.tier_order)); setForm({ tier_name: '', tier_order: tiers.length + 1, min_spend: 0, points_multiplier: 1, perks: '', color: '#7FB897' }) }
    setSaving(false)
  }

  async function remove(id: string) {
    await fetch(`/api/loyalty/tiers?id=${id}`, { method: 'DELETE' })
    setTiers(t => t.filter(x => x.id !== id))
  }

  const inp = { width: '100%', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(127,184,151,0.2)', color: '#fff', fontSize: 12, fontFamily: 'inherit' } as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>VIP Tiers</h2>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>Set spend thresholds and point multipliers. Customers are auto-promoted as they cross thresholds.</p>
      </div>
      {tiers.length === 0 ? (
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>No tiers yet — add Bronze / Silver / Gold to start.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {tiers.map(t => (
            <div key={t.id} style={{ padding: 14, borderRadius: 12, borderLeft: `4px solid ${t.color}`, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: t.color }}>{t.tier_name}</p>
                <button onClick={() => remove(t.id)} style={{ fontSize: 10, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
              </div>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Min spend: A${Number(t.min_spend).toFixed(0)}</p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{t.points_multiplier}× points</p>
              {t.perks && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 4, fontStyle: 'italic' }}>{t.perks}</p>}
            </div>
          ))}
        </div>
      )}
      <div style={{ padding: 14, borderRadius: 12, background: 'rgba(127,184,151,0.06)', border: '1px solid rgba(127,184,151,0.2)' }}>
        <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Add tier</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.7fr 1fr 1fr 0.6fr auto', gap: 6 }}>
          <input style={inp} placeholder="Bronze / Silver / Gold" value={form.tier_name} onChange={e => setForm(f => ({ ...f, tier_name: e.target.value }))} />
          <input style={inp} type="number" min={1} placeholder="Order" value={form.tier_order} onChange={e => setForm(f => ({ ...f, tier_order: Number(e.target.value) }))} />
          <input style={inp} type="number" min={0} placeholder="Min spend $" value={form.min_spend} onChange={e => setForm(f => ({ ...f, min_spend: Number(e.target.value) }))} />
          <input style={inp} type="number" min={0.5} step={0.5} placeholder="Multiplier" value={form.points_multiplier} onChange={e => setForm(f => ({ ...f, points_multiplier: Number(e.target.value) }))} />
          <input style={{ ...inp, padding: 4 }} type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
          <button onClick={add} disabled={saving || !form.tier_name.trim()}
            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#7FB897', color: '#0E1812', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: saving || !form.tier_name.trim() ? 0.5 : 1 }}>Add</button>
        </div>
        <input style={{ ...inp, marginTop: 6 }} placeholder="Perks (e.g. Free coffee, priority service)" value={form.perks} onChange={e => setForm(f => ({ ...f, perks: e.target.value }))} />
      </div>
    </div>
  )
}

export function ReferralsTab() {
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([])

  useEffect(() => {
    fetch('/api/loyalty/referrals').then(r => r.json()).then(d => { setReferrals(d.referrals ?? []); setLeaderboard(d.leaderboard ?? []) }).catch(() => {})
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Referral program</h2>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>Each customer gets a code. When a friend uses it at POS, both earn points.</p>
      </div>
      <div style={{ padding: 14, borderRadius: 12, background: 'rgba(127,184,151,0.06)', border: '1px solid rgba(127,184,151,0.2)' }}>
        <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>🏆 Top referrers</p>
        {leaderboard.length === 0 ? <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>No referrals yet.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {leaderboard.map((l, i) => (
              <div key={l.customer_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>{i + 1}. {l.name}</span>
                <span style={{ color: '#7FB897', fontWeight: 700 }}>{l.referrals} referrals · {l.points_earned} pts</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Recent referrals</p>
        {referrals.length === 0 ? <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>None yet.</p> : (
          <div style={{ borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
            {referrals.slice(0, 20).map(r => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 12 }}>
                <span style={{ fontFamily: 'monospace', color: '#A78BFA' }}>{r.referral_code ?? '—'}</span>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>{new Date(r.referral_date).toLocaleDateString('en-AU')}</span>
                <span style={{ color: '#7FB897' }}>+{r.referrer_points_awarded ?? 0} / +{r.referred_points_awarded ?? 0}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function RewardRulesTab() {
  const [rules, setRules] = useState<Rule[]>([])
  const [flags, setFlags] = useState<FraudFlag[]>([])

  async function load() {
    const r = await fetch('/api/loyalty/reward-rules').then(r => r.json()).catch(() => ({ rules: [] }))
    setRules(r.rules ?? [])
    const f = await fetch('/api/loyalty/fraud').then(r => r.json()).catch(() => ({ flags: [] }))
    setFlags(f.flags ?? [])
  }
  useEffect(() => { load() }, [])

  async function upsert(type: string, points_value: number, is_active: boolean, existing?: Rule) {
    if (existing) {
      await fetch(`/api/loyalty/reward-rules?id=${existing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ points_value, is_active }) })
      setRules(rs => rs.map(r => r.id === existing.id ? { ...r, points_value, is_active } : r))
    } else {
      const res = await fetch('/api/loyalty/reward-rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rule_type: type, points_value, is_active }) }).then(r => r.json())
      if (res.rule) setRules(rs => [...rs, res.rule])
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Behavior-based rewards</h2>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>Award points for actions beyond purchases.</p>
      </div>
      <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        {RULE_TYPES.map(rt => {
          const r = rules.find(x => x.rule_type === rt.key)
          return (
            <div key={rt.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.02)' }}>
              <span style={{ fontSize: 13 }}>{rt.label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="number" min={0} defaultValue={r?.points_value ?? 25} onBlur={e => upsert(rt.key, Number(e.target.value), r?.is_active ?? true, r)}
                  style={{ width: 70, padding: '5px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(127,184,151,0.2)', color: '#fff', fontSize: 12 }} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>pts</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                  <input type="checkbox" checked={r?.is_active ?? false} onChange={e => upsert(rt.key, r?.points_value ?? 25, e.target.checked, r)} />
                  Active
                </label>
              </div>
            </div>
          )
        })}
      </div>
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>⚠️ Fraud flags</h3>
        {flags.length === 0 ? <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>No suspicious activity detected.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {flags.map((f, i) => (
              <div key={i} style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12 }}>
                <strong style={{ color: '#F87171' }}>{f.customer_name}</strong> — {f.flag_type === 'frequent_redeem' ? `${f.details.redeems_this_week} redemptions this week` : `Earned ${f.details.points_earned_this_week} points this week`}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function RevenueForecastCard() {
  const [data, setData] = useState<{ summary: ForecastSummary; insight: string } | null>(null)
  const [loading, setLoading] = useState(false)

  async function run() {
    setLoading(true)
    const r = await fetch('/api/loyalty/revenue-forecast', { method: 'POST' }).then(r => r.json()).catch(() => null)
    setData(r)
    setLoading(false)
  }

  return (
    <div style={{ borderRadius: 12, padding: 16, background: 'rgba(45,82,64,0.18)', border: '1px solid rgba(127,184,151,0.25)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#7FB897', textTransform: 'uppercase', letterSpacing: '0.06em' }}>✦ Revenue forecast</p>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>How much your loyalty members are worth</p>
        </div>
        <button onClick={run} disabled={loading}
          style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#2D5240', color: '#7FB897', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>
          {loading ? 'Analysing…' : data ? 'Refresh' : 'Run AI forecast'}
        </button>
      </div>
      {data?.summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
          <div><p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Members</p><p style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{data.summary.loyalty_members}</p></div>
          <div><p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Avg loyalty spend</p><p style={{ fontSize: 16, fontWeight: 700, color: '#7FB897' }}>A${data.summary.avg_loyalty_spend.toFixed(0)}</p></div>
          <div><p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Avg non-loyalty</p><p style={{ fontSize: 16, fontWeight: 700, color: '#A78BFA' }}>A${data.summary.avg_non_loyalty_spend.toFixed(0)}</p></div>
          <div><p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Multiplier</p><p style={{ fontSize: 16, fontWeight: 700, color: '#F59E0B' }}>{data.summary.spend_multiplier}×</p></div>
        </div>
      )}
      {data?.insight && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.55 }}>{data.insight}</p>}
    </div>
  )
}

export function BrandingSection() {
  const [branding, setBranding] = useState({ loyalty_program_name: 'Aria Rewards', loyalty_points_name: 'points', loyalty_points_expiry_months: 12 })
  const [savedMsg, setSavedMsg] = useState('')

  useEffect(() => {
    fetch('/api/loyalty/branding').then(r => r.json()).then(d => { if (d.branding) setBranding(d.branding) }).catch(() => {})
  }, [])

  async function save() {
    await fetch('/api/loyalty/branding', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(branding) })
    setSavedMsg('Saved')
    setTimeout(() => setSavedMsg(''), 1800)
  }

  const inp = { width: '100%', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(127,184,151,0.2)', color: '#fff', fontSize: 13, fontFamily: 'inherit' } as const

  return (
    <div style={{ padding: 16, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <p style={{ fontSize: 13, fontWeight: 600 }}>🎨 Program branding</p>
        <button onClick={save} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#2D5240', color: '#7FB897', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Save</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.7fr', gap: 8 }}>
        <div>
          <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 4 }}>Program name</label>
          <input style={inp} value={branding.loyalty_program_name} onChange={e => setBranding(b => ({ ...b, loyalty_program_name: e.target.value }))} placeholder="Aria Rewards" />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 4 }}>Points name</label>
          <input style={inp} value={branding.loyalty_points_name} onChange={e => setBranding(b => ({ ...b, loyalty_points_name: e.target.value }))} placeholder="points / sips / bottles" />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 4 }}>Expiry (months)</label>
          <input style={inp} type="number" min={0} value={branding.loyalty_points_expiry_months} onChange={e => setBranding(b => ({ ...b, loyalty_points_expiry_months: Number(e.target.value) }))} />
        </div>
      </div>
      {savedMsg && <p style={{ fontSize: 11, color: '#7FB897', marginTop: 6 }}>✓ {savedMsg}</p>}
    </div>
  )
}

// LOY-MEMBER-PRICING — owner control. Enable + set the member discount %; reused at checkout via the
// existing discount engine (a "Members" group + an auto promotion). Members get the price automatically.
export function MemberPricingSection() {
  const [enabled, setEnabled] = useState(false)
  const [percent, setPercent] = useState(10)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch('/api/loyalty/member-pricing').then(r => r.json())
      .then(d => { setEnabled(!!d.enabled); if (Number(d.percent) > 0) setPercent(Number(d.percent)) })
      .catch(() => {})
  }, [])

  async function save() {
    setSaving(true); setMsg('')
    const r = await fetch('/api/loyalty/member-pricing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled, percent }) }).then(r => r.json()).catch(() => ({}))
    setSaving(false)
    setMsg(r.ok ? 'Saved' : (r.error || 'Could not save'))
    setTimeout(() => setMsg(''), 2200)
  }

  return (
    <div style={{ padding: 16, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <p style={{ fontSize: 13, fontWeight: 600 }}>🏷️ Member pricing</p>
        <button onClick={save} disabled={saving} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#2D5240', color: '#7FB897', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>Loyalty members get this discount automatically when added to a sale at the till.</p>
      <button type="button" onClick={() => setEnabled(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10, background: 'var(--bg-surface, #0E1812)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary)', cursor: 'pointer', marginBottom: 10 }}>
        <span style={{ width: 38, height: 22, borderRadius: 999, background: enabled ? '#2D5240' : 'rgba(255,255,255,0.12)', padding: 2, flexShrink: 0, transition: 'background 150ms' }}>
          <span style={{ display: 'block', width: 18, height: 18, borderRadius: '50%', background: enabled ? '#7FB897' : '#888', transform: enabled ? 'translateX(16px)' : 'translateX(0)', transition: 'transform 150ms' }} />
        </span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{enabled ? 'On — members get the member price' : 'Off — no member pricing'}</span>
      </button>
      <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 4 }}>Members get this % off</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="number" min={1} max={90} step={1} value={percent}
          onChange={e => setPercent(Math.max(0, Math.min(90, Math.floor(Number(e.target.value) || 0))))}
          style={{ width: 120, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(127,184,151,0.2)', color: '#fff', fontSize: 13, fontFamily: 'inherit' }} />
        <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>% off every sale</span>
      </div>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>Won&apos;t stack with another promotion — the customer gets whichever is set, never both.</p>
      {msg && <p style={{ fontSize: 11, color: msg === 'Saved' ? '#7FB897' : '#EF4444', marginTop: 6 }}>{msg === 'Saved' ? '✓ Saved' : msg}</p>}
    </div>
  )
}

// LOY-CHALLENGES — owner control. Turn on AI-personalised missions; each member's challenges are generated
// from their REAL purchase history and award points through the existing loyalty ledger when completed.
export function ChallengesSection() {
  const [enabled, setEnabled] = useState(false)
  const [reward, setReward] = useState(50)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch('/api/loyalty/challenges?owner=1').then(r => r.json())
      .then(d => { setEnabled(!!d.enabled); if (Number(d.reward_points) > 0) setReward(Number(d.reward_points)) })
      .catch(() => {})
  }, [])

  async function save() {
    setSaving(true); setMsg('')
    const r = await fetch('/api/loyalty/challenges', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled, reward_points: reward }) }).then(r => r.json()).catch(() => ({}))
    setSaving(false)
    setMsg(r.ok ? 'Saved' : (r.error || 'Could not save'))
    setTimeout(() => setMsg(''), 2200)
  }

  return (
    <div style={{ padding: 16, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <p style={{ fontSize: 13, fontWeight: 600 }}>🎯 Personalised challenges</p>
        <button onClick={save} disabled={saving} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#2D5240', color: '#7FB897', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>AI sets each member a goal from what they actually buy (e.g. &ldquo;Buy 2 more flat whites this week&rdquo;). Completing it credits bonus points automatically — through your normal loyalty ledger.</p>
      <button type="button" onClick={() => setEnabled(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10, background: 'var(--bg-surface, #0E1812)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary)', cursor: 'pointer', marginBottom: 10 }}>
        <span style={{ width: 38, height: 22, borderRadius: 999, background: enabled ? '#2D5240' : 'rgba(255,255,255,0.12)', padding: 2, flexShrink: 0, transition: 'background 150ms' }}>
          <span style={{ display: 'block', width: 18, height: 18, borderRadius: '50%', background: enabled ? '#7FB897' : '#888', transform: enabled ? 'translateX(16px)' : 'translateX(0)', transition: 'transform 150ms' }} />
        </span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{enabled ? 'On — members get personalised challenges' : 'Off — no challenges'}</span>
      </button>
      <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 4 }}>Bonus points per completed challenge</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="number" min={10} max={500} step={5} value={reward}
          onChange={e => setReward(Math.max(10, Math.min(500, Math.floor(Number(e.target.value) || 0))))}
          style={{ width: 120, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(127,184,151,0.2)', color: '#fff', fontSize: 13, fontFamily: 'inherit' }} />
        <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>points each</span>
      </div>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>Every goal is grounded in real purchases — no invented products. Progress only counts real in-store sales.</p>
      {msg && <p style={{ fontSize: 11, color: msg === 'Saved' ? '#7FB897' : '#EF4444', marginTop: 6 }}>{msg === 'Saved' ? '✓ Saved' : msg}</p>}
    </div>
  )
}
