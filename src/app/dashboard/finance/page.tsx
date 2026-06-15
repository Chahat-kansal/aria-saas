'use client'
import React, { useState, useEffect, useCallback } from 'react'

// WIRE-4 — owner finance: computed P&L + cash-flow forecast + POS reconciliation + expense anomalies.
const G = '#7FB897', AMBER = '#BA7517', RED = '#E24B4A', DISPLAY = "var(--font-display, 'Cormorant', Georgia, serif)"
const card: React.CSSProperties = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18 }
const money = (n: number | null | undefined) => n == null ? '—' : (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (n: number | null | undefined) => n == null ? '—' : `${n}%`

interface Pnl { period: { from: string; to: string }; revenue: number; cogs: number; gross_profit: number; gross_margin_pct: number | null; labour: number; operating_expenses: number; external_ai_costs: number; net_profit: number; net_margin_pct: number | null; labour_pct: number | null }
interface Forecast { forecast_week: string; predicted_pos_revenue: number; predicted_payroll: number; predicted_supplier_payments: number; predicted_rent_utilities: number; predicted_other_fixed: number; predicted_bas_gst: number; opening_cash_position: number; closing_cash_position: number; risk_level: string; risk_reason: string; actions: Array<{ label: string }> }
interface Recon { recon_date: string; pos_sales_total: number; pos_cash_total: number; pos_card_total: number; pos_other_total: number; variance_amount: number; variance_pct: number; status: string; bank_data_source: string; notes: string | null }
interface Anomaly { expense_category: string; expense_description: string; amount: number; expected_range_low: number | null; expected_range_high: number | null; deviation_pct: number | null; possible_causes: string[] | string | null; status: string }
interface Overview { empty: boolean; pnl?: Pnl; cash_forecast?: Forecast | null; reconciliations?: Recon[]; anomalies?: Anomaly[] }

const riskColor = (r: string) => r === 'high' ? RED : r === 'medium' ? AMBER : G
const reconColor = (s: string) => s === 'variance' ? RED : s === 'balanced' ? G : 'rgba(255,255,255,0.4)'

export default function FinancePage() {
  const today = new Date().toISOString().slice(0, 10)
  const monthStart = today.slice(0, 8) + '01'
  const [from, setFrom] = useState(monthStart)
  const [to, setTo] = useState(today)
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try { const r = await fetch(`/api/finance/overview?from=${from}&to=${to}`); const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Failed'); setData(d) }
    catch (e) { setErr((e as Error).message) } finally { setLoading(false) }
  }, [from, to])
  useEffect(() => { load() }, [load])

  async function refresh() {
    setBusy(true); setErr('')
    try { const r = await fetch('/api/finance/generate', { method: 'POST' }); const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Failed'); await load() }
    catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const p = data?.pnl, f = data?.cash_forecast, recons = data?.reconciliations ?? [], anomalies = data?.anomalies ?? []

  return (
    <div style={{ padding: 24, maxWidth: 1100, color: '#e8ede7', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 34, fontWeight: 600, margin: 0 }}>Finance</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>P&amp;L, cash-flow forecast, reconciliation and expense anomalies — from your real POS data.</p>
        </div>
        <button onClick={refresh} disabled={busy} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: G, color: '#0c130f', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? 'Refreshing…' : '↻ Refresh forecast & recon'}</button>
      </div>

      {err && <div style={{ ...card, borderColor: `${RED}55`, color: RED, fontSize: 13, marginBottom: 16 }}>{err}</div>}
      {loading ? <div style={{ color: 'rgba(255,255,255,0.35)', padding: 40, textAlign: 'center' }}>Loading…</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* P&L */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
              <h2 style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 22, fontWeight: 600, margin: 0 }}>Profit &amp; Loss</h2>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={dateInp} />
                <span style={{ color: 'rgba(255,255,255,0.3)' }}>→</span>
                <input type="date" value={to} onChange={e => setTo(e.target.value)} style={dateInp} />
              </div>
            </div>
            {p && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                <PnlLine label="Revenue" value={money(p.revenue)} big accent={G} />
                <PnlLine label="− COGS (supplier/stock)" value={money(p.cogs)} />
                <PnlLine label="Gross profit" value={money(p.gross_profit)} sub={`${pct(p.gross_margin_pct)} margin`} accent={G} />
                <PnlLine label={`− Labour ${p.labour_pct != null ? `(${p.labour_pct}%)` : ''}`} value={money(p.labour)} />
                <PnlLine label="− Operating expenses" value={money(p.operating_expenses)} />
                <PnlLine label="− AI / external costs" value={money(p.external_ai_costs)} />
                <PnlLine label="Net profit" value={money(p.net_profit)} sub={`${pct(p.net_margin_pct)} margin`} big accent={p.net_profit >= 0 ? G : RED} />
              </div>
            )}
            <p style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.3)', marginTop: 12 }}>Computed live from pos_sales (completed), timesheets (labour, WIRE-3 basis), business_expenses (by expense date) and AI costs. Not stored.</p>
          </div>

          {/* Cash flow forecast */}
          <div style={card}>
            <h2 style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 22, fontWeight: 600, margin: '0 0 12px' }}>Cash-flow forecast {f && <span style={{ fontSize: 12, fontStyle: 'normal', color: 'rgba(255,255,255,0.4)', fontFamily: 'inherit' }}>· week of {f.forecast_week}</span>}</h2>
            {!f ? <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>No forecast yet — hit “Refresh” to generate one from your trends.</p> : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                  <span style={{ padding: '3px 11px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: `${riskColor(f.risk_level)}22`, color: riskColor(f.risk_level), border: `1px solid ${riskColor(f.risk_level)}55`, textTransform: 'uppercase' }}>{f.risk_level} risk</span>
                  <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.6)' }}>{f.risk_reason}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                  <PnlLine label="Predicted revenue" value={money(f.predicted_pos_revenue)} accent={G} />
                  <PnlLine label="− Payroll" value={money(f.predicted_payroll)} />
                  <PnlLine label="− Suppliers" value={money(f.predicted_supplier_payments)} />
                  <PnlLine label="− Rent/utilities" value={money(f.predicted_rent_utilities)} />
                  <PnlLine label="− GST set-aside" value={money(f.predicted_bas_gst)} />
                  <PnlLine label="Opening cash" value={money(f.opening_cash_position)} />
                  <PnlLine label="Closing cash" value={money(f.closing_cash_position)} accent={f.closing_cash_position >= 0 ? G : RED} big />
                </div>
                {f.actions?.length > 0 && <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>{f.actions.map((a, i) => <span key={i} style={{ fontSize: 11.5, padding: '4px 10px', borderRadius: 8, background: 'rgba(186,117,23,0.12)', border: '1px solid rgba(186,117,23,0.3)', color: '#d8a657' }}>{a.label}</span>)}</div>}
              </>
            )}
          </div>

          {/* Reconciliation */}
          <div style={card}>
            <h2 style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 22, fontWeight: 600, margin: '0 0 12px' }}>Daily POS reconciliation</h2>
            {recons.length === 0 ? <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>No reconciliation rows yet — hit “Refresh”.</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead><tr style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'left' }}>
                    {['Date', 'Sales', 'Cash', 'Card', 'Other', 'Variance', 'Status'].map(h => <th key={h} style={{ padding: '4px 8px', fontWeight: 600 }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {recons.map(r => (
                      <tr key={r.recon_date} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '6px 8px' }}>{r.recon_date}</td>
                        <td style={{ padding: '6px 8px' }}>{money(r.pos_sales_total)}</td>
                        <td style={{ padding: '6px 8px' }}>{money(r.pos_cash_total)}</td>
                        <td style={{ padding: '6px 8px' }}>{money(r.pos_card_total)}</td>
                        <td style={{ padding: '6px 8px' }}>{money(r.pos_other_total)}</td>
                        <td style={{ padding: '6px 8px', color: Math.abs(r.variance_amount) >= 5 ? RED : 'rgba(255,255,255,0.6)' }}>{money(r.variance_amount)}</td>
                        <td style={{ padding: '6px 8px' }}><span style={{ color: reconColor(r.status), fontWeight: 600, textTransform: 'capitalize' }}>{r.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Expense anomalies (alongside profit leaks) */}
          <div style={card}>
            <h2 style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 22, fontWeight: 600, margin: '0 0 12px' }}>Expense anomalies</h2>
            {anomalies.length === 0 ? <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>No anomalies — expenses are within their expected ranges. ✓</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {anomalies.map((a, i) => {
                  const causes = Array.isArray(a.possible_causes) ? a.possible_causes : a.possible_causes ? [String(a.possible_causes)] : []
                  return (
                    <div key={i} style={{ border: `1px solid ${AMBER}33`, borderRadius: 10, padding: 12, background: 'rgba(186,117,23,0.05)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{a.expense_description}</span>
                        <span style={{ fontSize: 12.5, color: AMBER }}>{money(a.amount)}{a.deviation_pct != null ? ` · +${a.deviation_pct}%` : ''}</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>
                        {a.expense_category} · expected {money(a.expected_range_low)}–{money(a.expected_range_high)}
                        {causes.length > 0 && <span> · {causes.slice(0, 3).join(', ')}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const dateInp: React.CSSProperties = { padding: '5px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: '#e8ede7', fontSize: 12, fontFamily: 'inherit' }

function PnlLine({ label, value, sub, big, accent }: { label: string; value: string; sub?: string; big?: boolean; accent?: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 9, padding: '10px 12px' }}>
      <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: big ? 26 : 20, fontWeight: 600, color: accent ?? '#e8ede7', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 5 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{sub}</div>}
    </div>
  )
}
