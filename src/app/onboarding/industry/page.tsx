'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { publishedIndustries } from '@/lib/industry-config';

const INDUSTRY_SUBS: Record<string, string> = {
  retail: 'Liquor, convenience, specialty retail',
  cafe: 'Coffee shops, tea rooms, juice bars',
  restaurant: 'Restaurants, takeaway, food service',
  warehouse: 'Importer, wholesaler, distributor',
};

export default function IndustryPage() {
  const router = useRouter();
  const [selected, setSelected] = useState('');
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setIsNew(params.get('new') === 'true');
  }, []);

  function handleContinue() {
    if (!selected) return;
    localStorage.setItem('aria_industry', selected);
    const dest = isNew ? '/onboarding/details?new=true' : '/onboarding/details';
    router.push(dest);
  }

  return (
    <div className="min-h-screen bg-[#f5f4ef] flex flex-col items-center px-4 py-12">
      <div className="text-2xl font-medium tracking-tight mb-10 text-[#1a1a16]">aria</div>

      <ProgressBar step={1} />

      <div className="w-full max-w-xl bg-white rounded-2xl border border-[rgba(0,0,0,0.08)] shadow-sm p-8 mt-6">
        {isNew && (
          <div className="mb-5 bg-[rgba(29,158,117,0.08)] border border-[rgba(29,158,117,0.2)] rounded-xl px-4 py-3">
            <p className="text-sm font-medium text-[#1D9E75]">Adding a new business</p>
            <p className="text-xs text-[rgba(26,26,22,0.5)] mt-0.5">This will create a separate dashboard and POS for your new business.</p>
          </div>
        )}

        <h1 className="text-xl font-medium text-[#1a1a16] mb-1">What type of business are you?</h1>
        <p className="text-sm text-[rgba(26,26,22,0.45)] mb-6">
          Aria customises every feature specifically for your industry
        </p>

        <div className="grid grid-cols-1 gap-2 mb-6">
          {publishedIndustries.map(ind => (
            <button
              key={ind.id}
              onClick={() => setSelected(ind.id)}
              className={`text-left p-4 rounded-xl border transition-all ${
                selected === ind.id
                  ? 'border-[1.5px] border-[#1D9E75] bg-[#f0faf6]'
                  : 'border border-[#eceae3] bg-[#faf9f6] hover:border-[#b8d9cc] hover:bg-[#f2faf6]'
              }`}
            >
              <div className={`text-sm font-medium mb-0.5 ${selected === ind.id ? 'text-[#1D9E75]' : 'text-[#1a1a16]'}`}>
                {ind.label}
              </div>
              {INDUSTRY_SUBS[ind.id] && (
                <div className="text-[11px] text-[rgba(26,26,22,0.4)]">{INDUSTRY_SUBS[ind.id]}</div>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={handleContinue}
          disabled={!selected}
          className="w-full bg-[#1a1a16] hover:bg-[#2d2d25] disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 rounded-full font-medium text-sm transition-colors"
        >
          Continue
        </button>

        <button
          onClick={() => {
            localStorage.setItem('aria_industry', 'retail');
            router.push(isNew ? '/onboarding/details?new=true' : '/onboarding/details');
          }}
          className="block w-full text-center text-xs text-[rgba(26,26,22,0.35)] hover:text-[rgba(26,26,22,0.6)] mt-4 transition-colors"
        >
          I&apos;ll set this up later
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
