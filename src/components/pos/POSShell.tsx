'use client';
import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import POSSidebar from './POSSidebar';

const POS_USER_KEY  = 'aria_pos_user';
const SESSION_TTL   = 12 * 3600 * 1000; // 12 hours
const BYPASS_PATHS  = ['/pos/display', '/pos/mobile'];

interface PosUser {
  id: string; name: string; role: string;
  permissions: Record<string, unknown>;
  loginAt?: number;
}

function makeInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

/* ── Teal orb ────────────────────────────────────────────────────── */
function Orb({ style }: { style: React.CSSProperties }) {
  return <div style={{ position: 'absolute', borderRadius: '50%', pointerEvents: 'none', ...style }} />;
}

/* ── LogoMark ────────────────────────────────────────────────────── */
function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M16 2L28 9v14L16 30 4 23V9z" fill="rgba(139,92,246,0.15)" stroke="#8B5CF6" strokeWidth="1.5"/>
      <path d="M16 8l7 4v8l-7 4-7-4V12z" fill="rgba(139,92,246,0.25)" stroke="#8B5CF6" strokeWidth="1"/>
      <circle cx="16" cy="16" r="2.5" fill="#8B5CF6"/>
    </svg>
  );
}

/* ── NUM PAD ─────────────────────────────────────────────────────── */
const PAD = ['1','2','3','4','5','6','7','8','9','','0','←'];

/* ── PIN Entry ───────────────────────────────────────────────────── */
function PINEntry({
  user, businessId, attempts, onVerify, onBack,
}: {
  user: PosUser; businessId: string; attempts: number;
  onVerify: (u: PosUser) => void; onBack: () => void;
}) {
  const [pin, setPin]         = useState('');
  const [error, setError]     = useState('');
  const [verifying, setVerifying] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [localAttempts, setLocalAttempts] = useState(attempts);

  const verify = useCallback(async (p: string) => {
    setVerifying(true);
    try {
      const res = await fetch('/api/pos/users/verify-pin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, user_id: user.id, pin: p }),
      });
      const d = await res.json();
      if (d.valid && d.user) {
        onVerify(d.user);
      } else {
        const na = localAttempts + 1;
        setLocalAttempts(na);
        setPin('');
        setError(na >= 3 ? 'Too many attempts. Ask a manager.' : 'Incorrect PIN. Try again.');
        setShaking(true);
        setTimeout(() => setShaking(false), 400);
      }
    } catch {
      setPin(''); setError('Connection error.');
    }
    setVerifying(false);
  }, [businessId, user.id, onVerify, localAttempts]);

  function tap(k: string) {
    if (k === '←') { setPin(p => p.slice(0,-1)); setError(''); return; }
    if (pin.length >= 4 || localAttempts >= 3) return;
    const next = pin + k;
    setPin(next); setError('');
    if (next.length === 4) verify(next);
  }

  const initials = makeInitials(user.name);

  return (
    <div style={{ textAlign: 'center', width: '100%', maxWidth: 300 }}>
      {/* User info */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(139,92,246,0.12)', border: '2px solid rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: 'var(--violet)', fontFamily: 'var(--font-ui)' }}>
          {initials}
        </div>
        <div style={{ textAlign: 'left' }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)' }}>{user.name}</p>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize', fontFamily: 'var(--font-ui)' }}>{user.role}</p>
        </div>
      </div>

      <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)', marginBottom: 20 }}>Enter your PIN</p>

      {/* PIN dots */}
      <div className={shaking ? 'shake' : ''} style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 8 }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', transition: 'all 150ms ease', background: pin.length > i ? 'var(--violet)' : 'transparent', border: `2px solid ${pin.length > i ? 'var(--violet)' : 'var(--border-strong)'}` }} />
        ))}
      </div>
      {error && <p style={{ fontSize: 12, color: 'var(--destructive)', fontFamily: 'var(--font-ui)', marginBottom: 12 }}>{error}</p>}
      {verifying && <p style={{ fontSize: 12, color: 'var(--violet)', fontFamily: 'var(--font-ui)', marginBottom: 12 }}>Verifying…</p>}
      {!error && !verifying && <div style={{ height: 24 }} />}

      {/* Number pad */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
        {PAD.map((k, i) => (
          <button key={i}
            type="button"
            onClick={() => k && tap(k)}
            disabled={verifying || !k || localAttempts >= 3}
            style={{
              height: 56, borderRadius: 14, fontSize: 20, fontWeight: 700, cursor: k ? 'pointer' : 'default',
              fontFamily: k === '←' ? 'system-ui' : 'var(--font-mono)',
              background: k ? 'var(--bg-surface)' : 'transparent',
              border: k ? '1px solid var(--border-default)' : 'none',
              color: 'var(--text-primary)', opacity: (!k || localAttempts >= 3) ? 0.3 : 1,
              transition: 'all 100ms ease',
              WebkitTapHighlightColor: 'transparent',
              userSelect: 'none',
            }}
            onPointerDown={e => { if (k && localAttempts < 3) { const el = e.currentTarget; el.style.transform = 'translateY(2px) scale(0.95)'; el.style.background = 'var(--bg-hover)'; el.style.border = '1px solid var(--border-violet)'; }}}
            onPointerUp={e => { const el = e.currentTarget; el.style.transform = ''; el.style.background = k ? 'var(--bg-surface)' : 'transparent'; el.style.border = k ? '1px solid var(--border-default)' : 'none'; }}
            onPointerLeave={e => { const el = e.currentTarget; el.style.transform = ''; el.style.background = k ? 'var(--bg-surface)' : 'transparent'; el.style.border = k ? '1px solid var(--border-default)' : 'none'; }}
          >{k}</button>
        ))}
      </div>

      <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-ui)' }}>
        ← Choose different user
      </button>
    </div>
  );
}

/* ── User Select ─────────────────────────────────────────────────── */
function POSUserSelect({ businessId, businessName, onLogin }: {
  businessId: string; businessName: string;
  onLogin: (user: PosUser) => void;
}) {
  const [users,    setUsers]    = useState<PosUser[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [loadErr,  setLoadErr]  = useState(false);
  const [selected, setSelected] = useState<PosUser | null>(null);
  const [attempts, setAttempts] = useState(0);

  const loadUsers = useCallback(() => {
    if (!businessId) { setLoading(false); return; }
    setLoading(true);
    setLoadErr(false);
    fetch(`/api/pos/users?business_id=${businessId}`)
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); })
      .then(d => setUsers(d.users ?? []))
      .catch(() => setLoadErr(true))
      .finally(() => setLoading(false));
  }, [businessId]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  function bypassAsOwner() {
    const owner: PosUser = {
      id: 'owner', name: 'Owner', role: 'owner',
      permissions: { can_apply_discount: true, can_refund: true, max_discount_pct: 100, can_close_register: true, can_override_price: true },
      loginAt: Date.now(),
    };
    localStorage.setItem(POS_USER_KEY, JSON.stringify(owner));
    onLogin(owner);
  }

  function handleVerified(u: PosUser) {
    const withTime = { ...u, loginAt: Date.now() };
    localStorage.setItem(POS_USER_KEY, JSON.stringify(withTime));
    onLogin(withTime);
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, fontFamily: 'var(--font-ui)', position: 'relative', overflow: 'hidden' }}>
      <Orb style={{ width: 500, height: 500, top: '-150px', left: '-150px', background: 'radial-gradient(circle,rgba(139,92,246,0.12),transparent 70%)', filter: 'blur(120px)', animation: 'orb-breathe 4s ease-in-out infinite' }} />
      <Orb style={{ width: 400, height: 400, top: '40%', left: '40%', background: 'radial-gradient(circle,rgba(8,145,178,0.1),transparent 70%)', filter: 'blur(100px)', animation: 'orb-breathe 5s ease-in-out infinite 1s' }} />
      <Orb style={{ width: 450, height: 450, bottom: '-120px', right: '-120px', background: 'radial-gradient(circle,rgba(139,92,246,0.08),transparent 70%)', filter: 'blur(80px)', animation: 'orb-breathe 6s ease-in-out infinite 2s' }} />

      <div style={{ width: '100%', maxWidth: 500, position: 'relative', zIndex: 1, background: 'var(--bg-elevated)', backdropFilter: 'blur(24px)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 24, padding: '40px 32px', boxShadow: '0 24px 64px rgba(0,0,0,0.6)', animation: 'scale-in 0.35s cubic-bezier(0.16,1,0.3,1)' }}>

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><LogoMark size={36} /></div>
          <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 28, color: 'var(--violet)', lineHeight: 1, marginBottom: 6 }}>AriaPOS</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{businessName}</p>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.3)', borderTopColor: 'var(--violet)', animation: 'pos-processing 0.7s linear infinite' }} />
          </div>
        ) : selected ? (
          <PINEntry
            user={selected}
            businessId={businessId}
            attempts={attempts}
            onVerify={handleVerified}
            onBack={() => { setSelected(null); setAttempts(0); }}
          />
        ) : (
          <>
            <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 18, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 20 }}>
              Who&apos;s working today?
            </p>

            {/* Error state — network/API failure */}
            {loadErr && (
              <div style={{ textAlign: 'center', padding: '20px 0 16px', marginBottom: 8 }}>
                <p style={{ fontSize: 13, color: 'var(--destructive)', marginBottom: 12 }}>
                  Couldn&apos;t load staff list — check your connection.
                </p>
                <button onClick={loadUsers}
                  style={{ padding: '9px 20px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>
                  Retry
                </button>
              </div>
            )}

            {/* User grid — show even during/after load error if we have cached users */}
            {users.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: users.length <= 2 ? `repeat(${users.length},1fr)` : 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
                {users.map(u => {
                  const initials = makeInitials(u.name);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setSelected(u)}
                      style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 16,
                        padding: '20px 10px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 10,
                        cursor: 'pointer',
                        transition: 'all 150ms ease',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                      onPointerDown={e => {
                        const el = e.currentTarget;
                        el.style.background = 'var(--bg-hover)';
                        el.style.border = '1px solid rgba(139,92,246,0.35)';
                        el.style.transform = 'scale(0.97)';
                      }}
                      onPointerUp={e => {
                        const el = e.currentTarget;
                        el.style.transform = '';
                        // click fires after pointerUp, keep highlight briefly
                        setTimeout(() => {
                          el.style.background = 'var(--bg-surface)';
                          el.style.border = '1px solid var(--border-default)';
                        }, 150);
                      }}
                      onPointerLeave={e => {
                        const el = e.currentTarget;
                        el.style.background = 'var(--bg-surface)';
                        el.style.border = '1px solid var(--border-default)';
                        el.style.transform = '';
                      }}
                    >
                      <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(139,92,246,0.1)', border: '2px solid rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: 'var(--violet)', fontFamily: 'var(--font-ui)', flexShrink: 0 }}>
                        {initials}
                      </div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', textAlign: 'center', wordBreak: 'break-word' }}>{u.name}</p>
                      <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', fontFamily: 'var(--font-ui)' }}>{u.role}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* No users + no error */}
            {users.length === 0 && !loadErr && (
              <div style={{ textAlign: 'center', padding: '20px 0 16px' }}>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 4 }}>No staff set up yet</p>
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>Add cashiers in Settings, or continue as owner below.</p>
                <a href="/pos/settings/users" style={{ display: 'inline-block', padding: '10px 20px', borderRadius: 10, background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                  Set up staff →
                </a>
              </div>
            )}

            {/* Always-visible owner bypass */}
            <div style={{ textAlign: 'center', paddingTop: users.length > 0 ? 0 : 8 }}>
              <button
                type="button"
                onClick={bypassAsOwner}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-ui)', padding: '8px 16px', WebkitTapHighlightColor: 'transparent' }}>
                Continue as owner (bypass PIN)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── POSShell ────────────────────────────────────────────────────── */
export default function POSShell({ children, businessId, businessName }: {
  children: React.ReactNode; businessId: string; businessName: string;
}) {
  const pathname = usePathname();
  const [posUser, setPosUser] = useState<PosUser | null>(null);
  const [ready,   setReady]   = useState(false);
  const [ariaOpen, setAriaOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(POS_USER_KEY);
      if (stored) {
        const parsed: PosUser = JSON.parse(stored);
        const validTTL = !parsed.loginAt || (Date.now() - parsed.loginAt < SESSION_TTL);
        if (validTTL) setPosUser(parsed);
        else localStorage.removeItem(POS_USER_KEY);
      }
    } catch { /* ignore */ }
    setReady(true);
  }, []);

  // Bypass for display page — no auth, no sidebar
  if (BYPASS_PATHS.includes(pathname)) return <>{children}</>;

  if (!ready) {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.3)', borderTopColor: 'var(--violet)', animation: 'pos-processing 0.7s linear infinite' }} />
      </div>
    );
  }

  if (!posUser) {
    return (
      <POSUserSelect
        businessId={businessId}
        businessName={businessName}
        onLogin={u => setPosUser(u)}
      />
    );
  }

  const userForSidebar = {
    name:     posUser.name ?? 'User',
    role:     posUser.role ?? 'cashier',
    initials: makeInitials(posUser.name ?? 'U'),
  };

  return (
    <div className="pos-shell" style={{ display: 'flex', height: '100dvh', overflow: 'hidden', background: 'var(--bg-base)' }}>
      <POSSidebar
        businessName={businessName}
        posUser={userForSidebar}
        currentUser={userForSidebar}
        ariaOpen={ariaOpen}
        onAriaToggle={() => {
          setAriaOpen(v => !v);
          window.dispatchEvent(new CustomEvent('pos-aria-toggle'));
        }}
        onUserSwitch={() => {
          localStorage.removeItem(POS_USER_KEY);
          setPosUser(null);
        }}
      />
      <main style={{ flex: 1, overflow: 'hidden', minWidth: 0, height: '100dvh' }}>
        {children}
      </main>
    </div>
  );
}
