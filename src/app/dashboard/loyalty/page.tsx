'use client'
import { useCallback, useEffect, useState } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import { TIER_BADGE, type LoyaltyTier } from '@/lib/loyalty'
import { TiersTab, ReferralsTab, RewardRulesTab, RevenueForecastCard, BrandingSection, OffersTab, MemberPricingSection } from '@/components/dashboard/LoyaltyExtensions'
import { AriaSays, invalidateAriaInsight } from '@/components/dashboard/AriaSays'

type Config = { program_type: string; points_per_dollar: number; point_value_cents: number; stamps_to_reward: number; stamp_reward_text: string; birthday_reward_text: string | null; winback_after_days: number; winback_reward_text: string | null; points_expiry_days: number; referral_bonus_points: number; referee_bonus_points: number; tier_silver_points: number; tier_gold_points: number; tier_platinum_points: number; enrol_page_slug: string | null; public_enrol_enabled?: boolean }
type Stats = { enrolled: number; active_this_month: number; points_liability_dollars: number; redemptions_this_month: number; avg_points_per_customer: number }
type TopCustomer = { id: string; name: string; points_balance: number; loyalty_points: number; stamps_count: number; total_spent: number; total_spend: number; visit_count: number; tier: LoyaltyTier; last_redemption: string | null }
type Txn = { id: string; type: string; points_delta: number; stamps_delta: number; reward_redeemed: string | null; created_at: string; pos_customers: { name: string; email: string | null } | null }

const DEFAULT_CONFIG: Config = { program_type: 'points', points_per_dollar: 1, point_value_cents: 1, stamps_to_reward: 10, stamp_reward_text: 'Free coffee', birthday_reward_text: null, winback_after_days: 30, winback_reward_text: null, points_expiry_days: 365, referral_bonus_points: 0, referee_bonus_points: 0, tier_silver_points: 500, tier_gold_points: 1500, tier_platinum_points: 5000, enrol_page_slug: null, public_enrol_enabled: true }

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
      <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{label}</p>
      <p className="text-2xl font-medium" style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{sub}</p>}
    </div>
  )
}

function TierBadge({ tier }: { tier: LoyaltyTier }) {
  const { label, color } = TIER_BADGE[tier]
  return <span className="text-xs font-semibold" style={{ color }}>{label}</span>
}

const TXN_LABELS: Record<string, string> = { earn: '+ Earn', redeem: '− Redeem', birthday: '🎂 Birthday', winback: '📩 Winback' }

export default function LoyaltyPage() {
  const { business } = useBusinessContext()
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG)
  const [draft, setDraft] = useState<Config>(DEFAULT_CONFIG)
  const [stats, setStats] = useState<Stats | null>(null)
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([])
  const [txns, setTxns] = useState<Txn[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [insight, setInsight] = useState('')
  const [insightLoading, setInsightLoading] = useState(false)
  const [tab, setTab] = useState<'overview' | 'members' | 'tiers' | 'referrals' | 'rewards' | 'offers' | 'config'>('overview')

  const load = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    const bid = business.id
    const [cfgR, statsR, topR, txnR] = await Promise.all([
      fetch(`/api/loyalty/config`).then(r => r.json()),
      fetch(`/api/loyalty/stats?business_id=${bid}`).then(r => r.json()),
      fetch(`/api/loyalty/customers/top?business_id=${bid}`).then(r => r.json()),
      fetch(`/api/loyalty/transactions?business_id=${bid}`).then(r => r.json()),
    ])
    const cfg = cfgR.config ?? DEFAULT_CONFIG
    setConfig(cfg); setDraft(cfg)
    setStats(statsR)
    setTopCustomers(topR.customers ?? [])
    setTxns(txnR.transactions ?? [])
    setLoading(false)
  }, [business?.id])

  useEffect(() => { load() }, [load])

  const save = async () => {
    setSaving(true); setSaveMsg('')
    const r = await fetch('/api/loyalty/config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    const j = await r.json()
    if (r.ok) { setConfig(draft); setSaveMsg('Saved'); invalidateAriaInsight(business?.id, 'loyalty') }
    else setSaveMsg(j.error ?? 'Failed')
    setSaving(false)
    setTimeout(() => setSaveMsg(''), 2000)
  }

  const fetchInsight = async () => {
    if (!business?.id) return
    setInsightLoading(true)
    const r = await fetch('/api/loyalty/aria-insight', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id }),
    })
    const j = await r.json()
    setInsight(j.insight ?? '')
    setInsightLoading(false)
  }

  const earnPreview = draft.program_type === 'points'
    ? `A customer spending $50 earns ${Math.floor(50 * draft.points_per_dollar)} points worth $${(Math.floor(50 * draft.points_per_dollar) * draft.point_value_cents / 100).toFixed(2)}`
    : `A customer earns 1 stamp per visit — reward at ${draft.stamps_to_reward} stamps: "${draft.stamp_reward_text}"`

  if (loading) return <div className="p-6 text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</div>

  return (
    <div className="p-6 max-w-6xl space-y-8" style={{ color: 'var(--text-primary, #E8EDE7)' }}>
      <AriaSays businessId={business?.id ?? null} page="loyalty" />
      <header>
        <h1 className="text-2xl font-medium">Loyalty Program</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Configure your points or stamps program, view performance, and manage rewards.</p>
      </header>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(232,237,231,0.08)' }}>
        {(['overview','members','tiers','referrals','rewards','offers','config'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '9px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: tab === t ? 700 : 400, color: tab === t ? '#7FB897' : 'var(--text-secondary, #A8B5A8)', borderBottom: tab === t ? '2px solid #7FB897' : '2px solid transparent', marginBottom: -1, textTransform: 'capitalize' }}>
            {t}
          </button>
        ))}
      </div>

      {/* Stats — visible on overview */}
      {tab === 'overview' && stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard label="Enrolled customers" value={String(stats.enrolled)} />
          <StatCard label="Active this month" value={String(stats.active_this_month)} sub={`${stats.enrolled > 0 ? Math.round((stats.active_this_month / stats.enrolled) * 100) : 0}% of enrolled`} />
          <StatCard label="Points liability" value={`$${stats.points_liability_dollars.toFixed(2)}`} sub="outstanding" />
          <StatCard label="Redemptions (30d)" value={String(stats.redemptions_this_month)} />
          <StatCard label="Avg points/customer" value={String(stats.avg_points_per_customer)} />
        </div>
      )}

      {tab === 'tiers' && <TiersTab />}
      {tab === 'referrals' && <ReferralsTab />}
      {tab === 'rewards' && <RewardRulesTab />}
      {tab === 'offers' && <OffersTab />}

      {tab === 'overview' && <RevenueForecastCard />}

      {/* Program config */}
      {tab === 'config' && (
      <div className="rounded-xl p-6 space-y-5" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Program Setup</h2>
          <div className="flex items-center gap-3">
            {saveMsg && <span className="text-xs" style={{ color: saveMsg === 'Saved' ? '#7FB897' : '#ef4444' }}>{saveMsg}</span>}
            <button onClick={save} disabled={saving} className="px-4 py-1.5 text-sm rounded-lg font-medium disabled:opacity-50" style={{ background: '#2D5240', color: '#7FB897' }}>
              {saving ? 'Saving…' : 'Save program'}
            </button>
          </div>
        </div>

        {/* Program type toggle */}
        <div className="flex gap-2">
          {['points', 'stamps'].map(t => (
            <button key={t} onClick={() => setDraft(d => ({ ...d, program_type: t }))}
              className="px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors"
              style={{ background: draft.program_type === t ? '#2D5240' : 'rgba(255,255,255,0.04)', color: draft.program_type === t ? '#7FB897' : 'var(--text-secondary)', border: `1px solid ${draft.program_type === t ? 'rgba(127,184,151,0.4)' : 'transparent'}` }}>
              {t === 'points' ? '🎯 Points' : '🎟 Stamps'}
            </button>
          ))}
        </div>

        {draft.program_type === 'points' ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Points earned per $1 spent</label>
              <input type="number" min="0.1" step="0.1" value={draft.points_per_dollar}
                onChange={e => setDraft(d => ({ ...d, points_per_dollar: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Point value (cents per point)</label>
              <input type="number" min="1" step="1" value={draft.point_value_cents}
                onChange={e => setDraft(d => ({ ...d, point_value_cents: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary)' }} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Stamps to earn reward</label>
              <input type="number" min="1" step="1" value={draft.stamps_to_reward}
                onChange={e => setDraft(d => ({ ...d, stamps_to_reward: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Reward description</label>
              <input type="text" value={draft.stamp_reward_text}
                onChange={e => setDraft(d => ({ ...d, stamp_reward_text: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary)' }} />
            </div>
          </div>
        )}

        {/* Live preview */}
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(45,82,64,0.2)', border: '1px solid rgba(127,184,151,0.2)', color: '#7FB897' }}>
          Preview: {earnPreview}
        </div>

        {/* Tier thresholds (points) — the single source of truth the customer dashboard reads */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Tier thresholds (points)</p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Everyone starts Bronze. Members see their tier &amp; progress on their loyalty dashboard — these point thresholds drive it. Set 0 to disable a tier.</p>
          <div className="grid grid-cols-3 gap-3">
            {([['Silver', 'tier_silver_points'], ['Gold', 'tier_gold_points'], ['Platinum', 'tier_platinum_points']] as const).map(([label, key]) => (
              <div key={key}>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>{label} at (points)</label>
                <input type="number" min="0" step="50" value={draft[key] ?? 0}
                  onChange={e => setDraft(d => ({ ...d, [key]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                  className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary)' }} />
              </div>
            ))}
          </div>
        </div>

        {/* Points expiry + win-back + referral bonuses */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Points expiry (days, 0 = never)</label>
            <input type="number" min="0" step="1" value={draft.points_expiry_days ?? 0}
              onChange={e => setDraft(d => ({ ...d, points_expiry_days: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
              className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary)' }} />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Win-back after (days inactive)</label>
            <input type="number" min="0" step="1" value={draft.winback_after_days ?? 0}
              onChange={e => setDraft(d => ({ ...d, winback_after_days: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
              className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary)' }} />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide block" style={{ color: 'var(--text-secondary)' }}>Win-back reward</label>
          <input type="text" value={draft.winback_reward_text ?? ''}
            onChange={e => setDraft(d => ({ ...d, winback_reward_text: e.target.value || null }))}
            placeholder="e.g. 20% off — we miss you!"
            className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary)' }} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Referrer bonus (points)</label>
            <input type="number" min="0" step="10" value={draft.referral_bonus_points ?? 0}
              onChange={e => setDraft(d => ({ ...d, referral_bonus_points: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
              className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary)' }} />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>New-member bonus (points)</label>
            <input type="number" min="0" step="10" value={draft.referee_bonus_points ?? 0}
              onChange={e => setDraft(d => ({ ...d, referee_bonus_points: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
              className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary)' }} />
          </div>
        </div>

        {/* Birthday config */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Birthday Reward</p>
          <input type="text" value={draft.birthday_reward_text ?? ''}
            onChange={e => setDraft(d => ({ ...d, birthday_reward_text: e.target.value || null }))}
            placeholder="e.g. Free coffee on your birthday"
            className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary)' }} />
          {draft.birthday_reward_text && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(45,82,64,0.2)', color: '#7FB897' }}>
              SMS preview: &quot;Happy Birthday, [Name]! 🎂 {draft.birthday_reward_text} Show this in store to redeem.&quot;
            </p>
          )}
        </div>

        {/* Public sign-up / auto-enrol */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Public sign-up</p>
          <button type="button" onClick={() => setDraft(d => ({ ...d, public_enrol_enabled: !(d.public_enrol_enabled ?? true) }))}
            className="flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-lg text-sm"
            style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary)' }}>
            <span className="inline-flex items-center" style={{ width: 38, height: 22, borderRadius: 999, background: (draft.public_enrol_enabled ?? true) ? '#2D5240' : 'rgba(255,255,255,0.12)', padding: 2, transition: 'background 150ms' }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', background: (draft.public_enrol_enabled ?? true) ? '#7FB897' : '#888', transform: (draft.public_enrol_enabled ?? true) ? 'translateX(16px)' : 'translateX(0)', transition: 'transform 150ms' }} />
            </span>
            <span className="flex-1">
              <span className="block font-medium">Let customers join from your hub link</span>
              <span className="block text-xs" style={{ color: 'var(--text-secondary)' }}>{(draft.public_enrol_enabled ?? true) ? 'On — customers can self-enrol at your /loyalty link' : 'Off — sign-ups happen in store only'}</span>
            </span>
          </button>
          <label className="text-xs mb-1 block mt-2" style={{ color: 'var(--text-secondary)' }}>Custom link name (optional)</label>
          <input type="text" value={draft.enrol_page_slug ?? ''}
            onChange={e => setDraft(d => ({ ...d, enrol_page_slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-') || null }))}
            placeholder="e.g. sip-cafe"
            className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary)' }} />
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Lowercase letters, numbers, hyphens. Must be unique.</p>
        </div>
      </div>
      )}

      {tab === 'config' && <MemberPricingSection />}
      {tab === 'config' && <BrandingSection />}

      {/* Top customers */}
      {(tab === 'overview' || tab === 'members') && (
      <div className="space-y-3">
        <h2 className="text-base font-medium">Top Loyalty Customers</h2>
        {topCustomers.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No loyalty customers yet. Start issuing points at the POS.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
            <table className="w-full text-sm">
              <thead><tr style={{ background: 'var(--bg-elevated, #1A2620)', borderBottom: '1px solid var(--divider)' }}>
                {['Customer', 'Tier', 'Balance', 'Lifetime spend', 'Last redemption'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wide font-medium" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {topCustomers.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3"><TierBadge tier={c.tier} /></td>
                    <td className="px-4 py-3">{Number(c.points_balance ?? c.loyalty_points ?? 0)} pts</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>${Number(c.total_spent ?? c.total_spend ?? 0).toFixed(2)}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                      {c.last_redemption ? new Date(c.last_redemption).toLocaleDateString('en-AU') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* Recent transactions */}
      {tab === 'overview' && (
      <div className="space-y-3">
        <h2 className="text-base font-medium">Recent Transactions</h2>
        {txns.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No transactions yet.</p>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
            {txns.slice(0, 50).map(t => (
              <div key={t.id} className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
                <div>
                  <span className="text-sm font-medium">{t.pos_customers?.name ?? 'Unknown'}</span>
                  <span className="ml-2 text-xs" style={{ color: 'var(--text-secondary)' }}>{TXN_LABELS[t.type] ?? t.type}</span>
                  {t.reward_redeemed && <span className="ml-2 text-xs" style={{ color: '#7FB897' }}>{t.reward_redeemed}</span>}
                </div>
                <div className="text-right">
                  {t.points_delta !== 0 && <span className="text-sm font-medium" style={{ color: t.points_delta > 0 ? '#7FB897' : '#ef4444' }}>{t.points_delta > 0 ? '+' : ''}{t.points_delta} pts</span>}
                  {t.stamps_delta !== 0 && <span className="text-sm font-medium ml-2" style={{ color: t.stamps_delta > 0 ? '#7FB897' : '#ef4444' }}>{t.stamps_delta > 0 ? '+' : ''}{t.stamps_delta} stamps</span>}
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{new Date(t.created_at).toLocaleDateString('en-AU')}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Aria insight */}
      {tab === 'overview' && (
      <div className="rounded-xl p-5 space-y-3" style={{ background: 'var(--bg-elevated, #1A2620)', borderLeft: '3px solid #1D9E75', border: '1px solid rgba(29,158,117,0.2)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span style={{ color: '#1D9E75' }}>✦</span>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Aria Loyalty Insight</p>
          </div>
          <button onClick={fetchInsight} disabled={insightLoading} className="text-xs px-3 py-1 rounded-lg disabled:opacity-50"
            style={{ background: 'rgba(45,82,64,0.3)', color: '#7FB897', border: '1px solid rgba(45,82,64,0.4)' }}>
            {insightLoading ? 'Analysing…' : insight ? 'Refresh' : 'Get Aria insight'}
          </button>
        </div>
        {insight ? (
          <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--text-primary)' }}>{insight}</p>
        ) : (
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Click "Get Aria insight" for AI-powered loyalty program recommendations based on your real data.</p>
        )}
      </div>
      )}
    </div>
  )
}
