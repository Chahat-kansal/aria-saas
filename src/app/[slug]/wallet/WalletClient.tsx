'use client'
import { useState, useEffect } from 'react'
import { CxTabBar } from '../CxTabBar'

const BG = '#f3efe4'
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
  created_at: string
}

interface PreloadTxn {
  id: string
  amount: number
  type: string
  description: string | null
  created_at: string
}

interface CxData {
  found: boolean
  customer_id?: string
  name?: string
  points_balance?: number
  loyalty_tier?: string | null
  loyalty_identity_id?: string | null
  wallet_balance?: number
  wallet_currency?: string
  recent_txns?: EarnTxn[]
  preload_txns?: PreloadTxn[]
}

// ── Barcode — black bars on white (sits on card's white magnetic stripe) ──────

function BarcodeVisual({ code }: { code: string }) {
  const hex = (code.replace(/-/g, '') + code.replace(/-/g, '')).slice(0, 52)
  const bars = hex.split('').map((c, i) => ({
    w: (parseInt(c, 16) % 3) + 1,
    isBar: i % 2 === 0,
  }))
  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden' }}>
      {bars.map((b, i) => (
        <div key={i} style={{ flex: b.w, height: '100%', background: b.isBar ? 'rgba(0,0,0,0.82)' : 'transparent' }} />
      ))}
    </div>
  )
}

// ── Apple / Google logos ──────────────────────────────────────────────────────

function IconApple() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="#fff" style={{ display: 'block', flexShrink: 0 }}>
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  )
}

function IconGoogle() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" style={{ display: 'block', flexShrink: 0 }}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

// ── Transaction row icons ─────────────────────────────────────────────────────

function IconCup({ color = '#fff' }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      <path d="M18 8h1a4 4 0 010 8h-1"/>
      <path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/>
      <line x1="6" y1="1" x2="6" y2="4"/>
      <line x1="10" y1="1" x2="10" y2="4"/>
      <line x1="14" y1="1" x2="14" y2="4"/>
    </svg>
  )
}

function IconDollar({ color = '#fff' }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" style={{ display: 'block' }}>
      <line x1="12" y1="1" x2="12" y2="23"/>
      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
    </svg>
  )
}

function IconGift({ color = '#fff' }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      <polyline points="20 12 20 22 4 22 4 12"/>
      <rect x="2" y="7" width="20" height="5"/>
      <line x1="12" y1="22" x2="12" y2="7"/>
      <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/>
      <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/>
    </svg>
  )
}

// ── Photoreal card with text overlay ─────────────────────────────────────────

function LoyaltyCard({ bizName, name, tier, walletBal, identityId }: {
  bizName: string
  name: string | null
  tier: string
  walletBal: number
  identityId: string | null
}) {
  const tierLabel = tier === 'gold' || tier === 'Gold' ? 'Gold'
    : tier === 'silver' || tier === 'Silver' ? 'Silver' : 'Member'

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 380, margin: '0 auto', userSelect: 'none', overflow: 'hidden' }}>
      {/* Photoreal card background — tilt, chip, gold edge, shadow all IN the image */}
      <img
        src="/menu/_lib/cx/loyalty-card-bg.png"
        alt=""
        draggable={false}
        style={{ width: '100%', display: 'block', pointerEvents: 'none' }}
      />

      {/* Business name + customer name — upper-left of card face */}
      <div style={{ position: 'absolute', top: '20%', left: '9%', right: '42%', pointerEvents: 'none' }}>
        <span style={{
          display: 'block', fontFamily: FD, fontStyle: 'italic',
          fontSize: 22, color: '#fff', fontWeight: 500, lineHeight: 1.1,
          textShadow: '0 1px 4px rgba(0,0,0,0.6)',
        }}>
          {bizName}
        </span>
        <span style={{
          display: 'block', fontFamily: FB, fontSize: 15, color: '#fff',
          marginTop: 10, fontWeight: 400,
          textShadow: '0 1px 4px rgba(0,0,0,0.5)',
        }}>
          {name ?? 'Member'}
        </span>
      </div>

      {/* Balance + tier — mid-left of card face */}
      <div style={{ position: 'absolute', top: '43%', left: '9%', pointerEvents: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: FB, fontSize: 26, color: '#fff', fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.4)', lineHeight: 1 }}>
            {'$' + walletBal.toFixed(2)}
          </span>
          <span style={{ fontFamily: FB, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            balance ·
          </span>
          <span style={{ fontFamily: FB, fontSize: 13, color: ACCENT, fontWeight: 700 }}>
            {tierLabel}
          </span>
        </div>
      </div>

      {/* Barcode — sits in the white magnetic stripe zone of the card image */}
      {identityId && (
        <div style={{
          position: 'absolute', top: '60%', left: '7%', right: '7%', height: '11%',
          display: 'flex', alignItems: 'center', pointerEvents: 'none',
        }}>
          <BarcodeVisual code={identityId} />
        </div>
      )}
    </div>
  )
}

// ── Transaction row ───────────────────────────────────────────────────────────

function TxnRow({ date, label, itemName, pts, amount, kind, bizName }: {
  date: string
  label: string
  itemName: string | null
  pts: number | null
  amount: number | null
  kind: 'earn' | 'redeem' | 'preload'
  bizName: string
}) {
  const d = new Date(date)
  const timeStr = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })

  const iconBg = kind === 'redeem' ? '#e5e7eb' : (ACCENT + 'cc')
  const iconColor = kind === 'redeem' ? INK_MUTED : ACCENT_TEXT

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 13,
      padding: '12px 0',
      borderBottom: '1px solid rgba(217,245,78,0.2)',
    }}>
      {/* Icon */}
      <div style={{
        width: 42, height: 42, borderRadius: 13, flexShrink: 0,
        background: iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {kind === 'earn' && <IconCup color={iconColor} />}
        {kind === 'redeem' && <IconGift color={iconColor} />}
        {kind === 'preload' && <IconDollar color={iconColor} />}
      </div>

      {/* Label */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: FB, fontSize: 14, fontWeight: 600, margin: '0 0 1px', color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
          {itemName && (
            <span style={{ fontFamily: FD, fontStyle: 'italic', fontWeight: 400, marginLeft: 5 }}>
              {' · ' + itemName}
            </span>
          )}
        </p>
        <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 12, color: INK_MUTED, margin: 0 }}>
          {bizName + ' at ' + timeStr}
        </p>
      </div>

      {/* Amount */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {pts !== null && (
          <p style={{ fontFamily: FB, fontSize: 14, fontWeight: 700, color: pts > 0 ? '#059669' : '#dc2626', margin: 0 }}>
            {pts > 0 ? '+' : ''}{pts} pts
          </p>
        )}
        {amount !== null && (
          <p style={{ fontFamily: FB, fontSize: 13, fontWeight: 600, color: amount > 0 ? '#059669' : INK_MUTED, margin: 0 }}>
            {amount > 0 ? '+' : ''}{'$' + Math.abs(amount).toFixed(2)}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function WalletClient({ slug, bizId: _bizId, bizName, logoUrl: _logoUrl, topUpUrl }: {
  slug: string
  bizId: string
  bizName: string
  logoUrl: string | null
  topUpUrl: string
}) {
  const [cx, setCx] = useState<CxData | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('aria_cx_' + slug)
      if (saved) {
        const { phone } = JSON.parse(saved) as { phone?: string }
        if (phone) {
          fetch('/api/public/cx/' + slug + '/me', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone }),
          })
            .then(r => r.json())
            .then((data: CxData) => { setCx(data.found ? data : null); setLoaded(true) })
            .catch(() => setLoaded(true))
          return
        }
      }
    } catch { /* no localStorage */ }
    setLoaded(true)
  }, [slug])

  const isLoggedIn = cx?.found === true
  const name = cx?.name ?? null
  const tier = cx?.loyalty_tier ?? 'Member'
  const walletBal = cx?.wallet_balance ?? 0
  const identityId = cx?.loyalty_identity_id ?? null
  const earnTxns: EarnTxn[] = (cx?.recent_txns ?? []) as EarnTxn[]
  const preloadTxns: PreloadTxn[] = (cx?.preload_txns ?? []) as PreloadTxn[]

  type MergedTxn = {
    id: string; date: string; label: string; itemName: string | null
    pts: number | null; amount: number | null; kind: 'earn' | 'redeem' | 'preload'
  }

  const allTxns: MergedTxn[] = [
    ...earnTxns.map(t => {
      const isEarn = t.points_delta > 0
      return {
        id: t.id,
        date: t.created_at,
        label: isEarn ? ('Earned +' + t.points_delta) : ('Redeemed ' + t.points_delta),
        itemName: t.reward_redeemed ?? null,
        pts: t.points_delta,
        amount: null,
        kind: (isEarn ? 'earn' : 'redeem') as 'earn' | 'redeem',
      }
    }),
    ...preloadTxns.map(t => ({
      id: t.id,
      date: t.created_at,
      label: t.type === 'top_up' ? ('Preloaded +$' + Math.abs(t.amount).toFixed(2)) : ('Purchase $' + Math.abs(t.amount).toFixed(2)),
      itemName: t.description ?? null,
      pts: null,
      amount: t.type === 'debit' ? -Math.abs(t.amount) : Math.abs(t.amount),
      kind: 'preload' as const,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 12)

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: FB, color: INK, paddingBottom: 100 }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box }
        @keyframes cx-spin { to { transform: rotate(360deg) } }
      `}</style>

      {/* ── Loyalty card — full-width at top, image blends into cream page ── */}
      <div style={{ paddingTop: 48 }}>
        {!loaded ? (
          <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 28, height: 28, border: '2.5px solid rgba(0,0,0,0.1)', borderTopColor: ACCENT_TEXT, borderRadius: '50%', animation: 'cx-spin 0.75s linear infinite' }} />
          </div>
        ) : isLoggedIn ? (
          <LoyaltyCard
            bizName={bizName}
            name={name}
            tier={tier}
            walletBal={walletBal}
            identityId={identityId}
          />
        ) : (
          <div style={{ margin: '0 18px', padding: '28px 20px', background: '#fff', borderRadius: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.07)', textAlign: 'center' }}>
            <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 22, color: INK, margin: '0 0 14px' }}>
              Your loyalty card
            </p>
            <a href={'/' + slug} style={{ display: 'inline-block', background: ACCENT, color: ACCENT_TEXT, borderRadius: 100, padding: '10px 24px', fontFamily: FB, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
              Sign in on Home
            </a>
          </div>
        )}
      </div>

      {/* ── Wallet actions ── */}
      {isLoggedIn && (
        <div style={{ padding: '20px 18px 0' }}>

          {/* Apple + Google Wallet — black pill buttons */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <a
              href={'/api/public/wallet-pass/' + slug}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: '#000', borderRadius: 100, padding: '13px 10px',
                textDecoration: 'none',
              }}
            >
              <IconApple />
              <div>
                <p style={{ fontFamily: FB, fontSize: 9, color: 'rgba(255,255,255,0.65)', margin: 0, lineHeight: 1, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Add to</p>
                <p style={{ fontFamily: FB, fontSize: 13, color: '#fff', margin: 0, fontWeight: 700, lineHeight: 1.2 }}>Apple Wallet</p>
              </div>
            </a>
            <a
              href={'/api/public/google-pass/' + slug}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: '#000', borderRadius: 100, padding: '13px 10px',
                textDecoration: 'none',
              }}
            >
              <IconGoogle />
              <div>
                <p style={{ fontFamily: FB, fontSize: 9, color: 'rgba(255,255,255,0.65)', margin: 0, lineHeight: 1, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Add to</p>
                <p style={{ fontFamily: FB, fontSize: 13, color: '#fff', margin: 0, fontWeight: 700, lineHeight: 1.2 }}>Google Wallet</p>
              </div>
            </a>
          </div>

          {/* Lime Top-up — full width */}
          <a
            href={topUpUrl}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: ACCENT, color: ACCENT_TEXT,
              borderRadius: 100, padding: '16px 0', marginBottom: 24,
              fontFamily: FB, fontSize: 17, fontWeight: 700, textDecoration: 'none',
              boxShadow: '0 0 24px 4px rgba(217,245,78,0.55), 0 4px 18px rgba(217,245,78,0.45), inset 0 1px 0 rgba(255,255,255,0.35)',
            }}
          >
            Top up
          </a>
        </div>
      )}

      {/* ── Transaction history ── */}
      <div style={{ padding: '0 18px' }}>
        <div style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRadius: 22, padding: '18px 18px 4px', boxShadow: '0 3px 18px rgba(0,0,0,0.08)' }}>
          <h2 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 24, fontWeight: 600, margin: '0 0 4px', color: INK }}>
            History
          </h2>
          {!loaded ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: INK_MUTED, fontFamily: FB, fontSize: 14 }}>
              Loading...
            </div>
          ) : allTxns.length > 0 ? (
            <div>
              {allTxns.map(t => (
                <TxnRow
                  key={t.id}
                  date={t.date}
                  label={t.label}
                  itemName={t.itemName}
                  pts={t.pts}
                  amount={t.amount}
                  kind={t.kind}
                  bizName={bizName}
                />
              ))}
            </div>
          ) : (
            <div style={{ padding: '28px 0', textAlign: 'center' }}>
              <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 18, color: INK_MUTED, margin: '0 0 6px' }}>
                No transactions yet
              </p>
              <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, margin: 0 }}>
                Your earn, redeem, and top-up history will appear here
              </p>
            </div>
          )}
        </div>
      </div>

      <CxTabBar slug={slug} active="wallet" />
    </div>
  )
}