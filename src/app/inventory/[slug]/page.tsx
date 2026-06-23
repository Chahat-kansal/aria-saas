'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'

// INV-STAFF-APP-1 — staff inventory PWA. Phone-native shell, slug routing, per-staff PIN login, live Home
// tool-hub. Matches the locked staff-app HTML (light theme, dashboard tokens, Cormorant + Outfit). Data is
// live (stock value via INV-COST-1, order badge via INV-PAR-1, sold-today from real sales). Tasks/Reports/
// Review/Scan are wired nav targets, fully built in the next two prompts.

const T = {
  sage: '#7FB897', green: '#2D5240', sand: '#C9A37A', amber: '#BA7517', red: '#E24B4A',
  ink: '#111827', paper: '#F4F6F9', line: '#ECEEF3', muted: '#8A93A2',
  greenSoft: '#EAF2EC', sandSoft: '#F6EFE4', amberSoft: '#FBF1E1', redSoft: '#FCEBEA', sageSoft: '#EDF5F0', blueSoft: '#E7F0FA', violetSoft: '#EEEDFE',
}
const DISPLAY = "'Cormorant', Georgia, serif"
const BODY = "'Outfit', system-ui, sans-serif"
const AV_PALETTE = ['#185FA5', '#2D5240', '#C9A37A', '#7c5cbf', '#BA7517']
const money = (n: number) => `$${(Number(n) || 0).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const initials = (name: string) => name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
const firstName = (name: string) => name.split(' ')[0] ?? name
const greetWord = () => { const h = new Date().getHours(); return h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening' }

interface Staff { id: string; name: string; role: string; color: string | null }
interface Outlet { id: string; name: string; is_default: boolean }
interface Boot { business: { id: string; name: string; slug: string }; outlets: Outlet[]; staff: Staff[] }
interface Home { staff: { id: string; name: string }; value_hero: { at_cost: number; at_retail: number; margin_pct: number | null; products_valued: number; products_total: number; uncosted: number }; mini_stats: { sold_today: number; tasks_open: number; to_review: number }; tile_badges: { order: number; expiring: number } }
interface Task { id: string; task_type: string; product_id: string | null; title: string; detail: string | null; hypothesis: string | null; priority: number; status: string; completed_by: string | null; product_name: string | null; product_sku: string | null; expected: number | null }
interface TasksData { acting: { id: string; name: string }; tasks: Task[]; pills: { accuracy: number | null; streak: number; left_today: number } }

const TILES = [
  { key: 'receive', label: 'Receive', sub: 'log a delivery', bg: 'greenSoft', stroke: '#0F6E56', d: 'M3 7h13v8H3zM16 10h3l2 3v2h-5M5.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z' },
  { key: 'count', label: 'Count', sub: 'stock count', bg: 'blueSoft', stroke: '#185FA5', d: 'M9 11l3 3 8-8M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9' },
  { key: 'waste', label: 'Waste', sub: 'log spoilage', bg: 'redSoft', stroke: '#A32D2D', d: 'M5 7h14M9 7V4h6v3M6 7l1 13h10l1-13' },
  { key: 'transfer', label: 'Transfer', sub: 'between outlets', bg: 'amberSoft', stroke: '#854F0B', d: 'M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4' },
  { key: 'adjust', label: 'Adjust', sub: 'fix a count', bg: 'violetSoft', stroke: '#534AB7', d: 'M11 4H4v16h16v-7M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4 9.5-9.5z' },
  { key: 'order', label: 'Order', sub: 'reorder needs', bg: 'greenSoft', stroke: '#0F6E56', d: 'M6 6h15l-1.5 9h-12zM6 6L5 3H2M9 20a1 1 0 100-2 1 1 0 000 2zM18 20a1 1 0 100-2 1 1 0 000 2z', badge: 'order' as const },
  { key: 'expiring', label: 'Expiring', sub: 'expiry alerts', bg: 'amberSoft', stroke: '#854F0B', d: 'M12 7v5l3 2', circle: true, badge: 'expiring' as const },
  { key: 'scan', label: 'Scan', sub: 'look up item', bg: 'paper', stroke: '#5F5E5A', d: 'M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M7 12h10' },
]

export default function InventoryStaffApp() {
  const slug = (useParams()?.slug as string) ?? ''
  const [boot, setBoot] = useState<Boot | null>(null)
  const [bootErr, setBootErr] = useState(false)
  const [stage, setStage] = useState<'loading' | 'pick' | 'pin' | 'app'>('loading')
  const [selStaff, setSelStaff] = useState<Staff | null>(null)
  const [pin, setPin] = useState('')
  const [pinErr, setPinErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [acting, setActing] = useState<{ id: string; name: string } | null>(null)
  const [outletId, setOutletId] = useState<string | null>(null)
  const [home, setHome] = useState<Home | null>(null)
  const [homeState, setHomeState] = useState<'loading' | 'ok' | 'error' | 'empty'>('loading')
  const [tab, setTab] = useState<'home' | 'tasks' | 'reports' | 'review' | 'scan'>('home')
  const pinSubmitting = useRef(false)
  // Tasks screen state
  const [tasksData, setTasksData] = useState<TasksData | null>(null)
  const [tasksState, setTasksState] = useState<'loading' | 'ok' | 'error' | 'empty'>('loading')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [countVal, setCountVal] = useState(0)
  const [countMsg, setCountMsg] = useState<{ variance: number; review: boolean; time: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // PWA: register SW + inject per-slug manifest link + fonts.
  useEffect(() => {
    if (!slug) return
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/inventory-sw.js', { scope: '/inventory/' }).catch(() => {})
    const add = (rel: string, href: string, extra?: Record<string, string>) => {
      const l = document.createElement('link'); l.rel = rel; l.href = href; if (extra) Object.entries(extra).forEach(([k, v]) => l.setAttribute(k, v)); document.head.appendChild(l); return l
    }
    const m = add('manifest', `/api/inventory/app/${slug}/manifest`)
    const f1 = add('preconnect', 'https://fonts.googleapis.com')
    const f2 = add('stylesheet', 'https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@1,600&family=Outfit:wght@300;400;500;600;700&display=swap')
    return () => { [m, f1, f2].forEach(el => el.remove()) }
  }, [slug])

  const loadHome = useCallback(async (oid: string | null) => {
    setHomeState('loading')
    try {
      const r = await fetch(`/api/inventory/app/${slug}/home${oid ? `?outlet_id=${oid}` : ''}`)
      if (r.status === 401) { setStage('pick'); return }
      if (!r.ok) { setHomeState('error'); return }
      const d = await r.json() as Home
      setHome(d); setActing(d.staff)
      setHomeState(d.value_hero.products_total === 0 ? 'empty' : 'ok')
      setStage('app')
    } catch { setHomeState('error') }
  }, [slug])

  const loadTasks = useCallback(async (oid: string | null) => {
    setTasksState('loading')
    try {
      const r = await fetch(`/api/inventory/app/${slug}/tasks${oid ? `?outlet_id=${oid}` : ''}`)
      if (r.status === 401) { setStage('pick'); return }
      if (!r.ok) { setTasksState('error'); return }
      const d = await r.json() as TasksData
      setTasksData(d)
      setTasksState(d.tasks.length === 0 ? 'empty' : 'ok')
      // auto-activate the first open count/cycle_count task
      const first = d.tasks.find(t => t.status === 'open' && (t.task_type === 'count' || t.task_type === 'cycle_count') && t.product_id)
      setActiveId(first?.id ?? null)
      if (first) setCountVal(first.expected ?? 0)
      setCountMsg(null)
    } catch { setTasksState('error') }
  }, [slug])

  useEffect(() => { if (stage === 'app' && tab === 'tasks' && !tasksData) loadTasks(outletId) }, [stage, tab, tasksData, outletId, loadTasks])

  async function submitCount(task: Task) {
    if (!task.product_id) return
    setSubmitting(true)
    try {
      const r = await fetch(`/api/inventory/app/${slug}/count`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_id: task.product_id, counted: countVal, task_id: task.id, outlet_id: outletId, product_name: task.product_name }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.ok) {
        setCountMsg({ variance: d.variance, review: d.review_raised, time: new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase() })
        setTasksData(td => td ? { ...td, tasks: td.tasks.map(t => t.id === task.id ? { ...t, status: 'done', completed_by: acting?.id ?? null } : t) } : td)
      }
    } catch { /* ignore */ }
    setSubmitting(false)
  }

  // Bootstrap + resume session.
  useEffect(() => {
    if (!slug) return
    ;(async () => {
      try {
        const r = await fetch(`/api/inventory/app/${slug}`)
        if (!r.ok) { setBootErr(true); setStage('pick'); return }
        const b = await r.json() as Boot
        setBoot(b)
        const oid = b.outlets.find(o => o.is_default)?.id ?? b.outlets[0]?.id ?? null
        setOutletId(oid)
        // resume if a session cookie is still valid
        const h = await fetch(`/api/inventory/app/${slug}/home${oid ? `?outlet_id=${oid}` : ''}`)
        if (h.ok) { const d = await h.json() as Home; setHome(d); setActing(d.staff); setHomeState(d.value_hero.products_total === 0 ? 'empty' : 'ok'); setStage('app') }
        else setStage('pick')
      } catch { setBootErr(true); setStage('pick') }
    })()
  }, [slug])

  async function submitPin(p: string) {
    if (!selStaff || pinSubmitting.current) return
    pinSubmitting.current = true; setBusy(true); setPinErr('')
    try {
      const r = await fetch(`/api/inventory/app/${slug}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staff_id: selStaff.id, pin: p }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.ok) { setActing({ id: d.staff.id, name: d.staff.name }); setPin(''); await loadHome(outletId); setStage('app') }
      else { setPinErr('Incorrect PIN'); setPin(''); }
    } catch { setPinErr('Something went wrong') }
    setBusy(false); pinSubmitting.current = false
  }
  function pushDigit(n: string) {
    if (pin.length >= 4) return
    const next = pin + n; setPin(next); setPinErr('')
    if (next.length === 4) submitPin(next)
  }
  async function logout() {
    await fetch(`/api/inventory/app/${slug}/logout`, { method: 'POST' }).catch(() => {})
    setActing(null); setHome(null); setSelStaff(null); setPin(''); setStage('pick'); setTab('home')
  }

  const avColor = (s: Staff, i: number) => (s.color && s.color !== '#6366f1') ? s.color : AV_PALETTE[i % AV_PALETTE.length]

  // ── shells ──
  const shell = (children: React.ReactNode) => (
    <div style={{ minHeight: '100dvh', background: '#E7ECF1', display: 'flex', justifyContent: 'center', fontFamily: BODY, color: T.ink }}>
      <div style={{ width: '100%', maxWidth: 440, background: T.paper, minHeight: '100dvh', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: '0 0 60px rgba(20,30,50,.12)' }}>{children}</div>
    </div>
  )
  const statusbar = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 22px 4px', fontSize: 12, fontWeight: 600 }}>
      <span>{new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
      <span style={{ color: T.muted }}>{boot?.business.name ?? 'Sip'} · PWA</span>
    </div>
  )
  const header = (mini?: boolean, title?: string, subtitle?: string) => (
    <div style={{ padding: mini ? '6px 20px 14px' : '6px 20px 16px', background: `linear-gradient(135deg, ${T.green}, #244236)` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <div style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(127,184,151,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontStyle: 'italic', color: '#fff', fontSize: 20, fontWeight: 600 }}>{(boot?.business.name ?? 's')[0]?.toLowerCase()}</div>
        <div style={{ flex: 1, color: '#fff' }}>
          <b style={{ fontSize: 15, fontWeight: 600, display: 'block' }}>{boot?.business.name ?? 'Inventory'}</b>
          <span style={{ fontSize: 11.5, color: '#A9C3B4' }}>{subtitle ?? `ariaos.site/inventory/${slug}`}</span>
        </div>
        {acting && <div onClick={logout} title="Switch staff" style={{ width: 34, height: 34, borderRadius: '50%', background: T.sand, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, border: '2px solid rgba(255,255,255,.3)', cursor: 'pointer' }}>{initials(acting.name)}</div>}
      </div>
      {!mini && acting && (
        <div style={{ marginTop: 15, color: '#fff' }}>
          <h1 style={{ fontSize: 21, fontWeight: 500 }}><span style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 25, color: T.sage }}>{greetWord()},</span> {firstName(acting.name)}</h1>
          <p style={{ fontSize: 12, color: '#A9C3B4', marginTop: 2 }}>Everything inventory — in one app</p>
        </div>
      )}
      {mini && title && <div style={{ color: '#fff', marginTop: 14 }}><h1 style={{ fontSize: 20, fontWeight: 500 }}><span style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 24, color: T.sage }}>{title}</span></h1><p style={{ fontSize: 11.5, color: '#A9C3B4', marginTop: 2 }}>{subtitle}</p></div>}
    </div>
  )
  const tabbar = (
    <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: `1px solid ${T.line}`, display: 'flex', padding: '11px 0 max(22px, env(safe-area-inset-bottom))', zIndex: 20 }}>
      {([['home', 'Home', 'M3 11l9-8 9 8M5 10v10h14V10'], ['tasks', 'Tasks', 'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11']] as const).map(([k, label, d]) => (
        <button key={k} onClick={() => setTab(k)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: tab === k ? T.green : T.muted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: BODY }}>
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d={d} /></svg><span style={{ fontSize: 10, fontWeight: 600 }}>{label}</span>
        </button>
      ))}
      <button onClick={() => setTab('scan')} style={{ flex: 1, display: 'flex', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: T.green, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: -22, boxShadow: '0 6px 16px rgba(45,82,64,.35)', border: '3px solid #fff' }}>
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M7 12h10" /></svg>
        </div>
      </button>
      {([['reports', 'Reports', 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z'], ['review', 'Review', 'M12 2l9 4-9 4-9-4 9-4zM3 11l9 4 9-4M3 16l9 4 9-4']] as const).map(([k, label, d]) => (
        <button key={k} onClick={() => setTab(k)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: tab === k ? T.green : T.muted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: BODY }}>
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d={d} /></svg><span style={{ fontSize: 10, fontWeight: 600 }}>{label}</span>
        </button>
      ))}
    </div>
  )

  // ── LOGIN: staff picker ──
  if (stage === 'loading') return shell(<>{statusbar}{header()}<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted, fontSize: 13 }}>Loading…</div></>)

  if (stage === 'pick') return shell(
    <>
      {statusbar}{header()}
      <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
        {bootErr && <p style={{ fontSize: 13, color: T.red, marginBottom: 12 }}>Couldn&apos;t load this store.</p>}
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '4px 2px 14px' }}>Who&apos;s working?</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {(boot?.staff ?? []).map((s, i) => (
            <button key={s.id} onClick={() => { setSelStaff(s); setPin(''); setPinErr(''); setStage('pin') }}
              style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, cursor: 'pointer', fontFamily: BODY, boxShadow: '0 1px 3px rgba(20,30,50,.03)' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: avColor(s, i), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18 }}>{initials(s.name)}</div>
              <div style={{ textAlign: 'center' }}><b style={{ fontSize: 13.5, fontWeight: 600, display: 'block' }}>{s.name}</b><span style={{ fontSize: 11, color: T.muted, textTransform: 'capitalize' }}>{s.role}</span></div>
            </button>
          ))}
          {(!boot || boot.staff.length === 0) && <p style={{ gridColumn: '1/-1', fontSize: 13, color: T.muted }}>No staff set up yet.</p>}
        </div>
      </div>
    </>
  )

  // ── LOGIN: PIN entry ──
  if (stage === 'pin' && selStaff) return shell(
    <>
      {statusbar}{header()}
      <div style={{ flex: 1, overflowY: 'auto', padding: 22, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <button onClick={() => { setStage('pick'); setPin('') }} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: T.muted, fontSize: 13, cursor: 'pointer', fontFamily: BODY }}>← Back</button>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: avColor(selStaff, 0), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 22, marginTop: 10 }}>{initials(selStaff.name)}</div>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 12 }}>Hi {firstName(selStaff.name)}</h2>
        <p style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>Enter your 4-digit PIN</p>
        <div style={{ display: 'flex', gap: 12, margin: '20px 0' }}>
          {[0, 1, 2, 3].map(i => <div key={i} style={{ width: 16, height: 16, borderRadius: '50%', background: i < pin.length ? T.green : 'transparent', border: `2px solid ${i < pin.length ? T.green : T.line}`, transition: 'all 120ms' }} />)}
        </div>
        {pinErr && <p style={{ fontSize: 12.5, color: T.red, marginBottom: 10 }}>{pinErr}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 72px)', gap: 14 }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k, i) => k === '' ? <div key={i} /> : (
            <button key={i} disabled={busy} onClick={() => k === 'del' ? setPin(p => p.slice(0, -1)) : pushDigit(k)}
              style={{ height: 64, borderRadius: 16, border: `1px solid ${T.line}`, background: '#fff', fontFamily: DISPLAY, fontStyle: 'italic', fontSize: k === 'del' ? 16 : 28, fontWeight: 600, color: T.ink, cursor: 'pointer' }}>{k === 'del' ? '⌫' : k}</button>
          ))}
        </div>
      </div>
    </>
  )

  // ── APP (logged in) ──
  const body = (children: React.ReactNode) => <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 24px' }}>{children}</div>
  const stub = (title: string, note: string) => shell(<>{statusbar}{header(true, title, note)}{body(
    <div style={{ padding: 40, textAlign: 'center' }}><div style={{ fontSize: 38, marginBottom: 10 }}>🧰</div><p style={{ fontSize: 16, fontFamily: DISPLAY, fontStyle: 'italic', marginBottom: 6 }}>Coming in the next update</p><p style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>This screen is being built. Your acting session (<b>{acting?.name}</b>) carries through so every action is attributed to you.</p></div>
  )}{tabbar}</>)

  if (tab === 'tasks') {
    const pills = tasksData?.pills
    const open = (tasksData?.tasks ?? []).filter(t => t.status === 'open')
    const done = (tasksData?.tasks ?? []).filter(t => t.status === 'done')
    const active = (tasksData?.tasks ?? []).find(t => t.id === activeId && t.status === 'open')
    const variance = active ? countVal - (active.expected ?? 0) : 0
    const tasksHeader = (
      <div style={{ padding: '6px 20px 16px', background: `linear-gradient(135deg, ${T.green}, #244236)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(127,184,151,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontStyle: 'italic', color: '#fff', fontSize: 20, fontWeight: 600 }}>{(boot?.business.name ?? 's')[0]?.toLowerCase()}</div>
          <div style={{ flex: 1, color: '#fff' }}><b style={{ fontSize: 15, fontWeight: 600, display: 'block' }}>{boot?.business.name}</b><span style={{ fontSize: 11.5, color: '#A9C3B4' }}>ariaos.site/inventory/{slug}</span></div>
          {acting && <div onClick={logout} style={{ width: 34, height: 34, borderRadius: '50%', background: T.sand, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, border: '2px solid rgba(255,255,255,.3)', cursor: 'pointer' }}>{initials(acting.name)}</div>}
        </div>
        <div style={{ marginTop: 15, color: '#fff' }}>
          <h1 style={{ fontSize: 21, fontWeight: 500 }}><span style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 25, color: T.sage }}>Today,</span> {firstName(acting?.name ?? '')}</h1>
          <p style={{ fontSize: 12, color: '#A9C3B4', marginTop: 2 }}>{open.length} task{open.length === 1 ? '' : 's'} · Aria built your list from real sales</p>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {[[pills?.accuracy != null ? `${pills.accuracy}%` : 'new', 'count accuracy'], [String(pills?.streak ?? 0), 'day streak'], [String(pills?.left_today ?? open.length), 'left today']].map(([v, k]) => (
            <div key={k} style={{ flex: 1, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 12, padding: '9px 11px', color: '#fff' }}>
              <b style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 20, fontWeight: 600, display: 'block', lineHeight: 1 }}>{v}</b><span style={{ fontSize: 10, color: '#A9C3B4' }}>{k}</span>
            </div>
          ))}
        </div>
      </div>
    )
    const taskCard = (children: React.ReactNode, extra?: React.CSSProperties) => <div style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 16, padding: 14, marginBottom: 11, boxShadow: '0 1px 3px rgba(20,30,50,.03)', ...extra }}>{children}</div>
    const checkRow = (t: Task, isDone: boolean) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div onClick={() => { if (!isDone && (t.task_type === 'count' || t.task_type === 'cycle_count') && t.product_id) { setActiveId(t.id); setCountVal(t.expected ?? 0); setCountMsg(null) } }}
          style={{ width: 24, height: 24, borderRadius: 8, border: `2px solid ${isDone ? T.sage : T.sage}`, background: isDone ? T.sage : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          {isDone && <svg width="14" height="14" fill="none" stroke="#fff" strokeWidth={3} viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>}
        </div>
        <div style={{ flex: 1 }}>
          <b style={{ fontSize: 14, fontWeight: 600, textDecoration: isDone ? 'line-through' : 'none', color: isDone ? T.muted : T.ink }}>{t.title}</b>
          {t.detail && <span style={{ display: 'block', fontSize: 11.5, color: T.muted, marginTop: 2, lineHeight: 1.4 }}>{t.detail}</span>}
        </div>
      </div>
    )
    return shell(
      <>
        {statusbar}{tasksHeader}
        {body(
          tasksState === 'loading' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>{[...Array(4)].map((_, i) => <div key={i} style={{ height: i === 1 ? 220 : 56, borderRadius: 16, background: '#fff', border: `1px solid ${T.line}` }} />)}</div>
          ) : tasksState === 'error' ? (
            <div style={{ padding: 24, borderRadius: 16, background: '#fff', border: `1px solid ${T.redSoft}`, textAlign: 'center' }}><p style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Couldn&apos;t load your tasks</p><button onClick={() => loadTasks(outletId)} style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: T.green, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: BODY }}>Try again</button></div>
          ) : tasksState === 'empty' ? (
            <div style={{ padding: 40, textAlign: 'center' }}><div style={{ fontSize: 38, marginBottom: 10 }}>✓</div><p style={{ fontSize: 18, fontFamily: DISPLAY, fontStyle: 'italic', marginBottom: 6 }}>No tasks today — you&apos;re clear</p><p style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>Aria didn&apos;t find anything that needs counting right now. New tasks appear as stock runs low or items near expiry.</p></div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 2px 10px' }}>
                <b style={{ fontSize: 14, fontWeight: 600 }}>Today&apos;s tasks</b>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: T.amber, background: T.amberSoft, padding: '3px 8px', borderRadius: 7 }}>🇯🇵 Tanpin Kanri</span>
              </div>
              {done.map(t => <div key={t.id}>{taskCard(checkRow(t, true))}</div>)}

              {/* ACTIVE COUNT CARD */}
              {active && (
                <>
                  <div style={{ margin: '4px 2px 10px', fontSize: 14, fontWeight: 600 }}>{active.title}</div>
                  {taskCard(
                    <>
                      {active.hypothesis && <div style={{ fontSize: 11.5, color: '#5A6472', background: T.sageSoft, borderRadius: 9, padding: '8px 11px', lineHeight: 1.45 }}><b style={{ color: T.green }}>Aria&apos;s hypothesis:</b> {active.hypothesis}</div>}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: T.ink, color: '#fff', borderRadius: 12, padding: '12px 14px', margin: '13px 0' }}>
                        <svg width="20" height="20" fill="none" stroke={T.sage} strokeWidth={2} viewBox="0 0 24 24"><path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M7 12h10" /></svg>
                        <b style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{active.product_name}</b><span style={{ fontSize: 11, color: '#9aa3b2' }}>{active.product_sku ? `SKU ${active.product_sku}` : 'scanned'}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'center', margin: '6px 0 14px' }}>
                        <button onClick={() => setCountVal(v => Math.max(0, v - 1))} style={{ width: 46, height: 46, borderRadius: 14, border: `1.5px solid ${T.line}`, background: '#fff', fontSize: 24, fontWeight: 600, color: T.green, cursor: 'pointer' }}>−</button>
                        <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 48, fontWeight: 600, minWidth: 70, textAlign: 'center', lineHeight: 1 }}>{countVal}</div>
                        <button onClick={() => setCountVal(v => v + 1)} style={{ width: 46, height: 46, borderRadius: 14, border: `1.5px solid ${T.line}`, background: '#fff', fontSize: 24, fontWeight: 600, color: T.green, cursor: 'pointer' }}>+</button>
                      </div>
                      <div style={{ display: 'flex', gap: 9, marginBottom: 14 }}>
                        {[['Aria expects', active.expected ?? 0, T.paper, T.ink], ['You counted', countVal, T.greenSoft, T.green], ['Variance', `${variance > 0 ? '+' : ''}${variance}`, variance === 0 ? T.greenSoft : T.redSoft, variance === 0 ? T.green : T.red]].map(([l, v, bg, col], i) => (
                          <div key={i} style={{ flex: 1, borderRadius: 12, padding: 11, textAlign: 'center', background: bg as string }}>
                            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px', color: T.muted }}>{l}</div>
                            <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 24, fontWeight: 600, marginTop: 3, color: col as string }}>{v}</div>
                          </div>
                        ))}
                      </div>
                      {variance !== 0 && !countMsg && (
                        <div style={{ fontSize: 11.5, color: T.red, background: T.redSoft, borderRadius: 10, padding: '10px 12px', lineHeight: 1.45, marginBottom: 13, display: 'flex', gap: 8 }}>
                          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}><path d="M12 9v4m0 4h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
                          <span>{Math.abs(variance)} units {variance < 0 ? 'short of' : 'over'} expected. This won&apos;t change stock — it goes to the owner&apos;s review queue to investigate (over-pour? unlogged waste?).</span>
                        </div>
                      )}
                      {!countMsg ? (
                        <button onClick={() => submitCount(active)} disabled={submitting} style={{ width: '100%', background: T.green, color: '#fff', border: 0, borderRadius: 13, padding: 14, fontFamily: BODY, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>{submitting ? 'Submitting…' : 'Submit count'}</button>
                      ) : (
                        <div style={{ width: '100%', background: T.sage, color: '#fff', borderRadius: 13, padding: 14, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>{countMsg.review ? '✓ Sent to owner review' : '✓ Count matches — recorded'}</div>
                      )}
                      <div style={{ fontSize: 10.5, color: T.muted, textAlign: 'center', marginTop: 9, lineHeight: 1.5 }}>Logged as <b style={{ color: T.green }}>{acting?.name}</b> · {countMsg?.time ?? new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase()} · attribution is how Aria spots who counts accurately</div>
                    </>,
                    { border: `1.5px solid ${T.green}`, boxShadow: '0 6px 20px rgba(45,82,64,.1)' }
                  )}
                </>
              )}

              {/* UP NEXT */}
              {open.filter(t => t.id !== activeId).length > 0 && (
                <>
                  <div style={{ margin: '4px 2px 10px', fontSize: 14, fontWeight: 600 }}>Up next</div>
                  {open.filter(t => t.id !== activeId).map(t => <div key={t.id}>{taskCard(checkRow(t, false))}</div>)}
                </>
              )}
            </>
          )
        )}
        {tabbar}
      </>
    )
  }
  if (tab === 'reports') return stub('Reports', 'Sold vs in-stock · PDF + email')
  if (tab === 'review') return stub('Review', 'Owner review queue')
  if (tab === 'scan') return stub('Scan', 'Look up an item')

  // HOME
  const multiOutlet = (boot?.outlets.length ?? 0) > 1
  const vh = home?.value_hero
  const pct = vh && vh.products_total > 0 ? Math.round((vh.products_valued / vh.products_total) * 100) : 0

  return shell(
    <>
      {statusbar}{header()}
      {body(
        <>
          {multiOutlet && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: `1px solid ${T.line}`, borderRadius: 11, padding: '9px 12px', marginBottom: 13, fontSize: 12.5, fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.sage }} />
              <select value={outletId ?? ''} onChange={e => { setOutletId(e.target.value); loadHome(e.target.value) }} style={{ border: 0, background: 'transparent', fontFamily: BODY, fontWeight: 600, fontSize: 12.5, flex: 1, outline: 0, color: T.ink }}>
                {boot!.outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <span style={{ fontSize: 9.5, color: T.muted, fontWeight: 600 }}>stock is per-outlet</span>
            </div>
          )}

          {/* VALUE HERO */}
          {homeState === 'loading' ? (
            <div style={{ height: 150, borderRadius: 16, background: '#fff', border: `1px solid ${T.line}`, marginBottom: 13 }} />
          ) : homeState === 'error' ? (
            <div style={{ padding: 24, borderRadius: 16, background: '#fff', border: `1px solid ${T.redSoft}`, textAlign: 'center', marginBottom: 13 }}>
              <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Couldn&apos;t load your stock</p>
              <button onClick={() => loadHome(outletId)} style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: T.green, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: BODY }}>Try again</button>
            </div>
          ) : homeState === 'empty' ? (
            <div style={{ padding: 28, borderRadius: 16, background: '#fff', border: `1px solid ${T.line}`, textAlign: 'center', marginBottom: 13 }}>
              <div style={{ fontSize: 34, marginBottom: 8 }}>📦</div>
              <p style={{ fontSize: 16, fontFamily: DISPLAY, fontStyle: 'italic', marginBottom: 4 }}>No products yet</p>
              <p style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>Add products in the dashboard and your live stock value will appear here.</p>
            </div>
          ) : vh && (
            <div style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 16, padding: 15, marginBottom: 13, boxShadow: '0 1px 3px rgba(20,30,50,.03)' }}>
              <div style={{ fontSize: 11, color: T.muted }}>Stock value on hand · at cost</div>
              <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 34, fontWeight: 600, color: T.green, lineHeight: 1.05, marginTop: 1 }}>{money(vh.at_cost)}</div>
              <div style={{ fontSize: 11.5, color: T.muted, marginTop: 1 }}>at retail {money(vh.at_retail)}{vh.margin_pct != null ? ` · ${vh.margin_pct}% margin` : ''} · {vh.products_valued}/{vh.products_total} costed</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 13 }}>
                {[['sold today', String(home!.mini_stats.sold_today), T.ink], ['tasks open', String(home!.mini_stats.tasks_open), T.amber], ['to review', String(home!.mini_stats.to_review), T.red]].map(([k, v, col]) => (
                  <div key={k} style={{ flex: 1, background: T.paper, borderRadius: 11, padding: '8px 10px' }}>
                    <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 19, fontWeight: 600, lineHeight: 1, color: col as string }}>{v}</div>
                    <div style={{ fontSize: 9.5, color: T.muted, marginTop: 3 }}>{k}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TOOL TILES */}
          <div style={{ margin: '6px 2px 10px', fontSize: 14, fontWeight: 600 }}>Inventory tools</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {TILES.map(t => {
              const badge = t.badge ? (home?.tile_badges[t.badge] ?? 0) : 0
              return (
                <div key={t.key} onClick={() => { /* screens built in prompts 2-3 */ if (t.key === 'count') setTab('tasks'); else if (t.key === 'scan') setTab('scan'); }}
                  style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 14, padding: 13, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 9, boxShadow: '0 1px 3px rgba(20,30,50,.03)' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: (T as Record<string, string>)[t.bg], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="18" height="18" fill="none" stroke={t.stroke} strokeWidth={2} viewBox="0 0 24 24">{t.circle && <circle cx="12" cy="12" r="9" />}<path d={t.d} /></svg>
                  </div>
                  <b style={{ fontSize: 13, fontWeight: 600 }}>{t.label}</b>
                  {t.badge && badge > 0
                    ? <span style={{ fontSize: 9, fontWeight: 700, color: T.amber, background: T.amberSoft, padding: '1px 6px', borderRadius: 5, alignSelf: 'flex-start', marginTop: -4 }}>{badge} {t.key === 'order' ? 'to reorder' : 'today'}</span>
                    : <span style={{ fontSize: 10.5, color: T.muted, marginTop: -4 }}>{t.sub}</span>}
                </div>
              )
            })}
          </div>
        </>
      )}
      {tabbar}
    </>
  )
}
