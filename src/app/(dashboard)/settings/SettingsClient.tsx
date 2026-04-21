'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import toast from 'react-hot-toast';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface UserData { name: string; email: string; plan: string; image?: string; }

export default function SettingsClient() {
  const params = useSearchParams();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    fetch('/api/user').then(r => r.json()).then(setUserData).catch(() => {});
    if (params.get('upgraded') === 'true') toast.success('Welcome to Aria Pro!');
  }, [params]);

  async function handleUpgrade() {
    setUpgrading(true);
    const res = await fetch('/api/stripe/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: userData?.plan === 'starter' ? 'growth' : 'pro' }),
    });
    const data = await res.json();
    setUpgrading(false);
    if (data.url) window.location.href = data.url;
    else toast.error(data.error || 'Could not start checkout');
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  const isPro = userData?.plan === 'pro';

  return (
    <div className="min-h-screen bg-[#0e0e12] text-[#f0f0f5] overflow-y-auto">
      <div className="max-w-xl mx-auto px-6 py-10">
        <Link href="/chat" className="text-sm text-[#888899] hover:text-white inline-flex items-center gap-1 mb-8">
          ← Back to chat
        </Link>

        <h1 className="text-2xl font-semibold mt-6 mb-8">Settings</h1>

        <div className="bg-[#16161d] border border-white/5 rounded-2xl p-6 mb-4">
          <h2 className="text-xs font-medium text-[#555566] uppercase tracking-wider mb-4">Profile</h2>
          <div className="flex items-center gap-4">
            {userData?.image
              ? <img src={userData.image} className="w-12 h-12 rounded-full flex-shrink-0" alt="" />
              : <div className="w-12 h-12 rounded-full bg-[#1D9E75]/20 flex items-center justify-center text-[#1D9E75] font-semibold text-lg flex-shrink-0">{userData?.name?.[0] ?? '?'}</div>}
            <div>
              <div className="font-medium">{userData?.name ?? '—'}</div>
              <div className="text-sm text-[#888899]">{userData?.email ?? '—'}</div>
            </div>
            {isPro && <span className="ml-auto text-xs bg-[#1D9E75]/20 text-[#1D9E75] border border-[#1D9E75]/30 px-2.5 py-1 rounded-full">Pro</span>}
          </div>
        </div>

        <div className="bg-[#16161d] border border-white/5 rounded-2xl p-6 mb-4">
          <h2 className="text-xs font-medium text-[#555566] uppercase tracking-wider mb-3">Plan</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium capitalize">{userData?.plan ?? 'Starter'}</p>
              <p className="text-sm text-[#888899] mt-0.5">
                {isPro ? 'All features unlocked' : 'Upgrade to unlock more'}
              </p>
            </div>
            {!isPro && (
              <button onClick={handleUpgrade} disabled={upgrading}
                className="bg-[#1D9E75] hover:bg-[#18896a] disabled:opacity-60 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
                {upgrading ? 'Loading…' : 'Upgrade'}
              </button>
            )}
          </div>
        </div>

        <div className="bg-[#16161d] border border-white/5 rounded-2xl p-6">
          <h2 className="text-xs font-medium text-[#555566] uppercase tracking-wider mb-4">Account</h2>
          <button onClick={handleSignOut} className="text-sm text-red-400 hover:text-red-300 transition-colors">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}