'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

interface TabCustomer {
  id: string
  name: string
  phone: string | null
  email: string | null
  current_balance_cents: number
  credit_limit_cents: number
  account_number: string | null
  last_visit: string | null
  last_visit_at: string | null
  total_spend: number | null
}

const C = {
  bg: 'var(--bg-base)', card: 'var(--bg-surface)', text: 'var(--text-primary)',
  muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)',
  green: '#22C55E', red: '#EF4444', amber: '#F59E0B', violet: '#8B5CF6',
  border: 'rgba(255,255,255,0.07)',
}

function fmtCents(cents: number) {
  return 'A$' + Math.abs(cents / 100).toFixed(2)
}

function AgingReport({ customers, onEmailAll }: { customers: Array<{ id: string; name: string; email: string | null; current_balance_cents: number; last_visit: string | null; last_visit_at: string | null }>; onEmailAll: () => void }) {
  const now = Date.now()
  const ageOf = (c: { last_visit: string | null; last_visit_at: string | null }) => {
    const ts = c.last_visit_at ?? c.last_visit
    return ts ? Math.floor((now - new Date(ts).getTime()) / 86400000) : 999
  }

  const owing = customers.filter(c => (c.current_balance_cents ?? 0) > 0)
  const b30  = owing.filter(c => ageOf(c) <= 30)
  const b60  = owing.filter(c => ageOf(c) > 30 && ageOf(c) <= 60)
  const b90  = owing.filter(c => ageOf(c) > 60 && ageOf(c) <= 90)
  const b90p = owing.filter(c => ageOf(c) > 90)

  const sum = (arr: typeof owing) => arr.reduce((s, c) => s + c.current_balance_cents, 0)
  const fmtC = (cents: number) => 'A$' + (cents / 100).toFixed(0)

  if (owing.length === 0) return null

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '18px 20px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>Aging report</p>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{owing.length} customers with outstanding balances · {fmtC(sum(owing))} total</p>
        </div>
        {b90p.length > 0 && (
          <button onClick={onEmailAll}
            style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#EF4444', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            📧 Email all 90d+ overdue ({b90p.filter(c => c.email).length})
          </button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
        {[
          { label: '0–30 days', items: b30, color: '#22C55E' },
          { label: '31–60 days', items: b60, color: '#F59E0B' },
          { label: '61–90 days', items: b90, color: '#F97316' },
          { label: '90+ days', items: b90p, color: '#EF4444' },
        ].map(bucket => (
          <div key={bucket.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 9, padding: '12px 14px' }}>
            <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{bucket.label}</p>
            <p style={{ fontSize: 20, fontWeight: 700, color: bucket.color, marginBottom: 2 }}>{fmtC(sum(bucket.items))}</p>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{bucket.items.length} customer{bucket.items.length !== 1 ? 's' : ''}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function CustomerTabsPage() {
  const { business } = useBusinessContext()
  const [customers, setCustomers] = useState<TabCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<TabCustomer | null>(null)
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'owing' | 'overLimit'>('all')
  const [sendingStatement, setSendingStatement] = useState(false)
  const [statementMsg, setStatementMsg] = useState('')
  const [ariaDebtInsight, setAriaDebtInsight] = useState('')

  const load = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    try {
      // Fetch customers who have a credit limit or balance
      const res = await fetch('/api/pos/customers?business_id=' + business.id + '&limit=500')
      const d = await res.json() as { customers?: TabCustomer[] }
      const all = d.customers ?? []
      // Show customers who have a tab (credit_limit > 0 or balance != 0)
      const tabCustomers = all.filter(c => (c.credit_limit_cents ?? 0) > 0 || (c.current_balance_cents ?? 0) !== 0)
      setCustomers(tabCustomers)
    } catch { /* ignore */ }
    setLoading(false)
  }, [business?.id])

  // Compute Aria debt insight from loaded data (pure client computation, no extra API call)
  useEffect(() => {
    if (customers.length === 0) return
    const now = Date.now()
    const ageOf = (c: typeof customers[0]) => {
      const ts = c.last_visit_at ?? c.last_visit
      return ts ? Math.floor((now - new Date(ts).getTime()) / 86400000) : 999
    }
    const critical = customers.filter(c => (c.current_balance_cents ?? 0) > 0 && ageOf(c) > 90)
    const seriousRisk = customers.filter(c => (c.current_balance_cents ?? 0) > 0 && ageOf(c) > 60 && ageOf(c) <= 90)
    const totalCritical = critical.reduce((s, c) => s + (c.current_balance_cents ?? 0), 0)
    const totalRisk = seriousRisk.reduce((s, c) => s + (c.current_balance_cents ?? 0), 0)

    if (critical.length > 0) {
      const emails = critical.filter(c => c.email).length
      setAriaDebtInsight(
        critical.length + ' customer' + (critical.length !== 1 ? 's' : '') + ' ' +
        (critical.length === 1 ? 'has' : 'have') + ' been silent for 90+ days owing A$' + (totalCritical / 100).toFixed(0) + '. ' +
        (seriousRisk.length > 0 ? seriousRisk.length + ' more (A$' + (totalRisk/100).toFixed(0) + ') are 60–90 days overdue. ' : '') +
        (emails > 0 ? 'Send statements to all ' + emails + ' with email addresses now — the longer you wait, the lower the recovery rate.' : 'Add email addresses to send statements.')
      )
    } else if (seriousRisk.length > 0) {
      setAriaDebtInsight(
        seriousRisk.length + ' customer' + (seriousRisk.length !== 1 ? 's' : '') + ' are 60–90 days overdue owing A$' + (totalRisk/100).toFixed(0) + '. Contact them now before they cross the 90-day mark.'
      )
    }
  }, [customers])

  useEffect(() => { load() }, [load])

  async function adjustBalance(customerId: string, amountDollars: number, isCharge: boolean) {
    if (!business?.id) return
    setAdjusting(true)
    const cents = Math.round(Math.abs(amountDollars) * 100) * (isCharge ? 1 : -1)
    try {
      await fetch('/api/pos/customers/' + customerId + '/balance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: business.id,
          adjustment_cents: cents,
          note: adjustNote || (isCharge ? 'Tab charge' : 'Payment received'),
        }),
      })
      setSelected(prev => prev ? { ...prev, current_balance_cents: (prev.current_balance_cents ?? 0) + cents } : null)
      setCustomers(prev => prev.map(c => c.id === customerId
        ? { ...c, current_balance_cents: (c.current_balance_cents ?? 0) + cents }
        : c))
      setAdjustAmount('')
      setAdjustNote('')
    } catch { /* ignore */ }
    setAdjusting(false)
  }

  async function sendStatement(customer: TabCustomer) {
    if (!customer.email || !business?.id) return
    setSendingStatement(true)
    setStatementMsg('')
    try {
      const res = await fetch('/api/pos/customers/' + customer.id + '/statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id }),
      })
      const d = await res.json()
      setStatementMsg(d.ok ? '✓ Statement sent to ' + customer.email : '✗ ' + (d.error ?? 'Failed'))
    } catch { setStatementMsg('✗ Network error') }
    setSendingStatement(false)
  }

  async function emailAllOverdue() {
    const overdue = customers.filter(c => {
      const ts = c.last_visit_at ?? c.last_visit
      const age = ts ? Math.floor((Date.now() - new Date(ts).getTime()) / 86400000) : 999
      return (c.current_balance_cents ?? 0) > 0 && age > 90 && c.email
    })
    if (!overdue.length || !business?.id) return
    await Promise.allSettled(overdue.map(c =>
      fetch('/api/pos/customers/' + c.id + '/statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business?.id }),
      })
    ))
    alert('Statements sent to ' + overdue.filter(c => c.email).length + ' overdue customers.')
  }

  const filtered = customers.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    if (filter === 'owing' && (c.current_balance_cents ?? 0) <= 0) return false
    if (filter === 'overLimit' && (c.current_balance_cents ?? 0) <= (c.credit_limit_cents ?? 0)) return false
    return true
  })

  const totalOwing = customers.reduce((s, c) => s + Math.max(0, c.current_balance_cents ?? 0), 0)
  const totalCredit = customers.reduce((s, c) => s + (c.credit_limit_cents ?? 0), 0)
  const overLimitCount = customers.filter(c => (c.current_balance_cents ?? 0) > (c.credit_limit_cents ?? 0)).length

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Inter',sans-serif", padding: '24px 28px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Customer Tabs & Accounts</h1>
        <p style={{ fontSize: 13, color: C.muted }}>Manage customer credit accounts, record payments, and send statements.</p>
      </div>

      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total owing', value: fmtCents(totalOwing), color: totalOwing > 0 ? C.amber : C.green },
          { label: 'Total credit limit', value: fmtCents(totalCredit), color: C.muted },
          { label: 'Over limit', value: String(overLimitCount), color: overLimitCount > 0 ? C.red : C.green },
        ].map(s => (
          <div key={s.label} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 360px' : '1fr', gap: 20 }}>
        {/* Aria debt intelligence */}
        {ariaDebtInsight && (
          <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: '14px 18px', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 14 }}>🔴</span>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Aria Debt Intelligence</p>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{ariaDebtInsight}</p>
          </div>
        )}
        {/* Aging report */}
        <AgingReport customers={customers} onEmailAll={emailAllOverdue} />
        {/* Customer list */}
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input
              type="text"
              placeholder="Search customers..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid ' + C.border, background: 'rgba(255,255,255,0.05)', color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
            />
            {(['all', 'owing', 'overLimit'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid ' + (filter === f ? C.violet : C.border), background: filter === f ? 'rgba(139,92,246,0.1)' : 'transparent', color: filter === f ? C.violet : C.muted, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {f === 'all' ? 'All' : f === 'owing' ? 'Owing' : 'Over limit'}
              </button>
            ))}
          </div>

          {loading ? (
            <p style={{ color: C.muted }}>Loading...</p>
          ) : customers.length === 0 ? (
            <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 14, padding: '48px 24px', textAlign: 'center' }}>
              <p style={{ fontSize: 32, marginBottom: 12 }}>💳</p>
              <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No customer accounts yet</p>
              <p style={{ fontSize: 13, color: C.muted }}>Set credit limits on customers in the POS to enable tab tracking.</p>
            </div>
          ) : filtered.length === 0 ? (
            <p style={{ color: C.muted, textAlign: 'center', padding: '40px 0' }}>No customers match this filter.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(c => {
                const balance = c.current_balance_cents ?? 0
                const limit = c.credit_limit_cents ?? 0
                const isOver = balance > limit && limit > 0
                const usedPct = limit > 0 ? Math.min(100, Math.round((balance / limit) * 100)) : 0
                const isSelected = selected?.id === c.id
                return (
                  <div key={c.id}
                    onClick={() => setSelected(isSelected ? null : c)}
                    style={{ background: isSelected ? 'rgba(139,92,246,0.08)' : C.card, border: '1px solid ' + (isSelected ? 'rgba(139,92,246,0.3)' : isOver ? 'rgba(239,68,68,0.25)' : C.border), borderRadius: 12, padding: '14px 16px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <p style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{c.name}</p>
                          {c.account_number && <span style={{ fontSize: 10, color: C.dim }}>#{c.account_number}</span>}
                          {isOver && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: 'rgba(239,68,68,0.15)', color: C.red }}>OVER LIMIT</span>}
                        </div>
                        {limit > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                              <div style={{ height: 4, width: usedPct + '%', background: isOver ? C.red : usedPct > 80 ? C.amber : C.green, borderRadius: 2 }} />
                            </div>
                            <span style={{ fontSize: 10, color: C.dim, flexShrink: 0 }}>{usedPct}% of {fmtCents(limit)}</span>
                          </div>
                        )}
                        {c.phone && <p style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{c.phone}</p>}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ fontSize: 16, fontWeight: 700, color: balance > 0 ? C.amber : C.green }}>
                          {balance > 0 ? 'Owes ' : balance < 0 ? 'Credit ' : ''}{fmtCents(Math.abs(balance))}
                        </p>
                        {balance === 0 && <p style={{ fontSize: 11, color: C.green }}>✓ Clear</p>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Account detail panel */}
        {selected && (
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 14, padding: '20px', height: 'fit-content', position: 'sticky', top: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{selected.name}</h3>
              <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
              {[
                { label: 'Current balance', value: fmtCents(Math.abs(selected.current_balance_cents ?? 0)), color: (selected.current_balance_cents ?? 0) > 0 ? C.amber : C.green },
                { label: 'Credit limit', value: fmtCents(selected.credit_limit_cents ?? 0), color: C.muted },
              ].map(s => (
                <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 12px' }}>
                  <p style={{ fontSize: 10, color: C.dim, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</p>
                  <p style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Charge or payment */}
            <p style={{ fontSize: 11, fontWeight: 600, color: C.dim, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Record transaction</p>
            <input
              type="number"
              step="0.01"
              placeholder="Amount A$"
              value={adjustAmount}
              onChange={e => setAdjustAmount(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid ' + C.border, borderRadius: 8, color: C.text, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: 8 }}
            />
            <input
              type="text"
              placeholder="Note (optional)"
              value={adjustNote}
              onChange={e => setAdjustNote(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid ' + C.border, borderRadius: 8, color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: 10 }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              <button
                onClick={() => adjustBalance(selected.id, parseFloat(adjustAmount || '0'), true)}
                disabled={adjusting || !adjustAmount}
                style={{ padding: '9px', borderRadius: 8, border: 'none', background: C.amber + '20', color: C.amber, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: adjusting ? 0.6 : 1 }}>
                + Charge to tab
              </button>
              <button
                onClick={() => adjustBalance(selected.id, parseFloat(adjustAmount || '0'), false)}
                disabled={adjusting || !adjustAmount}
                style={{ padding: '9px', borderRadius: 8, border: 'none', background: C.green + '20', color: C.green, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: adjusting ? 0.6 : 1 }}>
                − Payment received
              </button>
            </div>

            {/* Statement */}
            {selected.email && (
              <div style={{ borderTop: '1px solid ' + C.border, paddingTop: 14 }}>
                <button onClick={() => sendStatement(selected)} disabled={sendingStatement}
                  style={{ width: '100%', padding: '9px', borderRadius: 8, border: '1px solid ' + C.border, background: 'transparent', color: C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: sendingStatement ? 0.6 : 1 }}>
                  {sendingStatement ? 'Sending...' : '📧 Email statement to ' + selected.email}
                </button>
                {statementMsg && <p style={{ fontSize: 11, color: statementMsg.startsWith('✓') ? C.green : C.red, marginTop: 6, textAlign: 'center' }}>{statementMsg}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
