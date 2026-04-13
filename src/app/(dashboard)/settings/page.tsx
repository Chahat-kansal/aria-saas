'use client';
import { useSession, signOut } from 'next-auth/react';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import Link from 'next/link';

interface UserData {
  name: string; email: string; plan: string; messagesUsedThisMonth: number; image?: string;
}

// Separate component that uses useSearchParams — must be wrapped in Suspense
function UpgradeToast() {
  const params = useSearchParams();
  useEffect(() => {
    if (params.get('upgraded') === 'true') toast.success('🎉 Welcome to Aria Pro!');
  }, []);
  return null;
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    fetch('/api/user').then(r => r.json()).then(setUserData).catch(() => {});
  }, []);

  async function handleUpgrade() {
    setUpgrading(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not start checkout'); return; }
      if (data.url) window.location.href = data.url;
      else toast.error('No checkout URL returned');
    } catch { toast.error('Checkout failed'); }
    finally { setUpgrading(false); }
  }

  const isPro = userData?.plan === 'pro';
  const msgUsed = userData?.messagesUsedThisMonth || 0;
  const msgPct = Math.min((msgUsed / 50) * 100, 100);

  return (
    <div className="bg-[#0e0e12] text-[#f0f0f5] overflow-y-auto" style={{ height: '100dvh' }}>
      {/* Suspense wraps the component that calls useSearchParams */}
      <Suspense fallback={null}>
        <UpgradeToast />
      </Suspense>

      <div className="max-w-xl mx-auto px-6 py-10">
        <Link href="/chat" className="text-sm text-[#888899] hover:text-white mb-8 inline-flex items-center gap-1 transition-colors">
          ← Back to chat
        </Link>

        <h1 className="text-2xl font-semibold mt-6 mb-8">Settings</h1>

        {/* Profile */}
        <div className="bg-[#16161d] border border-white/5 rounded-2xl p-6 mb-4">
          <h2 className="text-xs font-medium text-[#555566] uppercase tracking-wider mb-4">Profile</h2>
          <div className="flex items-center gap-4">
            {userData?.image
              ? <img src={userData.image} className="w-12 h-12 rounded-full flex-shrink-0" alt="" />
              : <div className="w-12 h-12 rounded-full bg-[#6C63FF]/30 flex items-center justify-center text-[#a78bfa] font-semibold text-lg flex-shrink-0">{userData?.name?.[0] || '?'}</div>}
            <div className="min-w-0">
              <div className="font-medium truncate">{userData?.name || '—'}</div>
              <div className="text-sm text-[#888899] truncate">{userData?.email || '—'}</div>
            </div>
            {isPro && <span className="ml-auto text-xs bg-[#6C63FF]/20 text-[#a78bfa] border border-[#6C63FF]/30 px-2.5 py-1 rounded-full flex-shrink-0">Pro</span>}
          </div>
        </div>

        {/* Plan */}
        <div className="bg-[#16161d] border border-white/5 rounded-2xl p-6 mb-4">
          <h2 className="text-xs font-medium text-[#555566] uppercase tracking-wider mb-4">Plan</h2>
          {isPro ? (
            <div>
              <div className="font-medium flex items-center gap-2">
                Aria Pro <span className="text-xs bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full">Active</span>
              </div>
              <div className="text-sm text-[#888899] mt-1">Unlimited messages · All models · Web search · Image gen</div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="font-medium">Free plan</div>
                  <div className="text-sm text-[#888899] mt-1">{msgUsed} / 50 messages used this month</div>
                </div>
                <button onClick={handleUpgrade} disabled={upgrading}
                  className="bg-[#6C63FF] hover:bg-[#4b44cc] disabled:opacity-60 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex-shrink-0 ml-4">
                  {upgrading ? 'Loading…' : 'Upgrade — $20/mo'}
                </button>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-[#6C63FF] rounded-full transition-all" style={{ width: `${msgPct}%` }} />
              </div>
            </>
          )}
        </div>

        {/* Pro upsell */}
        {!isPro && (
          <div className="bg-gradient-to-br from-[#6C63FF]/10 to-[#a78bfa]/5 border border-[#6C63FF]/20 rounded-2xl p-6 mb-4">
            <h2 className="text-xs font-medium text-[#a78bfa] uppercase tracking-wider mb-4">Pro unlocks</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {['🔍 Web search & deep research','🎨 Image generation (DALL-E 3)','⚡ Unlimited messages','🤖 Claude Sonnet 4 + Opus 4','📎 File uploads up to 20MB','🌐 All future Pro features'].map(f => (
                <div key={f} className="flex items-center gap-2 text-sm text-[#888899]">
                  <span className="text-[#6C63FF] flex-shrink-0">✓</span>{f}
                </div>
              ))}
            </div>
            <button onClick={handleUpgrade} disabled={upgrading}
              className="mt-5 w-full bg-[#6C63FF] hover:bg-[#4b44cc] disabled:opacity-60 text-white py-3 rounded-xl text-sm font-medium transition-colors">
              {upgrading ? 'Redirecting to checkout…' : 'Upgrade to Pro — $20/mo'}
            </button>
          </div>
        )}

        {/* What's included */}
        <div className="bg-[#16161d] border border-white/5 rounded-2xl p-6 mb-4">
          <h2 className="text-xs font-medium text-[#555566] uppercase tracking-wider mb-4">Your plan includes</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { label: 'Claude AI chat', free: true },
              { label: 'Builder mode + live preview', free: true },
              { label: 'Code execution (14+ langs)', free: true },
              { label: 'Project builder IDE', free: true },
              { label: 'Canvas document editor', free: true },
              { label: 'Voice mode', free: true },
              { label: 'Plugins (weather, stocks…)', free: true },
              { label: 'Chat history', free: true },
              { label: 'Web search + deep research', free: false },
              { label: 'Image generation', free: false },
              { label: 'Unlimited messages', free: false },
              { label: 'Sonnet 4 + Opus 4 models', free: false },
            ].map(f => {
              const available = f.free || isPro;
              return (
                <div key={f.label} className={`flex items-center gap-2 text-sm ${available ? 'text-[#888899]' : 'text-[#333344]'}`}>
                  <span className={available ? 'text-[#6C63FF]' : 'text-[#333344]'}>{available ? '✓' : '✗'}</span>
                  {f.label}
                  {!f.free && !isPro && <span className="text-[9px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-full ml-auto">Pro</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Account */}
        <div className="bg-[#16161d] border border-white/5 rounded-2xl p-6">
          <h2 className="text-xs font-medium text-[#555566] uppercase tracking-wider mb-4">Account</h2>
          <button onClick={() => signOut({ callbackUrl: '/login' })} className="text-sm text-red-400 hover:text-red-300 transition-colors">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
