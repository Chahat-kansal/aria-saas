import { useState, useEffect, useRef, useCallback } from 'react'
import type { ActivityItem, CurrentBusiness, SavedReport } from './global'

// ═══ CANOPY — the Aria OS desktop environment ═══
// CANOPY-REDESIGN-1: ported from the updated design/aria-environment-dock-final.jsx (the file that
// actually carries this sprint's changes — design/aria-environment-original.jsx on disk was not the
// one updated). Real macOS-style traffic-light chrome, the light Pipel palette, the full always-on
// labeled dock, real cropped logo icons (design/icon-sprite-sheet.png), and the desktop
// icons/weather/tagline additions. All real IPC wiring from SHELL-1 (business identity, activity
// feed, health/alerts, today's sales, PIN verification, real AriaOS/POS windows) is unchanged —
// this sprint is chrome/theme/dock only, not a data-layer change.

const P = {
  bg: '#F5F3EC', ink: '#1A1A16', dim: 'rgba(26,26,22,.62)', faint: 'rgba(26,26,22,.38)',
  lime: '#d9f54e', surface: '#FFFFFF', raised: 'rgba(20,20,16,.045)',
  line: 'rgba(20,20,16,.10)', limeSoft: 'rgba(217,245,78,.28)',
  red: '#d1453b', amber: '#b8860b',
}
const A = { sage: '#7A8C1E', deep: '#22221A', paper: '#FAF8F2', card: 'rgba(217,245,78,.16)', line: 'rgba(20,20,16,.10)' }
const sans = "'Outfit', system-ui, sans-serif"
const ariaSerif = "'Cormorant Garamond', serif"
const num: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' }

// CANOPY-POLISH-1 item 2 — the dock's own real footprint, computed from its actual CSS values
// below (icon 32 + item gap 3 + ~11px label line + 9px/7px top/bottom padding), not a guessed
// constant. DOCK_CLEARANCE is the one shared source of truth both the dock's own `bottom` offset
// and the feed panel's `bottom` anchor derive from, so they can never drift out of sync with each
// other the way the feed panel's old fixed `top: 570` could (and did) drift out of sync with the
// dock's real position — anchoring the feed panel's bottom edge here means its available height is
// always `100vh - DOCK_CLEARANCE - <its own top>`, recomputed by the browser at every window size,
// so it can never overlap the dock regardless of actual screen resolution.
const DOCK_BOTTOM_OFFSET = 16
const DOCK_CONTENT_HEIGHT = 32 /* icon */ + 3 /* gap */ + 11 /* label line */ + 9 + 7 /* padding */
const DOCK_CLEARANCE = DOCK_BOTTOM_OFFSET + DOCK_CONTENT_HEIGHT + 20 /* breathing room above the dock */

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

// STAFF_VISIBLE unchanged from SHELL-1 — everything a staff PIN can reach: the register + the order
// queue, never approvals, brief, reports, or settings.
const STAFF_VISIBLE = ['pos', 'orders']

// Exact dock order from the sprint spec — matches design/aria-environment-dock-final.jsx's ALL_APPS
// order verbatim. Supersedes SHELL-1's narrower 9-app launcher roster; this sprint's dock is the
// full 17-app set, always visible.
const ALL_APPS: App[] = [
  { id: 'ariaos',    label: 'AriaOS',    aria: true,  glyph: 'mark',      badge: A.sage,    fg: '#0a1710', flagship: true, real: 'ariaos' },
  { id: 'pos',       label: 'POS',       aria: true,  glyph: 'cart',      badge: '#2D5240', fg: '#eafff0', real: 'pos' },
  { id: 'orders',    label: 'Orders',    aria: true,  glyph: 'receipt',   badge: '#BA7517', fg: '#fff7e6' },
  { id: 'customers', label: 'Customers', aria: true,  glyph: 'users',     badge: '#A85C7A', fg: '#fff0f6' },
  { id: 'inventory', label: 'Inventory', aria: true,  glyph: 'box',       badge: '#7FB897', fg: '#0a1b10' },
  { id: 'reports',   label: 'Reports',   aria: true,  glyph: 'chart',     badge: '#3C7A89', fg: '#eafcff' },
  { id: 'finance',   label: 'Finance',   aria: true,  glyph: 'dollar',    badge: '#1F7A4D', fg: '#eafff0' },
  { id: 'kitchen',   label: 'Kitchen',   aria: true,  glyph: 'chef',      badge: '#8B5A2B', fg: '#fff5e8' },
  { id: 'marketing', label: 'Marketing', aria: true,  glyph: 'megaphone', badge: '#C2410C', fg: '#fff3ea' },
  { id: 'suppliers', label: 'Suppliers', aria: true,  glyph: 'truck',     badge: '#3B5BA5', fg: '#eaf1ff' },
  { id: 'ariaai',    label: 'Aria AI',   aria: true,  glyph: 'brain',     badge: '#d9f54e', fg: '#0a0a0a' },
  { id: 'team',      label: 'Team',      aria: true,  glyph: 'users2',    badge: '#5B7FA6', fg: '#eef6ff' },
  { id: 'files',     label: 'Files',     aria: true,  glyph: 'folder',    badge: '#6b6458', fg: '#fff9ee' },
  { id: 'help',      label: 'Help',      aria: true,  glyph: 'help',      badge: '#4a5245', fg: '#f2f7ee' },
  { id: 'settings',  label: 'Settings',  aria: true,  glyph: 'gear',      badge: '#3a3d40', fg: '#eef2ff' },
  { id: 'xero',      label: 'Xero',      aria: false, glyph: 'book',      badge: '#3a4046', fg: '#eef2ff' },
  { id: 'store',     label: 'App Store', aria: false, glyph: 'bag',       badge: '#4a4f45', fg: '#eef2ff' },
]

// CANOPY-UNIVERSAL-SEARCH-1 — a searchable feature registry, deliberately separate from ALL_APPS.
// The dock stays exactly as it was (17 fixed apps, several of them still showing sample/mock
// content in an in-Canopy Win — see the Win definitions below); this registry is a second,
// growable list of REAL AriaOS dashboard pages, reachable only via search, that always open the
// actual live page (deep-linked via openFeature below), never a mock. Starter set pulled from the
// real src/app/dashboard/ sub-pages (each id below has a confirmed page.tsx); adding another
// feature later is a one-line data row here, not a UI build — the whole point of the registry
// pattern. Owner-only, matching every other business-intelligence surface in this app (dock/
// launcher already restrict staff to STAFF_VISIBLE; these are all owner-level pages).
interface AriaFeature { id: string; label: string; route: string }
const ARIA_FEATURES: AriaFeature[] = [
  { id: 'feat-reviews',        label: 'Reviews',                route: '/dashboard/reviews' },
  { id: 'feat-profit-leaks',   label: 'Profit Leaks',            route: '/dashboard/profit-leaks' },
  { id: 'feat-competitors',    label: 'Competitor Tracking',     route: '/dashboard/competitors' },
  { id: 'feat-churn',          label: 'Churn Prediction',        route: '/dashboard/churn' },
  { id: 'feat-compliance',     label: 'Compliance Monitoring',   route: '/dashboard/compliance' },
  { id: 'feat-quote-builder',  label: 'Quote Generator',         route: '/dashboard/quote-builder' },
  { id: 'feat-bookings',       label: 'Bookings',                route: '/dashboard/bookings' },
  { id: 'feat-customers-seg',  label: 'Customer Segments',       route: '/dashboard/customers' },
  { id: 'feat-weekly-reports', label: 'Weekly Reports',          route: '/dashboard/weekly-reports' },
  { id: 'feat-ask-aria',       label: 'Ask Aria',                route: '/dashboard/ask-aria' },
  { id: 'feat-loyalty',        label: 'Loyalty Program',         route: '/dashboard/loyalty' },
  { id: 'feat-promotions',     label: 'Promotions',              route: '/dashboard/promotions' },
  { id: 'feat-gift-cards',     label: 'Gift Cards',              route: '/dashboard/gift-cards' },
  { id: 'feat-staff',          label: 'Staff',                   route: '/dashboard/staff' },
  { id: 'feat-invoices',       label: 'Invoices',                route: '/dashboard/invoices' },
  { id: 'feat-cash-flow',      label: 'Cash Flow',               route: '/dashboard/cash-flow' },
  { id: 'feat-dynamic-pricing',label: 'Dynamic Pricing',         route: '/dashboard/dynamic-pricing' },
  { id: 'feat-missed-demand',  label: 'Missed Demand',           route: '/dashboard/missed-demand' },
  { id: 'feat-reorder',        label: 'Reorder Suggestions',     route: '/dashboard/reorder' },
  { id: 'feat-slow-day',       label: 'Slow Day Predictor',      route: '/dashboard/slow-day' },
  { id: 'feat-hypotheses',     label: 'Growth Hypotheses',       route: '/dashboard/hypotheses' },
  { id: 'feat-autopilot',      label: 'Autopilot',               route: '/dashboard/autopilot' },
  { id: 'feat-stocktake',      label: 'Stocktake',               route: '/dashboard/stocktake' },
  { id: 'feat-winback',        label: 'Winback Campaigns',       route: '/dashboard/winback' },
  { id: 'feat-shift-reports',  label: 'Shift Reports',           route: '/dashboard/shift-reports' },
  { id: 'feat-integrations',   label: 'Integrations',            route: '/dashboard/integrations' },
]

// CANOPY-REPORTS-AS-FILES-1 — Files app display labels for canopy_saved_reports.source_kind, and
// colors for its grounding tag (the Business Truth typing principle applied at this sprint's
// scale — design/ARIA-ENVIRONMENT-BUILD-PLAN.md's locked "verified/derived/estimated" tag).
const FILE_SOURCE_LABEL: Record<string, string> = {
  ask_aria_deliverable: 'Ask Aria', weekly_report: 'Weekly Report', daily_briefing: 'Daily Briefing', profit_leaks: 'Profit Leaks',
}
const FILE_GROUNDING_COLOR: Record<string, string> = { verified: '#7A8C1E', derived: '#3C7A89', estimated: '#BA7517' }

// Real cropped logo icons (design/icon-sprite-sheet.png, 5x3 grid) — Aria-native apps only. xero and
// store have no sprite crop (third-party/store, not brand-iconed) and fall back to the SVG glyph.
// Served from Vite's public/ dir (src/renderer/public/icons/) as plain relative string paths rather
// than ES-module imports — TS's "bundler" moduleResolution doesn't fall back to an ambient
// `declare module '*.png'` wildcard for relative asset imports the way classic/node resolution does,
// so a typed import here hits a hard TS2307. A relative runtime string sidesteps that entirely and
// resolves correctly under both the dev server and the packaged file:// build (electron-vite sets
// base:'./' for the renderer).
const ICON_IDS = ['ariaos', 'pos', 'orders', 'customers', 'inventory', 'reports', 'finance', 'kitchen', 'marketing', 'suppliers', 'ariaai', 'team', 'files', 'help', 'settings'] as const
const APP_ICONS: Record<string, string> = Object.fromEntries(ICON_IDS.map((id) => [id, `./icons/${id}.png`]))

const GLYPH: Record<string, JSX.Element> = {
  brain: <path d="M9 4.5a2.5 2.5 0 0 0-2.5 2.5V8a2.5 2.5 0 0 0 0 5v1a2.5 2.5 0 0 0 2.5 2.5M15 4.5A2.5 2.5 0 0 1 17.5 7V8a2.5 2.5 0 0 1 0 5v1a2.5 2.5 0 0 1-2.5 2.5M9 4.5h6M9 19.5h6" />,
  cart: <><circle cx="9" cy="19" r="1.3" /><circle cx="16" cy="19" r="1.3" /><path d="M3.5 5h2l2 10h9.5l1.8-7.5H6.2" /></>,
  chart: <><path d="M4.5 19h15" /><path d="M7.5 19v-6M12 19V8M16.5 19v-9" /></>,
  book: <><path d="M5.5 4.5h11a1.8 1.8 0 0 1 1.8 1.8V19H8a1.8 1.8 0 0 1-1.8-1.8V4.5z" /><path d="M5.5 16.5A1.8 1.8 0 0 1 7.3 15h9.6" /></>,
  receipt: <><path d="M6.5 3.5h11v17l-2-1.4-1.8 1.4-1.8-1.4-1.8 1.4-1.8-1.4-1.8 1.4v-17z" /><path d="M9.5 8.5h5M9.5 12h5" /></>,
  box: <><path d="M12 3.5l7.5 4v9L12 20.5 4.5 16.5v-9L12 3.5z" /><path d="M4.8 7.7L12 11.5l7.2-3.8M12 11.5V20" /></>,
  bag: <><path d="M6.5 8h11l-1 11h-9L6.5 8z" /><path d="M9.3 8a2.7 2.7 0 0 1 5.4 0" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19.5c.6-3.2 2.7-4.8 5.5-4.8s4.9 1.6 5.5 4.8" /><path d="M15.5 5.3a3 3 0 0 1 0 5.4M17 14.7c1.9.7 3 2.1 3.4 4.3" /></>,
  users2: <><circle cx="8" cy="8.5" r="3" /><circle cx="16" cy="8.5" r="3" /><path d="M3 19c.6-3 2.5-4.5 5-4.5s4.4 1.5 5 4.5M11 19c.6-3 2.5-4.5 5-4.5s4.4 1.5 5 4.5" /></>,
  folder: <path d="M3.5 6.5A1.8 1.8 0 0 1 5.3 4.7H9.5l2 2.3H18.7a1.8 1.8 0 0 1 1.8 1.8V17a1.8 1.8 0 0 1-1.8 1.8H5.3A1.8 1.8 0 0 1 3.5 17V6.5z" />,
  help: <><circle cx="12" cy="12" r="8.5" /><path d="M9.5 9.3a2.5 2.5 0 0 1 4.9.6c0 1.7-2.4 1.9-2.4 3.6" /><circle cx="12" cy="16.7" r=".3" fill="currentColor" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.3M12 18.2v2.3M20.5 12h-2.3M5.8 12H3.5M17.8 6.2l-1.6 1.6M7.8 16.2l-1.6 1.6M17.8 17.8l-1.6-1.6M7.8 7.8L6.2 6.2" /></>,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="1.8" /><circle cx="9" cy="10" r="1.6" /><path d="M4.5 16.5l4.5-4.5 3 3 3.5-4.5 5 6" /></>,
  sheet: <><rect x="4.5" y="3.5" width="15" height="17" rx="1.5" /><path d="M4.5 9h15M9.5 9v11.5" /></>,
  pdf: <><path d="M6 3.5h8l4 4v13H6z" /><path d="M14 3.5V7.5h4" /><path d="M8.3 17.3v-3.6h1.1a1.1 1.1 0 0 1 0 2.2H8.3M12 13.7v3.6h.9a1.6 1.6 0 0 0 0-3.6zM16 17.3v-3.6h1.8M16 15.5h1.5" /></>,
  note: <><rect x="4.5" y="3.5" width="15" height="17" rx="1.5" /><path d="M7.5 8h9M7.5 12h9M7.5 16h5.5" /></>,
  chat: <path d="M4.5 5.5h15a1.4 1.4 0 0 1 1.4 1.4V15a1.4 1.4 0 0 1-1.4 1.4H10l-4 3v-3H4.5A1.4 1.4 0 0 1 3.1 15V6.9a1.4 1.4 0 0 1 1.4-1.4z" />,
  dollar: <><circle cx="12" cy="12" r="8.5" /><path d="M12 6.5v11M15 9a3 3 0 0 0-3-1.5c-1.8 0-3 1-3 2.3 0 3 6 1.5 6 4.5 0 1.3-1.4 2.2-3 2.2a3.3 3.3 0 0 1-3-1.5" /></>,
  chef: <><path d="M7 21h10M8 21v-6.3M16 21v-6.3" /><path d="M6 10.5a3 3 0 0 1 1-5.8 3.4 3.4 0 0 1 6 0 3 3 0 0 1 5 2.3 3 3 0 0 1-.4 3.7c.5.6.9 1.4.9 2.3 0 2-2.5 3.5-5.5 3.5s-5.5-1.5-5.5-3.5c0-.8.2-1.5.5-2.1z" /></>,
  megaphone: <><path d="M3.5 10v4a1.5 1.5 0 0 0 1.5 1.5h1l2.5 4.5V5.5L6 10H5A1.5 1.5 0 0 0 3.5 10z" /><path d="M13 6a13 13 0 0 1 7-3v18a13 13 0 0 1-7-3z" /><path d="M8.5 15.5v3a1.5 1.5 0 0 0 3 0v-2" /></>,
  truck: <><path d="M3.5 7h9v9h-9z" /><path d="M12.5 10.5h4l3 3V16h-7z" /><circle cx="7" cy="18" r="1.6" /><circle cx="16.5" cy="18" r="1.6" /></>,
}
const G = ({ id, s = 17 }: { id: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">{GLYPH[id]}</svg>
)
// CANOPY-POLISH-1 item 3 — investigated before fixing: rendered a real screenshot comparison
// (object-fit cover vs contain at production size, plus a raw-pixel scan of the PNGs themselves).
// object-fit/image-rendering were NOT the cause — no visible difference between cover/contain, and
// the 256px+ source has far more resolution than a 30-34px render needs. The actual defect is in
// the source PNGs: design/icon-sprite-sheet.png has no alpha channel at all (flat RGB), so the
// auto-crop's background-color-threshold alpha synthesis couldn't separate each icon's own soft
// drop-shadow (rendered against the sheet's light canvas) from true transparency — the result is a
// soft, partly fully-opaque, near-white halo baked into the outer ~15% margin of every icon,
// invisible on the sheet's own light background but visibly "washed out" against the dock's dark
// background. Recoloring the baked-in pixels (alpha decontamination) was tried and rejected — it's
// numerically unstable at low alpha and risks new, unverifiable artifacts across 15 files. This
// zoom-crop is CSS-only, fully reversible, and verified via rendered screenshots across 6
// differently-shaped icons: it trims exactly the halo margin with zero glyph clipping.
const ICON_ZOOM = 1.32
const ICON_ZOOM_OFFSET_PCT = (ICON_ZOOM - 1) * 50 // centers the zoomed image within its frame

// Real logo PNG when the sprite has one; falls back to the programmatic colored-glyph badge otherwise.
const AppLogo = ({ app, s = 34, radius = 10 }: { app: App; s?: number; radius?: number }) => {
  const icon = APP_ICONS[app.id]
  if (icon) {
    return (
      <div style={{ width: s, height: s, borderRadius: radius, overflow: 'hidden', flexShrink: 0, boxShadow: '0 2px 6px rgba(0,0,0,.35)' }}>
        <img src={icon} alt={app.label} style={{
          width: `${ICON_ZOOM * 100}%`, height: `${ICON_ZOOM * 100}%`, objectFit: 'cover', display: 'block',
          marginLeft: `-${ICON_ZOOM_OFFSET_PCT}%`, marginTop: `-${ICON_ZOOM_OFFSET_PCT}%`,
        }} />
      </div>
    )
  }
  return (
    <div style={{ width: s, height: s, borderRadius: radius, background: app.badge, display: 'grid', placeItems: 'center', flexShrink: 0, boxShadow: '0 2px 6px rgba(0,0,0,.35)' }}>
      {app.glyph === 'mark'
        ? <span style={{ color: app.fg, transform: 'scale(.72)' }}><AMark s={Math.round(s * 0.62)} /></span>
        : <span style={{ color: app.fg }}><G id={app.glyph} s={Math.round(s * 0.52)} /></span>}
    </div>
  )
}

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
  ['#1024', 'Takeaway · 2 items', '$14.20', '15 min', 'rgba(22,36,28,.4)'],
  ['#1023', 'Online · 6 items', '$62.00', '22 min', 'rgba(22,36,28,.4)'],
]
const INVENTORY: Array<[string, string, string]> = [
  ['Milk 2L', '2 days cover', P.red], ['Oat milk', 'reorder waiting', P.amber],
  ['House roast beans', '6.2kg · healthy', A.sage], ['Cups 8oz', '4 days cover', A.sage],
  ['Banana bread loaf', '3 units left', P.amber], ['Croissants (frozen)', '48 units · healthy', A.sage],
  ['Chai concentrate', '1.5L · healthy', A.sage], ['Takeaway lids', '6 days cover', A.sage],
]
const CUSTOMERS: Array<[string, string, string]> = [
  ['Maya K.', 'Gold · 3 visits/wk', '$23.50 preload'], ['Tom R.', 'Silver · quiet 3wks', 'winback staged'],
  ['Priya S.', 'New this week', '2 visits'], ['Leo M.', 'Bronze · regular', '4 visits/wk'],
  ['Aisha N.', 'Gold · 2yr member', '812 pts'],
]
const DESKTOP_ICONS: Array<[string, string]> = [
  ['folder', 'My Drive'], ['image', 'Store Photos'], ['sheet', 'Daily Report.xlsx'],
  ['pdf', 'Suppliers.pdf'], ['note', 'Notes'], ['chat', 'Team Chat'],
]

export default function App() {
  const [boot, setBoot] = useState(0)
  const [ready, setReady] = useState(false)
  const [wins, setWins] = useState<string[]>([])
  const [launcherOpen, setLauncherOpen] = useState(false)
  // CANOPY-UNIVERSAL-SEARCH-1 — the launcher's search bar was decorative (a static label, no real
  // <input>) until now; this is the actual query state it filters ALL_APPS and ARIA_FEATURES by.
  const [searchQuery, setSearchQuery] = useState('')
  const [locked, setLocked] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const [justUnlocked, setJustUnlocked] = useState(false)
  const [role, setRole] = useState<'owner' | 'staff'>('owner')
  // CANOPY-POLISH-1 item 4 — Exit Canopy is deliberately gated behind a FRESH owner PIN entry, not
  // just the ambient `role === 'owner'` state (which the Settings window's own visibility already
  // requires to reach this button at all — STAFF_VISIBLE never includes 'settings'). Same reasoning
  // as the lock screen itself: quitting a kiosk-mode business register is significant enough to
  // warrant a deliberate re-authentication step, not a single tap.
  const [exitConfirm, setExitConfirm] = useState(false)
  const [exitPin, setExitPin] = useState('')
  const [exitPinError, setExitPinError] = useState(false)
  const [clock, setClock] = useState('')
  const [business, setBusiness] = useState<CurrentBusiness | null>(null)
  const [feed, setFeed] = useState<ActivityItem[]>([])
  const [todaySalesCents, setTodaySalesCents] = useState<number | null>(null)
  const [issues, setIssues] = useState<string[]>([])
  // CANOPY-REPORTS-AS-FILES-1 — Files app's real per-business saved reports (item 2). Fetched
  // lazily when Files is actually opened, not on every boot — unlike the ambient feed/health/sales
  // above, nothing on the default desktop needs this.
  const [savedReports, setSavedReports] = useState<SavedReport[]>([])
  const [reportsLoading, setReportsLoading] = useState(false)
  // CANOPY-REPORTS-AS-FILES-1 — per-report export-in-progress/result status shown under each row
  // (item 4), keyed by report id since multiple exports could be triggered independently.
  const [exportStatus, setExportStatus] = useState<Record<string, string>>({})

  useEffect(() => {
    const t = setInterval(() => setBoot((p) => Math.min(100, p + 5)), 46)
    return () => clearInterval(t)
  }, [])

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

  // CANOPY-REPORTS-AS-FILES-1 item 2 — loads real saved reports only once Files is actually opened
  // (the `wins` array gains 'files' when its dock/launcher entry is clicked, same as every other
  // in-Canopy Win), not on every boot like the always-visible ambient feed above.
  useEffect(() => {
    if (!ready || !business || !wins.includes('files')) return
    let cancelled = false
    setReportsLoading(true)
    window.canopyAPI.getSavedReports().then((reports) => {
      if (!cancelled) setSavedReports(reports)
    }).finally(() => { if (!cancelled) setReportsLoading(false) })
    return () => { cancelled = true }
  }, [ready, business, wins])

  // CANOPY-REPORTS-AS-FILES-1 item 4 — real Windows-side export via the main process's native save
  // dialog + net.fetch/writeFile (src/main/export.ts); the PDF's own URL is already public (Vercel
  // Blob), so the renderer just hands it and a sanitized filename to the main process.
  const exportReport = useCallback((r: SavedReport) => {
    const suggestedName = r.title.replace(/[\\/:*?"<>|]/g, '_') + '.pdf'
    setExportStatus((s) => ({ ...s, [r.id]: 'Exporting…' }))
    window.canopyAPI.exportReport(r.pdf_url, suggestedName).then((res) => {
      if (res.canceled) {
        setExportStatus((s) => { const n = { ...s }; delete n[r.id]; return n })
      } else if (res.ok) {
        setExportStatus((s) => ({ ...s, [r.id]: 'Saved to Windows — ' + (res.path ?? suggestedName) }))
      } else {
        setExportStatus((s) => ({ ...s, [r.id]: '⚠ ' + (res.error ?? 'Export failed') }))
      }
    })
  }, [])

  useEffect(() => window.canopyAPI.onAppClosed((kind) => setWins((w) => w.filter((id) => id !== kind))), [])

  const open = useCallback((id: string) => {
    const app = ALL_APPS.find((a) => a.id === id)
    if (app?.real) window.canopyAPI.openApp(app.real)
    setWins((w) => [...w.filter((x) => x !== id), id])
    setLauncherOpen(false)
    setSearchQuery('')
  }, [])

  const close = useCallback((id: string) => {
    const app = ALL_APPS.find((a) => a.id === id)
    if (app?.real) window.canopyAPI.closeApp(app.real)
    setWins((w) => w.filter((x) => x !== id))
  }, [])

  // CANOPY-UNIVERSAL-SEARCH-1 — opens a real AriaOS feature page as a real window, using the exact
  // same mechanism as AriaOS/POS (openApp -> the main-process WebContentsView pane). Deliberately
  // separate from `open()` above rather than folding features into ALL_APPS/id lookup: features
  // have no dock icon, no `wins`-tracked in-Canopy Win, and no running-dot indicator to maintain —
  // this is a pure deep-link, not a dock app. Passing `route`/`title` explicitly is what lets
  // openApp (extended, additively, in main/windows.ts) open an arbitrary page instead of only the
  // two fixed 'ariaos'/'pos' kinds; existing callers that omit these two fields are unaffected.
  const openFeature = useCallback((feature: AriaFeature) => {
    window.canopyAPI.openApp(feature.id, { route: feature.route, title: feature.label })
    setLauncherOpen(false)
    setSearchQuery('')
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
        if (attempt !== pi.current) return
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

  const xi = useRef(0)
  const pressExitPin = (d: string) => {
    const next = (exitPin + d).slice(0, 4)
    setExitPin(next)
    if (next.length === 4) {
      xi.current += 1
      const attempt = xi.current
      if (!business) { setTimeout(() => setExitPin(''), 200); return }
      window.canopyAPI.verifyPin(business.id, next).then((result) => {
        if (attempt !== xi.current) return
        // Owner scope specifically — a valid STAFF pin must not be able to quit the kiosk app.
        if (result.valid && result.scope === 'owner') {
          window.canopyAPI.exitApp()
        } else {
          setExitPinError(true)
          setTimeout(() => { setExitPin(''); setExitPinError(false) }, 420)
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
      {/* track uses P.line, not the reference's leftover dark-theme rgba(250,250,250,.12) — that value
          reads as near-invisible on this sprint's light background */}
      <div style={{ width: 210, height: 2, background: P.line, borderRadius: 99, marginTop: 26 }}>
        <div style={{ width: boot + '%', height: 2, background: P.lime, borderRadius: 99, transition: 'width .1s linear' }} />
      </div>
    </div>
  )

  const Win = ({ id, title, ariaApp = false, w = 480, h = 400, x = 300, y = 90, pad = true, scroll = true, children }: {
    id: string; title: string; ariaApp?: boolean; w?: number; h?: number; x?: number; y?: number; pad?: boolean; scroll?: boolean; children: React.ReactNode
  }) => {
    const z = wins.indexOf(id)
    if (z < 0) return null
    return (
      <div onMouseDown={() => open(id)} style={{
        position: 'absolute', left: x + z * 26, top: y + z * 18, width: w, height: h, maxWidth: '95vw', maxHeight: '84vh',
        background: P.surface, border: `1px solid ${P.line}`, borderRadius: 14,
        boxShadow: '0 24px 70px rgba(0,0,0,.6)', zIndex: 20 + z,
        display: 'flex', flexDirection: 'column', overflow: 'hidden', color: P.ink, animation: 'winIn .22s cubic-bezier(.2,.85,.25,1.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', height: 34, background: '#e7e5df', borderBottom: '1px solid rgba(0,0,0,.08)', flexShrink: 0, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 14 }}>
            <div onClick={(e) => { e.stopPropagation(); close(id) }} style={{ width: 12, height: 12, borderRadius: 99, background: '#ff5f57', cursor: 'pointer' }} />
            <div style={{ width: 12, height: 12, borderRadius: 99, background: '#ffbd2e' }} />
            <div style={{ width: 12, height: 12, borderRadius: 99, background: '#28c840' }} />
          </div>
          <span style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', fontSize: 12.5, fontWeight: 500, color: 'rgba(20,20,20,.62)' }}>{title}</span>
        </div>
        <div style={{ flex: 1, overflowY: scroll ? 'auto' : 'hidden', padding: pad ? 16 : 0, background: ariaApp ? A.paper : 'transparent', display: 'flex', flexDirection: 'column' }}>{children}</div>
      </div>
    )
  }

  const SageCard = ({ k, v, s, vc = '#16241C' }: { k: string; v: string; s: string; vc?: string }) => (
    <div style={{ background: A.card, border: `1px solid ${A.line}`, borderRadius: 10, padding: '11px 12px', flex: 1 }}>
      <div style={{ fontSize: 10.5, color: 'rgba(22,36,28,.55)' }}>{k}</div>
      <div style={{ fontFamily: ariaSerif, fontSize: 20, fontWeight: 700, color: vc, margin: '2px 0', ...num }}>{v}</div>
      <div style={{ fontSize: 10, color: 'rgba(22,36,28,.5)' }}>{s}</div>
    </div>
  )
  const Row = ({ l, r, rc = '#16241C', sub }: { l: string; r: string; rc?: string; sub?: string }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${A.line}`, fontSize: 12.5 }}>
      <div><div style={{ color: 'rgba(22,36,28,.85)' }}>{l}</div>{sub && <div style={{ fontSize: 10.5, color: 'rgba(22,36,28,.45)', marginTop: 1 }}>{sub}</div>}</div>
      <b style={{ color: rc, ...num }}>{r}</b>
    </div>
  )
  const Placeholder = ({ title, blurb }: { title: string; blurb: string }) => (
    <>
      <div style={{ fontFamily: ariaSerif, fontSize: 18, fontWeight: 700, color: '#16241C', marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 11.5, color: 'rgba(22,36,28,.6)', lineHeight: 1.6 }}>{blurb}</div>
    </>
  )

  const salesLabel = todaySalesCents == null ? '—' : `$${(todaySalesCents / 100).toFixed(2)}`
  const businessName = business?.name ?? 'Your business'

  return (
    <div style={{ height: '100vh', overflow: 'hidden', position: 'relative', fontFamily: sans, ...wallpaper }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Cormorant+Garamond:wght@600;700&display=swap');
        @keyframes winIn { from { opacity:0; transform: scale(.96) translateY(8px);} to { opacity:1; transform:none;} }
        @keyframes rise { from { opacity:0; transform: translateY(8px);} to { opacity:1; transform:none;} }
        @keyframes pulseRing { 0%,100%{ box-shadow:0 0 0 0 rgba(217,245,78,.3);} 50%{ box-shadow:0 0 0 9px rgba(217,245,78,0);} }
        @keyframes shake { 0%,100%{ transform: translateX(0);} 25%{ transform: translateX(-6px);} 75%{ transform: translateX(6px);} }
        .dock-scroll::-webkit-scrollbar { display: none; }
        .dock-scroll { scrollbar-width: none; }
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
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(245,243,236,.97)', zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
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

      {/* CANOPY-POLISH-1 item 4 — Exit Canopy confirmation. Reuses the lock screen's PIN-pad
          pattern but is its own separate flow: entering a PIN here never unlocks/changes `role`,
          it only ever calls exitApp() on a verified OWNER pin, or shakes/rejects otherwise
          (including a valid STAFF pin — quitting the kiosk is owner-only). Cancelable, unlike the
          lock screen, since this sits on top of an already-unlocked owner session. */}
      {exitConfirm && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(245,243,236,.97)', zIndex: 210, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => { setExitConfirm(false); setExitPin('') }} style={{ position: 'absolute', top: 20, right: 24, fontSize: 12, color: P.dim, cursor: 'pointer', padding: '6px 10px', borderRadius: 6 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = P.ink)} onMouseLeave={(e) => (e.currentTarget.style.color = P.dim)}>Cancel</div>
          <div style={{ width: 74, height: 74, borderRadius: '50%', background: 'rgba(209,69,59,.1)', display: 'grid', placeItems: 'center', marginBottom: 8 }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={P.red} strokeWidth="1.8"><path d="M9 4.5H6.5A1.8 1.8 0 0 0 4.7 6.3v11.4A1.8 1.8 0 0 0 6.5 19.5H9" /><path d="M15 8l4 4-4 4" /><path d="M19 12H9" /></svg>
          </div>
          <div style={{ color: P.ink, fontSize: 16, fontWeight: 600 }}>Exit Canopy</div>
          <div style={{ color: P.dim, fontSize: 11.5, marginTop: 3, marginBottom: 22 }}>Enter the owner PIN to quit — this closes the register.</div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 26, animation: exitPinError ? 'shake .3s' : undefined }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ width: 13, height: 13, borderRadius: 99, border: `1.5px solid ${exitPinError ? P.red : P.line}`, background: i < exitPin.length ? (exitPinError ? P.red : P.red) : 'transparent' }} />
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 62px)', gap: 12 }}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((d, i) => d === '' ? <div key={i} /> : (
              <button key={i} onClick={() => (d === '⌫' ? setExitPin((p) => p.slice(0, -1)) : pressExitPin(d))} style={{
                width: 62, height: 62, borderRadius: '50%', border: `1px solid ${P.line}`, background: P.raised, color: P.ink, fontSize: 18, cursor: 'pointer', fontFamily: sans,
              }}>{d}</button>
            ))}
          </div>
        </div>
      )}

      {role === 'owner' && <div style={{ position: 'absolute', left: 20, top: 50, display: 'grid', gap: 16, width: 90 }}>
        {DESKTOP_ICONS.map(([ic, label]) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ width: 40, height: 40, borderRadius: 9, background: P.surface, border: `1px solid ${P.line}`, display: 'grid', placeItems: 'center', boxShadow: '0 1px 3px rgba(20,20,16,.08)' }}>
              <G id={ic} s={19} />
            </div>
            <span style={{ fontSize: 10, color: P.dim, lineHeight: 1.2 }}>{label}</span>
          </div>
        ))}
      </div>}

      {/* CANOPY-POLISH-1 item 2 — was `top: 570` with no lower bound, so its content could grow
          straight into the dock's space once desktop icons pushed everything below them and the
          real screen was shorter than whatever this was eyeballed against. `bottom: DOCK_CLEARANCE`
          (the dock's own real, computed footprint — see the constant's definition above) reserves
          the dock's space on every window size, and overflowY:'auto' means if content ever DID
          exceed the resulting height, it scrolls inside this panel instead of pushing into the
          dock — it can no longer collide with the dock, full stop, regardless of resolution. */}
      {role === 'owner' && <div style={{ position: 'absolute', left: 20, top: 570, bottom: DOCK_CLEARANCE, width: 258, overflowY: 'auto', animation: 'rise .4s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: P.surface, border: `1px solid ${P.line}`, borderRadius: 12, padding: '8px 11px' }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: P.surface, border: `1px solid ${P.line}`, display: 'grid', placeItems: 'center', animation: 'pulseRing 3s infinite' }}><AMark s={15} /></div>
          <div style={{ fontSize: 11.5, fontWeight: 600 }}>Aria is watching the business</div>
        </div>
        {feed.length === 0 && (
          <div style={{ fontSize: 10.5, color: P.faint, padding: '10px 2px' }}>No recent activity yet.</div>
        )}
        {feed.map((e, i) => (
          <div key={e.id} style={{ display: 'flex', gap: 9, background: i === 0 ? P.limeSoft : P.surface, border: `1px solid ${i === 0 ? 'rgba(217,245,78,.28)' : P.line}`, borderRadius: 11, padding: '8px 10px', marginTop: 6, opacity: 1 - i * 0.2 }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: i === 0 ? P.lime : 'rgba(20,20,16,.06)', color: i === 0 ? '#0a0a0a' : P.dim, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
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
        {/* Weather is decorative, matching the design file's own static value — no live weather
            source exists in this codebase, and wiring one is a feature build, out of this sprint's
            chrome/dock-only scope. */}
        <div style={{ background: P.surface, border: `1px solid ${P.line}`, borderRadius: 13, padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>☀️</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, ...num }}>24°C</div>
            <div style={{ fontSize: 10, color: P.faint }}>Melbourne</div>
          </div>
        </div>
      </div>}

      {wins.length === 0 && !launcherOpen && (
        <div style={{ position: 'absolute', left: '50%', top: '46%', transform: 'translate(-50%,-50%)', textAlign: 'center', animation: 'rise .5s ease' }}>
          <div style={{ width: 100, height: 100, display: 'grid', placeItems: 'center', margin: '0 auto' }}><AMark s={92} /></div>
          <div style={{ color: P.ink, fontSize: 25, fontWeight: 600, letterSpacing: '0.28em', marginTop: 14 }}>CANOPY</div>
          <div style={{ color: P.faint, fontSize: 11, letterSpacing: '0.16em', marginTop: 8 }}>THE INTELLIGENT ENVIRONMENT FOR YOUR BUSINESS</div>
          <div onClick={() => setLauncherOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: 420, maxWidth: '80vw', margin: '22px auto 0', background: P.raised, border: `1px solid ${P.line}`, borderRadius: 12, padding: '12px 15px', cursor: 'pointer' }}>
            <span style={{ color: P.faint }}>⌕</span>
            <span style={{ color: P.dim, fontSize: 13 }}>Ask Aria, or open an app…</span>
            <span style={{ marginLeft: 'auto', fontSize: 10.5, color: P.faint, border: `1px solid ${P.line}`, borderRadius: 5, padding: '2px 6px' }}>⌘K</span>
          </div>
        </div>
      )}

      {launcherOpen && (() => {
        // CANOPY-UNIVERSAL-SEARCH-1 — the search bar below now actually filters: dock apps by the
        // existing ALL_APPS list (unchanged behaviour when the query is empty — same full list as
        // before), plus, once there's a query, real AriaOS feature pages from ARIA_FEATURES.
        // Features are owner-only (matches every other business-intelligence surface in this app)
        // and only ever surface as search RESULTS, never as a permanent always-visible list, so the
        // default (no-query) launcher is pixel-identical to before this sprint.
        const q = searchQuery.trim().toLowerCase()
        const appResults = (role === 'owner' ? ALL_APPS : ALL_APPS.filter((a) => STAFF_VISIBLE.includes(a.id)))
          .filter((a) => !q || a.label.toLowerCase().includes(q))
        const featureResults = role === 'owner' && q
          ? ARIA_FEATURES.filter((f) => f.label.toLowerCase().includes(q))
          : []
        return (
          <div onClick={() => { setLauncherOpen(false); setSearchQuery('') }} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 140 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: 440, maxHeight: '60vh', overflowY: 'auto', background: P.surface, border: `1px solid ${P.line}`, borderRadius: 14, padding: 14, boxShadow: '0 30px 80px rgba(0,0,0,.6)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: P.raised, border: `1px solid ${P.line}`, borderRadius: 10, padding: '10px 13px', marginBottom: 10, position: 'sticky', top: 0 }}>
                <span style={{ color: P.faint }}>⌕</span>
                <input autoFocus value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ask Aria, or open an app…"
                  style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: P.ink, fontSize: 13, fontFamily: sans }} />
              </div>
              {appResults.map((a) => (
                <div key={a.id} onClick={() => open(a.id)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 8px', borderRadius: 8, cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = P.raised)} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                  <AppLogo app={a} s={30} radius={8} />
                  <span style={{ fontSize: 13 }}>{a.label}</span>
                  {a.aria && <span style={{ marginLeft: 'auto', fontSize: 8.5, color: A.sage, letterSpacing: '.08em' }}>ARIAOS</span>}
                </div>
              ))}
              {featureResults.length > 0 && (
                <>
                  <div style={{ fontSize: 9.5, color: P.faint, letterSpacing: '.08em', margin: '10px 8px 4px', textTransform: 'uppercase' }}>AriaOS features</div>
                  {featureResults.map((f) => (
                    <div key={f.id} onClick={() => openFeature(f)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 8px', borderRadius: 8, cursor: 'pointer' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = P.raised)} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: A.card, border: `1px solid ${A.line}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        <G id="chart" s={15} />
                      </div>
                      <span style={{ fontSize: 13 }}>{f.label}</span>
                      {/* Distinct from dock apps' "ARIAOS" tag (which marks first-party branding) — this
                          marks the result TYPE, so a feature never reads as if it were a dock app. */}
                      <span style={{ marginLeft: 'auto', fontSize: 8.5, color: P.faint, letterSpacing: '.08em' }}>ARIAOS FEATURE</span>
                    </div>
                  ))}
                </>
              )}
              {q && appResults.length === 0 && featureResults.length === 0 && (
                <div style={{ fontSize: 12, color: P.faint, padding: '10px 8px' }}>No matches for "{searchQuery}".</div>
              )}
            </div>
          </div>
        )
      })()}

      {/* AriaOS + POS are real separate BrowserWindows (SHELL-1 scope, unchanged) — no in-page Win. */}

      <Win id="ariaai" title="Aria AI" ariaApp w={600} h={430} x={220} y={70}>
        <div style={{ fontFamily: ariaSerif, fontSize: 23, fontWeight: 700, color: '#16241C' }}>Morning, {businessName}</div>
        <div style={{ fontSize: 11.5, color: 'rgba(22,36,28,.55)', marginTop: 3, marginBottom: 14 }}>Ask Aria anything about the business from inside AriaOS — open it from the dock to start.</div>
        <button onClick={() => open('ariaos')} style={{ alignSelf: 'flex-start', padding: '9px 16px', border: 'none', borderRadius: 8, background: A.deep, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: sans }}>Open AriaOS</button>
      </Win>

      <Win id="orders" title="Orders" ariaApp w={480} h={440} x={330} y={110}>
        <div style={{ fontFamily: ariaSerif, fontSize: 20, fontWeight: 700, color: '#16241C', marginBottom: 10 }}>Live queue — 6 open</div>
        {ORDERS.map(([id, desc, price, mins, c]) => (
          <Row key={id} l={`${id} · ${desc}`} r={price} rc={c} sub={`${mins} ago`} />
        ))}
      </Win>

      <Win id="inventory" title="Inventory" ariaApp w={480} h={430} x={350} y={90}>
        <div style={{ fontFamily: ariaSerif, fontSize: 20, fontWeight: 700, color: '#16241C', marginBottom: 10 }}>Stock overview</div>
        {INVENTORY.map(([n, s, c]) => (
          <div key={n} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${A.line}`, fontSize: 12.5 }}>
            <b style={{ color: '#16241C' }}>{n}</b><span style={{ color: c, fontSize: 11.5 }}>{s}</span>
          </div>
        ))}
      </Win>

      <Win id="customers" title="Customers" ariaApp w={460} h={400} x={370} y={100}>
        <div style={{ fontFamily: ariaSerif, fontSize: 20, fontWeight: 700, color: '#16241C', marginBottom: 10 }}>318 total · 12 in today</div>
        {CUSTOMERS.map(([n, tier, note]) => (
          <Row key={n} l={n} sub={tier} r={note} rc={A.sage} />
        ))}
      </Win>

      <Win id="reports" title="Reports" ariaApp w={600} h={460} x={370} y={80}>
        <div style={{ fontFamily: ariaSerif, fontSize: 22, fontWeight: 700, color: '#16241C' }}>Reports</div>
        <div style={{ fontSize: 11, color: 'rgba(22,36,28,.5)', margin: '3px 0 12px' }}>Live performance, without turning the desktop into a dashboard.</div>
        <div style={{ display: 'flex', gap: 9, marginBottom: 14 }}>
          <SageCard k="Revenue" v="$4,782" s="+18.6%" />
          <SageCard k="Margin" v="42%" s="Healthy" />
          <SageCard k="Labour" v="22%" s="Within target" />
        </div>
        <div style={{ background: A.card, border: `1px solid ${A.line}`, borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'rgba(22,36,28,.55)', marginBottom: 6 }}>Sales — last 7 days</div>
          <svg width="100%" height="60" viewBox="0 0 320 60" preserveAspectRatio="none">
            <polyline points="0,44 45,38 90,42 135,24 180,30 225,14 270,20 315,8" fill="none" stroke={A.sage} strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#16241C', marginBottom: 6 }}>Top sellers this week</div>
        {[['Cappuccino', '89 sold'], ['Flat White', '74 sold'], ['Avo Toast', '45 sold'], ['Banana Bread', '38 sold']].map(([n, s]) => (
          <Row key={n} l={n} r={s} rc={A.sage} />
        ))}
      </Win>

      <Win id="finance" title="Finance" ariaApp w={460} h={340} x={340} y={100}>
        <Placeholder title="Finance" blurb="P&L, cash flow, and reconciliation land here in a later sprint. For live numbers today, use AriaOS → Reports." />
      </Win>
      <Win id="kitchen" title="Kitchen" ariaApp w={460} h={340} x={360} y={110}>
        <Placeholder title="Kitchen" blurb="The kitchen display ticket queue lands here in a later sprint. Kitchen tickets print from Orders today." />
      </Win>
      <Win id="marketing" title="Marketing" ariaApp w={460} h={340} x={380} y={90}>
        <Placeholder title="Marketing" blurb="Campaigns, reels, and reach tools land here in a later sprint. Winback and promo actions live in Aria AI's approvals today." />
      </Win>
      <Win id="suppliers" title="Suppliers" ariaApp w={460} h={340} x={330} y={120}>
        <Placeholder title="Suppliers" blurb="Supplier ordering and delivery tracking land here in a later sprint. Reorder suggestions surface in Aria AI today." />
      </Win>

      <Win id="xero" title="Xero" w={520} h={400} x={390} y={120}>
        {[['Invoices owed to you', '$2,140'], ['Bills to pay', '$3,615'], ['Bank — reconciled nightly', '$18,204'], ['GST set aside', '$3,120'], ["This month's revenue", '$61,240'], ["This month's expenses", '$38,900']].map(([l, r]) => (
          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${P.line}`, fontSize: 12.5, ...num }}>
            <span style={{ color: P.dim }}>{l}</span><b>{r}</b>
          </div>
        ))}
        <div style={{ fontSize: 11, color: P.faint, marginTop: 12 }}>Third-party software, running on this machine — connected to the graph.</div>
      </Win>

      <Win id="team" title="Team" ariaApp w={480} h={430} x={310} y={90}>
        <div style={{ fontFamily: ariaSerif, fontSize: 18, fontWeight: 700, color: '#16241C', marginBottom: 4 }}>On shift now — 3</div>
        {[['Maya K.', 'Register 1 · since 7:00am'], ['Tom R.', 'Kitchen · since 8:00am'], ['You', 'Owner · office']].map(([n, s]) => (
          <div key={n} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${A.line}`, fontSize: 12 }}>
            <b style={{ color: '#16241C' }}>{n}</b><span style={{ color: A.sage, fontSize: 11 }}>{s}</span>
          </div>
        ))}
        <div style={{ fontSize: 12, fontWeight: 700, color: '#16241C', margin: '14px 0 6px' }}>Team chat</div>
        <div style={{ fontSize: 11.5, lineHeight: 1.9, color: 'rgba(22,36,28,.75)' }}>
          <b style={{ color: A.sage }}>Maya:</b> milk delivery arrived 👍<br />
          <b style={{ color: A.sage }}>You:</b> legend — roster's up for Sat<br />
          <b style={{ color: A.sage }}>Tom:</b> can I swap Thu for Fri?
        </div>
      </Win>

      {/* CANOPY-REPORTS-AS-FILES-1 — real, per-business saved reports (canopy_saved_reports),
          replacing the old static/demo document list. Each row carries its provenance (what kind
          of report it is + its Business Truth grounding tag) rather than just a filename+size, and
          a real "Export" that writes the actual PDF to Windows via a native save dialog. */}
      <Win id="files" title="Files" ariaApp w={460} h={440} x={330} y={100}>
        <div style={{ fontFamily: ariaSerif, fontSize: 18, fontWeight: 700, color: '#16241C', marginBottom: 10 }}>Saved reports</div>
        {reportsLoading && savedReports.length === 0 && (
          <div style={{ fontSize: 11.5, color: 'rgba(22,36,28,.5)', padding: '10px 2px' }}>Loading…</div>
        )}
        {!reportsLoading && savedReports.length === 0 && (
          <div style={{ fontSize: 11.5, color: 'rgba(22,36,28,.5)', padding: '10px 2px', lineHeight: 1.6 }}>
            No reports saved yet — use "Save to Files" from Ask Aria, Weekly Reports, Profit Leaks, or the Daily Briefing.
          </div>
        )}
        {savedReports.map((r) => {
          const kindLabel = FILE_SOURCE_LABEL[r.source_kind] ?? r.source_kind
          const groundColor = FILE_GROUNDING_COLOR[r.grounding] ?? A.sage
          const status = exportStatus[r.id]
          return (
            <div key={r.id} style={{ padding: '10px 0', borderBottom: `1px solid ${A.line}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#16241C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                    <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: A.card, color: A.sage, fontWeight: 700 }}>{kindLabel}</span>
                    <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: groundColor + '18', color: groundColor, fontWeight: 700, textTransform: 'uppercase' }}>{r.grounding}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(22,36,28,.4)', marginTop: 3 }}>
                    Generated {new Date(r.generated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                </div>
                <button onClick={() => exportReport(r)} style={{ flexShrink: 0, fontSize: 10.5, padding: '5px 10px', borderRadius: 7, border: `1px solid ${A.line}`, background: 'transparent', color: A.sage, fontWeight: 700, cursor: 'pointer', fontFamily: sans }}>
                  Export
                </button>
              </div>
              {status && (
                <div style={{ fontSize: 10, color: status.startsWith('⚠') ? P.red : A.sage, marginTop: 4 }}>{status}</div>
              )}
            </div>
          )
        })}
      </Win>

      <Win id="help" title="Help" ariaApp w={440} h={340} x={350} y={110}>
        <div style={{ fontFamily: ariaSerif, fontSize: 18, fontWeight: 700, color: '#16241C', marginBottom: 8 }}>Need something?</div>
        <div style={{ fontSize: 11.5, color: 'rgba(22,36,28,.6)', marginBottom: 14 }}>Message the Aria team directly — usually a reply within the hour.</div>
        <textarea placeholder="What's happening?" style={{ width: '100%', height: 70, background: A.card, border: `1px solid ${A.line}`, borderRadius: 8, padding: 10, color: '#16241C', fontSize: 12, fontFamily: sans, resize: 'none' }} />
        <button style={{ marginTop: 10, padding: '9px 16px', border: 'none', borderRadius: 8, background: A.deep, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: sans }}>Send</button>
        <div style={{ fontSize: 11, color: 'rgba(22,36,28,.45)', marginTop: 16 }}>Or browse the guide — printer setup, staff PINs, adding a tier.</div>
      </Win>

      <Win id="settings" title="Settings" ariaApp w={460} h={410} x={370} y={90}>
        <div style={{ fontFamily: ariaSerif, fontSize: 18, fontWeight: 700, color: '#16241C', marginBottom: 10 }}>Business</div>
        {[['Opening hours', '6:30am – 3:00pm daily'], ['Notifications', 'Sales, alerts, approvals'], ['Register printer', 'Epson TM-T82 · connected'], ['Cash drawer', 'Connected']].map(([l, r]) => (
          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${A.line}`, fontSize: 12 }}>
            <span style={{ color: 'rgba(22,36,28,.7)' }}>{l}</span><b style={{ color: A.sage, fontSize: 11 }}>{r}</b>
          </div>
        ))}
        <div style={{ fontFamily: ariaSerif, fontSize: 18, fontWeight: 700, color: '#16241C', margin: '16px 0 8px' }}>Staff PINs</div>
        {[['Maya K.', '•••• · reset available'], ['Tom R.', '•••• · reset available']].map(([n, s]) => (
          <div key={n} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${A.line}`, fontSize: 12 }}>
            <span style={{ color: 'rgba(22,36,28,.7)' }}>{n}</span><span style={{ color: 'rgba(22,36,28,.45)', fontSize: 11 }}>{s}</span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button onClick={() => setLocked(true)} style={{ padding: '9px 16px', border: `1px solid ${A.line}`, borderRadius: 8, background: 'transparent', color: A.sage, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: sans }}>Lock this machine</button>
          {/* CANOPY-POLISH-1 item 4 — this button only ever opens the owner-PIN confirmation above;
              it never quits directly. Settings itself is already owner-only (STAFF_VISIBLE never
              includes 'settings'), and exitApp() is still gated a second time behind a fresh PIN. */}
          <button onClick={() => setExitConfirm(true)} style={{ padding: '9px 16px', border: `1px solid rgba(209,69,59,.3)`, borderRadius: 8, background: 'transparent', color: P.red, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: sans }}>Exit Canopy</button>
        </div>
      </Win>

      <Win id="store" title="App Store" w={520} h={420} x={280} y={70}>
        {[['A', 'AriaOS', 'The business co-owner — pre-installed', 'Installed', true],
          ['XE', 'Xero', 'Accounting — connected to the graph', 'Connected', false],
          ['DP', 'Deputy', 'Rostering — staff & labour into the graph', 'Install', false],
          ['CV', 'Canva', 'Design — brand kit from the graph', 'Install', false],
          ['GB', 'Google Business', 'Reviews & listing', 'Install', false]].map(([ic, name, desc, cta, brand]) => (
          <div key={name as string} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${P.line}` }}>
            <span style={{ width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, background: brand ? A.sage : P.raised, color: brand ? '#0a0a0a' : P.ink }}>{ic as string}</span>
            <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{name as string}</div><div style={{ fontSize: 10.5, color: P.dim }}>{desc as string}</div></div>
            <span style={{ fontSize: 10.5, color: cta === 'Install' ? P.lime : P.faint }}>{cta as string}</span>
          </div>
        ))}
      </Win>

      {/* Full always-visible labeled dock — real frosted glass, hidden scrollbar as a safety net
          against clipping on an unusually narrow window, not meant to be visibly used at real
          fullscreen width. */}
      <div className="dock-scroll" style={{
        position: 'absolute', left: '50%', bottom: DOCK_BOTTOM_OFFSET, transform: 'translateX(-50%)', display: 'flex', alignItems: 'flex-end', gap: 10,
        background: 'rgba(28,30,26,.55)', backdropFilter: 'blur(22px) saturate(1.6)', WebkitBackdropFilter: 'blur(22px) saturate(1.6)',
        border: '1px solid rgba(255,255,255,.14)', boxShadow: '0 12px 34px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.08)',
        borderRadius: 20, padding: '9px 14px 7px', maxWidth: '92vw', overflowX: 'auto',
      }}>
        {(role === 'owner' ? ALL_APPS : ALL_APPS.filter((a) => STAFF_VISIBLE.includes(a.id))).map((a) => {
          const isOpen = wins.includes(a.id)
          return (
            <div key={a.id} onClick={() => open(a.id)} title={a.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer', position: 'relative', width: 44, flexShrink: 0 }}>
              <AppLogo app={a} s={32} radius={9} />
              <span style={{ fontSize: 8.5, color: 'rgba(250,250,250,.7)', textAlign: 'center', lineHeight: 1.1 }}>{a.label}</span>
              <span style={{ position: 'absolute', bottom: -5, width: 3.5, height: 3.5, borderRadius: 99, background: isOpen ? P.lime : 'transparent' }} />
            </div>
          )
        })}
        <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,.14)', margin: '0 2px 12px', flexShrink: 0 }} />
        <div onClick={() => setLauncherOpen(true)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer', width: 44, flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', background: P.lime }}>
            <span style={{ color: '#0a0a0a', fontSize: 15, fontWeight: 700, lineHeight: 1 }}>+</span>
          </div>
          <span style={{ fontSize: 8.5, color: 'rgba(250,250,250,.7)' }}>More</span>
        </div>
      </div>
    </div>
  )
}
