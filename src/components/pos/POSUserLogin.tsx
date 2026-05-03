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
  onSkip: () => void; // owner bypass
}

const ROLE_COLORS: Record<string, string> = {
  cashier: 'bg-blue-100 text-blue-700',
  supervisor: 'bg-amber-100 text-amber-700',
  manager: 'bg-purple-100 text-purple-700',
  owner: 'bg-emerald-100 text-emerald-700',
};
const ROLE_EMOJIS: Record<string, string> = { cashier: '💼', supervisor: '⭐', manager: '🎯', owner: '👑' };

const NUM_PAD = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

export function POSUserLogin({ businessId, businessName, onLogin, onSkip }: Props) {
  const [users, setUsers] = useState<PosUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<PosUser | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [verifying, setVerifying] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const d = await fetch(`/api/pos/users?business_id=${businessId}`).then(r => r.json());
      setUsers(d.users ?? []);
    } catch { /* silent */ }
    setLoading(false);
  }, [businessId]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  function handlePad(key: string) {
    if (key === '⌫') {
      setPin(p => p.slice(0, -1));
      setError('');
    } else if (pin.length < 4) {
      const next = pin + key;
      setPin(next);
      setError('');
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
      }
    } catch {
      setPin('');
      setError('Verification failed. Check your connection.');
    }
    setVerifying(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#111827] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  // First-time setup: no users exist
  if (users.length === 0) {
    return (
      <div className="min-h-screen bg-[#111827] flex flex-col items-center justify-center p-8 text-center">
        <div className="mb-6">
          <p className="text-4xl font-black text-white mb-1">{businessName}</p>
          <p className="text-gray-400 text-lg">AriaPOS</p>
        </div>
        <div className="bg-white/10 rounded-2xl p-6 max-w-sm w-full">
          <p className="text-xl font-bold text-white mb-2">Set up your first cashier</p>
          <p className="text-gray-400 text-sm mb-5">Add yourself as a cashier to start using the register</p>
          <a href="/pos/settings/users"
            className="block w-full py-3 rounded-xl text-center text-sm font-semibold text-white"
            style={{ background: '#059669' }}>
            Set up users →
          </a>
          <button onClick={onSkip} className="mt-3 w-full text-gray-500 text-xs hover:text-gray-400 py-2">
            Skip for now (owner mode)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111827] flex flex-col items-center justify-center p-8">
      <div className="mb-8 text-center">
        <p className="text-4xl font-black text-white mb-1">{businessName}</p>
        <p className="text-gray-400 text-lg">{selectedUser ? 'Enter your PIN' : "Who's working today?"}</p>
      </div>

      {!selectedUser ? (
        /* User selection grid */
        <div className="w-full max-w-xl">
          <div className="grid grid-cols-3 gap-3 mb-6">
            {users.map(u => (
              <button key={u.id} onClick={() => { setSelectedUser(u); setPin(''); setError(''); setAttempts(0); }}
                className="bg-white/10 hover:bg-white/20 active:scale-95 rounded-2xl p-5 text-center transition-all">
                <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3 text-2xl font-black text-white">
                  {u.name[0]?.toUpperCase()}
                </div>
                <p className="text-white font-semibold text-sm">{u.name}</p>
                <div className="mt-1.5 flex justify-center">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${ROLE_COLORS[u.role] ?? 'bg-gray-100 text-gray-500'}`}>
                    {ROLE_EMOJIS[u.role] ?? ''} {u.role}
                  </span>
                </div>
              </button>
            ))}
          </div>
          <div className="text-center">
            <button onClick={onSkip} className="text-gray-500 text-xs hover:text-gray-400 py-2">
              I&apos;m the owner — skip PIN
            </button>
          </div>
        </div>
      ) : (
        /* PIN entry */
        <div className="w-full max-w-xs text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm">
              {selectedUser.name[0]?.toUpperCase()}
            </div>
            <div className="text-left">
              <p className="text-white font-semibold text-sm">{selectedUser.name}</p>
              <p className="text-gray-500 text-xs capitalize">{selectedUser.role}</p>
            </div>
          </div>

          {/* PIN dots */}
          <div className="flex justify-center gap-4 mb-5 mt-4">
            {[0,1,2,3].map(i => (
              <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${
                pin.length > i ? 'bg-emerald-400 border-emerald-400' : 'border-white/30 bg-transparent'
              }`} />
            ))}
          </div>

          {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
          {verifying && <p className="text-emerald-400 text-xs mb-3 animate-pulse">Verifying…</p>}

          {/* Number pad */}
          <div className="grid grid-cols-3 gap-2 mb-5">
            {NUM_PAD.map((k, i) => (
              <button key={i} onClick={() => k && handlePad(k)} disabled={verifying || !k || attempts >= 3}
                className={`h-14 rounded-2xl text-xl font-bold transition-all ${
                  k
                    ? 'bg-white/10 hover:bg-white/20 active:scale-95 text-white disabled:opacity-30'
                    : 'bg-transparent'
                }`}>
                {k}
              </button>
            ))}
          </div>

          <button onClick={() => { setSelectedUser(null); setPin(''); setError(''); }}
            className="text-gray-500 text-xs hover:text-gray-400">
            ← Choose different user
          </button>
        </div>
      )}
    </div>
  );
}
