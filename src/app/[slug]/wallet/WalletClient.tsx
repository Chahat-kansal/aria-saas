'use client'
import { useRef, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import JsBarcode from 'jsbarcode'
import { CxTabBar } from '../CxTabBar'

const BG = '#fafafa'
const INK = '#0a0a0a'
const ACCENT = '#d9f54e'
const ACCENT_TEXT = '#2f3a06'
const INK_MUTED = '#6b7280'
const FD = "var(--font-display,'Cormorant',Georgia,serif)"
const FB = "var(--font-body,'Outfit',system-ui,sans-serif)"

interface EarnTxn {
  id: string
  type: string
  points_delta: number
  reward_redeemed: string | null
  item_name?: string | null
  created_at: string
}

interface PreloadTxn {
  id: string
  amount: number
  type: string
  description: string | null
  created_at: string
}

// ── QR code canvas — renders the loyalty short_code as a square QR ──
// widthMod and heightPx kept for API compat; size is the canonical QR dimension
function LoyaltyBarcode({ value, widthMod = 2.4, heightPx = 96, size }: {
  value: string | null
  widthMod?: number
  heightPx?: number
  size?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [encErr, setEncErr] = useState(false)
  const px = size ?? heightPx

  useEffect(() => {
    setEncErr(false)
    if (!canvasRef.current || !value) return
    QRCode.toCanvas(canvasRef.current, value, {
      errorCorrectionLevel: 'M',
      margin: 3,
      width: px,
      color: { dark: '#000000', light: '#ffffff' },
    }, (err) => {
      if (err) {
        console.error('[LoyaltyBarcode] QR encode error:', value, err)
        setEncErr(true)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, px])

  if (!value || encErr) {
    return (
      <div style={{
        width: px, height: px, background: '#ffffff', borderRadius: 6,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontFamily: FB, fontSize: 18, color: '#9ca3af', letterSpacing: '0.2em' }}>— —</span>
      </div>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      width={px}
      height={px}
      style={{ display: 'block', borderRadius: 6 }}
    />
  )
}

// ── 1D CODE128 barcode, SVG-based so it scales without clipping at any
//    viewport width. Shared by the card's mini-strip and the enlarged scan
//    modal — same symbology/value, different size. Pure #000 on #fff and no
//    filter/tint applied here (7-Eleven-style scannability): the caller may
//    still sit this inside a rotated card, but nothing in this component
//    itself blurs, tints, or transforms the bars.
function Barcode1D({ value, heightPx, widthPercent, barWidth = 3 }: {
  value: string | null
  heightPx: number
  widthPercent: string
  barWidth?: number
}) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || !value) return
    try {
      JsBarcode(svgRef.current, value, {
        format: 'CODE128',
        width: barWidth,
        height: heightPx,
        displayValue: false,
        margin: 0,
        background: '#ffffff',
        lineColor: '#000000',
      })
      // parseFloat strips any 'px' suffix JsBarcode may append — raw string in viewBox is invalid
      const svg = svgRef.current
      const w = parseFloat(svg.getAttribute('width') ?? '') || 200
      const h = parseFloat(svg.getAttribute('height') ?? '') || heightPx
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h)
      svg.setAttribute('preserveAspectRatio', 'none')
      svg.removeAttribute('width')
      svg.removeAttribute('height')
    } catch { /* value may not encode cleanly — svg stays blank */ }
  }, [value, heightPx, barWidth])

  if (!value) return null

  return (
    <svg
      ref={svgRef}
      preserveAspectRatio="none"
      style={{ display: 'block', width: widthPercent, height: heightPx }}
    />
  )
}

// ── 1D barcode strip on the card face, inset with its own rounding — LOYALTY-FINISH:
// this used to be a flush full-width strip relying on the CARD's own overflow:hidden
// to clip its corners, which left a visible seam where the strip's square corners met
// the card's rounded ones. Own borderRadius + margin (mx-3.5 mb-3.5) makes it a
// distinct inset panel instead, matching public/menu/_refs/cx-app-wallet.png (the
// card's black face visibly frames the white strip on all sides, no full-bleed edge).
function BarcodeStrip({ value, onTap }: {
  value: string | null
  onTap: () => void
}) {
  if (!value) return null

  return (
    <div
      role="button"
      aria-label="Tap to open scan view"
      onClick={onTap}
      style={{
        background: '#ffffff',
        borderRadius: 12,
        margin: '0 14px 14px',
        padding: '8px 0',
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* min 56px bar height, ~85% card width, per 7-Eleven-style scannability fix */}
      <Barcode1D value={value} heightPx={56} widthPercent="85%" barWidth={3} />
    </div>
  )
}

// Wake Lock API — real, widely-supported (iOS Safari 16.4+, Android Chrome),
// unlike a "screen brightness API" which no mainstream browser exposes to web
// pages. Combined with the fullscreen pure-white background below (the actual
// brightness mechanism — maximises emitted light), this stops the OS from
// auto-dimming/sleeping the screen mid-scan. Best-effort: never throws if
// unsupported or denied, the white background still does the real work.
function useScreenAwakeWhileOpen(active: boolean) {
  useEffect(() => {
    if (!active) return
    let cancelled = false
    let lock: { release: () => Promise<void> } | null = null
    ;(async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } }
        if (!nav.wakeLock) return
        const sentinel = await nav.wakeLock.request('screen')
        if (cancelled) { void sentinel.release(); return }
        lock = sentinel
      } catch { /* unsupported/denied — fullscreen white background still applies */ }
    })()
    return () => {
      cancelled = true
      if (lock) void lock.release()
    }
  }, [active])
}

// ── Fullscreen scan modal — 7-Eleven-style: large high-contrast 1D barcode as
//    the default (reads on more scanners, including some imagers-that-look-
//    like-lasers), QR kept as a toggle for pure-camera scanners. ──
function ScanModal({ value, bizName, onClose }: {
  value: string | null
  bizName: string
  onClose: () => void
}) {
  const [mode, setMode] = useState<'1d' | 'qr'>('1d')
  useScreenAwakeWhileOpen(true)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scan loyalty card"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 999999,
        background: '#ffffff',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '28px 16px',
      }}
    >
      <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, margin: '0 0 4px', textAlign: 'center' }}>
        ☀️ Screen brightened for scanning
      </p>
      <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 24, color: INK, margin: '0 0 20px', textAlign: 'center' }}>
        {bizName}
      </p>
      {/* stopPropagation so tapping the barcode/toggle itself doesn't dismiss the modal */}
      <div onClick={function (e) { e.stopPropagation() }} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {mode === '1d' ? (
          <div style={{ width: '100%', padding: '8px 0' }}>
            <Barcode1D value={value} heightPx={120} widthPercent="92%" barWidth={3} />
          </div>
        ) : (
          <div style={{ background: '#ffffff', borderRadius: 12, padding: 10, boxShadow: '0 2px 12px rgba(0,0,0,0.10)' }}>
            <LoyaltyBarcode value={value} size={240} />
          </div>
        )}

        {value && (
          <p style={{ fontFamily: 'monospace', fontSize: 14, color: INK_MUTED, marginTop: 14, letterSpacing: '0.15em' }}>
            {/^\d{10}$/.test(value) ? value.slice(0, 4) + ' ' + value.slice(4) : value.slice(0, 16)}
          </p>
        )}

        {/* Barcode / QR toggle — both symbologies encode the same short_code value */}
        <div style={{ display: 'flex', gap: 4, marginTop: 18, background: 'rgba(0,0,0,0.05)', borderRadius: 100, padding: 4 }}>
          <button
            onClick={() => setMode('1d')}
            style={{
              padding: '6px 18px', borderRadius: 100, border: 'none', cursor: 'pointer',
              fontFamily: FB, fontSize: 12, fontWeight: 700,
              background: mode === '1d' ? INK : 'transparent', color: mode === '1d' ? '#ffffff' : INK_MUTED,
            }}
          >
            Barcode
          </button>
          <button
            onClick={() => setMode('qr')}
            style={{
              padding: '6px 18px', borderRadius: 100, border: 'none', cursor: 'pointer',
              fontFamily: FB, fontSize: 12, fontWeight: 700,
              background: mode === 'qr' ? INK : 'transparent', color: mode === 'qr' ? '#ffffff' : INK_MUTED,
            }}
          >
            QR code
          </button>
        </div>
      </div>
      <p style={{ fontFamily: FB, fontSize: 14, color: INK, marginTop: 20, textAlign: 'center', fontWeight: 600 }}>
        Show this to the counter camera
      </p>
      <p style={{ fontFamily: FB, fontSize: 11, color: INK_MUTED, marginTop: 16, textAlign: 'center' }}>
        Tap anywhere to close
      </p>
    </div>
  )
}

// ── EMV-style chip icon — gold/brass ─────────────────────────────────────────
function IconChip() {
  return (
    <svg width="44" height="34" viewBox="0 0 44 34" fill="none" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="chipGold" x1="0" y1="0" x2="44" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#D4A843" />
          <stop offset="50%" stopColor="#C9A37A" />
          <stop offset="100%" stopColor="#A07830" />
        </linearGradient>
      </defs>
      <rect width="44" height="34" rx="5" fill="url(#chipGold)" />
      {/* contact pad outline */}
      <rect x="13" y="4" width="18" height="26" rx="2.5" fill="none" stroke="#7A5C10" strokeWidth="1.4" />
      {/* horizontal contact lines */}
      <line x1="13" y1="12" x2="31" y2="12" stroke="#7A5C10" strokeWidth="1.2" />
      <line x1="13" y1="22" x2="31" y2="22" stroke="#7A5C10" strokeWidth="1.2" />
      {/* vertical centre line */}
      <line x1="22" y1="4" x2="22" y2="30" stroke="#7A5C10" strokeWidth="1.2" />
      {/* left stub tabs */}
      <line x1="0" y1="12" x2="13" y2="12" stroke="#7A5C10" strokeWidth="1.2" />
      <line x1="0" y1="22" x2="13" y2="22" stroke="#7A5C10" strokeWidth="1.2" />
      {/* right stub tabs */}
      <line x1="31" y1="12" x2="44" y2="12" stroke="#7A5C10" strokeWidth="1.2" />
      <line x1="31" y1="22" x2="44" y2="22" stroke="#7A5C10" strokeWidth="1.2" />
    </svg>
  )
}

// ── Apple / Google wallet logos ───────────────────────────────────────────────
function IconApple() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="#fff" style={{ display: 'block', flexShrink: 0 }}>
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  )
}

function IconGoogle() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" style={{ display: 'block', flexShrink: 0 }}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

// ── Transaction row icons ─────────────────────────────────────────────────────
function IconCup({ color = '#fff' }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      <path d="M18 8h1a4 4 0 010 8h-1" />
      <path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" />
      <line x1="6" y1="1" x2="6" y2="4" />
      <line x1="10" y1="1" x2="10" y2="4" />
      <line x1="14" y1="1" x2="14" y2="4" />
    </svg>
  )
}

function IconDollar({ color = '#fff' }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" style={{ display: 'block' }}>
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  )
}

function IconGift({ color = '#fff' }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="22" x2="12" y2="7" />
      <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
    </svg>
  )
}

// ── Loyalty Card — dark card, −7deg tilt; white barcode band across bottom ──
function LoyaltyCard({ bizName, name, tier, walletBal, pointsBalance, programEnabled, preloadEnabled, pointValueCents, identityId, onScanOpen }: {
  bizName: string
  name: string | null
  tier: string
  walletBal: number
  pointsBalance: number
  programEnabled: boolean
  preloadEnabled: boolean
  pointValueCents: number
  identityId: string | null
  onScanOpen: () => void
}) {
  const t = tier.toLowerCase()
  const tierLabel = t === 'gold' ? 'Gold' : t === 'silver' ? 'Silver' : 'Member'
  const tierColor = t === 'gold' ? '#C9A37A' : t === 'silver' ? '#A0B4C8' : ACCENT

  return (
    // 28px clearance each side so −7deg corners stay inside max-w-md
    <div style={{ padding: '0 28px' }}>
      <div
        style={{
          background: '#14130f',
          borderRadius: 20,
          transform: 'rotate(-7deg)',
          border: '1px solid rgba(201,163,122,0.55)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.55), 0 8px 24px rgba(0,0,0,0.35)',
          overflow: 'hidden',
          userSelect: 'none',
        }}
      >
        {/* ── Card face ── */}
        <div style={{ padding: '18px 20px 12px' }}>
          {/* Row 1: biz name only */}
          <div style={{ marginBottom: 6 }}>
            <span style={{
              fontFamily: FD, fontStyle: 'italic', fontSize: 26, fontWeight: 600,
              color: 'rgba(210,210,210,0.92)', lineHeight: 1.1,
              textShadow: '0 1px 8px rgba(0,0,0,0.4)',
            }}>
              {bizName}
            </span>
          </div>

          {/* Row 2: holder name */}
          <span style={{
            display: 'block',
            fontFamily: FB, fontSize: 16, fontWeight: 400,
            color: '#fff', marginBottom: 10,
          }}>
            {name ?? 'Member'}
          </span>

          {/* Row 3: pts + tier (left) + gold chip (right) */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'nowrap', marginBottom: 4 }}>
                <span style={{ fontFamily: FB, fontSize: 28, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
                  {programEnabled ? (pointsBalance + ' pts') : '—'}
                </span>
                <span style={{ fontFamily: FB, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>·</span>
                <span style={{
                  fontFamily: FB, fontSize: 14, fontWeight: 700,
                  color: tierColor,
                  textDecoration: 'underline', textDecorationColor: ACCENT, textUnderlineOffset: '3px',
                }}>
                  {tierLabel}
                </span>
              </div>
              {/* Subtext: program paused / pts value / preload balance */}
              {!programEnabled && (
                <span style={{ fontFamily: FB, fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 2 }}>
                  Loyalty paused
                </span>
              )}
              {programEnabled && pointValueCents > 0 && pointsBalance > 0 && (
                <span style={{ fontFamily: FB, fontSize: 11, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 2 }}>
                  {'≈ $' + (pointsBalance * pointValueCents / 100).toFixed(2) + ' in rewards'}
                </span>
              )}
              {preloadEnabled && walletBal > 0 && (
                <span style={{ fontFamily: FB, fontSize: 11, color: 'rgba(255,255,255,0.5)', display: 'block' }}>
                  {'$' + walletBal.toFixed(2) + ' preload balance'}
                </span>
              )}
            </div>
            {/* Gold EMV chip — bottom-right of card face per ref */}
            <IconChip />
          </div>
        </div>

        {/* ── 1D barcode band — inset panel with its own rounding, SVG, tap opens QR modal ── */}
        <BarcodeStrip value={identityId} onTap={onScanOpen} />
      </div>
    </div>
  )
}

// ── Transaction row — individual glass card ───────────────────────────────────
function TxnRow({ date, label, itemName, kind, bizName }: {
  date: string
  label: string
  itemName: string | null
  kind: 'earn' | 'redeem' | 'preload'
  bizName: string
}) {
  const timeStr = new Date(date).toLocaleTimeString('en-AU', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Australia/Melbourne',
  })

  const iconBg = kind === 'redeem' ? '#1a1a16' : ACCENT
  const iconColor = kind === 'redeem' ? '#ffffff' : ACCENT_TEXT

  return (
    <div style={{
      background: 'rgba(255,255,255,0.5)',
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      borderRadius: 16,
      marginBottom: 8,
      padding: '12px 14px 0',
    }}>
      {/* Content row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Icon tile */}
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: iconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: kind !== 'redeem' ? '0 0 12px rgba(217,245,78,0.4)' : 'none',
        }}>
          {kind === 'earn' && <IconCup color={iconColor} />}
          {kind === 'redeem' && <IconGift color={iconColor} />}
          {kind === 'preload' && <IconDollar color={iconColor} />}
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontFamily: FB, fontSize: 14, fontWeight: 600,
            margin: '0 0 2px', color: INK,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {label}
            {itemName && (
              <span style={{ fontFamily: FD, fontStyle: 'italic', fontWeight: 400 }}>
                {' · ' + itemName}
              </span>
            )}
          </p>
          <p style={{ fontFamily: FB, fontSize: 12, color: INK_MUTED, margin: 0 }}>
            {bizName + ' at ' + timeStr}
          </p>
        </div>
      </div>

      {/* Lime accent bar at bottom center */}
      <div style={{ width: 64, height: 3, background: ACCENT, borderRadius: 2, margin: '10px auto 12px' }} />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function WalletClient({ slug, bizName, heroImageUrl, isSignedIn, name, tier: tierProp, walletBal, pointsBalance, programEnabled, preloadEnabled, pointValueCents, identityId, earnTxns, preloadTxns, topUpUrl }: {
  slug: string
  bizName: string
  heroImageUrl?: string | null
  isSignedIn: boolean
  customerId: string | null
  name: string | null
  tier: string
  walletBal: number
  pointsBalance: number
  programEnabled: boolean
  preloadEnabled: boolean
  pointValueCents: number
  identityId: string | null
  earnTxns: EarnTxn[]
  preloadTxns: PreloadTxn[]
  topUpUrl: string | null
}) {
  const isLoggedIn = isSignedIn
  const tier = tierProp ?? 'Member'
  const [scanOpen, setScanOpen] = useState(false)

  const heroBg = heroImageUrl
    ? ('url(' + heroImageUrl + ') center/cover no-repeat')
    : 'url(/cx/wallet-bg.png) center/cover no-repeat'

  type MergedTxn = {
    id: string
    date: string
    label: string
    itemName: string | null
    kind: 'earn' | 'redeem' | 'preload'
  }

  const allTxns: MergedTxn[] = [
    ...earnTxns.map(t => {
      const isEarn = t.points_delta > 0
      return {
        id: t.id,
        date: t.created_at,
        label: isEarn
          ? ('Earned +' + t.points_delta)
          : ('Redeemed −' + Math.abs(t.points_delta)),
        // earn: item name from linked sale; redeem: reward label; null → omit
        itemName: isEarn ? (t.item_name ?? null) : (t.reward_redeemed ?? null),
        kind: (isEarn ? 'earn' : 'redeem') as 'earn' | 'redeem',
      }
    }),
    ...preloadTxns.map(t => ({
      id: t.id,
      date: t.created_at,
      label: t.type === 'top_up'
        ? ('Preloaded +$' + Math.abs(t.amount).toFixed(2))
        : ('Purchase $' + Math.abs(t.amount).toFixed(2)),
      itemName: t.description ?? null,
      kind: 'preload' as const,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 12)

  return (
    <div style={{ width: '100%', maxWidth: '28rem', margin: '0 auto', minHeight: '100dvh', background: BG, fontFamily: FB, color: INK }}>
      <style>{`
        body { background: #fafafa }
        *, *::before, *::after { box-sizing: border-box }
        @keyframes cx-spin { to { transform: rotate(360deg) } }
      `}</style>

      {/* ── Header — full-bleed café photo, fades to #fafafa at bottom ──
          LOYALTY-FINISH: had no border-radius at all — a hard rectangular
          edge against the app's otherwise-rounded design language, visible
          as a seam versus public/menu/_refs/cx-app-wallet.png's rounded
          bottom corners. Rounded bottom-only (flush with viewport top). */}
      <div style={{
        position: 'relative',
        height: '38vh',
        background: heroBg + ', linear-gradient(160deg, #3a2010 0%, #1a0d04 100%)',
        borderRadius: '0 0 24px 24px',
        overflow: 'hidden',
      }}>
        {/* Cream fade — starts at 28%, fully opaque #fafafa by 88% */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.06) 0%, transparent 28%, rgba(250,250,250,1) 88%)',
        }} />
      </div>

      {/* ── Card — overlaps photo by ~50%; card itself has overflow:hidden for barcode clip ── */}
      <div style={{ marginTop: -140, position: 'relative', zIndex: 2, paddingBottom: 24 }}>
        {isLoggedIn ? (
          <LoyaltyCard
            bizName={bizName}
            name={name}
            tier={tier}
            walletBal={walletBal}
            pointsBalance={pointsBalance}
            programEnabled={programEnabled}
            preloadEnabled={preloadEnabled}
            pointValueCents={pointValueCents}
            identityId={identityId}
            onScanOpen={() => setScanOpen(true)}
          />
        ) : (
          <div style={{ margin: '0 16px', padding: '28px 20px', background: '#fff', borderRadius: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.07)', textAlign: 'center' }}>
            <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 22, color: INK, margin: '0 0 14px' }}>
              Your loyalty card
            </p>
            <a href={'/' + slug + '/onboarding'} style={{ display: 'inline-block', background: ACCENT, color: ACCENT_TEXT, borderRadius: 100, padding: '10px 24px', fontFamily: FB, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
              Sign in
            </a>
          </div>
        )}
      </div>

      {/* ── Wallet actions ── */}
      {isLoggedIn && (
        <div style={{ padding: '0 16px' }}>
          {/* Apple + Google pills */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <a
              href={'/api/public/cx/' + slug + '/wallet-pass?format=apple_json'}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                background: '#111', borderRadius: 100, height: 56,
                textDecoration: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
              }}
            >
              <IconApple />
              <div>
                <p style={{ fontFamily: FB, fontSize: 9, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Add to</p>
                <p style={{ fontFamily: FB, fontSize: 13, color: '#fff', margin: 0, fontWeight: 700, lineHeight: 1.3 }}>Apple Wallet</p>
              </div>
            </a>
            <a
              href={'/api/public/cx/' + slug + '/wallet-pass?format=google_redirect'}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                background: '#111', borderRadius: 100, height: 56,
                textDecoration: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
              }}
            >
              <IconGoogle />
              <div>
                <p style={{ fontFamily: FB, fontSize: 9, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Add to</p>
                <p style={{ fontFamily: FB, fontSize: 13, color: '#fff', margin: 0, fontWeight: 700, lineHeight: 1.3 }}>Google Wallet</p>
              </div>
            </a>
          </div>

          {/* Top up — lime glow pill — only when topUpUrl is provided */}
          {topUpUrl && (
            <a
              href={topUpUrl}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: ACCENT, color: ACCENT_TEXT,
                borderRadius: 100, height: 56, marginBottom: 20,
                fontFamily: FB, fontSize: 17, fontWeight: 700, textDecoration: 'none',
                boxShadow: '0 0 24px rgba(217,245,78,0.5), 0 4px 16px rgba(217,245,78,0.35), inset 0 1px 0 rgba(255,255,255,0.3)',
              }}
            >
              Top up
            </a>
          )}
        </div>
      )}

      {/* ── Transaction history — individual glass cards ── */}
      <div style={{ padding: '0 16px', paddingBottom: 'calc(80px + env(safe-area-inset-bottom) + 24px)' }}>
        {isLoggedIn && allTxns.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 18, color: INK_MUTED, margin: '0 0 6px' }}>
              No transactions yet
            </p>
            <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, margin: 0 }}>
              Your earn, redeem, and top-up history will appear here
            </p>
          </div>
        )}
        {allTxns.map(t => (
          <TxnRow
            key={t.id}
            date={t.date}
            label={t.label}
            itemName={t.itemName}
            kind={t.kind}
            bizName={bizName}
          />
        ))}
      </div>

      <CxTabBar slug={slug} active="wallet" />

      {/* ── Scan modal — large 280px QR, belt-and-braces for bright daylight ── */}
      {scanOpen && (
        <ScanModal
          value={identityId}
          bizName={bizName}
          onClose={() => setScanOpen(false)}
        />
      )}
    </div>
  )
}