'use client';
import { useState, useEffect, useCallback } from 'react';

interface PosUser {
  id: string; name: string; role: string;
  permissions: Record<string, unknown>;
}

interface Props {
  businessId: string;
  businessName: string;
  onLogin: (user: PosUser) => void;
  onSkip: () => void;
}

const NUM_PAD = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

function Orb({ style }: { style: React.CSSProperties }) {
  return <div style={{ position: 'absolute', borderRadius: '50%', pointerEvents: 'none', ...style }} />;
}

export function POSUserLogin({ businessId, businessName, onLogin, onSkip }: Props) {
  const [users, setUsers]             = useState<PosUser[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selectedUser, setSelectedUser] = useState<PosUser | null>(null);
  const [pin, setPin]                 = useState('');
  const [error, setError]             = useState('');
  const [attempts, setAttempts]       = useState(0);
  const [verifying, setVerifying]     = useState(false);
  const [shaking, setShaking]         = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const d = await fetch(`/api/pos/users?business_id=${businessId}`).then(r => r.json());
      setUsers(d.users ?? []);
    } catch { /* silent */ }
    setLoading(false);
  }, [businessId]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  function handlePad(key: string) {
    if (key === '⌫') { setPin(p => p.slice(0, -1)); setError(''); }
    else if (pin.length < 4) {
      const next = pin + key;
      setPin(next); setError('');
      if (next.length === 4) verifyPin(next);
    }
  }

  async function verifyPin(p: string) {
    if (!selectedUser) return;
    setVerifying(true);
    try {
      const res = await fetch('/api/pos/users/verify-pin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, user_id: selectedUser.id, pin: p }),
      });
      const d = await res.json();
      if (d.valid && d.user) {
        localStorage.setItem('aria_pos_user', JSON.stringify(d.user));
        onLogin(d.user);
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setPin('');
        setError(newAttempts >= 3 ? 'Too many wrong attempts. Please ask a manager.' : 'Incorrect PIN. Try again.');
        setShaking(true);
        setTimeout(() => setShaking(false), 400);
      }
    } catch {
      setPin(''); setError('Verification failed. Check your connection.');
    }
    setVerifying(false);
  }

  if (loading) return (
    <div style={{ minHeight: '100dvh', background: '#0A0910', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.3)', borderTopColor: '#8B5CF6', animation: 'processing 0.7s linear infinite' }} />
    </div>
  );

  if (users.length === 0) return (
    <div style={{ minHeight: '100dvh', background: '#0A0910', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', fontFamily: "'Manrope',system-ui,sans-serif", position: 'relative', overflow: 'hidden' }}>
      <Orb style={{ width: 400, height: 400, top: '-100px', left: '-100px', background: 'radial-gradient(circle,rgba(139,92,246,0.15),transparent 70%)', filter: 'blur(80px)', animation: 'orb-pulse-0 4s ease-in-out infinite' }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <p style={{ fontFamily: "'Instrument Serif',serif", fontStyle: 'italic', fontSize: 36, color: '#8B5CF6', marginBottom: 4 }}>AriaPOS</p>
        <p style={{ fontSize: 14, color: '#8B85A8', marginBottom: 32 }}>{businessName}</p>
        <div style={{ background: 'rgba(26,23,40,0.8)', backdropFilter: 'blur(24px)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 20, padding: '28px 32px', maxWidth: 380, width: '100%' }}>
          <p style={{ fontSize: 18, fontWeight: 700, color: '#EDE8FF', marginBottom: 8 }}>Set up your first cashier</p>
          <p style={{ fontSize: 13, color: '#8B85A8', marginBottom: 24 }}>Add yourself as a cashier to start using the register</p>
          <a href="/pos/settings/users" style={{ display: 'block', width: '100%', padding: '12px 0', borderRadius: 12, textAlign: 'center', fontSize: 14, fontWeight: 600, color: '#fff', background: '#8B5CF6', textDecoration: 'none' }}>
            Set up users →
          </a>
          <button onClick={onSkip} style={{ marginTop: 12, width: '100%', background: 'none', border: 'none', color: '#4A4565', fontSize: 12, cursor: 'pointer', padding: '8px 0' }}>
            Skip for now (owner mode)
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100dvh', background: '#0A0910', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, fontFamily: "'Manrope',system-ui,sans-serif", position: 'relative', overflow: 'hidden' }}>
      <Orb style={{ width: 400, height: 400, top: '-100px', left: '-100px', background: 'radial-gradient(circle,rgba(139,92,246,0.15),transparent 70%)', filter: 'blur(80px)', animation: 'orb-pulse-0 4s ease-in-out infinite' }} />
      <Orb style={{ width: 300, height: 300, bottom: '-80px', right: '-80px', background: 'radial-gradient(circle,rgba(99,102,241,0.12),transparent 70%)', filter: 'blur(60px)', animation: 'orb-pulse-1 5s ease-in-out infinite 1s' }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <p style={{ fontFamily: "'Instrument Serif',serif", fontStyle: 'italic', fontSize: 32, color: '#8B5CF6', marginBottom: 4 }}>AriaPOS</p>
        <p style={{ fontSize: 14, color: '#8B85A8', marginBottom: 40 }}>
          {selectedUser ? 'Enter your PIN' : "Who's working today?"}
        </p>

        {!selectedUser ? (
          /* User grid */
          <div style={{ width: '100%', maxWidth: 560 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
              {users.map((u, idx) => {
                const initials = u.name.slice(0,2).toUpperCase();
                return (
                  <button
                    key={u.id}
                    onClick={() => { setSelectedUser(u); setPin(''); setError(''); setAttempts(0); }}
                    className="pos-card-enter"
                    style={{
                      background: '#1A1728', border: '1px solid #2A2540', borderRadius: 16,
                      padding: '20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                      cursor: 'pointer', animationDelay: `${idx * 60}ms`, transition: 'all 150ms ease',
                    }}
                    onMouseEnter={e => { const el = e.currentTarget; el.style.border = '1px solid rgba(139,92,246,0.35)'; el.style.background = 'rgba(139,92,246,0.06)'; }}
                    onMouseLeave={e => { const el = e.currentTarget; el.style.border = '1px solid #2A2540'; el.style.background = '#1A1728'; }}
                  >
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(139,92,246,0.1)', border: '2px solid rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 18, fontWeight: 800, color: '#8B5CF6' }}>{initials}</span>
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#EDE8FF' }}>{u.name}</p>
                    <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4A4565', fontWeight: 600 }}>{u.role}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ textAlign: 'center' }}>
              <button onClick={onSkip} style={{ background: 'none', border: 'none', color: '#4A4565', fontSize: 12, cursor: 'pointer', padding: '8px 0' }}>
                I&apos;m the owner — skip PIN
              </button>
            </div>
          </div>
        ) : (
          /* PIN entry */
          <div style={{ width: '100%', maxWidth: 300, textAlign: 'center' }}>
            {/* User mini-card */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 24 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(139,92,246,0.12)', border: '1.5px solid rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#8B5CF6' }}>{selectedUser.name.slice(0,2).toUpperCase()}</span>
              </div>
              <div style={{ textAlign: 'left' }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#EDE8FF' }}>{selectedUser.name}</p>
                <p style={{ fontSize: 11, color: '#4A4565', textTransform: 'capitalize' }}>{selectedUser.role}</p>
              </div>
            </div>

            {/* PIN dots */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 20, animation: shaking ? 'shake 0.4s ease' : 'none' }}>
              {[0,1,2,3].map(i => (
                <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: pin.length > i ? '#8B5CF6' : 'transparent', border: `2px solid ${pin.length > i ? '#8B5CF6' : '#2A2540'}`, transition: 'all 150ms ease', transform: pin.length > i ? 'scale(1.1)' : 'scale(1)' }} />
              ))}
            </div>

            {error && <p style={{ fontSize: 12, color: '#EF4444', marginBottom: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '6px 12px' }}>{error}</p>}
            {verifying && <p style={{ fontSize: 12, color: '#8B5CF6', marginBottom: 12, animation: 'pulse 1s ease-in-out infinite' }}>Verifying…</p>}

            {/* Numpad */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 20 }}>
              {NUM_PAD.map((k, i) => (
                <button key={i}
                  onClick={() => k && handlePad(k)}
                  disabled={verifying || !k || attempts >= 3}
                  style={{
                    height: 52, borderRadius: 12,
                    background: k ? '#1A1728' : 'transparent',
                    border: k ? '1px solid #2A2540' : 'none',
                    color: '#EDE8FF', fontSize: 18, fontWeight: 700, cursor: k ? 'pointer' : 'default',
                    fontFamily: k === '⌫' ? 'system-ui' : "'JetBrains Mono',monospace",
                    opacity: (!k || attempts >= 3) ? 0.3 : 1,
                    transition: 'all 100ms ease',
                  }}
                  onMouseEnter={e => { if (k && attempts < 3) { const el = e.currentTarget; el.style.border = '1px solid rgba(139,92,246,0.35)'; el.style.background = 'rgba(139,92,246,0.08)'; }}}
                  onMouseLeave={e => { if (k) { const el = e.currentTarget; el.style.border = '1px solid #2A2540'; el.style.background = '#1A1728'; }}}
                  onMouseDown={e => { if (k) { const el = e.currentTarget; el.style.transform = 'translateY(1px) scale(0.96)'; el.style.boxShadow = 'none'; }}}
                  onMouseUp={e => { const el = e.currentTarget; el.style.transform = ''; }}
                >
                  {k}
                </button>
              ))}
            </div>

            <button onClick={() => { setSelectedUser(null); setPin(''); setError(''); }}
              style={{ background: 'none', border: 'none', color: '#4A4565', fontSize: 12, cursor: 'pointer' }}>
              ← Choose different user
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
