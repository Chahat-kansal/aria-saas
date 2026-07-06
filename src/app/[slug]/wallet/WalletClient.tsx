'use client'
import { useState, useEffect } from 'react'
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

// ── Barcode visual — white stripes on dark card ───────────────────────────────

function BarcodeVisual({ code }: { code: string }) {
  const hex = (code.replace(/-/g, '') + code.replace(/-/g, '')).slice(0, 48)
  const bars = hex.split('').map((c, i) => ({
    w: (parseInt(c, 16) % 3) + 1,
    isBar: i % 2 === 0,
  }))
  return (
    <div style={{ display: 'flex', height: 44, width: '100%', borderRadius: 4, overflow: 'hidden' }}>
      {bars.map((b, i) => (
        <div key={i} style={{ flex: b.w, height: '100%', background: b.isBar ? 'rgba(255,255,255,0.88)' : 'transparent' }} />
      ))}
    </div>
  )
}

// ── Loyalty card — stays DARK (it is a physical card) ────────────────────────

function LoyaltyCard({ bizName, logoUrl, name, pts, tier, walletBal, identityId }: {
  bizName: string
  logoUrl: string | null
  name: string | null
  pts: number
  tier: string
  walletBal: number
  identityId: string | null
}) {
  return (
    <div style={{ margin: '0 auto', maxWidth: 340, transform: 'perspective(800px) rotateX(4deg) rotateY(-6deg)', transformOrigin: 'center center' }}>
      <div style={{
        borderRadius: 24,
        background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)',
        padding: '24px 24px 20px',
        boxShadow: '0 28px 56px rgba(0,0,0,0.32), 0 4px 12px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.08)',
        position: 'relative', overflow: 'hidden', minHeight: 192,
      }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(217,245,78,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -30, left: -20, width: 120, height: 120, borderRadius: '50%', background: 'radial-gradient(circle, rgba(100,100,255,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {/* Top: wordmark + logo */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <span style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 22, color: '#fff', fontWeight: 600, letterSpacing: '-0.01em' }}>
              {bizName}
            </span>
            <span style={{ display: 'block', fontFamily: FB, fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 1 }}>
              Loyalty Card
            </span>
          </div>
          {logoUrl ? (
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'url(' + logoUrl + ') center/cover', border: '1px solid rgba(255,255,255,0.15)' }} />
          ) : (
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FB, fontSize: 16, color: '#fff', fontWeight: 700 }}>
              {bizName[0]}
            </div>
          )}
        </div>

        {/* Member info */}
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 20, color: '#fff', margin: '0 0 2px', fontWeight: 500 }}>
            {name ?? 'Member'}
          </p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontFamily: FB, fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>{pts} pts</span>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>·</span>
            <span style={{ fontFamily: FB, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{tier}</span>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>·</span>
            <span style={{ fontFamily: FB, fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>{'$' + walletBal.toFixed(2)}</span>
          </div>
        </div>

        {/* Barcode */}
        {identityId ? (
          <div>
            <BarcodeVisual code={identityId} />
            <p style={{ fontFamily: FB, fontSize: 9, color: 'rgba(255,255,255,0.25)', margin: '5px 0 0', letterSpacing: '0.06em', textAlign: 'center' }}>
              {identityId.slice(0, 8).toUpperCase()}...
            </p>
          </div>
        ) : (
          <div style={{ height: 44, background: 'rgba(255,255,255,0.06)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: FB, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Scan to earn</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Transaction row — light surface ──────────────────────────────────────────

function TxnRow({ date, label, pts, amount, isPos }: { date: string; label: string; pts: number | null; amount: number | null; isPos: boolean }) {
  const d = new Date(date)
  const dateStr = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
      <div style={{
        width: 36, height: 36, borderRadius: 12, flexShrink: 0,
        background: isPos ? '#ecfdf5' : '#fef9ec',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: INK,
      }}>
        {isPos ? '↑' : '↓'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: FB, fontSize: 14, fontWeight: 500, margin: '0 0 1px', color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {label}
        </p>
        <p style={{ fontFamily: FB, fontSize: 12, color: INK_MUTED, margin: 0 }}>{dateStr}</p>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {pts !== null && (
          <p style={{ fontFamily: FB, fontSize: 14, fontWeight: 700, color: isPos ? '#059669' : '#dc2626', margin: 0 }}>
            {isPos ? '+' : ''}{pts} pts
          </p>
        )}
        {amount !== null && (
          <p style={{ fontFamily: FB, fontSize: 12, color: INK_MUTED, margin: 0 }}>
            {'$' + Math.abs(amount).toFixed(2)}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function WalletClient({ slug, bizId, bizName, logoUrl, topUpUrl }: {
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
  const pts = cx?.points_balance ?? 0
  const tier = cx?.loyalty_tier ?? 'Member'
  const walletBal = cx?.wallet_balance ?? 0
  const identityId = cx?.loyalty_identity_id ?? null
  const earnTxns: EarnTxn[] = (cx?.recent_txns ?? []) as EarnTxn[]
  const preloadTxns: PreloadTxn[] = (cx?.preload_txns ?? []) as PreloadTxn[]

  type MergedTxn = { id: string; date: string; label: string; pts: number | null; amount: number | null; isPos: boolean }
  const allTxns: MergedTxn[] = [
    ...earnTxns.map(t => ({
      id: t.id,
      date: t.created_at,
      label: t.reward_redeemed ? ('Redeemed: ' + t.reward_redeemed) : (t.type === 'earn' ? 'Points earned' : t.type === 'redeem' ? 'Points redeemed' : t.type),
      pts: t.points_delta,
      amount: null,
      isPos: t.points_delta > 0,
    })),
    ...preloadTxns.map(t => ({
      id: t.id,
      date: t.created_at,
      label: t.description ?? (t.type === 'top_up' ? 'Wallet top-up' : t.type === 'debit' ? 'Purchase' : t.type),
      pts: null,
      amount: t.type === 'debit' ? -Math.abs(t.amount) : Math.abs(t.amount),
      isPos: t.type !== 'debit',
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 12)

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: FB, color: INK, paddingBottom: 100 }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box }
        @keyframes cx-spin { to { transform: rotate(360deg) } }
      `}</style>

      {/* ── Header — LIGHT ── */}
      <div style={{ paddingTop: 56, paddingBottom: 32, paddingLeft: 18, paddingRight: 18, textAlign: 'center' }}>
        <h1 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 32, color: INK, margin: '0 0 28px', fontWeight: 400 }}>
          Wallet
        </h1>

        {/* Loyalty card floating on light page */}
        {!loaded ? (
          <div style={{ height: 192, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 28, height: 28, border: '2.5px solid rgba(0,0,0,0.1)', borderTopColor: ACCENT_TEXT, borderRadius: '50%', animation: 'cx-spin 0.75s linear infinite' }} />
          </div>
        ) : isLoggedIn ? (
          <LoyaltyCard bizName={bizName} logoUrl={logoUrl} name={name} pts={pts} tier={tier} walletBal={walletBal} identityId={identityId} />
        ) : (
          <div style={{ textAlign: 'center', padding: '28px 20px', background: '#fff', borderRadius: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.07)' }}>
            <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 22, color: INK, margin: '0 0 14px' }}>
              Your loyalty card
            </p>
            <a href={'/' + slug} style={{ display: 'inline-block', background: ACCENT, color: ACCENT_TEXT, borderRadius: 100, padding: '10px 24px', fontFamily: FB, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
              Sign in on Home
            </a>
          </div>
        )}

        {/* Apple/Google Wallet pills — light style */}
        {isLoggedIn && (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#fff', borderRadius: 100, padding: '8px 18px', border: '1px solid rgba(0,0,0,0.1)', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
              <span style={{ fontSize: 14 }}>🍎</span>
              <span style={{ fontFamily: FB, fontSize: 12, color: INK, fontWeight: 500 }}>Apple Wallet</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#fff', borderRadius: 100, padding: '8px 18px', border: '1px solid rgba(0,0,0,0.1)', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
              <span style={{ fontSize: 14 }}>🤖</span>
              <span style={{ fontFamily: FB, fontSize: 12, color: INK, fontWeight: 500 }}>Google Wallet</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Balance + transactions — light surface ── */}
      <div style={{ padding: '0 18px' }}>

        {/* Balance card + top-up */}
        {isLoggedIn && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, background: '#fff', borderRadius: 20, padding: '16px 18px', boxShadow: '0 2px 14px rgba(0,0,0,0.07)' }}>
            <div>
              <p style={{ fontFamily: FB, fontSize: 11, color: INK_MUTED, margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Wallet balance
              </p>
              <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 30, color: INK, margin: 0, fontWeight: 600 }}>
                {'$' + walletBal.toFixed(2)}
              </p>
            </div>
            <a href={topUpUrl} style={{ background: ACCENT, color: ACCENT_TEXT, borderRadius: 100, padding: '11px 22px', fontFamily: FB, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
              + Top up
            </a>
          </div>
        )}

        {/* Transaction history */}
        <div style={{ background: '#fff', borderRadius: 20, padding: '16px 18px', boxShadow: '0 2px 14px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 22, fontWeight: 600, margin: '0 0 8px', color: INK }}>
            History
          </h2>
          {!loaded ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: INK_MUTED, fontFamily: FB, fontSize: 14 }}>
              Loading...
            </div>
          ) : allTxns.length > 0 ? (
            <div>
              {allTxns.map(t => (
                <TxnRow key={t.id} date={t.date} label={t.label} pts={t.pts} amount={t.amount} isPos={t.isPos} />
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