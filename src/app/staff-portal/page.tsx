'use client'

import { useEffect, useState } from 'react'

const C = { bg: '#0f1a15', card: '#1a2a1f', text: '#e8ede7', muted: '#7a9a82', green: '#7FB897', dark: '#2D5240', border: 'rgba(127,184,151,0.15)' }
const INP: React.CSSProperties = { background: 'rgba(255,255,255,0.05)', border: '1px solid ' + C.border, borderRadius: 8, padding: '10px 14px', color: C.text, fontSize: 14, width: '100%', outline: 'none', fontFamily: 'inherit' }
const BTN = (p = true): React.CSSProperties => ({ padding: '11px 24px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, background: p ? C.dark : 'transparent', color: p ? C.green : C.muted, fontFamily: 'inherit', width: '100%' })

interface Shift { id: string; shift_date: string; start_time: string; end_time: string; role: string; status: string }
interface LeaveBalance { leave_type: string; accrued_days: number; taken_days: number; remaining_days: number }
interface LeaveRequest { id: string; leave_type: string; start_date: string; end_date: string; days_taken: number; status: string; notes: string | null }
interface PortalSession { token: string; staff_member_id: string; name: string; first_name: string; position: string }

function usePortalSession() {
  const [session, setSession] = useState<PortalSession | null>(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = localStorage.getItem('aria-portal-session')
    if (raw) { try { setSession(JSON.parse(raw) as PortalSession) } catch { localStorage.removeItem('aria-portal-session') } }
  }, [])
  const save = (s: PortalSession) => { localStorage.setItem('aria-portal-session', JSON.stringify(s)); setSession(s) }
  const clear = () => { localStorage.removeItem('aria-portal-session'); setSession(null) }
  return { session, save, clear }
}

function fmt(t: string) { if (!t) return ''; const d = t.includes('T') ? new Date(t) : new Date('2000-01-01T' + t); return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true }) }
const SC: Record<string, string> = { pending: '#f59e0b', approved: '#10b981', declined: '#ef4444', scheduled: C.green }

function AuthFlow({ onSession }: { onSession: (s: PortalSession) => void }) {
  const [phase, setPhase] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  async function sendCode() {
    if (!email.trim()) return
    setLoading(true); setMsg('')
    await fetch('/api/staff-portal/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }) })
    setLoading(false); setPhase('code')
    setMsg('If your email is registered, a 6-digit code has been sent.')
  }

  async function verify() {
    if (!code.trim()) return
    setLoading(true); setMsg('')
    const r = await fetch('/api/staff-portal/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), code: code.trim() }) })
    const d = await r.json()
    setLoading(false)
    if (d.token) onSession(d as PortalSession)
    else setMsg(d.error ?? 'Invalid code. Try again.')
  }

  return (
    <div style={{ maxWidth: 380, margin: '80px auto', padding: 24 }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: C.green, marginBottom: 4 }}>Aria Staff Portal</div>
        <p style={{ color: C.muted, fontSize: 14 }}>Employee self-service</p>
      </div>
      <div style={{ background: C.card, borderRadius: 16, padding: 24, border: '1px solid ' + C.border }}>
        {phase === 'email' ? (
          <>
            <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 6 }}>Work or personal email</label>
            <input style={{ ...INP, marginBottom: 16 }} type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendCode()} placeholder="your@email.com" autoFocus />
            <button style={BTN()} onClick={sendCode} disabled={loading || !email.trim()}>{loading ? 'Sending…' : 'Send code'}</button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>Enter the 6-digit code sent to <strong style={{ color: C.text }}>{email}</strong></p>
            <input style={{ ...INP, marginBottom: 16, textAlign: 'center', fontSize: 22, letterSpacing: 8 }} type="text" inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={e => e.key === 'Enter' && verify()} autoFocus placeholder="000000" />
            <button style={BTN()} onClick={verify} disabled={loading || code.length < 6}>{loading ? 'Verifying…' : 'Log in'}</button>
            <button style={{ ...BTN(false), marginTop: 8 }} onClick={() => { setPhase('email'); setCode(''); setMsg('') }}>← Back</button>
          </>
        )}
        {msg && <p style={{ marginTop: 12, fontSize: 12, color: msg.includes('Invalid') || msg.includes('error') ? '#ef4444' : C.green, textAlign: 'center' }}>{msg}</p>}
      </div>
    </div>
  )
}

function PortalDashboard({ session, onLogout }: { session: PortalSession; onLogout: () => void }) {
  const [tab, setTab] = useState<'shifts' | 'timesheets' | 'leave'>('shifts')
  const [shifts, setShifts] = useState<Shift[]>([])
  const [balances, setBalances] = useState<LeaveBalance[]>([])
  const [leaveHistory, setLeaveHistory] = useState<LeaveRequest[]>([])
  const [leaveForm, setLeaveForm] = useState({ leave_type: 'annual', start_date: '', end_date: '', notes: '' })
  const [leaveSaving, setLeaveSaving] = useState(false)
  const [leaveMsg, setLeaveMsg] = useState('')
  const hdr = { 'Content-Type': 'application/json', 'x-portal-token': session.token }

  useEffect(() => {
    fetch('/api/staff-portal/shifts', { headers: hdr }).then(r => r.json()).then(d => setShifts(d.shifts ?? []))
    fetch('/api/staff-portal/leave', { headers: hdr }).then(r => r.json()).then(d => { setBalances(d.balances ?? []); setLeaveHistory(d.leave ?? []) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.token])

  async function submitLeave() {
    if (!leaveForm.start_date || !leaveForm.end_date) return
    setLeaveSaving(true); setLeaveMsg('')
    const r = await fetch('/api/staff-portal/leave', { method: 'POST', headers: hdr, body: JSON.stringify(leaveForm) })
    const d = await r.json()
    setLeaveSaving(false)
    if (d.leave) { setLeaveMsg('Request submitted!'); setLeaveForm(f => ({ ...f, start_date: '', end_date: '', notes: '' })); fetch('/api/staff-portal/leave', { headers: hdr }).then(x => x.json()).then(data => { setBalances(data.balances ?? []); setLeaveHistory(data.leave ?? []) }) }
    else setLeaveMsg(d.error ?? 'Failed')
  }

  const fmtDate = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui, Arial, sans-serif' }}>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px 16px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.green }}>Hi, {session.first_name}</div>
            <div style={{ fontSize: 12, color: C.muted }}>{session.position}</div>
          </div>
          <button onClick={onLogout} style={{ fontSize: 12, color: C.muted, background: 'none', border: 'none', cursor: 'pointer' }}>Log out</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid ' + C.border, paddingBottom: 12 }}>
          {(['shifts', 'timesheets', 'leave'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: tab === t ? C.dark : 'transparent', color: tab === t ? C.green : C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{t}</button>
          ))}
        </div>

        {tab === 'shifts' && (
          <div>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>Upcoming shifts (next 4 weeks)</p>
            {shifts.length === 0 ? <p style={{ color: C.muted, fontSize: 13 }}>No shifts scheduled.</p> : shifts.map(s => (
              <div key={s.id} style={{ background: C.card, borderRadius: 10, padding: '12px 16px', marginBottom: 8, border: '1px solid ' + C.border }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtDate(s.shift_date)}</div>
                    <div style={{ fontSize: 13, color: C.muted }}>{fmt(s.start_time)} – {fmt(s.end_time)}{s.role ? ' · ' + s.role : ''}</div>
                  </div>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: (SC[s.status] ?? '#888') + '20', color: SC[s.status] ?? '#888', fontWeight: 700, textTransform: 'uppercase' }}>{s.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'timesheets' && (
          <div>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>Your recent timesheets are managed by your employer. Contact your manager for timesheet queries.</p>
            <div style={{ background: C.card, borderRadius: 10, padding: '14px 16px', border: '1px solid ' + C.border }}>
              <p style={{ fontSize: 13, color: C.green, margin: 0 }}>For clock-in/out, use the POS terminal or ask your manager to access the timesheet system.</p>
            </div>
          </div>
        )}

        {tab === 'leave' && (
          <div>
            {balances.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 20 }}>
                {balances.map(b => (
                  <div key={b.leave_type} style={{ background: C.card, borderRadius: 10, padding: '12px 14px', border: '1px solid ' + C.border }}>
                    <div style={{ fontSize: 11, color: C.muted, textTransform: 'capitalize', marginBottom: 4 }}>{b.leave_type.replace('_', ' ')} leave</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: b.remaining_days > 0 ? C.green : '#ef4444' }}>{b.remaining_days}d</div>
                    <div style={{ fontSize: 10, color: C.muted }}>{b.taken_days}d taken of {b.accrued_days}d</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ background: C.card, borderRadius: 12, padding: 16, border: '1px solid ' + C.border, marginBottom: 20 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: C.green, marginBottom: 12 }}>Request leave</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Type</label>
                  <select style={{ ...INP, background: '#0f1a15' }} value={leaveForm.leave_type} onChange={e => setLeaveForm(f => ({ ...f, leave_type: e.target.value }))}>
                    {['annual', 'sick', 'personal', 'unpaid'].map(t => <option key={t} value={t} style={{ background: '#0f1a15' }}>{t[0].toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div />
                <div>
                  <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>From</label>
                  <input style={INP} type="date" value={leaveForm.start_date} onChange={e => setLeaveForm(f => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>To</label>
                  <input style={INP} type="date" value={leaveForm.end_date} onChange={e => setLeaveForm(f => ({ ...f, end_date: e.target.value }))} />
                </div>
              </div>
              <input style={{ ...INP, marginBottom: 12 }} placeholder="Notes (optional)" value={leaveForm.notes} onChange={e => setLeaveForm(f => ({ ...f, notes: e.target.value }))} />
              <button style={BTN()} onClick={submitLeave} disabled={leaveSaving || !leaveForm.start_date || !leaveForm.end_date}>{leaveSaving ? 'Submitting…' : 'Submit request'}</button>
              {leaveMsg && <p style={{ marginTop: 8, fontSize: 12, color: leaveMsg.includes('!') ? C.green : '#ef4444', textAlign: 'center' }}>{leaveMsg}</p>}
            </div>

            {leaveHistory.length > 0 && (
              <div>
                <p style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Recent requests</p>
                {leaveHistory.map(l => (
                  <div key={l.id} style={{ background: C.card, borderRadius: 8, padding: '10px 14px', marginBottom: 6, border: '1px solid ' + C.border, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{l.leave_type}</span>
                      <div style={{ fontSize: 11, color: C.muted }}>{fmtDate(l.start_date)} – {fmtDate(l.end_date)} · {l.days_taken}d</div>
                    </div>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: (SC[l.status] ?? '#888') + '20', color: SC[l.status] ?? '#888', fontWeight: 700, textTransform: 'capitalize' }}>{l.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function StaffPortalPage() {
  const { session, save, clear } = usePortalSession()
  if (!session) return <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui, Arial, sans-serif' }}><AuthFlow onSession={save} /></div>
  return <PortalDashboard session={session} onLogout={clear} />
}
