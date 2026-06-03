'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

interface GiftCard {
  id: string; code: string; balance: number; initial_balance: number
  redeemed_amount: number; recipient_name: string | null
  issued_at: string | null; expires_at: string | null
  is_active: boolean; created_at: string; last_used_at: string | null
}
interface GCStats {
  active_count: number; total_liability: number
  redeemed_this_month: number; issued_this_month: number
}
interface GCTransaction {
  id: string; type: string; amount: number; balance_after: number
  staff_name: string | null; note: string | null; created_at: string
}
interface GCSettings {
  enabled: boolean; expiry_months: number; min_load: number; max_load: number
  max_balance: number; allow_topup: boolean; allow_partial_redeem: boolean
  prefix: string; brand_color: string; terms_text: string | null
}

const TYPE_COLORS: Record<string, string> = {
  issue: '#22c55e', redeem: '#ef4444', topup: '#3b82f6',
  refund: '#f59e0b', void: '#6b7280', expire: '#9ca3af',
}

function fmt(n: number) { return '$' + n.toFixed(2) }
function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '16px 20px' }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export default function GiftCardsPage() {
  const { business } = useBusinessContext()
  const [tab, setTab] = useState<'overview' | 'issue' | 'lookup' | 'settings'>('overview')

  /* Overview state */
  const [cards, setCards] = useState<GiftCard[]>([])
  const [stats, setStats] = useState<GCStats | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [transactions, setTransactions] = useState<Record<string, GCTransaction[]>>({})
  const [txLoading, setTxLoading] = useState<string | null>(null)

  /* Issue state */
  const [issueAmount, setIssueAmount] = useState('')
  const [issueRecipient, setIssueRecipient] = useState('')
  const [issueNote, setIssueNote] = useState('')
  const [issuing, setIssuing] = useState(false)
  const [issuedCard, setIssuedCard] = useState<GiftCard | null>(null)
  const [issueError, setIssueError] = useState('')
  const [copied, setCopied] = useState(false)

  /* Lookup state */
  const [lookupCode, setLookupCode] = useState('')
  const [lookupResult, setLookupResult] = useState<(GiftCard & { status: string }) | null>(null)
  const [lookupError, setLookupError] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionAmount, setActionAmount] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')

  /* Settings state */
  const [settings, setSettings] = useState<GCSettings>({
    enabled: true, expiry_months: 36, min_load: 10, max_load: 500,
    max_balance: 1000, allow_topup: true, allow_partial_redeem: true,
    prefix: 'GC', brand_color: '#2D5240', terms_text: null,
  })
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsMsg, setSettingsMsg] = useState('')

  const loadCards = useCallback(async (q = '') => {
    setLoading(true)
    try {
      const res = await fetch('/api/gift-cards' + (q ? '?search=' + encodeURIComponent(q) : ''))
      const d = await res.json()
      setCards(d.gift_cards ?? [])
      setStats(d.stats ?? null)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadSettings = useCallback(async () => {
    const res = await fetch('/api/gift-cards/settings')
    const d = await res.json()
    if (d.settings) setSettings(d.settings)
  }, [])

  useEffect(() => {
    if (tab === 'overview') loadCards(search)
    if (tab === 'settings') loadSettings()
  }, [tab, loadCards, loadSettings, search])

  async function loadTransactions(id: string) {
    if (transactions[id]) { setExpandedId(expandedId === id ? null : id); return }
    setTxLoading(id)
    setExpandedId(id)
    try {
      const res = await fetch('/api/gift-cards/' + id + '/transactions')
      const d = await res.json()
      setTransactions(prev => ({ ...prev, [id]: d.transactions ?? [] }))
    } finally {
      setTxLoading(null)
    }
  }

  async function handleIssue() {
    setIssuing(true)
    setIssueError('')
    setIssuedCard(null)
    try {
      const res = await fetch('/api/gift-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parseFloat(issueAmount), recipient_name: issueRecipient || null, note: issueNote || null }),
      })
      const d = await res.json()
      if (!res.ok) { setIssueError(d.error ?? 'Failed'); return }
      setIssuedCard(d.gift_card)
      setIssueAmount(''); setIssueRecipient(''); setIssueNote('')
    } finally {
      setIssuing(false)
    }
  }

  async function handleLookup() {
    if (!lookupCode.trim()) return
    setLookupLoading(true)
    setLookupError('')
    setLookupResult(null)
    setActionError(''); setActionSuccess('')
    try {
      const res = await fetch('/api/gift-cards/' + encodeURIComponent(lookupCode.trim().toUpperCase()))
      const d = await res.json()
      if (!res.ok) { setLookupError(d.error ?? 'Not found'); return }
      setLookupResult(d.gift_card)
    } finally {
      setLookupLoading(false)
    }
  }

  async function handleAction(action: 'redeem' | 'topup') {
    if (!lookupResult) return
    const amount = parseFloat(actionAmount)
    if (isNaN(amount) || amount <= 0) { setActionError('Enter a valid amount'); return }
    setActionLoading(true)
    setActionError(''); setActionSuccess('')
    try {
      const res = await fetch('/api/gift-cards/' + lookupResult.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, amount }),
      })
      const d = await res.json()
      if (!res.ok) { setActionError(d.error ?? 'Failed'); return }
      setLookupResult(d.gift_card ? { ...d.gift_card, status: d.gift_card.is_active ? 'active' : 'voided' } : null)
      setActionSuccess(action === 'redeem' ? 'Redeemed ' + fmt(amount) : 'Topped up ' + fmt(amount))
      setActionAmount('')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleVoid(id: string) {
    if (!confirm('Void this gift card? This cannot be undone.')) return
    const res = await fetch('/api/gift-cards/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'void', reason: 'Voided by staff' }),
    })
    if (res.ok) loadCards(search)
  }

  async function saveSettings() {
    setSettingsSaving(true)
    setSettingsMsg('')
    try {
      const res = await fetch('/api/gift-cards/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (res.ok) setSettingsMsg('Saved')
      else setSettingsMsg('Save failed')
    } finally {
      setSettingsSaving(false)
      setTimeout(() => setSettingsMsg(''), 3000)
    }
  }

  const TAB_STYLE = (active: boolean) => ({
    padding: '8px 18px', borderRadius: 8, border: 'none',
    background: active ? 'rgba(127,184,151,0.18)' : 'transparent',
    color: active ? '#7FB897' : 'rgba(255,255,255,0.45)',
    fontSize: 13, fontWeight: active ? 700 : 500,
    cursor: 'pointer', fontFamily: 'inherit',
  } as React.CSSProperties)

  const INPUT_STYLE: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)',
    color: '#fff', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0d140f', padding: '24px 28px', color: '#fff' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Gift Cards</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: '4px 0 0' }}>Issue, redeem, and manage gift cards for {business?.name}</p>
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.04)', padding: 4, borderRadius: 10, width: 'fit-content' }}>
          {(['overview', 'issue', 'lookup', 'settings'] as const).map(t => (
            <button key={t} style={TAB_STYLE(tab === t)} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {tab === 'overview' && (
          <div>
            {stats && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                <StatCard label="Active cards" value={String(stats.active_count)} />
                <StatCard label="Total liability" value={fmt(stats.total_liability)} sub="outstanding balance" />
                <StatCard label="Redeemed this month" value={fmt(stats.redeemed_this_month)} />
                <StatCard label="Issued this month" value={String(stats.issued_this_month) + ' cards'} />
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <input
                style={{ ...INPUT_STYLE, flex: 1, maxWidth: 280 }}
                placeholder="Search by code..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && loadCards(search)}
              />
              <button
                onClick={() => loadCards(search)}
                style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: 'rgba(127,184,151,0.15)', color: '#7FB897', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Search
              </button>
              <button
                onClick={() => setTab('issue')}
                style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#2D5240', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                + Issue new
              </button>
            </div>

            {loading ? (
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: 32, textAlign: 'center' }}>Loading…</div>
            ) : cards.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 48 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🎁</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>No gift cards yet. Issue your first one!</div>
              </div>
            ) : (
              <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                      {['Code', 'Balance', 'Initial', 'Recipient', 'Issued', 'Expires', 'Status', ''].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cards.map(c => {
                      const expired = c.expires_at && new Date(c.expires_at) < new Date()
                      const status = !c.is_active ? 'voided' : expired ? 'expired' : (c.balance <= 0 ? 'depleted' : 'active')
                      const statusColor = status === 'active' ? '#22c55e' : status === 'voided' ? '#6b7280' : '#ef4444'
                      const isExpanded = expandedId === c.id
                      return (
                        <>
                          <tr
                            key={c.id}
                            style={{ borderTop: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' }}
                            onClick={() => loadTransactions(c.id)}
                          >
                            <td style={{ padding: '11px 14px', fontSize: 13, fontFamily: "'JetBrains Mono',monospace", color: '#7FB897', fontWeight: 600 }}>{c.code}</td>
                            <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 700 }}>{fmt(Number(c.balance))}</td>
                            <td style={{ padding: '11px 14px', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{fmt(Number(c.initial_balance))}</td>
                            <td style={{ padding: '11px 14px', fontSize: 13 }}>{c.recipient_name ?? '—'}</td>
                            <td style={{ padding: '11px 14px', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{fmtDate(c.created_at)}</td>
                            <td style={{ padding: '11px 14px', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{fmtDate(c.expires_at)}</td>
                            <td style={{ padding: '11px 14px' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: statusColor, background: statusColor + '18', padding: '2px 8px', borderRadius: 4 }}>{status}</span>
                            </td>
                            <td style={{ padding: '11px 14px' }}>
                              {c.is_active && (
                                <button
                                  onClick={e => { e.stopPropagation(); handleVoid(c.id) }}
                                  style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: 'rgba(239,68,68,0.7)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                                  Void
                                </button>
                              )}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={c.id + '-tx'}>
                              <td colSpan={8} style={{ padding: 0, background: 'rgba(0,0,0,0.2)' }}>
                                <div style={{ padding: '12px 24px' }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 8 }}>Transaction history</div>
                                  {txLoading === c.id ? (
                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Loading…</div>
                                  ) : (transactions[c.id] ?? []).length === 0 ? (
                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>No transactions</div>
                                  ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      {(transactions[c.id] ?? []).map(tx => (
                                        <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
                                          <span style={{ color: TYPE_COLORS[tx.type] ?? '#fff', fontWeight: 700, width: 60 }}>{tx.type}</span>
                                          <span style={{ color: tx.type === 'redeem' || tx.type === 'void' || tx.type === 'expire' ? '#ef4444' : '#22c55e', fontWeight: 600, width: 70 }}>
                                            {tx.type === 'redeem' || tx.type === 'void' || tx.type === 'expire' ? '-' : '+'}{fmt(Number(tx.amount))}
                                          </span>
                                          <span style={{ color: 'rgba(255,255,255,0.4)' }}>→ {fmt(Number(tx.balance_after))}</span>
                                          {tx.note && <span style={{ color: 'rgba(255,255,255,0.35)' }}>{tx.note}</span>}
                                          <span style={{ color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>{fmtDate(tx.created_at)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ISSUE TAB */}
        {tab === 'issue' && (
          <div style={{ maxWidth: 480 }}>
            {issuedCard ? (
              <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12, padding: 24 }}>
                <div style={{ fontSize: 13, color: '#22c55e', fontWeight: 700, marginBottom: 12 }}>Gift card issued!</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>Code</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 800, color: '#7FB897', letterSpacing: '0.08em' }}>{issuedCard.code}</div>
                  <button
                    onClick={() => { navigator.clipboard.writeText(issuedCard.code); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                    style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: copied ? 'rgba(34,197,94,0.2)' : 'rgba(127,184,151,0.15)', color: copied ? '#22c55e' : '#7FB897', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 20 }}>
                  <span>Balance: <strong style={{ color: '#fff' }}>{fmt(Number(issuedCard.balance))}</strong></span>
                  {issuedCard.recipient_name && <span>Recipient: <strong style={{ color: '#fff' }}>{issuedCard.recipient_name}</strong></span>}
                  {issuedCard.expires_at && <span>Expires: <strong style={{ color: '#fff' }}>{fmtDate(issuedCard.expires_at)}</strong></span>}
                </div>
                <button
                  onClick={() => { setIssuedCard(null); loadCards() }}
                  style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'rgba(127,184,151,0.15)', color: '#7FB897', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Issue another
                </button>
              </div>
            ) : (
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 24 }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>Issue a new gift card</div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>Amount (AUD) *</label>
                  <input style={INPUT_STYLE} type="number" min="1" placeholder="e.g. 50" value={issueAmount} onChange={e => setIssueAmount(e.target.value)} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>Recipient name (optional)</label>
                  <input style={INPUT_STYLE} placeholder="e.g. Jane Smith" value={issueRecipient} onChange={e => setIssueRecipient(e.target.value)} />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>Note (optional)</label>
                  <input style={INPUT_STYLE} placeholder="e.g. Birthday gift" value={issueNote} onChange={e => setIssueNote(e.target.value)} />
                </div>
                {issueError && <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 12 }}>{issueError}</div>}
                <button
                  onClick={handleIssue}
                  disabled={!issueAmount || issuing}
                  style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', background: '#2D5240', color: '#fff', fontSize: 14, fontWeight: 700, cursor: !issueAmount || issuing ? 'not-allowed' : 'pointer', opacity: !issueAmount ? 0.5 : 1, fontFamily: 'inherit' }}>
                  {issuing ? 'Issuing…' : 'Issue Gift Card'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* LOOKUP TAB */}
        {tab === 'lookup' && (
          <div style={{ maxWidth: 480 }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 24, marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Check gift card balance</div>
              <div style={{ display: 'flex', gap: 10, marginBottom: lookupError ? 8 : 0 }}>
                <input
                  style={{ ...INPUT_STYLE, flex: 1 }}
                  placeholder="Enter card code e.g. GC-ABCD-1234"
                  value={lookupCode}
                  onChange={e => { setLookupCode(e.target.value.toUpperCase()); setLookupResult(null); setLookupError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleLookup()}
                />
                <button
                  onClick={handleLookup}
                  disabled={!lookupCode.trim() || lookupLoading}
                  style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#2D5240', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {lookupLoading ? '…' : 'Check'}
                </button>
              </div>
              {lookupError && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>{lookupError}</div>}
            </div>

            {lookupResult && (
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                  <div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 18, fontWeight: 800, color: '#7FB897', marginBottom: 4 }}>{lookupResult.code}</div>
                    {lookupResult.recipient_name && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Recipient: {lookupResult.recipient_name}</div>}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: lookupResult.status === 'active' ? '#22c55e' : '#6b7280', background: (lookupResult.status === 'active' ? '#22c55e' : '#6b7280') + '18', padding: '3px 10px', borderRadius: 4 }}>{lookupResult.status}</span>
                </div>

                <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>Balance</div>
                    <div style={{ fontSize: 28, fontWeight: 800 }}>{fmt(Number(lookupResult.balance))}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>Original</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>{fmt(Number(lookupResult.initial_balance))}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>Expires</div>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>{fmtDate(lookupResult.expires_at)}</div>
                  </div>
                </div>

                {lookupResult.status === 'active' && (
                  <div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      <input
                        style={{ ...INPUT_STYLE, flex: 1 }}
                        type="number" min="0.01" placeholder="Amount"
                        value={actionAmount}
                        onChange={e => { setActionAmount(e.target.value); setActionError(''); setActionSuccess('') }}
                      />
                      <button
                        onClick={() => handleAction('redeem')}
                        disabled={actionLoading}
                        style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Redeem
                      </button>
                      <button
                        onClick={() => handleAction('topup')}
                        disabled={actionLoading}
                        style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: 'rgba(59,130,246,0.15)', color: '#3b82f6', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Top up
                      </button>
                    </div>
                    {actionError && <div style={{ fontSize: 12, color: '#ef4444' }}>{actionError}</div>}
                    {actionSuccess && <div style={{ fontSize: 12, color: '#22c55e' }}>{actionSuccess}</div>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* SETTINGS TAB */}
        {tab === 'settings' && (
          <div style={{ maxWidth: 520 }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>Gift card settings</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>Code prefix</label>
                  <input style={INPUT_STYLE} placeholder="GC" value={settings.prefix} onChange={e => setSettings(s => ({ ...s, prefix: e.target.value.toUpperCase().slice(0, 8) }))} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>Expiry (months)</label>
                  <input style={INPUT_STYLE} type="number" min="0" value={settings.expiry_months} onChange={e => setSettings(s => ({ ...s, expiry_months: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>Min load ($)</label>
                  <input style={INPUT_STYLE} type="number" min="0" value={settings.min_load} onChange={e => setSettings(s => ({ ...s, min_load: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>Max load ($)</label>
                  <input style={INPUT_STYLE} type="number" min="0" value={settings.max_load} onChange={e => setSettings(s => ({ ...s, max_load: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>Max balance ($)</label>
                  <input style={INPUT_STYLE} type="number" min="0" value={settings.max_balance} onChange={e => setSettings(s => ({ ...s, max_balance: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>Brand colour</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="color" value={settings.brand_color} onChange={e => setSettings(s => ({ ...s, brand_color: e.target.value }))}
                      style={{ width: 40, height: 40, padding: 2, borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', cursor: 'pointer' }} />
                    <input style={{ ...INPUT_STYLE, flex: 1 }} value={settings.brand_color} onChange={e => setSettings(s => ({ ...s, brand_color: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
                {([['enabled', 'Program enabled'], ['allow_topup', 'Allow top-up'], ['allow_partial_redeem', 'Allow partial redeem']] as const).map(([k, label]) => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={settings[k] as boolean} onChange={e => setSettings(s => ({ ...s, [k]: e.target.checked }))}
                      style={{ width: 14, height: 14, accentColor: '#7FB897' }} />
                    {label}
                  </label>
                ))}
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>Terms & conditions (optional)</label>
                <textarea
                  style={{ ...INPUT_STYLE, height: 80, resize: 'vertical' } as React.CSSProperties}
                  placeholder="Gift cards are non-refundable..."
                  value={settings.terms_text ?? ''}
                  onChange={e => setSettings(s => ({ ...s, terms_text: e.target.value || null }))}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  onClick={saveSettings}
                  disabled={settingsSaving}
                  style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#2D5240', color: '#fff', fontSize: 13, fontWeight: 700, cursor: settingsSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {settingsSaving ? 'Saving…' : 'Save settings'}
                </button>
                {settingsMsg && <span style={{ fontSize: 13, color: settingsMsg === 'Saved' ? '#22c55e' : '#ef4444' }}>{settingsMsg}</span>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
