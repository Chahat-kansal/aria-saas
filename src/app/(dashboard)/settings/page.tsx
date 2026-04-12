'use client';
import { useSession, signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import Link from 'next/link';

interface UserData { name: string; email: string; plan: string; messagesUsedThisMonth: number; image?: string; }

export default function SettingsPage() {
  const { data: session } = useSession();
  const params = useSearchParams();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    fetch('/api/user').then(r => r.json()).then(setUserData).catch(() => {});
    if (params.get('upgraded') === 'true') toast.success('🎉 Welcome to Aria Pro!');
  }, []);

  async function handleUpgrade() {
    setUpgrading(true);
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ? process.env.STRIPE_PRO_MONTHLY_PRICE_ID : '' }),
    });
    const data = await res.json();
    setUpgrading(false);
    if (data.url) window.location.href = data.url;
    else toast.error('Could not start checkout');
  }

  return (
    <div className="min-h-screen bg-[#0e0e12] flex">
      <div className="flex-1 max-w-2xl mx-auto px-6 py-10">
        <Link href="/chat" className="text-sm text-[#888899] hover:text-white mb-8 inline-flex items-center gap-1 transition-colors">← Back to chat</Link>

        <h1 className="text-2xl font-semibold mb-8">Settings</h1>

        {/* Profile */}
        <div className="bg-[#16161d] border border-white/5 rounded-2xl p-6 mb-4">
          <h2 className="text-sm font-medium text-[#888899] uppercase tracking-wider mb-4">Profile</h2>
          <div className="flex items-center gap-4">
            {userData?.image ? <img src={userData.image} className="w-12 h-12 rounded-full" alt="" /> : <div className="w-12 h-12 rounded-full bg-[#6C63FF]/30 flex items-center justify-center text-[#a78bfa] font-semibold text-lg">{userData?.name?.[0]}</div>}
            <div>
              <div className="font-medium">{userData?.name}</div>
              <div className="text-sm text-[#888899]">{userData?.email}</div>
            </div>
          </div>
        </div>

        {/* Plan */}
        <div className="bg-[#16161d] border border-white/5 rounded-2xl p-6 mb-4">
          <h2 className="text-sm font-medium text-[#888899] uppercase tracking-wider mb-4">Plan</h2>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="font-medium flex items-center gap-2">
                {userData?.plan === 'pro' ? (
                  <><span>Pro</span><span className="text-xs bg-[#6C63FF]/20 text-[#a78bfa] border border-[#6C63FF]/30 px-2 py-0.5 rounded-full">Active</span></>
                ) : 'Free'}
              </div>
              <div className="text-sm text-[#888899] mt-0.5">
                {userData?.plan === 'pro' ? 'Unlimited messages · All models · Web search' : `${userData?.messagesUsedThisMonth || 0} / 50 messages used this month`}
              </div>
            </div>
            {userData?.plan !== 'pro' && (
              <button onClick={handleUpgrade} disabled={upgrading} className="bg-[#6C63FF] hover:bg-[#4b44cc] disabled:opacity-60 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors">
                {upgrading ? 'Loading…' : 'Upgrade to Pro — $20/mo'}
              </button>
            )}
          </div>
          {userData?.plan === 'free' && (
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-[#6C63FF] rounded-full" style={{ width: `${Math.min(((userData?.messagesUsedThisMonth || 0) / 50) * 100, 100)}%` }} />
            </div>
          )}
        </div>

        {/* Pro features */}
        {userData?.plan !== 'pro' && (
          <div className="bg-gradient-to-br from-[#6C63FF]/10 to-[#a78bfa]/10 border border-[#6C63FF]/20 rounded-2xl p-6 mb-4">
            <h2 className="text-sm font-medium text-[#a78bfa] uppercase tracking-wider mb-3">Pro includes</h2>
            <ul className="space-y-2 text-sm text-[#888899]">
              {['Unlimited messages', 'Claude Sonnet 4 & Opus 4 models', 'Web search & deep research', 'File uploads up to 20MB', 'Priority support'].map(f => (
                <li key={f} className="flex items-center gap-2"><span className="text-[#6C63FF]">✓</span>{f}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Danger zone */}
        <div className="bg-[#16161d] border border-white/5 rounded-2xl p-6">
          <h2 className="text-sm font-medium text-[#888899] uppercase tracking-wider mb-4">Account</h2>
          <button onClick={() => signOut({ callbackUrl: '/login' })} className="text-sm text-red-400 hover:text-red-300 transition-colors">Sign out</button>
        </div>
      </div>
    </div>
  );
}
