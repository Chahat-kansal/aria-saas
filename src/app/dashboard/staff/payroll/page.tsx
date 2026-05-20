'use client'
import { useEffect, useState, useCallback } from 'react'

const C = { bg: 'var(--bg-base)', card: 'var(--bg-surface)', elevated: 'var(--bg-elevated)', text: 'var(--text-primary,#E8EDE7)', muted: 'var(--text-secondary,#A8B5A8)', green: '#7FB897', darkGreen: '#2D5240', border: 'var(--divider,rgba(232,237,231,0.08))', red: '#ef4444', amber: '#f59e0b', blue: '#60a5fa' }
const INP = { background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', color: C.text, fontSize: 13, outline: 'none' }
const $ = (c: number) => `$${(c / 100).toFixed(2)}`

interface LineItem {
  staff_member_id: string | null; staff_name: string; position: string
  employment_type: string; pay_frequency: string; hours_worked: number
  hourly_rate_cents: number; gross_pay_cents: number; tax_withheld_cents: number
  superannuation_rate: number; super_cents: number; net_pay_cents: number
  ytd_gross_cents: number; bank_bsb: string | null; bank_account: string | null
}

interface PayrollRun {
  id: string; period_start: string; period_end: string; status: string
  total_gross_cents: number; total_super_cents: number; total_tax_cents: number
  total_net_estimate_cents: number; staff_count: number; created_at: string
  approved_at: string | null; aba_generated_at: string | null; line_items: LineItem[]
}

export default function PayrollPage() {
  const [runs, setRuns] = useState<PayrollRun[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [approving, setApproving] = useState<string | null>(null)
  const [periodStart, setPeriodStart] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10)
  })
  const [periodEnd, setPeriodEnd] = useState(() => {
    const d = new Date(); d.setDate(14); return d.toISOString().slice(0, 10)
  })
  const [expanded, setExpanded] = useState<string | null>(null)
  const [tab, setTab] = useState<'runs' | 'settings'>('runs')
  const [staffList, setStaffList] = useState<Array<{ id: string; first_name: string; last_name: string; bank_bsb: string | null; bank_account: string | null; bank_account_name: string | null; tax_free_threshold: boolean }>>([])
  const [savingStaff, setSavingStaff] = useState<string | null>(null)
  const [bankEdits, setBankEdits] = useState<Record<string, { bsb: string; account: string; account_name: string; tax_free: boolean }>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/staff/payroll')
    const d = await r.json()
    setRuns(d.runs ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (tab === 'settings') {
      fetch('/api/staff/members?status=active').then(r => r.json()).then(d => {
        setStaffList(d.members ?? [])
        const edits: typeof bankEdits = {}
        for (const m of d.members ?? []) {
          edits[m.id] = { bsb: m.bank_bsb ?? '', account: m.bank_account ?? '', account_name: m.bank_account_name ?? `${m.first_name} ${m.last_name}`, tax_free: m.tax_free_threshold !== false }
        }
        setBankEdits(edits)
      })
    }
  }, [tab])

  const create = async () => {
    if (!periodStart || !periodEnd) return
    setCreating(true)
    const r = await fetch('/api/staff/payroll', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period_start: periodStart, period_end: periodEnd }),
    })
    const d = await r.json()
    if (d.error) alert(d.error)
    else { await load(); setExpanded(d.run_id) }
    setCreating(false)
  }

  const approve = async (runId: string) => {
    if (!confirm('Approve this payroll run? This will update YTD figures for all staff.')) return
    setApproving(runId)
    await fetch('/api/staff/payroll/approve', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ run_id: runId }),
    })
    await load()
    setApproving(null)
  }

  const downloadABA = (runId: string) => {
    window.open(`/api/staff/payroll/aba?run_id=${runId}`)
    setTimeout(load, 2000)
  }

  const saveStaffBanking = async (staffId: string) => {
    const e = bankEdits[staffId]
    if (!e) return
    setSavingStaff(staffId)
    await fetch(`/api/staff/members/${staffId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bank_bsb: e.bsb || null, bank_account: e.account || null, bank_account_name: e.account_name || null, tax_free_threshold: e.tax_free }),
    })
    setSavingStaff(null)
  }

  const totalGross = runs.reduce((s, r) => s + (r.total_gross_cents || 0), 0)
  const totalTax = runs.reduce((s, r) => s + (r.total_tax_cents || 0), 0)
  const totalSuper = runs.reduce((s, r) => s + (r.total_super_cents || 0), 0)

  return (
    <div style={{ padding: 24, maxWidth: 1000, color: C.text, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Payroll</h1>
          <p style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>ATO-compliant withholding · 11.5% super · ABA bank file export</p>
        </div>
      </div>

      {/* YTD summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total gross (all runs)', value: $(totalGross), color: C.text },
          { label: 'Tax withheld (PAYG)', value: $(totalTax), color: C.amber },
          { label: 'Superannuation', value: $(totalSuper), color: C.blue },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: C.card, borderRadius: 12, padding: '14px 16px' }}>
            <p style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Fraunces, serif', fontStyle: 'italic', color }}>{value}</p>
            <p style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {(['runs', 'settings'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === t ? 600 : 400, background: tab === t ? C.darkGreen : 'transparent', color: tab === t ? C.green : C.muted }}>
            {t === 'runs' ? 'Payroll runs' : 'Staff bank details'}
          </button>
        ))}
      </div>

      {/* RUNS TAB */}
      {tab === 'runs' && (
        <>
          {/* New run form */}
          <div style={{ background: 'rgba(45,82,64,0.08)', border: `1px solid ${C.green}33`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: C.green, marginBottom: 12 }}>New payroll run</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Period start</label>
                <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} style={INP} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Period end</label>
                <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} style={INP} />
              </div>
              <button onClick={create} disabled={creating} style={{ padding: '8px 20px', borderRadius: 8, background: C.darkGreen, color: C.green, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                {creating ? 'Generating…' : '✦ Generate payroll run'}
              </button>
            </div>
            <p style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>Pulls all approved timesheets in this period. Tax calculated using 2024-25 ATO withholding tables.</p>
          </div>

          {loading ? <p style={{ color: C.muted }}>Loading…</p> : runs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted }}>
              <p style={{ fontSize: 15, marginBottom: 6 }}>No payroll runs yet</p>
              <p style={{ fontSize: 13 }}>Approve timesheets first, then generate a payroll run above.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {runs.map(run => {
                const isExpanded = expanded === run.id
                const statusColor = run.status === 'approved' ? C.green : run.status === 'draft' ? C.amber : C.muted
                const hasBanking = (run.line_items ?? []).some(l => l.bank_bsb && l.bank_account)
                return (
                  <div key={run.id} style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                    {/* Run header */}
                    <div onClick={() => setExpanded(isExpanded ? null : run.id)}
                      style={{ padding: '14px 18px', cursor: 'pointer', display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', gap: 16, alignItems: 'center' }}>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: 14 }}>{new Date(run.period_start).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – {new Date(run.period_end).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        <p style={{ fontSize: 12, color: C.muted }}>{run.staff_count} staff · {new Date(run.created_at).toLocaleDateString('en-AU')}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 15, fontWeight: 700, color: C.green }}>{$(run.total_gross_cents)}</p>
                        <p style={{ fontSize: 11, color: C.muted }}>gross</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 13, color: C.amber }}>{$(run.total_tax_cents)}</p>
                        <p style={{ fontSize: 11, color: C.muted }}>PAYG</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 13, color: C.blue }}>{$(run.total_super_cents)}</p>
                        <p style={{ fontSize: 11, color: C.muted }}>super</p>
                      </div>
                      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 10, background: `${statusColor}20`, color: statusColor, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {run.status}
                      </span>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div style={{ borderTop: `1px solid ${C.border}`, padding: '16px 18px' }}>
                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                          {run.status === 'draft' && (
                            <button onClick={() => approve(run.id)} disabled={approving === run.id}
                              style={{ padding: '7px 16px', borderRadius: 8, background: C.darkGreen, color: C.green, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
                              {approving === run.id ? 'Approving…' : '✓ Approve payroll run'}
                            </button>
                          )}
                          <button onClick={() => downloadABA(run.id)} disabled={!hasBanking}
                            title={!hasBanking ? 'Add staff bank details in the Settings tab first' : 'Download ABA file for internet banking'}
                            style={{ padding: '7px 16px', borderRadius: 8, background: hasBanking ? 'rgba(96,165,250,0.1)' : 'transparent', color: hasBanking ? C.blue : C.muted, border: `1px solid ${hasBanking ? C.blue + '44' : C.border}`, cursor: hasBanking ? 'pointer' : 'not-allowed', fontSize: 12 }}>
                            ↓ Download ABA file {run.aba_generated_at ? '(generated)' : ''}
                          </button>
                          {!hasBanking && <p style={{ fontSize: 11, color: C.muted, alignSelf: 'center' }}>Add bank details in "Staff bank details" tab to enable ABA</p>}
                        </div>

                        {/* Line items table */}
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead>
                            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                              {['Staff', 'Hours', 'Gross', 'PAYG Tax', 'Super', 'Net Pay', 'YTD Gross'].map(h => (
                                <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11, color: C.muted, fontWeight: 600 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(run.line_items ?? []).map((l, i) => (
                              <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                                <td style={{ padding: '8px 10px' }}>
                                  <p style={{ fontWeight: 600, fontSize: 13 }}>{l.staff_name}</p>
                                  <p style={{ fontSize: 11, color: C.muted }}>{l.position} · {l.pay_frequency}</p>
                                </td>
                                <td style={{ padding: '8px 10px' }}>{l.hours_worked?.toFixed(1)}h</td>
                                <td style={{ padding: '8px 10px', color: C.green, fontWeight: 600 }}>{$(l.gross_pay_cents)}</td>
                                <td style={{ padding: '8px 10px', color: C.amber }}>{$(l.tax_withheld_cents)}</td>
                                <td style={{ padding: '8px 10px', color: C.blue }}>{$(l.super_cents)}</td>
                                <td style={{ padding: '8px 10px', fontWeight: 700 }}>{$(l.net_pay_cents)}</td>
                                <td style={{ padding: '8px 10px', color: C.muted }}>{$(l.ytd_gross_cents)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ borderTop: `2px solid ${C.border}` }}>
                              <td colSpan={2} style={{ padding: '10px 10px', fontWeight: 700 }}>TOTALS</td>
                              <td style={{ padding: '10px 10px', fontWeight: 700, color: C.green }}>{$(run.total_gross_cents)}</td>
                              <td style={{ padding: '10px 10px', fontWeight: 700, color: C.amber }}>{$(run.total_tax_cents)}</td>
                              <td style={{ padding: '10px 10px', fontWeight: 700, color: C.blue }}>{$(run.total_super_cents)}</td>
                              <td style={{ padding: '10px 10px', fontWeight: 700 }}>{$(run.total_net_estimate_cents)}</td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>

                        <p style={{ fontSize: 11, color: C.muted, marginTop: 12 }}>
                          Tax calculated using 2024-25 ATO Schedule 1 withholding tables including 2% Medicare levy. Super at {(run.line_items?.[0]?.superannuation_rate ?? 11.5)}% per Fair Work.
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* SETTINGS TAB - Staff bank details */}
      {tab === 'settings' && (
        <div>
          <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Add bank details for each staff member to enable ABA file generation for direct bank payments. Tax-free threshold affects withholding calculation.</p>
          {staffList.length === 0 ? (
            <p style={{ color: C.muted, fontSize: 14 }}>No active staff found. Add staff in Team settings first.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {staffList.map(m => {
                const e = bankEdits[m.id] ?? { bsb: '', account: '', account_name: `${m.first_name} ${m.last_name}`, tax_free: true }
                return (
                  <div key={m.id} style={{ background: C.card, borderRadius: 12, padding: '14px 18px', border: `1px solid ${C.border}` }}>
                    <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>{m.first_name} {m.last_name}</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <div>
                        <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>BSB (e.g. 062-000)</label>
                        <input value={e.bsb} onChange={ev => setBankEdits(p => ({ ...p, [m.id]: { ...e, bsb: ev.target.value } }))} placeholder="062-000" style={{ ...INP, width: '100%' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Account number</label>
                        <input value={e.account} onChange={ev => setBankEdits(p => ({ ...p, [m.id]: { ...e, account: ev.target.value } }))} placeholder="12345678" style={{ ...INP, width: '100%' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Account name</label>
                        <input value={e.account_name} onChange={ev => setBankEdits(p => ({ ...p, [m.id]: { ...e, account_name: ev.target.value } }))} style={{ ...INP, width: '100%' }} />
                      </div>
                      <button onClick={() => saveStaffBanking(m.id)} disabled={savingStaff === m.id}
                        style={{ padding: '8px 14px', borderRadius: 8, background: C.darkGreen, color: C.green, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                        {savingStaff === m.id ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12, color: C.muted, cursor: 'pointer' }}>
                      <input type="checkbox" checked={e.tax_free} onChange={ev => setBankEdits(p => ({ ...p, [m.id]: { ...e, tax_free: ev.target.checked } }))} />
                      Tax-free threshold claimed (lower withholding — most employees tick this)
                    </label>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
