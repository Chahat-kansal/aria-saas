'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { SitePreviewCard } from '@/components/SitePreviewCard';
import type { SitePreviewResult } from '@/app/api/site-preview/route';

function validateABN(raw: string): boolean {
  const digits = raw.replace(/\s/g, '');
  if (digits.length !== 11) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const d = digits.split('').map(Number);
  if (d.some(n => isNaN(n))) return false;
  d[0] -= 1;
  const sum = d.reduce((acc, v, i) => acc + v * weights[i], 0);
  return sum % 89 === 0;
}

const STEPS = ['identity', 'abn', 'details', 'operations', 'goals'] as const;
type Step = typeof STEPS[number];
type Setter = (k: keyof FD, v: FD[keyof FD]) => void;

const ENTITY_TYPES = ['Sole Trader', 'Partnership', 'Company (Pty Ltd)', 'Trust', 'Other'];
const INDUSTRIES = ['liquor', 'cafe', 'convenience', 'bakery', 'restaurant', 'retail', 'warehouse', 'other'];
const SERVICE_INDUSTRIES = ['swim school', 'childcare / kindergarten', 'clinic / allied health', 'tutoring', 'fitness / studio', 'services other'];
const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];
const STAFF_OPTS = ['Just me', '2–5', '6–15', '16–50', '51+'];
const REV_OPTS = ['Under $10k', '$10k–$25k', '$25k–$50k', '$50k–$100k', '$100k–$250k', '$250k+'];
const CHALLENGES = ['cash flow', 'staffing', 'marketing', 'stock', 'compliance', 'time', 'winning customers back', 'knowing my numbers'];

const HEADINGS = ['Tell us about yourself', 'Your ABN details', 'Business location & type', 'Operations', 'Your goals'];
const SUBHEADINGS = [
  "We'll use this to personalise your Aria experience.",
  'Australian Business Number — required for tax and compliance.',
  'Help us set up your industry-specific dashboard.',
  'Help us understand how your business runs.',
  'What challenges are you working to overcome?',
];

type FD = {
  legal_name: string; trading_name: string; owner_name: string; email: string; phone: string; entity_type: string;
  abn: string; acn: string; gst_registered: string;
  business_model: string;
  industry: string; industry_subtype: string; address: string; city: string;
  business_state: string; postcode: string; year_established: string;
  staff_count: string; monthly_revenue: string; website: string; google_business_url: string;
  biggest_challenge: string[]; goals_notes: string;
};

const EMPTY: FD = {
  legal_name: '', trading_name: '', owner_name: '', email: '', phone: '', entity_type: '',
  abn: '', acn: '', gst_registered: '',
  business_model: '',
  industry: '', industry_subtype: '', address: '', city: '', business_state: '', postcode: '', year_established: '',
  staff_count: '', monthly_revenue: '', website: '', google_business_url: '',
  biggest_challenge: [], goals_notes: '',
};

function isStepValid(step: number, f: FD): boolean {
  if (step === 0) return f.legal_name.trim().length > 0 && f.owner_name.trim().length > 0;
  if (step === 2) return f.business_model.length > 0 && f.industry.length > 0;
  return true;
}

export default function OnboardingWizard() {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [form, setForm] = useState<FD>(EMPTY);
  const [abnState, setAbnState] = useState<'valid' | 'invalid' | 'empty'>('empty');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: biz } = await supabase
        .from('businesses')
        .select('access_status')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (biz?.access_status === 'pending_review' || biz?.access_status === 'rejected') {
        router.push('/onboarding/holding');
        return;
      }

      const { data: onb } = await supabase
        .from('business_onboarding')
        .select('current_step, step_data')
        .eq('user_id', user.id)
        .maybeSingle();
      if (onb) {
        if (onb.current_step === 'provisioning') { router.push('/onboarding/provisioning'); return; }
        const i = STEPS.indexOf(onb.current_step as Step);
        if (i >= 0) setIdx(i);
        const sd = (onb.step_data as Partial<FD>) || {};
        setForm(prev => ({
          ...prev, ...sd,
          biggest_challenge: Array.isArray(sd.biggest_challenge) ? sd.biggest_challenge : [],
        }));
        if (sd.abn) setAbnState(validateABN(sd.abn) ? 'valid' : 'invalid');
      }
      setLoading(false);
    })();
  }, [router]);

  const set: Setter = (k, v) => setForm(p => ({ ...p, [k]: v }));

  async function goNext() {
    setSaving(true); setErr('');
    const isLast = idx === STEPS.length - 1;
    const nextStep: string = isLast ? 'provisioning' : STEPS[idx + 1];
    const stepRes = await fetch('/api/onboarding/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: STEPS[idx], next_step: nextStep, form }),
    });
    const stepJson = await stepRes.json();
    if (!stepRes.ok) { setErr(stepJson.error || 'Failed to save'); setSaving(false); return; }

    if (!isLast) { setIdx(idx + 1); setSaving(false); return; }

    const subRes = await fetch('/api/onboarding/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ form, abn_valid: abnState === 'valid' }),
    });
    const subJson = await subRes.json();
    setSaving(false);
    if (!subRes.ok) { setErr(subJson.error || 'Submit failed'); return; }
    router.push(subJson.route === 'provisioning' ? '/onboarding/provisioning' : '/onboarding/review');
  }

  if (loading) return (
    <div className="min-h-screen bg-[#f0f5f2] flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-[#2D5240] border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f0f5f2] flex flex-col items-center px-4 py-12" style={{ fontFamily: 'var(--font-body)' }}>
      {/* AN-D spell 20 keyboard-onboarding: per-step spring fade-in for desktop wizard */}
      <style>{`
        @keyframes anKbdOnboardingIn{0%{opacity:0;transform:translateY(14px) scale(.985)}60%{opacity:1;transform:translateY(-2px) scale(1.005)}100%{transform:translateY(0) scale(1)}}
        .an-kbd-onboarding{animation:anKbdOnboardingIn .5s cubic-bezier(.22,1,.36,1) both}
        @media (prefers-reduced-motion: reduce){.an-kbd-onboarding{animation:none!important}}
      `}</style>
      <div className="text-2xl font-semibold mb-8 text-[#2D5240]" style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>aria</div>
      <ProgressBar current={idx + 1} />
      <div key={idx} className="an-kbd-onboarding w-full max-w-xl bg-white rounded-2xl border border-[rgba(45,82,64,0.12)] shadow-sm p-8 mt-6">
        <h1 className="text-xl font-semibold text-[#2D5240] mb-1" style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>
          {HEADINGS[idx]}
        </h1>
        <p className="text-sm text-[rgba(0,0,0,0.45)] mb-6">{SUBHEADINGS[idx]}</p>
        {err && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{err}</div>}
        {idx === 0 && <Identity form={form} set={set} />}
        {idx === 1 && (
          <ABN form={form} set={set} abnState={abnState}
            onABNBlur={() => {
              const s = form.abn.replace(/\s/g, '');
              setAbnState(s.length === 0 ? 'empty' : validateABN(form.abn) ? 'valid' : 'invalid');
            }}
          />
        )}
        {idx === 2 && <Details form={form} set={set} />}
        {idx === 3 && <Operations form={form} set={set} />}
        {idx === 4 && <Goals form={form} set={set} />}
        <div className="flex gap-3 mt-6">
          {idx > 0 && (
            <button onClick={() => setIdx(idx - 1)} disabled={saving}
              className="flex-1 border border-[#2D5240] text-[#2D5240] py-3 rounded-full font-medium text-sm hover:bg-[#edf3ef] transition-colors disabled:opacity-50">
              Back
            </button>
          )}
          <button onClick={goNext} disabled={saving || !isStepValid(idx, form)}
            className={"flex-1 py-3 rounded-full font-medium text-sm transition-colors text-white " + (saving || !isStepValid(idx, form) ? 'bg-[#2D5240] opacity-50 cursor-not-allowed' : 'bg-[#2D5240] hover:bg-[#1a3328]')}>
            {saving ? 'Saving…' : idx === 4 ? 'Submit' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ current }: { current: number }) {
  return (
    <div className="flex flex-col items-center gap-2 mb-2">
      <p className="text-xs font-medium text-[#2D5240]">{'Step ' + current + ' of 6'}</p>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5, 6].map(s => (
          <div key={s} className="flex items-center gap-1">
            <div className={"w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium transition-colors " + (s < current ? 'bg-[#7FB897] text-white' : s === current ? 'bg-[#2D5240] text-white' : 'bg-[rgba(45,82,64,0.12)] text-[rgba(45,82,64,0.4)]')}>
              {s < current ? '✓' : s}
            </div>
            {s < 6 && <div className={"w-6 h-px " + (s < current ? 'bg-[#7FB897]' : 'bg-[rgba(45,82,64,0.15)]')} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#2D5240] mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full border border-[rgba(45,82,64,0.2)] rounded-lg px-3 py-3 text-sm text-[#1a1a16] placeholder-[rgba(0,0,0,0.3)] focus:outline-none focus:border-[#2D5240] focus:ring-1 focus:ring-[rgba(45,82,64,0.3)]" />
    </div>
  );
}

function Sel({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#2D5240] mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-[rgba(45,82,64,0.2)] rounded-lg px-3 py-3 text-sm text-[#1a1a16] focus:outline-none focus:border-[#2D5240] focus:ring-1 focus:ring-[rgba(45,82,64,0.3)] bg-white">
        <option value="">{placeholder || 'Select…'}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Identity({ form, set }: { form: FD; set: Setter }) {
  return (
    <div className="space-y-4">
      <Field label="Legal name *" value={form.legal_name} onChange={v => set('legal_name', v)} placeholder="As registered with ASIC / ABR" />
      <Field label="Trading name" value={form.trading_name} onChange={v => set('trading_name', v)} placeholder="If different from legal name" />
      <Field label="Owner / Director name *" value={form.owner_name} onChange={v => set('owner_name', v)} placeholder="Your full name" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email" value={form.email} onChange={v => set('email', v)} type="email" placeholder="you@example.com" />
        <Field label="Phone" value={form.phone} onChange={v => set('phone', v)} type="tel" placeholder="04XX XXX XXX" />
      </div>
      <Sel label="Entity type" value={form.entity_type} onChange={v => set('entity_type', v)} options={ENTITY_TYPES} />
    </div>
  );
}

function ABN({ form, set, abnState, onABNBlur }: { form: FD; set: Setter; abnState: 'valid' | 'invalid' | 'empty'; onABNBlur: () => void }) {
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ entity_name?: string; gst_registered?: boolean; active?: boolean } | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  async function verifyABN() {
    const clean = form.abn.replace(/\D/g, '');
    if (clean.length !== 11) return;
    setVerifying(true); setVerifyError(null); setVerifyResult(null);
    try {
      const res = await fetch('/api/abn-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ abn: clean }),
      });
      const data = await res.json();
      if (!res.ok || !data.found) { setVerifyError(data.error ?? 'ABN not found in Australian Business Register'); return; }
      setVerifyResult(data);
      if (data.gst_registered !== undefined) set('gst_registered', data.gst_registered ? 'yes' : 'no');
    } catch { setVerifyError('Could not reach ABN Lookup — check your connection'); }
    finally { setVerifying(false); }
  }

  const canVerify = form.abn.replace(/\D/g, '').length === 11;

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-[#2D5240] mb-1">ABN (Australian Business Number)</label>
        <div className="flex gap-2">
          <input type="text" value={form.abn} onChange={e => set('abn', e.target.value)} onBlur={onABNBlur}
            placeholder="XX XXX XXX XXX"
            className="flex-1 border border-[rgba(45,82,64,0.2)] rounded-lg px-3 py-3 text-sm text-[#1a1a16] placeholder-[rgba(0,0,0,0.3)] focus:outline-none focus:border-[#2D5240] focus:ring-1 focus:ring-[rgba(45,82,64,0.3)]" />
          <button type="button" onClick={verifyABN} disabled={!canVerify || verifying}
            className="px-3 py-3 rounded-lg bg-[#2D5240] text-white text-xs font-semibold disabled:opacity-40 whitespace-nowrap hover:bg-[#1e3d2e] transition-colors">
            {verifying ? 'Checking…' : 'Verify with ABR'}
          </button>
        </div>
        {abnState === 'valid' && !verifyResult && <p className="text-xs text-green-600 mt-1">✓ Valid ABN format</p>}
        {abnState === 'invalid' && <p className="text-xs text-amber-500 mt-1">⚠ Invalid ABN format</p>}
        {verifyError && <p className="text-xs text-red-500 mt-1">✗ {verifyError}</p>}
        {verifyResult && (
          <div className="mt-2 p-2.5 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-xs font-semibold text-green-700 mb-0.5">✓ Verified with Australian Business Register</p>
            {verifyResult.entity_name && <p className="text-xs text-green-600">Registered name: <strong>{verifyResult.entity_name}</strong></p>}
            {verifyResult.gst_registered !== undefined && <p className="text-xs text-green-600">GST: {verifyResult.gst_registered ? '✓ Registered — prefilled below' : '✗ Not registered — prefilled below'}</p>}
          </div>
        )}
      </div>
      <Field label="ACN (optional)" value={form.acn} onChange={v => set('acn', v)} placeholder="XXX XXX XXX" />
      <Sel label="GST registered?" value={form.gst_registered} onChange={v => set('gst_registered', v)} options={['yes', 'no']} placeholder="Select…" />
    </div>
  );
}

function Details({ form, set }: { form: FD; set: Setter }) {
  const industryOptions = form.business_model === 'service' ? SERVICE_INDUSTRIES : INDUSTRIES;
  return (
    <div className="space-y-4">
      {/* Business model question — required first */}
      <div>
        <label className="block text-xs font-medium text-[#2D5240] mb-2">Does your business sell products, or provide services and classes? *</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => { set('business_model', 'product'); set('industry', ''); }}
            className={'rounded-xl border-2 p-3 text-sm font-medium transition-colors text-left ' + (form.business_model === 'product' ? 'border-[#2D5240] bg-[#edf3ef] text-[#2D5240]' : 'border-[rgba(45,82,64,0.2)] text-[rgba(0,0,0,0.6)] hover:border-[#2D5240]')}
          >
            We sell products
          </button>
          <button
            type="button"
            onClick={() => { set('business_model', 'service'); set('industry', ''); }}
            className={'rounded-xl border-2 p-3 text-sm font-medium transition-colors text-left ' + (form.business_model === 'service' ? 'border-[#2D5240] bg-[#edf3ef] text-[#2D5240]' : 'border-[rgba(45,82,64,0.2)] text-[rgba(0,0,0,0.6)] hover:border-[#2D5240]')}
          >
            We provide services / classes
          </button>
        </div>
      </div>

      {form.business_model && (
        <Sel label="Industry *" value={form.industry} onChange={v => set('industry', v)} options={industryOptions} />
      )}
      <Field label="Industry subtype" value={form.industry_subtype} onChange={v => set('industry_subtype', v)} placeholder="e.g. craft beer, Vietnamese restaurant" />
      <Field label="Street address" value={form.address} onChange={v => set('address', v)} placeholder="123 Example St" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="City / Suburb" value={form.city} onChange={v => set('city', v)} placeholder="Sydney" />
        <Sel label="State" value={form.business_state} onChange={v => set('business_state', v)} options={AU_STATES} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Postcode" value={form.postcode} onChange={v => set('postcode', v)} placeholder="2000" />
        <Field label="Year established" value={form.year_established} onChange={v => set('year_established', v)} placeholder="2018" />
      </div>
    </div>
  );
}

function Operations({ form, set }: { form: FD; set: Setter }) {
  const [preview, setPreview] = useState<SitePreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  async function startPreview() {
    const url = form.website.trim();
    if (!url) return;
    setPreviewing(true); setPreview(null); setConfirmed(false);
    try {
      const res = await fetch('/api/site-preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
      });
      setPreview((await res.json()) as SitePreviewResult);
    } catch { /* leave preview null — field still saves */ }
    setPreviewing(false);
  }

  return (
    <div className="space-y-4">
      <Sel label="Staff count" value={form.staff_count} onChange={v => set('staff_count', v)} options={STAFF_OPTS} />
      <Sel label="Monthly revenue (approx.)" value={form.monthly_revenue} onChange={v => set('monthly_revenue', v)} options={REV_OPTS} />
      <div>
        <label className="block text-xs font-medium text-[#2D5240] mb-1">Website</label>
        <div className="flex gap-2">
          <input type="url" value={form.website} onChange={e => { set('website', e.target.value); setPreview(null); setConfirmed(false); }}
            placeholder="https://yourbusiness.com.au"
            className="flex-1 border border-[rgba(45,82,64,0.2)] rounded-lg px-3 py-3 text-sm text-[#1a1a16] placeholder-[rgba(0,0,0,0.3)] focus:outline-none focus:border-[#2D5240] focus:ring-1 focus:ring-[rgba(45,82,64,0.3)]" />
          <button type="button" onClick={startPreview} disabled={previewing || !form.website.trim()}
            className="px-4 rounded-lg bg-[#2D5240] text-white text-sm font-medium whitespace-nowrap disabled:opacity-50">
            {previewing ? 'Checking…' : confirmed ? 'Confirmed ✓' : 'Preview'}
          </button>
        </div>
        {confirmed && <p className="text-xs text-[#2D5240] mt-1.5 font-medium">✓ Website confirmed</p>}
        {preview && (
          <div className="mt-3">
            <SitePreviewCard
              result={preview}
              onConfirm={() => { if (preview.ok) set('website', preview.finalUrl); setConfirmed(true); setPreview(null); }}
              onReject={() => setPreview(null)}
            />
          </div>
        )}
      </div>
      <Field label="Google Business URL" value={form.google_business_url} onChange={v => set('google_business_url', v)} type="url" placeholder="https://g.page/..." />
    </div>
  );
}

function Goals({ form, set }: { form: FD; set: Setter }) {
  function toggle(c: string) {
    const next = form.biggest_challenge.includes(c)
      ? form.biggest_challenge.filter(x => x !== c)
      : [...form.biggest_challenge, c];
    set('biggest_challenge', next);
  }
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-[#2D5240] mb-2">What are your biggest challenges? (select all that apply)</label>
        <div className="flex flex-wrap gap-2">
          {CHALLENGES.map(c => (
            <button key={c} type="button" onClick={() => toggle(c)}
              className={"px-3 py-2.5 min-h-[40px] rounded-full text-sm border transition-colors " + (form.biggest_challenge.includes(c) ? 'bg-[#2D5240] text-white border-[#2D5240]' : 'bg-white text-[#2D5240] border-[rgba(45,82,64,0.3)] hover:border-[#2D5240]')}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-[#2D5240] mb-1">Anything else? (optional)</label>
        <textarea value={form.goals_notes} onChange={e => set('goals_notes', e.target.value)} rows={3}
          placeholder="Tell us more about your goals or challenges…"
          className="w-full border border-[rgba(45,82,64,0.2)] rounded-lg px-3 py-3 text-sm text-[#1a1a16] placeholder-[rgba(0,0,0,0.3)] focus:outline-none focus:border-[#2D5240] focus:ring-1 focus:ring-[rgba(45,82,64,0.3)] resize-none" />
      </div>
    </div>
  );
}
