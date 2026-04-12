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
        priceId: process.env.NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID || '',
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
        <Link href="/chat" className="text-sm text-[#888899]">
          ← Back to chat
        </Link>

        <h1 className="text-2xl font-semibold mb-8">Settings</h1>

        {/* Profile */}
        <div className="bg-[#16161d] p-6 rounded-xl">
          <div className="font-medium">{userData?.name}</div>
          <div className="text-sm text-gray-400">{userData?.email}</div>
        </div>

        {/* Plan */}
        <div className="mt-4 bg-[#16161d] p-6 rounded-xl">
          <div className="font-medium">
            {userData?.plan === 'pro' ? 'Pro' : 'Free'}
          </div>

          {userData?.plan !== 'pro' && (
            <button
              onClick={handleUpgrade}
              className="mt-4 bg-purple-600 px-4 py-2 rounded"
            >
              Upgrade
            </button>
          )}
        </div>

        <div className="mt-4">
          <button onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
