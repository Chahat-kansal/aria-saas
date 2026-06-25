'use client'
import React from 'react'
import { P, JAKARTA, HARD_SHADOW, pinitials } from '@/lib/inventory/ui/pipel-tokens'

// INV-PIPEL — the Pipel design system, componentised 1:1 from mockups/aria-inventory-pipel-theme.html.
// VISUAL ONLY. Every primitive is presentational (props in → markup out); no data fetching, no business logic.
// Borders are always 1.5px ink; cards 22–28px radius; tool tiles carry the 3px hard offset shadow.

// ───────────────────────── icons (stroke, 24-grid — straight from the mockup) ─────────────────────────
const ICONS: Record<string, React.ReactNode> = {
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></>,
  scan: <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M3 12h18" />,
  home: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
  'check-square': <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
  count: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>,
  edit: <path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z" />,
  adjust: <path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z" />,
  transfer: <><path d="M7 4v13M7 4L3 8M7 4l4 4" /><path d="M17 20V7M17 20l4-4M17 20l-4-4" /></>,
  repeat: <><path d="M7 4v13M7 4L3 8M7 4l4 4" /><path d="M17 20V7M17 20l4-4M17 20l-4-4" /></>,
  'git-branch': <><path d="M6 3v12" /><circle cx="6" cy="18" r="2.5" /><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="7" r="2.5" /><path d="M18 9.5V11a4 4 0 0 1-4 4H8.5" /></>,
  trash: <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />,
  'trash-2': <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />,
  tag: <><path d="M20.6 13.4L13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.3" /></>,
  'map-pin': <><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>,
  truck: <><path d="M1 3h15v13H1z" /><path d="M16 8h4l3 3v5h-7" /><circle cx="5.5" cy="18.5" r="2" /><circle cx="18.5" cy="18.5" r="2" /></>,
  'shopping-cart': <><circle cx="9" cy="21" r="1.5" /><circle cx="18" cy="21" r="1.5" /><path d="M1 1h4l2.6 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" /></>,
  'alert-triangle': <><path d="M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  'dollar-sign': <><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
  'bar-chart': <><path d="M12 20V10M18 20V4M6 20v-4" /></>,
  reports: <><path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" /></>,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  review: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  'plus-circle': <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
  printer: <><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14h12v8H6z" /></>,
  package: <><path d="M12 2l9 5v10l-9 5-9-5V7z" /><path d="M3 7l9 5 9-5M12 12v10" /></>,
  archive: <><path d="M3 4h18v4H3zM5 8v12h14V8M9 12h6" /></>,
  layers: <><path d="M12 2l9 5-9 5-9-5z" /><path d="M3 12l9 5 9-5M3 17l9 5 9-5" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></>,
  percent: <><path d="M19 5L5 19" /><circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="17" r="2.5" /></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
  'file-text': <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h6" /></>,
  box: <><path d="M12 2l9 5v10l-9 5-9-5V7z" /><path d="M3 7l9 5 9-5" /></>,
  'trending-up': <><path d="M22 7l-8.5 8.5-5-5L2 17" /><path d="M16 7h6v6" /></>,
  gift: <><rect x="3" y="8" width="18" height="13" rx="1" /><path d="M12 8v13M3 12h18M12 8a3 3 0 1 0-3-3c0 2 3 3 3 3zM12 8a3 3 0 1 1 3-3c0 2-3 3-3 3z" /></>,
  back: <path d="M15 18l-6-6 6-6" />,
}

// Manifest icon-key aliases → reuse an existing glyph so every tile renders a real icon (never a fallback box).
const ICON_ALIAS: Record<string, string> = {
  receive: 'truck', order: 'shopping-cart', low_stock: 'alert-triangle', expiring: 'clock', waste: 'trash',
  tickets: 'tag', price_check: 'tag', locate: 'map-pin', stock_value: 'dollar-sign', tasks: 'list',
  movement_audit: 'activity', fefo: 'clock', batches: 'layers', markdown: 'percent', transfer_history: 'git-branch',
  adjust: 'edit', 'sort-asc': 'bar-chart', 'percent-circle': 'percent', columns: 'bar-chart', database: 'archive',
}
for (const [k, v] of Object.entries(ICON_ALIAS)) if (!ICONS[k]) ICONS[k] = ICONS[v]

export function PIcon({ name, size = 20, stroke = P.ink, sw = 1.8 }: { name: string; size?: number; stroke?: string; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name] ?? ICONS.box}
    </svg>
  )
}

// ───────────────────────── status bar ─────────────────────────
export function PipelStatusBar({ right }: { right?: string }) {
  return (
    <div style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', fontSize: 13.5, fontWeight: 700 }}>
      <span>{new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
      <span style={{ fontSize: 11, color: P.muted, fontWeight: 600 }}>{right ?? 'PWA'}</span>
    </div>
  )
}

// ───────────────────────── top bar (crest + wordmark + circle buttons + avatar) ─────────────────────────
export function PipelTopBar({ word, crest, acting, onSwitch, onSearch, back }: {
  word: string; crest: string; acting?: { name: string } | null; onSwitch?: () => void; onSearch?: () => void; back?: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 18px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        {back
          ? <button onClick={back} aria-label="Back" style={{ width: 42, height: 42, borderRadius: '50%', background: P.card, border: `1.5px solid ${P.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}><PIcon name="back" size={20} /></button>
          : <div style={{ width: 44, height: 44, borderRadius: 13, background: P.lime, border: `1.5px solid ${P.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 22 }}>{crest}</div>}
        <div style={{ fontWeight: 800, fontSize: 26, letterSpacing: '-.02em' }}>{word}</div>
      </div>
      <div style={{ display: 'flex', gap: 9 }}>
        {onSearch && <button onClick={onSearch} aria-label="Search" style={{ width: 42, height: 42, borderRadius: '50%', background: P.card, border: `1.5px solid ${P.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}><PIcon name="search" size={20} /></button>}
        {acting && <button onClick={onSwitch} aria-label="Switch staff" title="Switch staff" style={{ width: 42, height: 42, borderRadius: '50%', background: P.ink, color: P.lime, fontWeight: 800, fontSize: 13, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>{pinitials(acting.name)}</button>}
      </div>
    </div>
  )
}

// ───────────────────────── greeting (time-aware) ─────────────────────────
export function PipelGreeting({ word, name, dateLine }: { word: string; name: string; dateLine: string }) {
  return (
    <div style={{ padding: '4px 20px 2px' }}>
      <h1 style={{ fontWeight: 800, fontSize: 30, letterSpacing: '-.02em', lineHeight: 1 }}>{word}, <span style={{ color: P.muted }}>{name}</span></h1>
      <div style={{ marginTop: 7, fontSize: 13, color: P.muted, fontWeight: 600 }}>{dateLine}</div>
    </div>
  )
}

// ───────────────────────── sub-screen title (mini header) ─────────────────────────
export function PipelTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ padding: '2px 20px 4px' }}>
      <h1 style={{ fontWeight: 800, fontSize: 27, letterSpacing: '-.02em', lineHeight: 1 }}>{title}</h1>
      {subtitle && <div style={{ marginTop: 6, fontSize: 13, color: P.muted, fontWeight: 600 }}>{subtitle}</div>}
    </div>
  )
}

// ───────────────────────── segment / outlet toggle ─────────────────────────
export function PipelSegment<T extends string>({ options, value, onChange }: { options: Array<{ value: T; label: string }>; value: T; onChange: (v: T) => void }) {
  return (
    <div style={{ display: 'flex', margin: '0 16px 14px', background: P.card, border: `1.5px solid ${P.ink}`, borderRadius: 30, padding: 5, gap: 5 }}>
      {options.map(o => {
        const on = o.value === value
        return (
          <button key={o.value} onClick={() => onChange(o.value)}
            style={{ flex: 1, textAlign: 'center', padding: 11, borderRadius: 24, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: JAKARTA, background: on ? P.lime : 'transparent', color: on ? P.ink : P.muted, border: on ? `1.5px solid ${P.ink}` : '1.5px solid transparent' }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ───────────────────────── section head (lowercase) ─────────────────────────
export function PipelSectionHead({ title, em, right }: { title: string; em?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '24px 20px 12px' }}>
      <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-.01em' }}>{title} {em && <em style={{ fontStyle: 'normal', color: P.faint, fontWeight: 600, fontSize: 13 }}>{em}</em>}</span>
      {right != null && <span style={{ fontSize: 13, color: P.faint, fontWeight: 600 }}>{right}</span>}
    </div>
  )
}

// ───────────────────────── card / button / badge / stat ─────────────────────────
export function PipelCard({ children, style, onClick }: { children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void }) {
  return <div onClick={onClick} style={{ background: P.card, border: `1.5px solid ${P.ink}`, borderRadius: 22, padding: 16, ...(onClick ? { cursor: 'pointer' } : null), ...style }}>{children}</div>
}

export function PipelButton({ children, onClick, disabled, variant = 'lime', style }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: 'lime' | 'ink' | 'ghost' | 'loss'; style?: React.CSSProperties }) {
  const v = variant === 'ink' ? { background: P.ink, color: '#fff' }
    : variant === 'ghost' ? { background: P.card, color: P.ink }
    : variant === 'loss' ? { background: '#fff', color: P.red }
    : { background: P.lime, color: P.ink }
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ width: '100%', border: `1.5px solid ${variant === 'loss' ? P.red : P.ink}`, borderRadius: 16, padding: '14px 16px', fontFamily: JAKARTA, fontSize: 14.5, fontWeight: 800, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1, ...v, ...style }}>
      {children}
    </button>
  )
}

export function PipelBadge({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'lime' | 'amber' | 'ink' }) {
  const t = tone === 'lime' ? { background: P.lime, color: P.ink }
    : tone === 'amber' ? { background: '#fff', color: P.amber }
    : tone === 'ink' ? { background: P.ink, color: P.lime }
    : { background: '#fff', color: P.ink }
  return <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 9, border: `1.5px solid ${P.ink}`, ...t }}>{children}</span>
}

/** Ink-bordered stat chip (hero footer + buckets). `tone` colours the number only. */
export function PipelStat({ n, k, tone }: { n: React.ReactNode; k: string; tone?: 'warn' | 'alert' }) {
  const col = tone === 'warn' ? P.amber : tone === 'alert' ? P.red : P.ink
  return (
    <div style={{ flex: 1, background: P.bg, border: `1.5px solid ${P.ink}`, borderRadius: 16, padding: 11, textAlign: 'center' }}>
      <div style={{ fontWeight: 800, fontSize: 22, lineHeight: 1, color: col }}>{n}</div>
      <div style={{ fontSize: 10.5, color: P.muted, marginTop: 3, fontWeight: 600 }}>{k}</div>
    </div>
  )
}

// ───────────────────────── hero (stock value + margin bar + stat chips) ─────────────────────────
export function PipelHero({ caption, value, costPct, costLabel, retailLabel, marginTag, stats }: {
  caption: string; value: string; costPct: number; costLabel: string; retailLabel: string; marginTag: string | null
  stats: Array<{ n: React.ReactNode; k: string; tone?: 'warn' | 'alert' }>
}) {
  const cp = Math.max(6, Math.min(94, costPct))
  return (
    <div style={{ margin: '16px 16px 0', background: P.card, border: `1.5px solid ${P.ink}`, borderRadius: 28, padding: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: P.muted, textTransform: 'uppercase', letterSpacing: '.06em' }}>{caption}</div>
      <div style={{ fontWeight: 800, fontSize: 50, letterSpacing: '-.03em', lineHeight: 1, margin: '8px 0 2px' }}>{value}</div>
      <div style={{ height: 14, borderRadius: 8, background: P.soft, border: `1.5px solid ${P.ink}`, margin: '16px 0 11px', overflow: 'hidden', display: 'flex' }}>
        <div style={{ width: `${cp}%`, background: P.ink }} />
        <div style={{ flex: 1, background: P.lime }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, color: P.muted, fontWeight: 600 }}>
        <span><b style={{ color: P.ink, fontWeight: 800 }}>{costLabel}</b> cost</span>
        {marginTag && <span style={{ background: P.lime, border: `1.5px solid ${P.ink}`, borderRadius: 8, padding: '1px 7px', color: P.ink, fontWeight: 800 }}>{marginTag}</span>}
        <span><b style={{ color: P.ink, fontWeight: 800 }}>{retailLabel}</b> retail</span>
      </div>
      {stats.length > 0 && (
        <div style={{ display: 'flex', marginTop: 16, gap: 9 }}>
          {stats.map((s, i) => <PipelStat key={i} n={s.n} k={s.k} tone={s.tone} />)}
        </div>
      )}
    </div>
  )
}

// ───────────────────────── tool tile (default | featured | loss) ─────────────────────────
export function PipelTile({ icon, label, statValue, statSuffix, badge, badgeTone, variant = 'default', onClick }: {
  icon: string; label: string; statValue?: React.ReactNode; statSuffix?: string; badge?: string
  badgeTone?: 'default' | 'lime' | 'amber' | 'ink'; variant?: 'default' | 'featured' | 'loss'; onClick?: () => void
}) {
  const feat = variant === 'featured'
  const loss = variant === 'loss'
  const iconBg = feat ? '#fff' : loss ? '#fdeceb' : P.lime
  const iconStroke = loss ? P.red : P.ink
  const statB = loss ? P.red : P.ink
  return (
    <div onClick={onClick} style={{
      position: 'relative', background: feat ? P.lime : P.card, border: `1.5px solid ${P.ink}`, borderRadius: 22,
      padding: 15, boxShadow: HARD_SHADOW, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      minHeight: 128, overflow: 'hidden', cursor: onClick ? 'pointer' : 'default',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ width: 46, height: 46, borderRadius: 13, border: `1.5px solid ${P.ink}`, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <PIcon name={icon} size={22} stroke={iconStroke} />
        </div>
        {badge && <PipelBadge tone={feat ? 'ink' : badgeTone ?? 'default'}>{badge}</PipelBadge>}
      </div>
      <div>
        <div style={{ fontWeight: 800, fontSize: 15.5, lineHeight: 1 }}>{label}</div>
        <div style={{ marginTop: 7, fontSize: 12, color: feat ? '#3c451a' : P.muted, fontWeight: 600, display: 'flex', alignItems: 'baseline', gap: 5 }}>
          {statValue != null && <b style={{ fontWeight: 800, fontSize: 17, color: statB }}>{statValue}</b>}{statSuffix}
        </div>
      </div>
    </div>
  )
}

// ───────────────────────── needs-you row ─────────────────────────
export function PipelNeed({ icon, title, detail, cta, onCta, tone = 'lime' }: { icon: string; title: string; detail: string; cta: string; onCta?: () => void; tone?: 'lime' | 'plain' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 13, background: P.card, border: `1.5px solid ${P.ink}`, borderRadius: 20, padding: '13px 14px' }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, border: `1.5px solid ${P.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: tone === 'plain' ? '#fff' : P.lime }}>
        <PIcon name={icon} size={20} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: 14.5, lineHeight: 1.15 }}>{title}</div>
        <div style={{ fontSize: 12, color: P.muted, marginTop: 2, fontWeight: 500 }}>{detail}</div>
      </div>
      <button onClick={onCta} style={{ fontWeight: 800, fontSize: 13, padding: '9px 15px', borderRadius: 13, background: P.lime, border: `1.5px solid ${P.ink}`, whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: JAKARTA }}>{cta}</button>
    </div>
  )
}

// ───────────────────────── bottom nav (fixed, non-overlapping) ─────────────────────────
export function PipelBottomNav({ active, onHome, onTasks, onScan, onReports, onReview }: {
  active: string; onHome: () => void; onTasks: () => void; onScan: () => void; onReports: () => void; onReview: () => void
}) {
  const iconBtn = (key: string, name: string, onClick: () => void) => (
    <button onClick={onClick} aria-label={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 8, opacity: active === key ? 1 : 0.78 }}>
      <PIcon name={name} size={23} stroke={P.ink} />
    </button>
  )
  return (
    <div style={{ position: 'sticky', bottom: 0, left: 0, right: 0, height: 'auto', background: 'rgba(250,250,250,.96)', backdropFilter: 'blur(12px)', borderTop: `1.5px solid ${P.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '12px 16px max(14px, env(safe-area-inset-bottom))', zIndex: 30 }}>
      {active === 'home'
        ? <button onClick={onHome} style={{ display: 'flex', alignItems: 'center', gap: 8, background: P.lime, border: `1.5px solid ${P.ink}`, padding: '11px 18px', borderRadius: 18, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: JAKARTA, color: P.ink }}><PIcon name="home" size={20} />home</button>
        : iconBtn('home', 'home', onHome)}
      {iconBtn('tasks', 'count', onTasks)}
      <button onClick={onScan} aria-label="scan" style={{ width: 54, height: 54, borderRadius: 16, background: P.lime, border: `1.5px solid ${P.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><PIcon name="scan" size={24} sw={1.9} /></button>
      {iconBtn('reports', 'reports', onReports)}
      {iconBtn('review', 'bell', onReview)}
    </div>
  )
}
