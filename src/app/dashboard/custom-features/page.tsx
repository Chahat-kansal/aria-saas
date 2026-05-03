'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import Link from 'next/link';

interface CustomFeature {
  id: string; feature_name: string; feature_request: string;
  status: string; feature_plan: Record<string, unknown> | null;
  created_at: string; deployed_at: string | null;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  planned:   { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Planned' },
  building:  { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'Building…' },
  deployed:  { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Deployed' },
  failed:    { bg: 'bg-red-100',    text: 'text-red-600',    label: 'Failed' },
};

const EXAMPLE_FEATURES = [
  { emoji: '💍', title: 'Jewellery commission tracking', desc: '3-8% commission on high-value sales for floor staff' },
  { emoji: '☕', title: '10th coffee free loyalty', desc: 'Punch card loyalty — free item after N purchases' },
  { emoji: '🎉', title: 'Happy hour discounting', desc: 'Auto-apply % discount between set hours (e.g. 4–6pm)' },
  { emoji: '📊', title: 'Staff sales leaderboard', desc: 'Real-time leaderboard on the terminal screen' },
  { emoji: '💰', title: 'Split bill between customers', desc: 'Divide a table bill evenly or by item' },
];

export default function CustomFeaturesPage() {
  const { business } = useBusinessContext();
  const [features, setFeatures] = useState<CustomFeature[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!business?.id) return;
    try {
      const res = await fetch(`/api/aria/custom-features?business_id=${business.id}`);
      if (res.ok) { const d = await res.json(); setFeatures(d.features ?? []); }
    } catch { /* silent */ }
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: '#0d0d14' }}>
      {/* Header */}
      <div className="border-b px-6 py-5 flex items-center justify-between flex-shrink-0"
        style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#13131a' }}>
        <div>
          <h1 className="font-semibold text-white text-xl">Custom Features</h1>
          <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>
            Features Aria has designed for {business?.name ?? 'your business'}
          </p>
        </div>
        <Link href="/dashboard/ask-aria?q=I+want+to+add+a+custom+feature+to+my+POS%3A+"
          className="px-4 py-2 rounded-xl text-sm font-medium text-white"
          style={{ background: '#1D9E75' }}>
          ✦ Ask Aria to build a feature
        </Link>
      </div>

      <div className="p-6 space-y-6 max-w-4xl mx-auto w-full">
        {/* How it works */}
        <div className="rounded-2xl p-5" style={{ background: 'rgba(29,158,117,0.08)', border: '1px solid rgba(29,158,117,0.2)' }}>
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-[rgba(29,158,117,0.2)] flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-[#1D9E75] font-bold">A</span>
            </div>
            <div>
              <p className="text-white font-medium mb-1">How custom features work</p>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Tell Aria what you want in <Link href="/dashboard/ask-aria" className="text-[#1D9E75] hover:underline">Ask Aria</Link>.
                Aria analyses your request, asks any clarifying questions, then designs and plans the feature.
                You get the exact code to add with a "Copy prompt for Claude Code" button.
              </p>
              <div className="flex gap-3 mt-3 flex-wrap">
                {['1. Describe it in plain English', '2. Aria designs it', '3. Review + copy code'].map(step => (
                  <span key={step} className="text-xs px-3 py-1.5 rounded-full"
                    style={{ background: 'rgba(29,158,117,0.15)', color: '#1D9E75' }}>
                    {step}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Existing custom features */}
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-5 h-5 rounded-full border-2 border-[#1D9E75] border-t-transparent animate-spin" />
          </div>
        ) : features.length > 0 ? (
          <div>
            <h2 className="text-sm font-semibold text-white mb-3">Your features</h2>
            <div className="space-y-3">
              {features.map(f => {
                const s = STATUS_STYLES[f.status] ?? STATUS_STYLES.planned;
                return (
                  <div key={f.id} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-white font-medium text-sm">{f.feature_name}</p>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${s.bg} ${s.text}`}>{s.label}</span>
                        </div>
                        <p className="text-xs text-gray-500 line-clamp-2">{f.feature_request}</p>
                        <p className="text-[10px] text-gray-600 mt-1">
                          Designed {new Date(f.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div>
            <h2 className="text-sm font-semibold text-white mb-3">Example features you could request</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {EXAMPLE_FEATURES.map(ex => (
                <Link key={ex.title}
                  href={`/dashboard/ask-aria?q=I+want+to+add+a+custom+feature+to+my+POS%3A+${encodeURIComponent(ex.title)}`}
                  className="rounded-2xl p-4 group transition-all hover:border-[#1D9E75]"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0">{ex.emoji}</span>
                    <div>
                      <p className="text-sm font-medium text-white mb-0.5 group-hover:text-[#1D9E75] transition-colors">{ex.title}</p>
                      <p className="text-xs text-gray-500">{ex.desc}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
