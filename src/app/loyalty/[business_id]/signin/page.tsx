'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'

// Locked Pipel design — light ink-on-cream, hard 1.5px borders, Cormorant + Outfit.
const INK = '#0a0a0a', CREAM = '#fafafa', SURFACE = '#ffffff', INK_SOFT = '#888888', ACCENT = '#d9f54e'
const BORDER = `1.5px solid ${INK}`
const FONT = "var(--font-body, 'Outfit', system-ui, sans-serif)"

type Step = 'loading' | 'email' | 'pin' | 'code' | 'setpin' | 'join' | 'landing'

interface Activity { type: string; points_delta: number; stamps_delta: number; reward_redeemed: string | null; created_at: string }
interface DashData {
  customer: { name: string | null }
  program_type: 'points' | 'stamps'
  points: { balance: number; dollar_value: number; point_value_cents: number }
  stamps: { count: number; target: number; remaining: number; reward_text: string }
  tier: { current_label: string; current_color: string; next_label: string | null; progress_pct: number; to_next_points: number } | null
  reward_available: { available: boolean; text?: string; dollars?: number }
  activity: Activity[]
  empty: boolean
}

interface AcctForm { name: string; email: string; phone: string; birthday: string; marketing_consent: boolean; email_consent: boolean; sms_consent: boolean }
interface OfferItem { id: string; title: string; description: string | null; image_url: string | null; offer_type: string; point_cost: number | null }
interface ChallengeItem { id: string; title: string; description: string | null; target_metric: string; target_item: string | null; target_count: number; progress: number; reward_points: number; status: string; expires_at: string | null }
interface InviteRow { status: string; date: string; points: number }
interface InviteData { enabled: boolean; code: string | null; share_url: string | null; referrer_bonus: number; referee_bonus: number; summary?: { total: number; rewarded: number; pending: number }; referrals: InviteRow[] }
interface PreloadLedger { entry_type: string; amount: number; balance_after: number; note: string | null; created_at: string }
interface PreloadData { enabled: boolean; balance: number; amounts: number[]; bonus_threshold: number; bonus_amount: number; ledger: PreloadLedger[] }

export default function LoyaltySignInPage() {
  const params = useParams()
  const bid = params?.business_id as string
  const [bizName, setBizName] = useState('Rewards')
  const [step, setStep] = useState<Step>('loading')
  const [mode, setMode] = useState<'login' | 'join' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [welcome, setWelcome] = useState<string | null>(null)
  const [dash, setDash] = useState<DashData | null>(null)
  const [showAccount, setShowAccount] = useState(false)
  const [acct, setAcct] = useState<AcctForm | null>(null)
  const [acctBusy, setAcctBusy] = useState(false)
  const [acctMsg, setAcctMsg] = useState('')
  const [acctErr, setAcctErr] = useState<Record<string, string>>({})
  const [showCode, setShowCode] = useState(false)
  const [qr, setQr] = useState<string | null>(null)
  const [codeBusy, setCodeBusy] = useState(false)
  const [codeExpiry, setCodeExpiry] = useState(0)
  const [secsLeft, setSecsLeft] = useState(0)
  const regenRef = useRef(false)
  const [showOffers, setShowOffers] = useState(false)
  const [offers, setOffers] = useState<OfferItem[] | null>(null)
  const [showChallenges, setShowChallenges] = useState(false)
  const [challenges, setChallenges] = useState<ChallengeItem[] | null>(null)
  const [challengesOn, setChallengesOn] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [invite, setInvite] = useState<InviteData | null>(null)
  const [inviteOn, setInviteOn] = useState(false)
  const [tierPerks, setTierPerks] = useState<{ perk_type: string; perk_value: number | null }[]>([])
  const [preload, setPreload] = useState<PreloadData | null>(null)
  const [showPreload, setShowPreload] = useState(false)
  const [loadingAmt, setLoadingAmt] = useState<number | null>(null)
  const [wallet, setWallet] = useState<{ google?: { configured: boolean; save_url: string | null }; apple?: { configured: boolean } } | null>(null)
  const [wa, setWa] = useState<{ enabled: boolean; opted_in: boolean; has_phone?: boolean } | null>(null)
  const [waBusy, setWaBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const refCodeRef = useRef<string | null>(null)
  const refCapturedRef = useRef(false)

  const openOffers = async () => {
    setShowOffers(true); setOffers(null)
    const d = await fetch('/api/loyalty/offers-feed?business_id=' + encodeURIComponent(bid)).then(r => r.json()).catch(() => null)
    if (d) setOffers((d.offers ?? []) as OfferItem[])
  }

  const loadChallenges = async () => {
    const d = await fetch('/api/loyalty/challenges?business_id=' + encodeURIComponent(bid)).then(r => r.json()).catch(() => null)
    if (d) { setChallengesOn(!!d.enabled); setChallenges((d.challenges ?? []) as ChallengeItem[]) }
  }
  const openChallenges = async () => { setShowChallenges(true); setChallenges(null); await loadChallenges() }

  const loadInvite = async () => {
    const d = await fetch('/api/loyalty/referral-link?business_id=' + encodeURIComponent(bid)).then(r => r.json()).catch(() => null)
    if (d) { setInviteOn(!!d.enabled); setInvite(d as InviteData) }
  }
  const openInvite = async () => { setShowInvite(true); setInvite(null); setCopied(false); await loadInvite() }
  const copyInvite = async () => {
    if (!invite?.share_url) return
    try { await navigator.clipboard.writeText(invite.share_url); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* clipboard blocked — user can select the text */ }
  }

  const generateCode = async () => {
    if (regenRef.current) return
    regenRef.current = true
    setCodeBusy(true); setQr(null)
    try {
      const r = await fetch('/api/loyalty/redeem-code', { method: 'POST' })
      const d = await r.json()
      if (r.ok && d.token) {
        const QRCode = (await import('qrcode')).default
        const url = await QRCode.toDataURL(d.token, { margin: 1, width: 240 })
        setQr(url); setCodeExpiry(new Date(d.expires_at).getTime())
      }
    } catch { /* ignore — user can tap refresh */ }
    setCodeBusy(false); regenRef.current = false
  }
  const openCode = () => { setShowCode(true); generateCode() }

  // Live countdown; auto-regenerate once when the short-lived code lapses.
  useEffect(() => {
    if (!showCode || !codeExpiry) return
    const t = setInterval(() => {
      const left = Math.max(0, Math.round((codeExpiry - Date.now()) / 1000))
      setSecsLeft(left)
      if (left === 0 && !regenRef.current) generateCode()
    }, 1000)
    return () => clearInterval(t)
  }, [showCode, codeExpiry])

  const openAccount = async () => {
    setAcctMsg(''); setAcctErr({}); setAcct(null); setShowAccount(true)
    const d = await fetch('/api/loyalty/account?business_id=' + encodeURIComponent(bid)).then(r => r.json()).catch(() => null)
    if (d?.account) setAcct(d.account as AcctForm)
  }
  const saveAccount = async () => {
    if (!acct) return
    setAcctBusy(true); setAcctMsg(''); setAcctErr({})
    const r = await fetch('/api/loyalty/account', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...acct, business_id: bid }) })
    const d = await r.json().catch(() => ({}))
    setAcctBusy(false)
    if (r.ok && d.ok) {
      setAcctMsg('Saved ✓'); setWelcome(acct.name || welcome)
      fetch('/api/loyalty/dashboard?business_id=' + encodeURIComponent(bid)).then(x => x.json()).then(x => { if (x?.customer) setDash(x as DashData) }).catch(() => {})
    } else if (d.errors) { setAcctErr(d.errors as Record<string, string>) }
    else { setAcctMsg(d.error || 'Could not save — please try again.') }
  }

  useEffect(() => {
    if (!bid) return
    try { refCodeRef.current = new URLSearchParams(window.location.search).get('ref') } catch { refCodeRef.current = null }
    fetch(`/api/public/loyalty/${bid}`).then(r => r.json()).then(d => { if (d?.business?.name) setBizName(d.business.name) }).catch(() => {})
    // Same-device session → resolve identity + membership at THIS business.
    fetch('/api/loyalty/auth?business_id=' + encodeURIComponent(bid)).then(r => r.json()).then(d => {
      if (d?.identity) {
        if (d.membership) { setWelcome(d.membership.name ?? null); setStep('landing') }
        else setStep('join')
      } else setStep('email')
    }).catch(() => setStep('email'))
  }, [bid])

  // After a global login, route to this business's dashboard or the join prompt.
  const checkMembership = async () => {
    const m = await fetch('/api/loyalty/membership?business_id=' + encodeURIComponent(bid)).then(r => r.json()).catch(() => null)
    if (m?.member) { setWelcome(m.name ?? null); setStep('landing') } else setStep('join')
  }

  const joinBusiness = async () => {
    setBusy(true); setError('')
    const r = await fetch('/api/loyalty/membership', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: bid, name: name || undefined, ref: refCodeRef.current || undefined }) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok || !d.ok) { setError(d.error || 'Could not join — try again.'); return }
    setWelcome(d.name ?? null); setStep('landing')
  }

  // Load the read-only dashboard whenever we land (membership scoped by identity + business).
  useEffect(() => {
    if (step !== 'landing') return
    setDash(null)
    fetch('/api/loyalty/dashboard?business_id=' + encodeURIComponent(bid)).then(r => r.json()).then(d => { if (d?.customer) setDash(d as DashData) }).catch(() => {})
    // Whether this business runs challenges (gates the nav link + lazily generates the member's missions).
    loadChallenges()
    // LOY-REFERRALS — if this member arrived via an invite link, record the pending referral once
    // (idempotent server-side; covers both the join and set-PIN signup paths). Then load invite state.
    if (refCodeRef.current && !refCapturedRef.current) {
      refCapturedRef.current = true
      fetch('/api/loyalty/referral-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: bid, ref: refCodeRef.current }) }).catch(() => {})
    }
    loadInvite()
    // LOY-TIER-PERKS — show the member's current-tier perks on their wallet.
    fetch('/api/loyalty/tier-perks?business_id=' + encodeURIComponent(bid)).then(r => r.json()).then(d => { if (Array.isArray(d?.perks)) setTierPerks(d.perks) }).catch(() => {})
    // LOY-PRELOAD — stored-value balance.
    fetch('/api/loyalty/preload?business_id=' + encodeURIComponent(bid)).then(r => r.json()).then(d => { if (d && d.enabled !== undefined) setPreload(d as PreloadData) }).catch(() => {})
    // LOY-WALLET-PASS — Apple/Google Wallet pass availability for this membership.
    fetch('/api/loyalty/wallet-pass?business_id=' + encodeURIComponent(bid)).then(r => r.json()).then(d => { if (d && (d.google || d.apple)) setWallet(d) }).catch(() => {})
    // LOY-WHATSAPP — channel availability + this member's opt-in state.
    fetch('/api/loyalty/whatsapp?business_id=' + encodeURIComponent(bid)).then(r => r.json()).then(d => { if (d && d.enabled !== undefined) setWa(d) }).catch(() => {})
  }, [step, bid])

  const toggleWa = async (next: boolean) => {
    setWaBusy(true)
    const r = await fetch('/api/loyalty/whatsapp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: next ? 'opt_in' : 'opt_out', business_id: bid }) }).then(r => r.json()).catch(() => ({}))
    if (r.ok) setWa(w => w ? { ...w, opted_in: !!r.opted_in } : w)
    setWaBusy(false)
  }

  const startLoad = async (amount: number) => {
    setLoadingAmt(amount)
    try {
      const r = await fetch('/api/loyalty/preload/load', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: bid, amount }) })
      const d = await r.json().catch(() => ({}))
      if (d.url) { window.location.href = d.url as string; return }
    } catch { /* ignore — user can retry */ }
    setLoadingAmt(null)
  }

  const post = async (payload: Record<string, unknown>) => {
    const r = await fetch('/api/loyalty/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    return { ok: r.ok, d: await r.json().catch(() => ({})) }
  }

  const continueEmail = async () => {
    setError('')
    if (!email.includes('@')) { setError('Enter a valid email.'); return }
    if (mode === 'login') { setStep('pin'); return }
    // join / forgot → send a code
    setBusy(true)
    const { d } = await post({ action: 'send-code', email })
    setBusy(false)
    if (d.error) { setError(d.error); return }
    setInfo(`We've emailed a 6-digit code to ${email}.`); setStep('code')
  }

  const doLogin = async () => {
    setError('')
    if (!/^\d{6}$/.test(pin)) { setError('Enter your 6-digit PIN.'); return }
    setBusy(true)
    const { ok, d } = await post({ action: 'login', email, pin })
    setBusy(false)
    if (!ok || d.error) { setError(d.error || 'Sign-in failed.'); setPin(''); return }
    await checkMembership()
  }

  const verifyCode = async () => {
    setError('')
    if (!/^\d{6}$/.test(code)) { setError('Enter the 6-digit code.'); return }
    setBusy(true)
    const { ok, d } = await post({ action: 'verify', email, code })
    setBusy(false)
    if (!ok || d.error) { setError(d.error || 'That code is incorrect or expired.'); return }
    setStep('setpin')
  }

  const setPinSubmit = async () => {
    setError('')
    if (!/^\d{6}$/.test(pin)) { setError('Choose a 6-digit PIN.'); return }
    if (pin !== confirm) { setError('The two PINs don’t match.'); return }
    setBusy(true)
    const { ok, d } = await post({ action: 'set-pin', business_id: bid, email, pin, name: mode === 'join' ? name : undefined })
    setBusy(false)
    if (!ok || d.error) { setError(d.error || 'Could not set your PIN.'); return }
    setWelcome(d.name ?? null); setStep('landing')
  }

  const logout = async () => {
    await post({ action: 'logout' })
    setEmail(''); setPin(''); setConfirm(''); setCode(''); setWelcome(null); setMode('login'); setStep('email')
  }

  const card: React.CSSProperties = { background: SURFACE, border: BORDER, borderRadius: 22, padding: 28, boxShadow: '4px 4px 0 #0a0a0a' }
  const inp: React.CSSProperties = { width: '100%', padding: '12px 14px', borderRadius: 12, border: BORDER, background: SURFACE, color: INK, fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: FONT }
  const pinInp: React.CSSProperties = { ...inp, fontSize: 22, letterSpacing: 8, textAlign: 'center' }
  const btn: React.CSSProperties = { height: 48, borderRadius: 12, border: BORDER, background: ACCENT, color: INK, fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: FONT }
  const link: React.CSSProperties = { background: 'none', border: 'none', color: INK, textDecoration: 'underline', cursor: 'pointer', fontSize: 13, fontFamily: FONT, padding: 0 }

  const wrap = (children: React.ReactNode) => (
    <div style={{ minHeight: '100vh', background: CREAM, fontFamily: FONT, color: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, textAlign: 'center', margin: '0 0 18px', fontFamily: "var(--font-display, 'Cormorant', Georgia, serif)", fontStyle: 'italic' }}>{bizName} Rewards</h1>
        {children}
        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 12, color: INK_SOFT }}>Powered by Aria</div>
      </div>
    </div>
  )

  if (step === 'loading') return wrap(<p style={{ textAlign: 'center', color: INK_SOFT }}>Loading…</p>)

  if (step === 'landing') {
    const bar = (pct: number) => (
      <div style={{ height: 10, borderRadius: 999, border: BORDER, background: SURFACE, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, background: ACCENT }} />
      </div>
    )
    const header = (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, fontFamily: "var(--font-display, 'Cormorant', Georgia, serif)", fontStyle: 'italic' }}>Hi{welcome ? `, ${welcome.split(' ')[0]}` : ''} 👋</h2>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {preload?.enabled && <button onClick={() => setShowPreload(true)} style={link}>Balance</button>}
          {challengesOn && <button onClick={openChallenges} style={link}>Challenges</button>}
          {inviteOn && <button onClick={openInvite} style={link}>Invite</button>}
          <button onClick={openOffers} style={link}>Offers</button>
          <button onClick={openAccount} style={link}>My details</button>
          <button onClick={logout} style={link}>Sign out</button>
        </div>
      </div>
    )

    // ── Preload balance (stored value; load via Stripe, spend in store) ──
    if (showPreload && preload) {
      const bonusNote = preload.bonus_threshold > 0 && preload.bonus_amount > 0
        ? `Load $${(Number(preload.bonus_threshold) || 0).toFixed(0)}+ and get $${(Number(preload.bonus_amount) || 0).toFixed(2)} free.` : null
      return wrap(
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, fontFamily: "var(--font-display, 'Cormorant', Georgia, serif)", fontStyle: 'italic' }}>Your balance</h2>
            <button onClick={() => setShowPreload(false)} style={link}>← Back</button>
          </div>
          <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
            <div style={{ fontSize: 48, fontWeight: 800, lineHeight: 1, fontFamily: "var(--font-display, 'Cormorant', Georgia, serif)", fontStyle: 'italic' }}>${(Number(preload.balance) || 0).toFixed(2)}</div>
            <p style={{ fontSize: 13, color: INK_SOFT, margin: '6px 0 0' }}>available to spend in store</p>
          </div>
          <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px' }}>Top up</p>
          {bonusNote && <p style={{ fontSize: 12, color: INK_SOFT, margin: '0 0 10px' }}>🎁 {bonusNote}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {preload.amounts.map(a => (
              <button key={a} onClick={() => startLoad(a)} disabled={loadingAmt != null}
                style={{ ...btn, flex: '1 0 28%', minWidth: 90, opacity: loadingAmt != null && loadingAmt !== a ? 0.5 : 1 }}>
                {loadingAmt === a ? '…' : `$${a}`}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 13, fontWeight: 700, margin: '4px 0 8px' }}>History</p>
          {preload.ledger.length === 0 ? (
            <p style={{ fontSize: 14, color: INK_SOFT, margin: 0, lineHeight: 1.5 }}>No activity yet — top up to get started. 🌱</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {preload.ledger.map((e, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: i ? '1px solid #eee' : 'none' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, textTransform: 'capitalize' }}>{e.entry_type === 'spend' ? 'Spent in store' : e.entry_type === 'load' ? 'Top up' : e.entry_type === 'bonus' ? 'Bonus' : 'Refund'}</div>
                    <div style={{ fontSize: 12, color: INK_SOFT }}>{new Date(e.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: (Number(e.amount) || 0) < 0 ? '#d11' : INK }}>{(Number(e.amount) || 0) < 0 ? '' : '+'}${(Number(e.amount) || 0).toFixed(2)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }

    // ── Invite a friend (shareable code/link; you both get points on their first visit) ──
    if (showInvite) {
      const statusChip = (s: string) => (
        <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, border: BORDER, background: s === 'rewarded' ? ACCENT : SURFACE }}>
          {s === 'rewarded' ? 'Rewarded' : s === 'cancelled' ? 'Cancelled' : 'Pending'}
        </span>
      )
      return wrap(
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, fontFamily: "var(--font-display, 'Cormorant', Georgia, serif)", fontStyle: 'italic' }}>Invite a friend</h2>
            <button onClick={() => setShowInvite(false)} style={link}>← Back</button>
          </div>
          {!invite ? (
            <p style={{ textAlign: 'center', color: INK_SOFT, margin: '12px 0' }}>Loading…</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 15, margin: 0, lineHeight: 1.5 }}>
                Share your link — when a friend joins and makes their first purchase, <strong>you get {invite.referrer_bonus} points</strong> and <strong>they get {invite.referee_bonus}</strong>. 🎉
              </p>
              {invite.code && (
                <div style={{ border: BORDER, borderRadius: 14, padding: 16, background: ACCENT, textAlign: 'center' }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: INK, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your code</p>
                  <p style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: 2, fontFamily: "var(--font-display, 'Cormorant', Georgia, serif)" }}>{invite.code}</p>
                </div>
              )}
              {invite.share_url && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ ...inp, fontSize: 12, color: INK_SOFT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '10px 12px' }}>{invite.share_url}</div>
                  <button onClick={copyInvite} style={btn}>{copied ? 'Copied ✓' : 'Copy invite link'}</button>
                </div>
              )}
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, margin: '4px 0 8px' }}>Your referrals{invite.summary ? ` · ${invite.summary.rewarded} rewarded, ${invite.summary.pending} pending` : ''}</p>
                {invite.referrals.length === 0 ? (
                  <p style={{ fontSize: 14, color: INK_SOFT, margin: 0, lineHeight: 1.5 }}>No invites yet — share your link to start earning. 🌱</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {invite.referrals.map((r, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: i ? '1px solid #eee' : 'none' }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>Friend joined</div>
                          <div style={{ fontSize: 12, color: INK_SOFT }}>{new Date(r.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {r.status === 'rewarded' && <span style={{ fontSize: 14, fontWeight: 800 }}>+{r.points}</span>}
                          {statusChip(r.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )
    }

    // ── Challenges (read-only personalised missions; progress only advances from real in-store sales) ──
    if (showChallenges) {
      const dot = (filled: boolean) => (
        <span style={{ width: 14, height: 14, borderRadius: '50%', border: BORDER, background: filled ? ACCENT : SURFACE, flexShrink: 0 }} />
      )
      return wrap(
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, fontFamily: "var(--font-display, 'Cormorant', Georgia, serif)", fontStyle: 'italic' }}>Your challenges</h2>
            <button onClick={() => setShowChallenges(false)} style={link}>← Back</button>
          </div>
          {!challenges ? (
            <p style={{ textAlign: 'center', color: INK_SOFT, margin: '12px 0' }}>Loading…</p>
          ) : challenges.length === 0 ? (
            <p style={{ textAlign: 'center', color: INK_SOFT, margin: '12px 0', lineHeight: 1.5 }}>No challenges right now — visit us a few times and we&apos;ll set you some personalised goals. 🌱</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {challenges.map(c => {
                const done = c.status === 'completed' || c.status === 'claimed'
                const target = Math.max(1, c.target_count)
                const prog = Math.max(0, Math.min(target, c.progress))
                const pct = Math.round((prog / target) * 100)
                return (
                  <div key={c.id} style={{ border: BORDER, borderRadius: 14, padding: 16, background: done ? ACCENT : SURFACE }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                      <p style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{c.title}</p>
                      <span style={{ fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', padding: '3px 9px', borderRadius: 999, border: BORDER, background: done ? SURFACE : ACCENT }}>+{c.reward_points} pts</span>
                    </div>
                    {c.description && <p style={{ fontSize: 13, color: done ? INK : INK_SOFT, margin: '6px 0 0', lineHeight: 1.5 }}>{c.description}</p>}
                    {done ? (
                      <p style={{ fontSize: 14, fontWeight: 800, margin: '12px 0 0' }}>✓ Complete — {c.reward_points} points added!</p>
                    ) : target <= 12 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center', marginTop: 12 }}>
                        {Array.from({ length: target }).map((_, i) => <span key={i}>{dot(i < prog)}</span>)}
                        <span style={{ fontSize: 12, color: INK_SOFT, marginLeft: 4 }}>{prog}/{target}</span>
                      </div>
                    ) : (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ height: 10, borderRadius: 999, border: BORDER, background: SURFACE, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: ACCENT }} />
                        </div>
                        <p style={{ fontSize: 12, color: INK_SOFT, margin: '6px 0 0' }}>{prog}/{target}</p>
                      </div>
                    )}
                  </div>
                )
              })}
              <p style={{ fontSize: 12, color: INK_SOFT, margin: '4px 0 0', lineHeight: 1.5, textAlign: 'center' }}>Progress updates automatically when you buy in store. 🌿</p>
            </div>
          )}
        </div>
      )
    }

    // ── Offers (read-only feed of the business's active offers) ──
    if (showOffers) {
      return wrap(
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, fontFamily: "var(--font-display, 'Cormorant', Georgia, serif)", fontStyle: 'italic' }}>Offers</h2>
            <button onClick={() => setShowOffers(false)} style={link}>← Back</button>
          </div>
          {!offers ? (
            <p style={{ textAlign: 'center', color: INK_SOFT, margin: '12px 0' }}>Loading…</p>
          ) : offers.length === 0 ? (
            <p style={{ textAlign: 'center', color: INK_SOFT, margin: '12px 0', lineHeight: 1.5 }}>No offers right now — check back soon. 🌿</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {offers.map(o => (
                <div key={o.id} style={{ border: BORDER, borderRadius: 14, overflow: 'hidden', background: SURFACE }}>
                  {o.image_url && <img src={o.image_url} alt="" style={{ width: '100%', height: 130, objectFit: 'cover', display: 'block' }} />}
                  <div style={{ padding: 14 }}>
                    <p style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{o.title}</p>
                    {o.description && <p style={{ fontSize: 14, color: INK_SOFT, margin: '6px 0 0', lineHeight: 1.5 }}>{o.description}</p>}
                    <p style={{ fontSize: 12, fontWeight: 700, margin: '10px 0 0' }}>
                      {o.point_cost != null ? `${o.point_cost} points · ` : ''}🎁 Claim in store
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }

    // ── Redeem code (short-lived single-use QR shown at the counter) ──
    if (showCode) {
      const expired = secsLeft <= 0 && !codeBusy
      return wrap(
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, fontFamily: "var(--font-display, 'Cormorant', Georgia, serif)", fontStyle: 'italic' }}>Show this at the counter</h2>
            <button onClick={() => setShowCode(false)} style={link}>← Back</button>
          </div>
          {codeBusy && !qr ? (
            <p style={{ color: INK_SOFT, margin: '24px 0' }}>Generating your code…</p>
          ) : qr && !expired ? (
            <>
              <img src={qr} alt="Your redeem code" width={240} height={240} style={{ border: BORDER, borderRadius: 16, background: SURFACE }} />
              <p style={{ fontSize: 13, color: INK_SOFT, margin: '14px 0 0' }}>The cashier scans this to apply your rewards.</p>
              <p style={{ fontSize: 13, fontWeight: 700, margin: '4px 0 0' }}>Refreshes in {secsLeft}s</p>
            </>
          ) : (
            <>
              <p style={{ color: INK_SOFT, margin: '24px 0 12px' }}>Your code expired — get a fresh one.</p>
            </>
          )}
          <button onClick={generateCode} disabled={codeBusy} style={{ ...btn, marginTop: 16, opacity: codeBusy ? 0.6 : 1 }}>{codeBusy ? 'Refreshing…' : 'Get a fresh code'}</button>
        </div>
      )
    }

    // ── My details (self-service account editor) ──
    if (showAccount) {
      const field = (label: string, key: 'name' | 'email' | 'phone' | 'birthday', type: string) => (
        <div>
          <label style={{ fontSize: 12, color: INK_SOFT, display: 'block', marginBottom: 5 }}>{label}</label>
          <input type={type} value={acct?.[key] ?? ''} onChange={e => setAcct(a => a ? { ...a, [key]: e.target.value } : a)} style={inp} />
          {acctErr[key] && <p style={{ color: '#d11', fontSize: 12, margin: '4px 0 0' }}>{acctErr[key]}</p>}
        </div>
      )
      const toggle = (label: string, key: 'marketing_consent' | 'email_consent' | 'sms_consent') => (
        <button type="button" onClick={() => setAcct(a => a ? { ...a, [key]: !a[key] } : a)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 12, border: BORDER, background: SURFACE, color: INK, fontFamily: FONT, fontSize: 14, cursor: 'pointer' }}>
          <span style={{ width: 38, height: 22, borderRadius: 999, background: acct?.[key] ? ACCENT : '#ddd', padding: 2, flexShrink: 0, transition: 'background 150ms' }}>
            <span style={{ display: 'block', width: 18, height: 18, borderRadius: '50%', background: INK, transform: acct?.[key] ? 'translateX(16px)' : 'translateX(0)', transition: 'transform 150ms' }} />
          </span>
          <span>{label}</span>
        </button>
      )
      return wrap(
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, fontFamily: "var(--font-display, 'Cormorant', Georgia, serif)", fontStyle: 'italic' }}>My details</h2>
            <button onClick={() => { setShowAccount(false); setAcctMsg('') }} style={link}>← Back</button>
          </div>
          {!acct ? <p style={{ textAlign: 'center', color: INK_SOFT, margin: '12px 0' }}>Loading…</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {field('Name', 'name', 'text')}
              {field('Email', 'email', 'email')}
              {field('Mobile', 'phone', 'tel')}
              {field('Birthday', 'birthday', 'date')}
              <p style={{ fontSize: 12, fontWeight: 700, color: INK_SOFT, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '6px 0 0' }}>Marketing preferences</p>
              {toggle('Receive offers & rewards', 'marketing_consent')}
              {toggle('Email me', 'email_consent')}
              {toggle('Text me', 'sms_consent')}
              {acctMsg && <p style={{ fontSize: 13, color: acctMsg.includes('✓') ? '#2e7d32' : '#d11', margin: 0 }}>{acctMsg}</p>}
              <button onClick={saveAccount} disabled={acctBusy} style={{ ...btn, opacity: acctBusy ? 0.6 : 1 }}>{acctBusy ? 'Saving…' : 'Save changes'}</button>
            </div>
          )}
        </div>
      )
    }

    if (!dash) return wrap(<div style={card}>{header}<p style={{ textAlign: 'center', color: INK_SOFT, margin: '12px 0' }}>Loading your rewards…</p></div>)

    const isStamps = dash.program_type === 'stamps'
    const reward = dash.reward_available

    return wrap(
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={card}>
          {header}

          {/* HERO — visible progress */}
          {isStamps ? (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: INK_SOFT, margin: '0 0 12px' }}>Your stamp card</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 14 }}>
                {Array.from({ length: dash.stamps.target }).map((_, i) => (
                  <div key={i} style={{ width: 38, height: 38, borderRadius: '50%', border: BORDER, display: 'flex', alignItems: 'center', justifyContent: 'center', background: i < dash.stamps.count ? ACCENT : SURFACE, fontSize: 16, fontWeight: 800 }}>{i < dash.stamps.count ? '★' : ''}</div>
                ))}
              </div>
              <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
                {dash.stamps.remaining === 0 ? `Reward ready: ${dash.stamps.reward_text}!` : `${dash.stamps.remaining} more to ${dash.stamps.reward_text}`}
              </p>
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: INK_SOFT, margin: '0 0 4px' }}>Your balance</p>
              <div style={{ fontSize: 52, fontWeight: 800, lineHeight: 1, fontFamily: "var(--font-display, 'Cormorant', Georgia, serif)", fontStyle: 'italic' }}>{dash.points.balance.toLocaleString()}</div>
              <p style={{ fontSize: 14, color: INK_SOFT, margin: '6px 0 0' }}>points · worth ${dash.points.dollar_value.toFixed(2)} in-store</p>
            </div>
          )}

          {/* REWARD AVAILABLE — display only, redeem is in-store */}
          {reward.available && (
            <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 12, border: BORDER, background: ACCENT, fontSize: 14, fontWeight: 700, textAlign: 'center' }}>
              {isStamps ? `🎁 ${reward.text} — claim it in store` : `🎁 You can redeem $${(reward.dollars ?? 0).toFixed(2)} in-store`}
            </div>
          )}
          {/* Redeem CTA — opens the short-lived scannable code */}
          <button onClick={openCode} style={{ ...btn, marginTop: 16, width: '100%' }}>📲 Redeem in store</button>
        </div>

        {/* TIER (points mode) */}
        {!isStamps && dash.tier && (
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, padding: '3px 10px', borderRadius: 999, border: BORDER, color: dash.tier.current_color }}>{dash.tier.current_label}</span>
              {dash.tier.next_label && <span style={{ fontSize: 12, color: INK_SOFT }}>{dash.tier.to_next_points.toLocaleString()} points to {dash.tier.next_label}</span>}
            </div>
            {dash.tier.next_label ? bar(dash.tier.progress_pct) : <p style={{ fontSize: 12, color: INK_SOFT, margin: 0 }}>You&apos;re at our top tier — thank you!</p>}
            {tierPerks.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                {tierPerks.map((p, i) => (
                  <span key={i} style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, border: BORDER, background: ACCENT }}>
                    {p.perk_type === 'points_multiplier' ? `★ Earn ×${Number(p.perk_value) || 1} points` : p.perk_type === 'priority' ? '★ Priority service' : p.perk_type}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ACTIVITY */}
        <div style={card}>
          <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 10px' }}>Recent activity</p>
          {dash.empty || dash.activity.length === 0 ? (
            <p style={{ fontSize: 14, color: INK_SOFT, margin: 0, lineHeight: 1.5 }}>Start earning — show your email at the counter on your next visit. 🌱</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {dash.activity.map((a, i) => {
                const isRedeem = a.type === 'redeem'
                const delta = isStamps ? a.stamps_delta : a.points_delta
                const unit = isStamps ? (Math.abs(delta) === 1 ? 'stamp' : 'stamps') : 'pts'
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: i ? '1px solid #eee' : 'none' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{isRedeem ? (a.reward_redeemed ? `Redeemed: ${a.reward_redeemed}` : 'Redeemed') : a.type === 'earn' ? 'Earned' : a.type === 'birthday' ? '🎂 Birthday reward' : a.type === 'winback' ? '💌 We miss you' : a.type}</div>
                      <div style={{ fontSize: 12, color: INK_SOFT }}>{new Date(a.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: delta < 0 ? '#d11' : INK }}>{delta > 0 ? '+' : ''}{delta} {unit}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* LOY-WHATSAPP — opt in to the WhatsApp channel (shown when the business enabled it) */}
        {wa?.enabled && (
          <div style={card}>
            <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 6px' }}>💬 WhatsApp updates</p>
            <p style={{ fontSize: 13, color: INK_SOFT, margin: '0 0 12px', lineHeight: 1.5 }}>Get your rewards, offers and balance on WhatsApp.{wa.has_phone === false ? ' Add a mobile in “My details” first.' : ''}</p>
            <button onClick={() => toggleWa(!wa.opted_in)} disabled={waBusy}
              style={{ ...btn, width: '100%', background: wa.opted_in ? SURFACE : ACCENT, opacity: waBusy ? 0.6 : 1 }}>
              {waBusy ? '…' : wa.opted_in ? 'Turn off WhatsApp updates' : 'Get updates on WhatsApp'}
            </button>
            {wa.opted_in && <p style={{ fontSize: 12, color: INK_SOFT, margin: '8px 0 0' }}>✓ You&apos;re opted in. Reply STOP on WhatsApp anytime to opt out.</p>}
          </div>
        )}

        {/* LOY-WALLET-PASS — add membership to Apple/Google Wallet (shown when a provider is configured) */}
        {wallet && ((wallet.google?.configured && wallet.google?.save_url) || wallet.apple?.configured) && (
          <div style={card}>
            <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 10px' }}>Add to your phone wallet</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {wallet.google?.configured && wallet.google?.save_url && (
                <a href={wallet.google.save_url} target="_blank" rel="noopener noreferrer" style={{ ...btn, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 48 }}>Add to Google Wallet</a>
              )}
              {wallet.apple?.configured && (
                <a href={`/api/loyalty/wallet-pass?business_id=${encodeURIComponent(bid)}&format=apple_json`} style={{ height: 48, borderRadius: 12, border: BORDER, background: INK, color: CREAM, fontWeight: 700, fontSize: 15, fontFamily: FONT, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Add to Apple Wallet</a>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return wrap(
    <div style={card}>
      {step === 'join' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 44 }}>🌟</div>
          <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>You&apos;re not a member of {bizName} yet</p>
          <p style={{ fontSize: 14, color: INK_SOFT, margin: 0, lineHeight: 1.5 }}>Join with your existing Aria Rewards account — same email &amp; PIN, no new sign-up.</p>
          {error && <p style={{ color: '#d11', fontSize: 13, margin: 0 }}>{error}</p>}
          <button onClick={joinBusiness} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Joining…' : `Become a member →`}</button>
          <button onClick={logout} style={link}>Sign out</button>
        </div>
      )}
      {step === 'email' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ fontSize: 13, color: INK_SOFT }}>{mode === 'login' ? 'Sign in with your email' : mode === 'join' ? 'Join with your email' : 'Reset your PIN'}</label>
          {mode === 'join' && <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name (optional)" style={inp} />}
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" style={inp} />
          {error && <p style={{ color: '#d11', fontSize: 13, margin: 0 }}>{error}</p>}
          <button onClick={continueEmail} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Please wait…' : 'Continue →'}</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            {mode === 'login'
              ? <button style={link} onClick={() => { setMode('join'); setError('') }}>First time? Join</button>
              : <button style={link} onClick={() => { setMode('login'); setError('') }}>Have a PIN? Sign in</button>}
            <button style={link} onClick={() => { setMode('forgot'); setError(''); if (email.includes('@')) continueEmail() }}>Forgot PIN?</button>
          </div>
        </div>
      )}

      {step === 'pin' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 15, margin: 0 }}>Welcome back — enter your PIN.</p>
          <input inputMode="numeric" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••••" style={pinInp} aria-label="PIN" />
          {error && <p style={{ color: '#d11', fontSize: 13, margin: 0 }}>{error}</p>}
          <button onClick={doLogin} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Signing in…' : 'Sign in →'}</button>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button style={link} onClick={() => { setStep('email'); setPin('') }}>← Back</button>
            <button style={link} onClick={() => { setMode('forgot'); continueEmail() }}>Forgot PIN?</button>
          </div>
        </div>
      )}

      {step === 'code' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {info && <p style={{ fontSize: 14, color: INK_SOFT, margin: 0 }}>{info}</p>}
          <input inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="6-digit code" style={pinInp} aria-label="Email code" />
          {error && <p style={{ color: '#d11', fontSize: 13, margin: 0 }}>{error}</p>}
          <button onClick={verifyCode} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Checking…' : 'Verify →'}</button>
          <button style={link} onClick={() => { setStep('email'); setCode('') }}>← Back</button>
        </div>
      )}

      {step === 'setpin' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 15, margin: 0 }}>Choose a 6-digit PIN.</p>
          <input inputMode="numeric" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••••" style={pinInp} aria-label="New PIN" />
          <input inputMode="numeric" maxLength={6} value={confirm} onChange={e => setConfirm(e.target.value.replace(/\D/g, ''))} placeholder="Confirm PIN" style={pinInp} aria-label="Confirm PIN" />
          {error && <p style={{ color: '#d11', fontSize: 13, margin: 0 }}>{error}</p>}
          <button onClick={setPinSubmit} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Set PIN & sign in →'}</button>
        </div>
      )}
    </div>
  )
}
