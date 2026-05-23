'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type BizSummary = {
  legal_name: string | null;
  trading_name: string | null;
  owner_name: string | null;
  email: string | null;
  abn: string | null;
  acn: string | null;
};

export default function ReviewRequestPage() {
  const router = useRouter();
  const [biz, setBiz] = useState<BizSummary | null>(null);
  const [explanation, setExplanation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data } = await supabase
        .from('businesses')
        .select('legal_name, trading_name, owner_name, email, abn, acn, access_status')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!data || data.access_status === 'active') { router.push('/onboarding'); return; }
      setBiz(data);
      setLoading(false);
    })();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!explanation.trim()) { setErr('Please provide an explanation.'); return; }
    setSubmitting(true); setErr('');
    const res = await fetch('/api/onboarding/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner_explanation: explanation }),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!res.ok) { setErr(json.error || 'Submission failed'); return; }
    router.push('/onboarding/holding');
  }

  if (loading) return (
    <div className="min-h-screen bg-[#f0f5f2] flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-[#2D5240] border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f0f5f2] flex flex-col items-center px-4 py-12" style={{ fontFamily: 'var(--font-body)' }}>
      <div className="text-2xl font-semibold mb-8 text-[#2D5240]" style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>aria</div>

      <div className="w-full max-w-xl bg-white rounded-2xl border border-[rgba(45,82,64,0.12)] shadow-sm p-8">
        <div className="mb-5 p-4 bg-[rgba(251,191,36,0.08)] border border-[rgba(251,191,36,0.3)] rounded-xl">
          <p className="text-sm font-semibold text-amber-700">ABN verification required</p>
          <p className="text-xs text-[rgba(0,0,0,0.5)] mt-1">We couldn't verify your ABN automatically. Please confirm your details and explain why your ABN may not have verified.</p>
        </div>

        <h1 className="text-xl font-semibold text-[#2D5240] mb-1" style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>
          Confirm your details
        </h1>
        <p className="text-sm text-[rgba(0,0,0,0.45)] mb-5">Please check the details below are correct.</p>

        <div className="bg-[#f8faf9] rounded-xl border border-[rgba(45,82,64,0.1)] p-4 mb-5 space-y-2 text-sm">
          <Row label="Legal name" value={biz?.legal_name} />
          <Row label="Trading name" value={biz?.trading_name} />
          <Row label="Owner" value={biz?.owner_name} />
          <Row label="Email" value={biz?.email} />
          <Row label="ABN" value={biz?.abn} />
          {biz?.acn && <Row label="ACN" value={biz.acn} />}
        </div>

        <p className="text-xs text-[rgba(0,0,0,0.4)] mb-4">
          If any detail is incorrect, <button onClick={() => router.push('/onboarding')} className="underline text-[#2D5240] hover:text-[#1a3328]">go back and update it</button>.
        </p>

        <form onSubmit={handleSubmit}>
          <label className="block text-xs font-medium text-[#2D5240] mb-1">
            Why did your ABN not verify? *
          </label>
          <textarea
            value={explanation}
            onChange={e => setExplanation(e.target.value)}
            rows={4}
            placeholder="e.g. My ABN was recently registered and may not yet appear in the ABR database. My registration number is XYZ…"
            className="w-full border border-[rgba(45,82,64,0.2)] rounded-lg px-3 py-2 text-sm text-[#1a1a16] placeholder-[rgba(0,0,0,0.3)] focus:outline-none focus:border-[#2D5240] focus:ring-1 focus:ring-[rgba(45,82,64,0.3)] resize-none mb-4"
          />
          {err && <p className="text-sm text-red-600 mb-3">{err}</p>}
          <button type="submit" disabled={submitting || !explanation.trim()}
            className={"w-full py-3 rounded-full font-medium text-sm transition-colors text-white " + (submitting || !explanation.trim() ? 'bg-[#2D5240] opacity-50 cursor-not-allowed' : 'bg-[#2D5240] hover:bg-[#1a3328]')}>
            {submitting ? 'Submitting…' : 'Submit for review'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between">
      <span className="text-[rgba(0,0,0,0.4)]">{label}</span>
      <span className="font-medium text-[#1a1a16]">{value}</span>
    </div>
  );
}
