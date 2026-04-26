'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const PLANS = [
  {
    id: 'starter', name: 'Starter', price: '$297',
    features: ['AI booking agent','Review autopilot','Basic dashboard','1 location','Email support'],
  },
  {
    id: 'growth', name: 'Growth', price: '$597', popular: true,
    features: ['Everything in Starter','Customer winback','Slow day filler','Profit leak detector','Competitor watch','Priority support'],
  },
  {
    id: 'pro', name: 'Pro', price: '$997',
    features: ['Everything in Growth','Churn prevention','Multi-location','Quote builder','Compliance AI','Dedicated support','Monthly strategy call'],
  },
];

const ADDON_FEATURES = [
  'Separate dashboard and POS',
  'Separate customers and inventory',
  'Same Aria AI access',
  'Switch between businesses instantly',
  'One login for everything',
  'Consolidated reporting (Pro)',
];

export default function PlanPage() {
  const router = useRouter();
  const [selected, setSelected] = useState('growth');
  const [loading, setLoading] = useState(false);
  const [isAdditional, setIsAdditional] = useState(false);
  const [existingPlan, setExistingPlan] = useState('');
  const [businessCount, setBusinessCount] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const newBusiness = params.get('new') === 'true';
    setIsAdditional(newBusiness);

    if (newBusiness) {
      (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: businesses } = await supabase
          .from('businesses')
          .select('id, plan')
          .eq('user_id', user.id)
          .eq('is_active', true);

        if (businesses && businesses.length > 0) {
          setBusinessCount(businesses.length);
          setExistingPlan(businesses[0].plan || 'starter');
        }
      })();
    }
  }, []);

  async function handleContinue() {
    setLoading(true);

    const type = isAdditional ? 'additional_business' : 'new';

    const res = await fetch('/api/stripe/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan: isAdditional ? 'additional' : selected,
        type,
      }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      // No Stripe configured — skip to connect step
      const dest = isAdditional
        ? '/onboarding/connect?new=true'
        : '/onboarding/connect';
      router.push(dest);
    }
    setLoading(false);
  }

  // ADDITIONAL BUSINESS PRICING UI
  if (isAdditional) {
    return (
      <div className="min-h-screen bg-[#f5f4ef] flex flex-col items-center px-4 py-12">
        <div className="text-2xl font-medium tracking-tight mb-10">
          aria<span className="text-[#1D9E75]">OS</span>
        </div>

        <ProgressBar step={3} />

        <div className="w-full max-w-lg mt-6">
          <button onClick={() => router.back()} className="text-xs text-[rgba(26,26,22,0.4)] hover:text-[#1a1a16] mb-5 flex items-center gap-1 transition-colors">
            ← Back
          </button>

          {/* Context banner */}
          <div className="bg-[rgba(29,158,117,0.08)] border border-[rgba(29,158,117,0.2)] rounded-2xl px-5 py-4 mb-6">
            <p className="text-sm font-semibold text-[#1D9E75]">Adding to your existing account</p>
            <p className="text-xs text-[rgba(26,26,22,0.5)] mt-1">
              You already have {businessCount} business{businessCount !== 1 ? 'es' : ''} on your{' '}
              <span className="font-medium capitalize">{existingPlan}</span> plan.
              This new business will be added as a separate workspace.
            </p>
          </div>

          <h1 className="text-xl font-medium text-[#1a1a16] mb-1">Add another business</h1>
          <p className="text-sm text-[rgba(26,26,22,0.45)] mb-6">
            Each additional business is just <strong>$97/month</strong> — not the full plan price.
          </p>

          {/* Addon pricing card */}
          <div className="bg-white rounded-2xl border-[2px] border-[#1D9E75] shadow-[0_0_24px_rgba(29,158,117,0.12)] p-8 mb-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="text-[11px] bg-[rgba(29,158,117,0.1)] text-[#1D9E75] border border-[rgba(29,158,117,0.2)] rounded-full px-3 py-1 inline-block mb-3">
                  Additional business
                </div>
                <div className="text-3xl font-bold text-[#1a1a16]">
                  $97<span className="text-base font-normal text-[rgba(26,26,22,0.4)]">/month</span>
                </div>
                <p className="text-xs text-[rgba(26,26,22,0.45)] mt-1">
                  vs $297–$997/month for a new account
                </p>
              </div>
              <div className="bg-[rgba(29,158,117,0.1)] rounded-xl px-3 py-1.5">
                <p className="text-[10px] font-semibold text-[#1D9E75]">SAVE UP TO</p>
                <p className="text-lg font-bold text-[#1D9E75]">$900/mo</p>
              </div>
            </div>

            <div className="border-t border-[rgba(0,0,0,0.06)] pt-5">
              <p className="text-xs font-semibold text-[rgba(26,26,22,0.4)] uppercase tracking-wider mb-3">
                What&apos;s included
              </p>
              <ul className="space-y-2">
                {ADDON_FEATURES.map(f => (
                  <li key={f} className="flex items-center gap-2 text-[13px] text-[rgba(26,26,22,0.7)]">
                    <span className="text-[#1D9E75] font-bold flex-shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <button
            onClick={handleContinue}
            disabled={loading}
            className="w-full bg-[#1a1a16] hover:bg-[#2d2d25] disabled:opacity-60 text-white py-3.5 rounded-full font-medium text-sm transition-colors"
          >
            {loading ? 'Redirecting to checkout…' : 'Add business for $97/month →'}
          </button>

          <p className="text-center text-[11px] text-[rgba(26,26,22,0.35)] mt-3">
            Billed monthly. Cancel anytime. Added to your existing subscription.
          </p>
        </div>
      </div>
    );
  }

  // STANDARD NEW ACCOUNT PRICING UI
  return (
    <div className="min-h-screen bg-[#f5f4ef] flex flex-col items-center px-4 py-12">
      <div className="text-2xl font-medium tracking-tight mb-10">
        aria<span className="text-[#1D9E75]">OS</span>
      </div>

      <ProgressBar step={3} />

      <div className="w-full max-w-2xl mt-6">
        <button onClick={() => router.back()} className="text-xs text-[rgba(26,26,22,0.4)] hover:text-[#1a1a16] mb-5 flex items-center gap-1 transition-colors">
          ← Back
        </button>
        <h1 className="text-xl font-medium text-[#1a1a16] mb-1">Choose your plan</h1>
        <p className="text-sm text-[rgba(26,26,22,0.45)] mb-6">14-day free trial on all plans. Cancel anytime.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {PLANS.map(plan => (
            <button
              key={plan.id}
              onClick={() => setSelected(plan.id)}
              className={`text-left bg-white rounded-2xl p-6 border-[1.5px] transition-all ${
                selected === plan.id
                  ? 'border-[#1D9E75] shadow-[0_0_20px_rgba(29,158,117,0.1)]'
                  : 'border-[rgba(0,0,0,0.08)] hover:border-[rgba(0,0,0,0.15)]'
              } relative`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#1D9E75] text-white text-[10px] font-medium px-2.5 py-0.5 rounded-full">
                  Most popular
                </div>
              )}
              <div className="text-[11px] bg-[rgba(29,158,117,0.08)] text-[#1D9E75] border border-[rgba(29,158,117,0.15)] rounded-full px-2.5 py-1 inline-block mb-3">
                14-day free trial
              </div>
              <div className="text-sm font-medium mb-1">{plan.name}</div>
              <div className="text-2xl font-semibold mb-4">
                {plan.price}<span className="text-sm font-normal text-[rgba(26,26,22,0.4)]">/mo</span>
              </div>
              <ul className="space-y-1.5">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-[12px] text-[rgba(26,26,22,0.55)]">
                    <span className="text-[#1D9E75] flex-shrink-0">✓</span>{f}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>

        <button
          onClick={handleContinue}
          disabled={loading}
          className="w-full bg-[#1a1a16] hover:bg-[#2d2d25] disabled:opacity-60 text-white py-3 rounded-full font-medium text-sm transition-colors"
        >
          {loading ? 'Redirecting to checkout…' : `Start free trial with ${PLANS.find(p=>p.id===selected)?.name}`}
        </button>
      </div>
    </div>
  );
}

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2">
      {[1,2,3,4].map(s => (
        <div key={s} className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-medium transition-colors ${
            s < step ? 'bg-[#1D9E75] text-white' :
            s === step ? 'bg-[#1a1a16] text-white' :
            'bg-[rgba(0,0,0,0.08)] text-[rgba(26,26,22,0.35)]'
          }`}>{s < step ? '✓' : s}</div>
          {s < 4 && <div className={`w-8 h-px ${s < step ? 'bg-[#1D9E75]' : 'bg-[rgba(0,0,0,0.1)]'}`} />}
        </div>
      ))}
    </div>
  );
}