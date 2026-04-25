'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

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

export default function PlanPage() {
  const router = useRouter();
  const [selected, setSelected] = useState('growth');
  const [loading, setLoading] = useState(false);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setIsNew(params.get('new') === 'true');
  }, []);

  async function handleContinue() {
    setLoading(true);
    const businessId = typeof window !== 'undefined'
      ? localStorage.getItem('aria_active_business_id')
      : null;

    const res = await fetch('/api/stripe/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan: selected,
        is_additional: isNew,
        business_id: businessId,
      }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      router.push(isNew ? '/onboarding/connect?new=true' : '/onboarding/connect');
    }
    setLoading(false);
  }

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

        {isNew ? (
          <>
            <h1 className="text-xl font-medium text-[#1a1a16] mb-1">Add this business to your account</h1>
            <div className="bg-[rgba(29,158,117,0.08)] border border-[rgba(29,158,117,0.2)] rounded-xl px-4 py-3 mb-6">
              <p className="text-sm font-medium text-[#1D9E75]">Additional business seat — $49/month</p>
              <p className="text-xs text-[rgba(26,26,22,0.5)] mt-0.5">
                Each business after your first is $49/mo regardless of plan. Your existing plan features apply.
              </p>
            </div>
            <button
              onClick={handleContinue}
              disabled={loading}
              className="w-full bg-[#1a1a16] hover:bg-[#2d2d25] disabled:opacity-60 text-white py-3 rounded-full font-medium text-sm transition-colors"
            >
              {loading ? 'Redirecting to checkout…' : 'Add business — $49/mo →'}
            </button>
          </>
        ) : (
          <>
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
              {loading ? 'Redirecting to checkout…' : `Start free trial with ${PLANS.find(p => p.id === selected)?.name}`}
            </button>
          </>
        )}
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