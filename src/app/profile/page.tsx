'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface Business {
  id: string;
  name: string;
  industry: string | null;
  plan: 'starter' | 'growth' | 'pro';
  created_at: string;
}

interface Profile {
  email: string;
  created_at: string;
}

const PLAN_COLOR: Record<string, string> = {
  starter: '#6b7280',
  growth: '#2563eb',
  pro: '#16a34a',
};

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  // Password change
  const [showPwForm, setShowPwForm] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  // Danger zone
  const [deleteConfirm, setDeleteConfirm] = useState('');

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      setProfile({ email: user.email ?? '', created_at: user.created_at });

      const { data } = await supabase
        .from('businesses')
        .select('id,name,industry,plan,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      setBusinesses(data ?? []);
      setLoading(false);
    }
    load();
  }, [router]);

  async function handleSignOut() {
    setSigningOut(true);
    localStorage.removeItem('aria_active_business_id');
    await supabase.auth.signOut();
    router.push('/login');
  }

  async function changePassword() {
    if (newPw !== confirmPw) { setPwMsg('Passwords do not match'); return; }
    if (newPw.length < 8) { setPwMsg('Password must be at least 8 characters'); return; }
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) { setPwMsg(error.message); } else { setPwMsg('Password updated'); setNewPw(''); setConfirmPw(''); setShowPwForm(false); }
    setPwSaving(false);
  }

  if (loading) return (
    <div className="p-8 flex items-center justify-center min-h-screen bg-[#f7f7f5]">
      <div className="text-sm text-[rgba(26,26,22,.35)]">Loading…</div>
    </div>
  );

  const initials = profile?.email?.slice(0, 2).toUpperCase() ?? '??';

  return (
    <div className="min-h-screen bg-[#f7f7f5] p-6">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/dashboard"
            className="flex items-center gap-1.5 text-xs text-[rgba(26,26,22,.45)] hover:text-[#1a1a16] transition-colors">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
              <path d="M10 12L6 8l4-4"/>
            </svg>
            Dashboard
          </Link>
          <button onClick={handleSignOut} disabled={signingOut}
            className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 disabled:opacity-50 transition-colors">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
              <path d="M10 8H2m0 0l3-3m-3 3l3 3M6 5V3a1 1 0 011-1h6a1 1 0 011 1v10a1 1 0 01-1 1H7a1 1 0 01-1-1v-2"/>
            </svg>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>

        {/* Avatar + identity */}
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-6 shadow-sm mb-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[rgba(29,158,117,.12)] border-2 border-[rgba(29,158,117,.25)] flex items-center justify-center flex-shrink-0">
              <span className="text-xl font-bold text-[#1D9E75]">{initials}</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-[#1a1a16]">{profile?.email}</h1>
              <p className="text-xs text-[rgba(26,26,22,.4)] mt-0.5">
                Member since {new Date(profile?.created_at ?? '').toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] shadow-sm mb-4 overflow-hidden">
          <div className="px-5 py-4 border-b border-[rgba(0,0,0,.06)]" style={{ background: '#fafaf8' }}>
            <p className="text-xs font-semibold text-[rgba(26,26,22,.5)] uppercase tracking-wider">Security</p>
          </div>
          <div className="px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#1a1a16]">Password</p>
                <p className="text-xs text-[rgba(26,26,22,.4)] mt-0.5">Change your account password</p>
              </div>
              <button onClick={() => setShowPwForm(v => !v)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[rgba(0,0,0,.1)] text-[rgba(26,26,22,.6)] hover:bg-[rgba(0,0,0,.04)] transition-colors">
                {showPwForm ? 'Cancel' : 'Change'}
              </button>
            </div>

            {showPwForm && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">New password</label>
                  <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min 8 characters"
                    className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] focus:outline-none focus:border-[#2563eb]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Confirm password</label>
                  <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repeat password"
                    className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] focus:outline-none focus:border-[#2563eb]" />
                </div>
                {pwMsg && <p className={`text-xs ${pwMsg.includes('updated') ? 'text-emerald-600' : 'text-red-500'}`}>{pwMsg}</p>}
                <button onClick={changePassword} disabled={pwSaving || !newPw}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-opacity hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>
                  {pwSaving ? 'Saving…' : 'Update Password'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Businesses */}
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] shadow-sm mb-4 overflow-hidden">
          <div className="px-5 py-4 border-b border-[rgba(0,0,0,.06)] flex items-center justify-between" style={{ background: '#fafaf8' }}>
            <p className="text-xs font-semibold text-[rgba(26,26,22,.5)] uppercase tracking-wider">Your Businesses</p>
            <Link href="/businesses"
              className="text-xs font-medium text-[#2563eb] hover:underline">
              Manage →
            </Link>
          </div>
          <div className="divide-y divide-[rgba(0,0,0,.05)]">
            {businesses.map(b => (
              <div key={b.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm font-medium text-[#1a1a16]">{b.name}</p>
                  <p className="text-[11px] text-[rgba(26,26,22,.4)] capitalize mt-0.5">{b.industry ?? 'Business'}</p>
                </div>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: `${PLAN_COLOR[b.plan]}18`, color: PLAN_COLOR[b.plan] }}>
                  {b.plan.charAt(0).toUpperCase() + b.plan.slice(1)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Danger zone */}
        <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-red-100" style={{ background: '#fff8f8' }}>
            <p className="text-xs font-semibold text-red-400 uppercase tracking-wider">Danger Zone</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-sm font-medium text-[#1a1a16] mb-1">Delete Account</p>
            <p className="text-xs text-[rgba(26,26,22,.4)] mb-3">This will permanently delete your account and all associated businesses. Type <strong>DELETE</strong> to confirm.</p>
            <div className="flex gap-2">
              <input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder="Type DELETE"
                className="flex-1 bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2 text-sm text-[#1a1a16] focus:outline-none focus:border-red-400" />
              <button disabled={deleteConfirm !== 'DELETE'}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-500 disabled:opacity-30 hover:bg-red-600 disabled:hover:bg-red-500 transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}