import { useState, useEffect, useRef, useCallback } from 'react'
import type { ActivityItem, CurrentBusiness } from './global'

// ═══ CANOPY — the Aria OS desktop environment ═══
// Ported from design/aria-environment-original.jsx — every color, shape, and layout decision below
// is copied from that file, not reinterpreted. What changed: mock state (OWNER_PIN, PULSE, hardcoded
// sales figures) is replaced with real IPC calls to the main process; "ariaos"/"pos" no longer render
// as in-page floating <Win>s, they open the real separate BrowserWindows (SHELL-1's own scope, not
// in the original demo file, which predates that split). See SHELL-1-REPORT.md for the full list of
// deviations and why each one exists.

const P = {
  bg: '#0a0a0a', ink: '#fafafa', dim: 'rgba(250,250,250,.58)', faint: 'rgba(250,250,250,.34)',
  lime: '#d9f54e', surface: '#121412', raised: 'rgba(250,250,250,.055)',
  line: 'rgba(250,250,250,.11)', limeSoft: 'rgba(217,245,78,.12)',
  red: '#ff6b5e', amber: '#f5c451',
}
const A = { sage: '#7FB897', deep: '#2D5240', paper: '#101814', card: 'rgba(127,184,151,.08)', line: 'rgba(127,184,151,.22)' }
const sans = "'Outfit', system-ui, sans-serif"
const ariaSerif = "'Cormorant Garamond', serif"
const num: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' }

const AMark = ({ s = 18 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 100 100" fill="none">
    <defs>
      <linearGradient id="ariaMarkGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f2ffc2" /><stop offset="1" stopColor={P.lime} />
      </linearGradient>
    </defs>
    {[0, 9, 18].map((o) => (
      <path key={o} d={`M ${20 + o * 0.3} 85 L 50 ${15 + o * 0.55} L ${80 - o * 0.3} 85`}
        stroke="url(#ariaMarkGrad)" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" opacity={1 - o * 0.02} />
    ))}
    <path d="M 35 61 L 65 61" stroke="url(#ariaMarkGrad)" strokeWidth="5.5" strokeLinecap="round" />
  </svg>
)

interface App { id: string; label: string; aria: boolean; glyph: string; badge: string; fg: string; flagship?: boolean; real?: 'ariaos' | 'pos' }

// SHELL-1's pre-installed set is the task's explicit narrower list (AriaOS, Aria AI, POS, Team,
// Files, Help, Settings, App Store) — the design file's full demo roster also showed Orders/
// Inventory/Reports/Customers/Xero, which are later-phase Shelf icons, not this sprint's. "orders"
// is kept here anyway, unlisted from the owner's launcher, purely because STAFF_VISIBLE (below,
// copied exactly from the design file) names it — the staff PIN scope needs somewhere for it to
// point.
const PINNED = ['ariaos', 'pos']
const STAFF_VISIBLE = ['pos', 'orders']
const LAUNCHER_APPS = ['ariaos', 'ariaai', 'pos', 'team', 'files', 'help', 'settings', 'store']

const ALL_APPS: App[] = [
  { id: 'ariaos', label: 'AriaOS', aria: true, glyph: 'mark', badge: A.sage, fg: '#0a1710', flagship: true, real: 'ariaos' },
  { id: 'ariaai', label: 'Aria AI', aria: true, glyph: 'brain', badge: '#d9f54e', fg: '#0a0a0a' },
  { id: 'pos', label: 'POS', aria: true, glyph: 'cart', badge: '#2D5240', fg: '#eafff0', real: 'pos' },
  { id: 'orders', label: 'Orders', aria: true, glyph: 'receipt', badge: '#BA7517', fg: '#fff7e6' },
  { id: 'store', label: 'App Store', aria: false, glyph: 'bag', badge: '#4a4f45', fg: '#eef2ff' },
  { id: 'team', label: 'Team', aria: true, glyph: 'users2', badge: '#5B7FA6', fg: '#eef6ff' },
  { id: 'files', label: 'Files', aria: true, glyph: 'folder', badge: '#6b6458', fg: '#fff9ee' },
  { id: 'help', label: 'Help', aria: true, glyph: 'help', badge: '#4a5245', fg: '#f2f7ee' },
  { id: 'settings', label: 'Settings', aria: true, glyph: 'gear', badge: '#3a3d40', fg: '#eef2ff' },
]

const GLYPH: Record<string, JSX.Element> = {
  brain: <path d="M9 4.5a2.5 2.5 0 0 0-2.5 2.5V8a2.5 2.5 0 0 0 0 5v1a2.5 2.5 0 0 0 2.5 2.5M15 4.5A2.5 2.5 0 0 1 17.5 7V8a2.5 2.5 0 0 1 0 5v1a2.5 2.5 0 0 1-2.5 2.5M9 4.5h6M9 19.5h6" />,
  cart: <><circle cx="9" cy="19" r="1.3" /><circle cx="16" cy="19" r="1.3" /><path d="M3.5 5h2l2 10h9.5l1.8-7.5H6.2" /></>,
  receipt: <><path d="M6.5 3.5h11v17l-2-1.4-1.8 1.4-1.8-1.4-1.8 1.4-1.8-1.4-1.8 1.4v-17z" /><path d="M9.5 8.5h5M9.5 12h5" /></>,
  bag: <><path d="M6.5 8h11l-1 11h-9L6.5 8z" /><path d="M9.3 8a2.7 2.7 0 0 1 5.4 0" /></>,
  users2: <><circle cx="8" cy="8.5" r="3" /><circle cx="16" cy="8.5" r="3" /><path d="M3 19c.6-3 2.5-4.5 5-4.5s4.4 1.5 5 4.5M11 19c.6-3 2.5-4.5 5-4.5s4.4 1.5 5 4.5" /></>,
  folder: <path d="M3.5 6.5A1.8 1.8 0 0 1 5.3 4.7H9.5l2 2.3H18.7a1.8 1.8 0 0 1 1.8 1.8V17a1.8 1.8 0 0 1-1.8 1.8H5.3A1.8 1.8 0 0 1 3.5 17V6.5z" />,
  help: <><circle cx="12" cy="12" r="8.5" /><path d="M9.5 9.3a2.5 2.5 0 0 1 4.9.6c0 1.7-2.4 1.9-2.4 3.6" /><circle cx="12" cy="16.7" r=".3" fill="currentColor" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.3M12 18.2v2.3M20.5 12h-2.3M5.8 12H3.5M17.8 6.2l-1.6 1.6M7.8 16.2l-1.6 1.6M17.8 17.8l-1.6-1.6M7.8 7.8L6.2 6.2" /></>,
}
const G = ({ id, s = 17 }: { id: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">{GLYPH[id]}</svg>
)
const AppLogo = ({ app, s = 34, radius = 10 }: { app: App; s?: number; radius?: number }) => (
  <div style={{ width: s, height: s, borderRadius: radius, background: app.badge, display: 'grid', placeItems: 'center', flexShrink: 0, boxShadow: '0 2px 6px rgba(0,0,0,.35)' }}>
    {app.glyph === 'mark'
      ? <span style={{ color: app.fg, transform: 'scale(.72)' }}><AMark s={Math.round(s * 0.62)} /></span>
      : <span style={{ color: app.fg }}><G id={app.glyph} s={Math.round(s * 0.52)} /></span>}
  </div>
)

const GLYPH_FOR_ACTION: Record<string, string> = {
  sale_completed: 'cart', loyalty_earn_error: 'receipt', kds_ticket_fire_error: 'receipt',
}
function glyphForActivity(actionType: string): string {
  return GLYPH_FOR_ACTION[actionType] ?? 'receipt'
}

const ORDERS: Array<[string, string, string, string, string]> = [
  ['#1028', 'Dine in · 2 items', '$24.50', '2 min', A.sage],
  ['#1027', 'Takeaway · 3 items', '$18.90', '4 min', A.sage],
  ['#1026', 'Online · 4 items', '$45.00', '8 min', P.amber],
  ['#1025', 'Dine in · 1 item', '$9.50', '11 min', A.sage],
]

export default function App() {
  const [boot, setBoot] = useState(0)
  const [ready, setReady] = useState(false)
  const [wins, setWins] = useState<string[]>([])
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [locked, setLocked] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const [justUnlocked, setJustUnlocked] = useState(false)
  const [role, setRole] = useState<'owner' | 'staff'>('owner')
  const [clock, setClock] = useState('')
  const [business, setBusiness] = useState<CurrentBusiness | null>(null)
  const [feed, setFeed] = useState<ActivityItem[]>([])
  const [todaySalesCents, setTodaySalesCents] = useState<number | null>(null)
  const [issues, setIssues] = useState<string[]>([])

  useEffect(() => {
    const t = setInterval(() => setBoot((p) => Math.min(100, p + 5)), 46)
    return () => clearInterval(t)
  }, [])

  // Boot finishes once the progress bar completes AND the business identity has resolved — avoids a
  // blank flash where the status strip has nothing real to show yet.
  useEffect(() => {
    if (boot < 100) return
    let cancelled = false
    window.canopyAPI.getBusiness().then((b) => {
      if (cancelled) return
      setBusiness(b)
      setTimeout(() => setReady(true), 200)
    })
    return () => { cancelled = true }
  }, [boot])

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))
    tick()
    const t = setInterval(tick, 30000)
    return () => clearInterval(t)
  }, [])

  // Real ambient feed + widgets — reads AriaOS's existing dashboard/alerts APIs only, no mocked
  // numbers. Polls rather than pushes since these are read-only, low-frequency business signals.
  useEffect(() => {
    if (!ready || !business) return
    let cancelled = false
    const load = async () => {
      const [activity, health, sales] = await Promise.all([
        window.canopyAPI.getActivity(business.id),
        window.canopyAPI.getHealth(business.id),
        window.canopyAPI.getTodaySales(),
      ])
      if (cancelled) return
      setFeed(activity.slice(0, 3))
      setIssues(health?.issues.slice(0, 2) ?? [])
      setTodaySalesCents(sales.totalCents)
    }
    load()
    const t = setInterval(load, 45000)
    return () => { cancelled = true; clearInterval(t) }
  }, [ready, business])

  useEffect(() => window.canopyAPI.onAppClosed((kind) => setWins((w) => w.filter((id) => id !== kind))), [])

  const open = useCallback((id: string) => {
    const app = ALL_APPS.find((a) => a.id === id)
    if (app?.real) {
      window.canopyAPI.openApp(app.real)
    }
    setWins((w) => [...w.filter((x) => x !== id), id])
    setLauncherOpen(false)
  }, [])

  const close = useCallback((id: string) => {
    const app = ALL_APPS.find((a) => a.id === id)
    if (app?.real) window.canopyAPI.closeApp(app.real)
    setWins((w) => w.filter((x) => x !== id))
  }, [])

  const pi = useRef(0)
  const pressPin = (d: string) => {
    const next = (pin + d).slice(0, 4)
    setPin(next)
    if (next.length === 4) {
      pi.current += 1
      const attempt = pi.current
      if (!business) { setTimeout(() => setPin(''), 200); return }
      window.canopyAPI.verifyPin(business.id, next).then((result) => {
        if (attempt !== pi.current) return // a newer attempt superseded this one
        if (result.valid && result.scope) {
          setRole(result.scope)
          if (result.scope === 'staff') setWins((w) => w.filter((id) => STAFF_VISIBLE.includes(id)))
          setLocked(false); setPin(''); setJustUnlocked(true)
          setTimeout(() => setJustUnlocked(false), 2600)
        } else {
          setPinError(true)
          setTimeout(() => { setPin(''); setPinError(false) }, 420)
        }
      })
    }
  }

  const wallpaper: React.CSSProperties = { background: `radial-gradient(ellipse at 15% 10%, rgba(217,245,78,.055), transparent 42%), radial-gradient(ellipse at 88% 82%, rgba(217,245,78,.04), transparent 42%), ${P.bg}` }

  if (!ready) return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: sans, ...wallpaper }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Cormorant+Garamond:wght@600;700&display=swap');`}</style>
      <div style={{ width: 72, height: 72, borderRadius: 18, background: P.surface, border: `1px solid ${P.line}`, display: 'grid', placeItems: 'center' }}><AMark s={40} /></div>
      <div style={{ color: P.ink, fontSize: 21, fontWeight: 600, letterSpacing: '0.3em', marginTop: 18 }}>CANOPY</div>
      <div style={{ color: P.faint, fontSize: 11.5, marginTop: 6 }}>powered by AriaOS</div>
      <div style={{ width: 210, height: 2, background: 'rgba(250,250,250,.12)', borderRadius: 99, marginTop: 26 }}>
        <div style={{ width: boot + '%', height: 2, background: P.lime, borderRadius: 99, transition: 'width .1s linear' }} />
      </div>
    </div>
  )

  const Win = ({ id, title, ariaApp = false, w = 480, h = 400, x = 300, y = 90, children }: { id: string; title: string; ariaApp?: boolean; w?: number; h?: number; x?: number; y?: number; children: React.ReactNode }) => {
    const z = wins.indexOf(id)
    if (z < 0) return null
    return (
      <div onMouseDown={() => open(id)} style={{
        position: 'absolute', left: x + z * 26, top: y + z * 18, width: w, height: h, maxWidth: '95vw', maxHeight: '84vh',
        background: P.surface, border: `1px solid ${P.line}`, borderRadius: 14,
        boxShadow: '0 24px 70px rgba(0,0,0,.6)', zIndex: 20 + z,
        display: 'flex', flexDirection: 'column', overflow: 'hidden', color: P.ink,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 38, background: 'rgba(250,250,250,.03)', borderBottom: `1px solid ${P.line}`, flexShrink: 0 }}>
          <div style={{ width: 30, height: '100%', background: ariaApp ? A.sage : 'rgba(250,250,250,.14)', clipPath: 'polygon(0 0, 100% 0, 78% 100%, 0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {ariaApp ? <span style={{ fontFamily: ariaSerif, color: '#0a0a0a', fontWeight: 700, fontSize: 13 }}>A</span> : <span style={{ color: P.ink, fontSize: 11 }}>·</span>}
          </div>
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{title}</span>
          <button onClick={(e) => { e.stopPropagation(); close(id) }} style={{ marginLeft: 'auto', width: 30, height: '100%', border: 'none', background: 'transparent', color: P.faint, cursor: 'pointer', fontSize: 15 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = P.red)} onMouseLeave={(e) => (e.currentTarget.style.color = P.faint)}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: ariaApp ? A.paper : 'transparent', display: 'flex', flexDirection: 'column' }}>{children}</div>
      </div>
    )
  }

  const Row = ({ l, r, rc = '#eef2ff', sub }: { l: string; r: string; rc?: string; sub?: string }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${A.line}`, fontSize: 12.5 }}>
      <div><div style={{ color: 'rgba(238,242,255,.85)' }}>{l}</div>{sub && <div style={{ fontSize: 10.5, color: 'rgba(238,242,255,.45)', marginTop: 1 }}>{sub}</div>}</div>
      <b style={{ color: rc, ...num }}>{r}</b>
    </div>
  )

  const salesLabel = todaySalesCents == null ? '—' : `$${(todaySalesCents / 100).toFixed(2)}`
  const businessName = business?.name ?? 'Your business'

  return (
    <div style={{ height: '100vh', overflow: 'hidden', position: 'relative', fontFamily: sans, ...wallpaper }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Cormorant+Garamond:wght@600;700&display=swap');
        @keyframes rise { from { opacity:0; transform: translateY(8px);} to { opacity:1; transform:none;} }
        @keyframes pulseRing { 0%,100%{ box-shadow:0 0 0 0 rgba(217,245,78,.3);} 50%{ box-shadow:0 0 0 9px rgba(217,245,78,0);} }
        @keyframes shake { 0%,100%{ transform: translateX(0);} 25%{ transform: translateX(-6px);} 75%{ transform: translateX(6px);} }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 34, padding: '0 16px', color: P.ink, fontSize: 12 }}>
        <AMark s={16} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: P.dim }}><span style={{ width: 6, height: 6, borderRadius: 99, background: P.lime }} /> {businessName} · Open {role === 'staff' && '· Staff view'}</span>
        <div onClick={() => setLocked(true)} title="Lock — switch staff" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: P.dim, padding: '3px 8px', borderRadius: 6 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = P.ink)} onMouseLeave={(e) => (e.currentTarget.style.color = P.dim)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5.5" y="11" width="13" height="9" rx="2" /><path d="M8 11V7.5a4 4 0 0 1 8 0V11" /></svg>
          <span style={{ fontSize: 11 }}>Lock</span>
        </div>
        <span style={{ color: P.dim, ...num }}>{clock}</span>
      </div>
      {justUnlocked && (
        <div style={{ position: 'absolute', top: 44, left: '50%', transform: 'translateX(-50%)', background: P.limeSoft, border: '1px solid rgba(217,245,78,.3)', borderRadius: 99, padding: '5px 14px', fontSize: 11.5, color: P.ink, zIndex: 90 }}>
          ✓ Unlocked — {role === 'owner' ? 'full view' : 'POS ready'}
        </div>
      )}

      {locked && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(6,7,6,.94)', zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 74, height: 74, display: 'grid', placeItems: 'center', marginBottom: 8 }}><AMark s={68} /></div>
          <div style={{ color: P.ink, fontSize: 16, fontWeight: 600 }}>{businessName} · Locked</div>
          <div style={{ color: P.dim, fontSize: 11.5, marginTop: 3, marginBottom: 22 }}>Enter your staff PIN to open the register</div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 26, animation: pinError ? 'shake .3s' : undefined }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ width: 13, height: 13, borderRadius: 99, border: `1.5px solid ${pinError ? P.red : P.line}`, background: i < pin.length ? (pinError ? P.red : P.lime) : 'transparent' }} />
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 62px)', gap: 12 }}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((d, i) => d === '' ? <div key={i} /> : (
              <button key={i} onClick={() => (d === '⌫' ? setPin((p) => p.slice(0, -1)) : pressPin(d))} style={{
                width: 62, height: 62, borderRadius: '50%', border: `1px solid ${P.line}`, background: P.raised, color: P.ink, fontSize: 18, cursor: 'pointer', fontFamily: sans,
              }}>{d}</button>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: P.faint, marginTop: 22, textAlign: 'center', maxWidth: 220, lineHeight: 1.5 }}>Owner and staff both unlock with their own PIN — the machine recognizes which by the code itself, never by a button.</div>
        </div>
      )}

      {role === 'owner' && <div style={{ position: 'absolute', left: 20, top: 50, width: 258, animation: 'rise .4s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: P.surface, border: `1px solid ${P.line}`, borderRadius: 12, padding: '8px 11px' }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: P.surface, border: `1px solid ${P.line}`, display: 'grid', placeItems: 'center', animation: 'pulseRing 3s infinite' }}><AMark s={15} /></div>
          <div style={{ fontSize: 11.5, fontWeight: 600 }}>Aria is watching the business</div>
        </div>
        {feed.length === 0 && (
          <div style={{ fontSize: 10.5, color: P.faint, padding: '10px 2px' }}>No recent activity yet.</div>
        )}
        {feed.map((e, i) => (
          <div key={e.id} style={{ display: 'flex', gap: 9, background: i === 0 ? P.limeSoft : P.surface, border: `1px solid ${i === 0 ? 'rgba(217,245,78,.28)' : P.line}`, borderRadius: 11, padding: '8px 10px', marginTop: 6, opacity: 1 - i * 0.2 }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: i === 0 ? P.lime : 'rgba(250,250,250,.08)', color: i === 0 ? '#0a0a0a' : P.dim, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <G id={glyphForActivity(e.action_type)} s={12} /></div>
            <div style={{ fontSize: 10.5, lineHeight: 1.4, ...num }}>{e.description}</div>
          </div>
        ))}
      </div>}

      {role === 'owner' && <div style={{ position: 'absolute', right: 20, top: 50, display: 'grid', gap: 9, width: 200 }}>
        <div style={{ background: P.surface, border: `1px solid ${P.line}`, borderRadius: 13, padding: '10px 13px' }}>
          <div style={{ fontSize: 10, letterSpacing: '.07em', color: P.faint }}>TODAY'S SALES</div>
          <div style={{ fontSize: 21, fontWeight: 700, margin: '2px 0', ...num }}>{salesLabel}</div>
        </div>
        <div style={{ background: P.surface, border: `1px solid ${P.line}`, borderRadius: 13, padding: '10px 13px' }}>
          <div style={{ fontSize: 10, letterSpacing: '.07em', color: P.faint }}>ALERTS</div>
          {issues.length === 0
            ? <div style={{ fontSize: 11.5, marginTop: 4, color: P.dim }}><span style={{ color: A.sage }}>●</span> All clear</div>
            : issues.map((issue, i) => (
              <div key={i} style={{ fontSize: 11.5, marginTop: i === 0 ? 4 : 5 }}><span style={{ color: i === 0 ? P.red : P.amber }}>●</span> {issue}</div>
            ))}
        </div>
      </div>}

      {wins.length === 0 && !launcherOpen && (
        <div style={{ position: 'absolute', left: '50%', top: '46%', transform: 'translate(-50%,-50%)', textAlign: 'center', animation: 'rise .5s ease' }}>
          <div style={{ width: 100, height: 100, display: 'grid', placeItems: 'center', margin: '0 auto' }}><AMark s={92} /></div>
          <div style={{ color: P.ink, fontSize: 25, fontWeight: 600, letterSpacing: '0.28em', marginTop: 14 }}>CANOPY</div>
          <div onClick={() => setLauncherOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: 420, maxWidth: '80vw', margin: '22px auto 0', background: P.raised, border: `1px solid ${P.line}`, borderRadius: 12, padding: '12px 15px', cursor: 'pointer' }}>
            <span style={{ color: P.faint }}>⌕</span>
            <span style={{ color: P.dim, fontSize: 13 }}>Ask Aria, or open an app…</span>
            <span style={{ marginLeft: 'auto', fontSize: 10.5, color: P.faint, border: `1px solid ${P.line}`, borderRadius: 5, padding: '2px 6px' }}>⌘K</span>
          </div>
        </div>
      )}

      {launcherOpen && (
        <div onClick={() => setLauncherOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 140 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 440, background: P.surface, border: `1px solid ${P.line}`, borderRadius: 14, padding: 14, boxShadow: '0 30px 80px rgba(0,0,0,.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: P.raised, border: `1px solid ${P.line}`, borderRadius: 10, padding: '10px 13px', marginBottom: 10 }}>
              <span style={{ color: P.faint }}>⌕</span><span style={{ color: P.dim, fontSize: 13 }}>Ask Aria, or open an app…</span>
            </div>
            {(role === 'owner' ? ALL_APPS.filter((a) => LAUNCHER_APPS.includes(a.id)) : ALL_APPS.filter((a) => STAFF_VISIBLE.includes(a.id))).map((a) => (
              <div key={a.id} onClick={() => open(a.id)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 8px', borderRadius: 8, cursor: 'pointer' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = P.raised)} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                <AppLogo app={a} s={30} radius={8} />
                <span style={{ fontSize: 13 }}>{a.label}</span>
                {a.aria && <span style={{ marginLeft: 'auto', fontSize: 8.5, color: A.sage, letterSpacing: '.08em' }}>ARIAOS</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AriaOS + POS are real separate BrowserWindows (SHELL-1 scope) — no in-page Win for them. */}

      <Win id="ariaai" title="Aria AI" ariaApp w={480} h={340} x={220} y={90}>
        <div style={{ fontFamily: ariaSerif, fontSize: 22, fontWeight: 700, color: '#eef2ff' }}>Morning, {businessName}</div>
        <div style={{ fontSize: 11.5, color: 'rgba(238,242,255,.55)', marginTop: 3, marginBottom: 14 }}>Ask Aria anything about the business from inside AriaOS — open it from the Shelf to start.</div>
        <button onClick={() => open('ariaos')} style={{ alignSelf: 'flex-start', padding: '9px 16px', border: 'none', borderRadius: 8, background: A.deep, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: sans }}>Open AriaOS</button>
      </Win>

      <Win id="orders" title="Orders" ariaApp w={440} h={380} x={330} y={110}>
        <div style={{ fontFamily: ariaSerif, fontSize: 18, fontWeight: 700, color: '#eef2ff', marginBottom: 10 }}>Live queue</div>
        {ORDERS.map(([id, desc, price, mins, c]) => (
          <Row key={id} l={`${id} · ${desc}`} r={price} rc={c} sub={`${mins} ago`} />
        ))}
        <div style={{ fontSize: 10.5, color: P.faint, marginTop: 10 }}>Full live queue is inside POS — this is a quick glance.</div>
      </Win>

      <Win id="team" title="Team" ariaApp w={420} h={360} x={310} y={90}>
        <div style={{ fontFamily: ariaSerif, fontSize: 18, fontWeight: 700, color: '#eef2ff', marginBottom: 10 }}>Team</div>
        <div style={{ fontSize: 11.5, color: 'rgba(238,242,255,.6)' }}>Rosters, timesheets, and staff chat live inside AriaOS.</div>
        <button onClick={() => open('ariaos')} style={{ marginTop: 12, alignSelf: 'flex-start', padding: '9px 16px', border: 'none', borderRadius: 8, background: A.deep, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: sans }}>Open AriaOS</button>
      </Win>

      <Win id="files" title="Files" ariaApp w={420} h={360} x={330} y={100}>
        <div style={{ fontFamily: ariaSerif, fontSize: 18, fontWeight: 700, color: '#eef2ff', marginBottom: 10 }}>Files</div>
        <div style={{ fontSize: 11.5, color: 'rgba(238,242,255,.6)' }}>Documents live inside AriaOS.</div>
        <button onClick={() => open('ariaos')} style={{ marginTop: 12, alignSelf: 'flex-start', padding: '9px 16px', border: 'none', borderRadius: 8, background: A.deep, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: sans }}>Open AriaOS</button>
      </Win>

      <Win id="help" title="Help" ariaApp w={440} h={320} x={350} y={110}>
        <div style={{ fontFamily: ariaSerif, fontSize: 18, fontWeight: 700, color: '#eef2ff', marginBottom: 8 }}>Need something?</div>
        <div style={{ fontSize: 11.5, color: 'rgba(238,242,255,.6)', marginBottom: 14 }}>Message the Aria team directly — usually a reply within the hour.</div>
        <textarea placeholder="What's happening?" style={{ width: '100%', height: 70, background: A.card, border: `1px solid ${A.line}`, borderRadius: 8, padding: 10, color: '#eef2ff', fontSize: 12, fontFamily: sans, resize: 'none' }} />
        <button style={{ marginTop: 10, padding: '9px 16px', border: 'none', borderRadius: 8, background: A.deep, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: sans }}>Send</button>
      </Win>

      <Win id="settings" title="Settings" ariaApp w={420} h={300} x={370} y={90}>
        <div style={{ fontFamily: ariaSerif, fontSize: 18, fontWeight: 700, color: '#eef2ff', marginBottom: 10 }}>Settings</div>
        <div style={{ fontSize: 11.5, color: 'rgba(238,242,255,.6)' }}>Business settings live inside AriaOS.</div>
        <button onClick={() => setLocked(true)} style={{ marginTop: 14, alignSelf: 'flex-start', padding: '9px 16px', border: `1px solid ${A.line}`, borderRadius: 8, background: 'transparent', color: A.sage, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: sans }}>Lock this machine</button>
      </Win>

      <Win id="store" title="App Store" w={480} h={380} x={280} y={70}>
        {[['A', 'AriaOS', 'The business co-owner — pre-installed', 'Installed', true],
          ['XE', 'Xero', 'Accounting', 'Coming soon', false],
          ['DP', 'Deputy', 'Rostering', 'Coming soon', false],
          ['CV', 'Canva', 'Design', 'Coming soon', false],
          ['GB', 'Google Business', 'Reviews & listing', 'Coming soon', false]].map(([ic, name, desc, cta, brand]) => (
          <div key={name as string} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${P.line}` }}>
            <span style={{ width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, background: brand ? A.sage : P.raised, color: brand ? '#0a0a0a' : P.ink }}>{ic as string}</span>
            <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{name as string}</div><div style={{ fontSize: 10.5, color: P.dim }}>{desc as string}</div></div>
            <span style={{ fontSize: 10.5, color: cta === 'Installed' ? P.lime : P.faint }}>{cta as string}</span>
          </div>
        ))}
      </Win>

      <div style={{ position: 'absolute', left: '50%', bottom: 16, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(18,20,18,.9)', border: `1px solid ${P.line}`, borderRadius: 99, padding: '6px 7px' }}>
        {(role === 'owner' ? PINNED : PINNED.filter((id) => STAFF_VISIBLE.includes(id))).map((id) => {
          const a = ALL_APPS.find((x) => x.id === id)!
          const isOpen = wins.includes(id)
          return (
            <div key={id} onClick={() => open(id)} title={a.label} style={{ position: 'relative', cursor: 'pointer' }}>
              <AppLogo app={a} s={34} radius={10} />
              {isOpen && <span style={{ position: 'absolute', bottom: -5, width: 4, height: 4, borderRadius: 99, background: P.lime, boxShadow: '0 0 0 2px rgba(18,20,18,.9)' }} />}
            </div>
          )
        })}
        {wins.filter((id) => !PINNED.includes(id)).length > 0 && <div style={{ width: 1, alignSelf: 'stretch', background: P.line, margin: '2px 2px' }} />}
        {wins.filter((id) => !PINNED.includes(id)).map((id) => {
          const a = ALL_APPS.find((x) => x.id === id)
          if (!a) return null
          return (
            <div key={id} onClick={() => open(id)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 12px 5px 5px', borderRadius: 99, cursor: 'pointer', background: 'rgba(250,250,250,.05)' }}>
              <AppLogo app={a} s={24} radius={7} />
              <span style={{ fontSize: 11.5, color: P.ink }}>{a.label}</span>
            </div>
          )
        })}
        <div onClick={() => setLauncherOpen(true)} style={{ width: 30, height: 30, borderRadius: 99, display: 'grid', placeItems: 'center', background: P.lime, cursor: 'pointer', marginLeft: 2 }}>
          <span style={{ color: '#0a0a0a', fontSize: 15, fontWeight: 700, lineHeight: 1 }}>+</span>
        </div>
      </div>
      <div style={{ position: 'absolute', left: '50%', bottom: 3, transform: 'translateX(-50%)', fontSize: 8.5, color: P.faint }}>pinned · running · add</div>
    </div>
  )
}
