'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const STAFF_OPTIONS = ['Just me','2–5','6–10','11–20','21–50','50+'];
const REVENUE_OPTIONS = ['Under $10k/mo','$10k–$30k/mo','$30k–$100k/mo','$100k–$300k/mo','$300k+/mo'];
const CHALLENGE_OPTIONS = [
  'Not enough new customers',
  'Losing existing customers',
  'Low Google rating',
  'Too much admin work',
  'Unpredictable revenue',
  'Standing out from competitors',
];

export default function DetailsPage() {
  const router = useRouter();
  const [industry, setIndustry] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isNew, setIsNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '', ownerName: '', address: '', phone: '', email: '',
    staffCount: '', monthlyRevenue: '', biggestChallenge: '', googleUrl: '',
  });

  useEffect(() => {
    setIndustry(localStorage.getItem('aria_industry') || 'professional');
    const params = new URLSearchParams(window.location.search);
    setIsNew(params.get('new') === 'true');
    setEditingId(params.get('edit') || null);
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    const payload = {
      name: form.name,
      owner_name: form.ownerName,
      industry,
      address: form.address,
      phone: form.phone ? `+61${form.phone}` : null,
      email: form.email || user.email,
      staff_count: form.staffCount,
      monthly_revenue: form.monthlyRevenue,
      biggest_challenge: form.biggestChallenge,
      google_business_url: form.googleUrl || null,
    };

    let businessId: string;
    let err: { message: string } | null = null;

    if (editingId) {
      // Editing specific existing business
      const { error: e } = await supabase
        .from('businesses')
        .update(payload)
        .eq('id', editingId)
        .eq('user_id', user.id);
      err = e;
      businessId = editingId;
    } else if (isNew) {
      // Always insert a brand new business
      const { data, error: e } = await supabase
        .from('businesses')
        .insert({ user_id: user.id, is_active: true, ...payload })
        .select('id')
        .single();
      err = e;
      businessId = data?.id ?? '';
    } else {
      // First-time onboarding: check if a business exists, update if so, insert if not
      const { data: existing } = await supabase
        .from('businesses')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        const { error: e } = await supabase
          .from('businesses')
          .update(payload)
          .eq('id', existing.id)
          .eq('user_id', user.id);
        err = e;
        businessId = existing.id;
      } else {
        const { data, error: e } = await supabase
          .from('businesses')
          .insert({ user_id: user.id, is_active: true, ...payload })
          .select('id')
          .single();
        err = e;
        businessId = data?.id ?? '';
      }
    }

    setLoading(false);
    if (err) { setError(err.message); return; }

    // Save active business
    if (businessId) {
      localStorage.setItem('aria_active_business_id', businessId);
      await supabase.from('user_active_business').upsert(
        { user_id: user.id, business_id: businessId, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
    }

    router.push('/onboarding/plan');
  }

  const inputCls = 'w-full bg-[#faf9f6] border border-[#eceae3] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#1D9E75] focus:shadow-[0_0_0_3px_rgba(29,158,117,0.08)] transition-all placeholder:text-[rgba(26,26,22,0.3)]';
  const selectCls = inputCls + ' appearance-none cursor-pointer';

  return (
    <div className="min-h-screen bg-[#f5f4ef] flex flex-col items-center px-4 py-12">
      <div className="text-2xl font-medium tracking-tight mb-10">
        aria<span className="text-[#1D9E75]">OS</span>
      </div>

      <ProgressBar step={2} />

      <div className="w-full max-w-xl bg-white rounded-2xl border border-[rgba(0,0,0,0.08)] shadow-sm p-8 mt-6">
        <button onClick={() => router.back()} className="text-xs text-[rgba(26,26,22,0.4)] hover:text-[#1a1a16] mb-5 flex items-center gap-1 transition-colors">
          ← Back
        </button>

        {isNew && (
          <div className="mb-4 bg-[rgba(29,158,117,0.08)] border border-[rgba(29,158,117,0.2)] rounded-xl px-4 py-3">
            <p className="text-sm font-medium text-[#1D9E75]">New business</p>
            <p className="text-xs text-[rgba(26,26,22,0.5)] mt-0.5">This will be added to your account as a separate business.</p>
          </div>
        )}

        {industry && (
          <span className="inline-block bg-[rgba(29,158,117,0.1)] text-[#1D9E75] border border-[rgba(29,158,117,0.2)] rounded-full text-xs px-3 py-1 mb-4 capitalize">
            {industry}
          </span>
        )}

        <h1 className="text-xl font-medium text-[#1a1a16] mb-1">Tell us about your business</h1>
        <p className="text-sm text-[rgba(26,26,22,0.45)] mb-6">We use this to personalise every Aria feature for you</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[rgba(26,26,22,0.5)] mb-1.5 block">Business name *</label>
              <input value={form.name} onChange={set('name')} required placeholder="e.g. The Hair Studio" className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-[rgba(26,26,22,0.5)] mb-1.5 block">Your first name *</label>
              <input value={form.ownerName} onChange={set('ownerName')} required placeholder="e.g. Sarah" className={inputCls} />
            </div>
          </div>

          <div>
            <label className="text-xs text-[rgba(26,26,22,0.5)] mb-1.5 block">Business address *</label>
            <input value={form.address} onChange={set('address')} required placeholder="123 Main St, Melbourne VIC 3000" className={inputCls} />
            <p className="text-[11px] text-[rgba(26,26,22,0.35)] mt-1">Used to monitor local competitors</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[rgba(26,26,22,0.5)] mb-1.5 block">Phone</label>
              <div className="flex gap-2">
                <div className="bg-[#faf9f6] border border-[#eceae3] rounded-xl px-3 py-3 text-sm text-[rgba(26,26,22,0.5)] flex-shrink-0">+61</div>
                <input value={form.phone} onChange={set('phone')} placeholder="412 345 678" className={inputCls} />
              </div>
            </div>
            <div>
              <label className="text-xs text-[rgba(26,26,22,0.5)] mb-1.5 block">Business email *</label>
              <input type="email" value={form.email} onChange={set('email')} placeholder="hello@yourbiz.com" className={inputCls} />
            </div>
          </div>

          <div className="border-t border-[rgba(0,0,0,0.06)] pt-4">
            <p className="text-xs font-medium text-[rgba(26,26,22,0.4)] uppercase tracking-wider mb-4">A little more</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-[rgba(26,26,22,0.5)] mb-1.5 block">Staff count *</label>
                <div className="relative">
                  <select value={form.staffCount} onChange={set('staffCount')} required className={selectCls}>
                    <option value="">Select…</option>
                    {STAFF_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                  <ChevronIcon />
                </div>
              </div>
              <div>
                <label className="text-xs text-[rgba(26,26,22,0.5)] mb-1.5 block">Monthly revenue *</label>
                <div className="relative">
                  <select value={form.monthlyRevenue} onChange={set('monthlyRevenue')} required className={selectCls}>
                    <option value="">Select…</option>
                    {REVENUE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                  <ChevronIcon />
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs text-[rgba(26,26,22,0.5)] mb-1.5 block">Biggest challenge *</label>
              <div className="relative">
                <select value={form.biggestChallenge} onChange={set('biggestChallenge')} required className={selectCls}>
                  <option value="">Select…</option>
                  {CHALLENGE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
                <ChevronIcon />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs text-[rgba(26,26,22,0.5)] mb-1.5 block">Google Business URL <span className="text-[rgba(26,26,22,0.3)]">(optional)</span></label>
            <input value={form.googleUrl} onChange={set('googleUrl')} placeholder="https://maps.google.com/…" className={inputCls} />
            <p className="text-[11px] text-[rgba(26,26,22,0.35)] mt-1">Connects Aria to your reviews</p>
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#1a1a16] hover:bg-[#2d2d25] disabled:opacity-60 text-white py-3 rounded-full font-medium text-sm transition-colors mt-2"
          >
            {loading ? 'Saving…' : 'Continue'}
          </button>

          <p className="text-center text-[11px] text-[rgba(26,26,22,0.3)] leading-relaxed">
            By continuing you agree to our Terms and Privacy Policy. Your data is never sold.
          </p>
        </form>
      </div>
    </div>
  );
}

function ChevronIcon() {
  return (
    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[rgba(26,26,22,0.4)]">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
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