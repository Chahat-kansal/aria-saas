'use client';

import { useSession, signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import Link from 'next/link';

interface UserData {
  name: string;
  email: string;
  plan: string;
  messagesUsedThisMonth: number;
  image?: string;
}

export default function SettingsClient() {
  const { data: session } = useSession();
  const params = useSearchParams();

  const [userData, setUserData] = useState<UserData | null>(null);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    fetch('/api/user')
      .then(r => r.json())
      .then(setUserData)
      .catch(() => {});

    if (params.get('upgraded') === 'true') {
      toast.success('🎉 Welcome to Aria Pro!');
    }
  }, [params]);

  async function handleUpgrade() {
    setUpgrading(true);

    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        priceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
      }),
    });

    const data = await res.json();
    setUpgrading(false);

    if (data.url) window.location.href = data.url;
    else toast.error('Could not start checkout');
  }

  return (
    <div className="min-h-screen bg-[#0e0e12] flex">
      <div className="flex-1 max-w-2xl mx-auto px-6 py-10">

        <Link href="/chat" className="text-sm text-[#888899] mb-6 block">
          ← Back to chat
        </Link>

        <h1 className="text-2xl font-semibold mb-8">Settings</h1>

        {/* Profile */}
        <div className="bg-[#16161d] p-6 rounded-2xl mb-4">
          <div className="flex items-center gap-4">
            {userData?.image ? (
              <img src={userData.image} className="w-12 h-12 rounded-full" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-[#6C63FF]/30 flex items-center justify-center">
                {userData?.name?.[0]}
              </div>
            )}

            <div>
              <div>{userData?.name}</div>
              <div className="text-sm text-[#888899]">{userData?.email}</div>
            </div>
          </div>
        </div>

        {/* Plan */}
        <div className="bg-[#16161d] p-6 rounded-2xl mb-4">
          <div className="flex justify-between items-center">
            <div>
              <div className="font-medium">
                {userData?.plan === 'pro' ? 'Pro' : 'Free'}
              </div>

              <div className="text-sm text-[#888899]">
                {userData?.plan === 'pro'
                  ? 'Unlimited usage'
                  : `${userData?.messagesUsedThisMonth || 0}/50 messages`}
              </div>
            </div>

            {userData?.plan !== 'pro' && (
              <button
                onClick={handleUpgrade}
                disabled={upgrading}
                className="bg-[#6C63FF] px-4 py-2 rounded-lg"
              >
                {upgrading ? 'Loading...' : 'Upgrade'}
              </button>
            )}
          </div>
        </div>

        {/* Sign out */}
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="text-red-400"
        >
          Sign out
        </button>

      </div>
    </div>
  );
}
