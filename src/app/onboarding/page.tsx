'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { SitePreviewCard } from '@/components/SitePreviewCard';
import type { SitePreviewResult } from '@/app/api/site-preview/route';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import Papa from 'papaparse';
import { getFeatureSetForBusiness } from '@/lib/industry-features';

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

const STEPS = ['identity', 'abn', 'details', 'operations', 'features', 'products', 'goals'] as const;
type Step = typeof STEPS[number];
type Setter = (k: keyof FD, v: FD[keyof FD]) => void;

const ENTITY_TYPES = ['Sole Trader', 'Partnership', 'Company (Pty Ltd)', 'Trust', 'Other'];
const INDUSTRIES = ['liquor', 'cafe', 'convenience', 'bakery', 'restaurant', 'retail', 'warehouse', 'other'];
const SERVICE_INDUSTRIES = ['swim school', 'childcare / kindergarten', 'clinic / allied health', 'tutoring', 'fitness / studio', 'services other'];
const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];
const STAFF_OPTS = ['Just me', '2–5', '6–15', '16–50', '51+'];
const REV_OPTS = ['Under $10k', '$10k–$25k', '$25k–$50k', '$50k–$100k', '$100k–$250k', '$250k+'];
const CHALLENGES = ['cash flow', 'staffing', 'marketing', 'stock', 'compliance', 'time', 'winning customers back', 'knowing my numbers'];

const HEADINGS = ['Tell us about yourself', 'Your ABN details', 'Business location & type', 'Operations', 'Confirm your features', 'Add your first products', 'Your goals'];
const SUBHEADINGS = [
  "We'll use this to personalise your Aria experience.",
  'Skip for now — add or verify your ABN in Settings at any time.',
  'Help us set up your industry-specific dashboard.',
  'Help us understand how your business runs.',
  "Aria's picked a sensible default for your industry — you can change any of this later.",
  'Optional — add a few to get your POS started, or skip and import/add them later.',
  'What challenges are you working to overcome?',
];

type FD = {
  legal_name: string; trading_name: string; owner_name: string; email: string; phone: string; entity_type: string;
  abn: string; acn: string; gst_registered: string;
  business_model: string;
  industry: string; industry_subtype: string; address: string; city: string;
  business_state: string; postcode: string; year_established: string;
  staff_count: string; monthly_revenue: string; website: string; google_business_url: string;
  biggest_challenge: string[]; goals_notes: string; weekly_revenue_target: string;
  products: { name: string; price: string; category: string }[];
  lat: string; lng: string; place_id: string; formatted_address: string;
  feature_choices: Record<string, boolean>;
};

const EMPTY: FD = {
  legal_name: '', trading_name: '', owner_name: '', email: '', phone: '', entity_type: '',
  abn: '', acn: '', gst_registered: '',
  business_model: '',
  industry: '', industry_subtype: '', address: '', city: '', business_state: '', postcode: '', year_established: '',
  staff_count: '', monthly_revenue: '', website: '', google_business_url: '',
  biggest_challenge: [], goals_notes: '', weekly_revenue_target: '',
  products: [],
  lat: '', lng: '', place_id: '', formatted_address: '',
  feature_choices: {},
};

function isStepValid(step: number, f: FD): boolean {
  if (step === 0) return f.legal_name.trim().length > 0 && f.owner_name.trim().length > 0;
  if (step === 2) return f.business_model.length > 0 && f.industry.length > 0;
  // Products step (5) — this is the seed data Aria derives categories, config
  // etc. from, so product businesses need at least 1 (manual/CSV/photo — any
  // source). Service businesses skip products entirely (not applicable).
  if (step === 5) return f.business_model === 'service' || f.products.length > 0;
  // Features step (4) is always skippable — sensible defaults are pre-ticked.
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
  // ABN-UNIQUE — recognize-existing check, independent of ABR verification
  // (which needs ABN_LOOKUP_GUID configured; this is a same-database check
  // that must work regardless).
  const [abnDup, setAbnDup] = useState<{ duplicate: boolean; owned_by_me?: boolean; business_id?: string | null; business_name?: string | null } | null>(null);
  const [switchingBiz, setSwitchingBiz] = useState(false);

  async function checkAbnDuplicate() {
    const clean = form.abn.replace(/\D/g, '');
    if (clean.length !== 11) { setAbnDup(null); return; }
    try {
      const res = await fetch('/api/onboarding/check-abn', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ abn: clean }),
      });
      if (res.ok) setAbnDup(await res.json());
    } catch { /* non-fatal — duplicate check just doesn't fire, DB constraint is the hard backstop */ }
  }

  async function goToExistingBusiness() {
    if (!abnDup?.business_id) return;
    setSwitchingBiz(true);
    await fetch('/api/businesses/switch', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: abnDup.business_id }),
    });
    router.push('/dashboard');
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      // AUTH-FIX BUG 2 — gate: unconfirmed email cannot enter onboarding. Google OAuth users
      // have email_confirmed_at set by the provider, so they pass straight through.
      if (!user.email_confirmed_at) { router.push(`/verify-email?email=${encodeURIComponent(user.email ?? '')}`); return; }

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
          products: Array.isArray(sd.products) ? sd.products : [],
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
          <ABN form={form} set={set} abnState={abnState} abnDup={abnDup} switchingBiz={switchingBiz}
            onGoToExisting={goToExistingBusiness}
            onABNBlur={() => {
              const s = form.abn.replace(/\s/g, '');
              const valid = s.length === 0 ? 'empty' : validateABN(form.abn) ? 'valid' : 'invalid';
              setAbnState(valid);
              if (valid === 'valid') checkAbnDuplicate(); else setAbnDup(null);
            }}
          />
        )}
        {idx === 2 && <Details form={form} set={set} />}
        {idx === 3 && <Operations form={form} set={set} />}
        {idx === 4 && <Features form={form} set={set} />}
        {idx === 5 && <Products form={form} set={set} />}
        {idx === 6 && <Goals form={form} set={set} />}
        <div className="flex gap-3 mt-6">
          {idx > 0 && (
            <button onClick={() => setIdx(idx - 1)} disabled={saving}
              className="flex-1 border border-[#2D5240] text-[#2D5240] py-3 rounded-full font-medium text-sm hover:bg-[#edf3ef] transition-colors disabled:opacity-50">
              Back
            </button>
          )}
          {(() => {
            const blocked = saving || !isStepValid(idx, form) || (idx === 1 && !!abnDup?.duplicate);
            return (
              <button onClick={goNext} disabled={blocked}
                className={"flex-1 py-3 rounded-full font-medium text-sm transition-colors text-white " + (blocked ? 'bg-[#2D5240] opacity-50 cursor-not-allowed' : 'bg-[#2D5240] hover:bg-[#1a3328]')}>
                {saving ? 'Saving…' : idx === STEPS.length - 1 ? 'Submit' : 'Continue'}
              </button>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

const TOTAL_PROGRESS_STEPS = STEPS.length + 1; // +1 for the provisioning step that follows submit

function ProgressBar({ current }: { current: number }) {
  return (
    <div className="flex flex-col items-center gap-2 mb-2">
      <p className="text-xs font-medium text-[#2D5240]">{'Step ' + current + ' of ' + TOTAL_PROGRESS_STEPS}</p>
      <div className="flex items-center gap-1">
        {Array.from({ length: TOTAL_PROGRESS_STEPS }, (_, i) => i + 1).map(s => (
          <div key={s} className="flex items-center gap-1">
            <div className={"w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium transition-colors " + (s < current ? 'bg-[#7FB897] text-white' : s === current ? 'bg-[#2D5240] text-white' : 'bg-[rgba(45,82,64,0.12)] text-[rgba(45,82,64,0.4)]')}>
              {s < current ? '✓' : s}
            </div>
            {s < TOTAL_PROGRESS_STEPS && <div className={"w-6 h-px " + (s < current ? 'bg-[#7FB897]' : 'bg-[rgba(45,82,64,0.15)]')} />}
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

interface AbnDup { duplicate: boolean; owned_by_me?: boolean; business_id?: string | null; business_name?: string | null }

function ABN({ form, set, abnState, abnDup, switchingBiz, onGoToExisting, onABNBlur }: {
  form: FD; set: Setter; abnState: 'valid' | 'invalid' | 'empty';
  abnDup: AbnDup | null; switchingBiz: boolean; onGoToExisting: () => void; onABNBlur: () => void;
}) {
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ entity_name?: string; gst_registered?: boolean; active?: boolean } | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyUnavailable, setVerifyUnavailable] = useState(false);

  async function verifyABN() {
    const clean = form.abn.replace(/\D/g, '');
    if (clean.length !== 11) return;
    setVerifying(true); setVerifyError(null); setVerifyResult(null); setVerifyUnavailable(false);
    try {
      const res = await fetch('/api/abn-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ abn: clean }),
      });
      const data = await res.json();
      if (!res.ok) { setVerifyUnavailable(true); return; }
      if (!data.found) {
        setVerifyError("This ABN wasn't found in the register — double-check the digits, or continue and add it later.");
        return;
      }
      setVerifyResult(data);
      if (data.gst_registered !== undefined) set('gst_registered', data.gst_registered ? 'yes' : 'no');
    } catch { setVerifyUnavailable(true); }
    finally { setVerifying(false); }
  }

  const canVerify = form.abn.replace(/\D/g, '').length === 11;

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-[#2D5240] mb-1">ABN (optional)</label>
        <div className="flex gap-2">
          <input type="text" value={form.abn} onChange={e => set('abn', e.target.value)} onBlur={onABNBlur}
            placeholder="XX XXX XXX XXX"
            className="flex-1 border border-[rgba(45,82,64,0.2)] rounded-lg px-3 py-3 text-sm text-[#1a1a16] placeholder-[rgba(0,0,0,0.3)] focus:outline-none focus:border-[#2D5240] focus:ring-1 focus:ring-[rgba(45,82,64,0.3)]" />
          <button type="button" onClick={verifyABN} disabled={!canVerify || verifying}
            className="px-3 py-3 rounded-lg border border-[#2D5240] text-[#2D5240] bg-white text-xs font-semibold disabled:opacity-40 whitespace-nowrap hover:bg-[#edf3ef] transition-colors">
            {verifying ? 'Checking…' : 'Verify ABN'}
          </button>
        </div>
        {abnState === 'valid' && !verifyResult && <p className="text-xs text-green-600 mt-1">✓ Valid ABN format</p>}
        {abnState === 'invalid' && <p className="text-xs text-amber-500 mt-1">⚠ Invalid ABN format</p>}
        {verifyUnavailable && (
          <p className="text-xs text-[rgba(0,0,0,0.45)] mt-1">ABN verification isn&apos;t available right now — no problem, just continue and add it later.</p>
        )}
        {!verifyUnavailable && verifyError && (
          <p className="text-xs text-amber-600 mt-1">⚠ {verifyError}</p>
        )}
        {verifyResult && (
          <div className="mt-2 p-2.5 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-xs font-semibold text-green-700 mb-0.5">✓ Verified with Australian Business Register</p>
            {verifyResult.entity_name && <p className="text-xs text-green-600">Registered name: <strong>{verifyResult.entity_name}</strong></p>}
            {verifyResult.gst_registered !== undefined && <p className="text-xs text-green-600">GST: {verifyResult.gst_registered ? '✓ Registered — prefilled below' : '✗ Not registered — prefilled below'}</p>}
          </div>
        )}
        {/* ABN-UNIQUE — recognize an existing business on this ABN before any row is finalized. */}
        {abnDup?.duplicate && abnDup.owned_by_me && (
          <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs font-semibold text-amber-800 mb-1.5">
              You already have {abnDup.business_name ?? 'a business'} set up on this ABN.
            </p>
            <button type="button" onClick={onGoToExisting} disabled={switchingBiz}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#2D5240] text-white disabled:opacity-50">
              {switchingBiz ? 'Switching…' : 'Go to that business'}
            </button>
          </div>
        )}
        {abnDup?.duplicate && !abnDup.owned_by_me && (
          <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-800">
              This ABN is already registered with Aria. If this is your business, contact support to request access.
            </p>
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
  // Manual mode when the owner opts out of autocomplete, or when editing an
  // already-saved address that didn't come from Geoapify (no lat/lng on file).
  const [manualAddress, setManualAddress] = useState(!!form.address && !form.lat);

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

      <div>
        <label className="block text-xs font-medium text-[#2D5240] mb-1">Business address</label>
        {manualAddress ? (
          <div className="space-y-3">
            <Field label="Street address" value={form.address} onChange={v => set('address', v)} placeholder="123 Example St" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="City / Suburb" value={form.city} onChange={v => set('city', v)} placeholder="Sydney" />
              <Sel label="State" value={form.business_state} onChange={v => set('business_state', v)} options={AU_STATES} />
            </div>
            <Field label="Postcode" value={form.postcode} onChange={v => set('postcode', v)} placeholder="2000" />
            <button type="button" onClick={() => setManualAddress(false)} className="text-xs text-[#2D5240] underline">
              Use address lookup instead
            </button>
          </div>
        ) : (
          <AddressAutocomplete
            initialValue={form.formatted_address || form.address}
            placeholder="Start typing your street address…"
            onManualEntry={() => setManualAddress(true)}
            onSelect={a => {
              set('address', a.address_line1);
              set('city', a.suburb);
              set('business_state', a.state);
              set('postcode', a.postcode);
              set('lat', a.lat !== null ? String(a.lat) : '');
              set('lng', a.lng !== null ? String(a.lng) : '');
              set('place_id', a.place_id ?? '');
              set('formatted_address', a.formatted);
            }}
          />
        )}
      </div>

      <Field label="Year established" value={form.year_established} onChange={v => set('year_established', v)} placeholder="2018" />
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

// Header aliases mirror /api/pos/products/import's HEADER_MAP (name/price/category only —
// onboarding just needs the seed, not the full product schema that endpoint handles).
const CSV_HEADER_MAP: Record<string, 'name' | 'price' | 'category'> = {
  'name': 'name', 'product name': 'name', 'item name': 'name', 'title': 'name', 'product': 'name',
  'price': 'price', 'rrp': 'price', 'sell price': 'price', 'selling price': 'price', 'retail price': 'price', 'unit price': 'price', 'sale price': 'price',
  'category': 'category', 'department': 'category', 'product type': 'category', 'type': 'category',
};

// ── Feature-set confirmation (ONBOARD-FIX-1) — Aria proposes a smart default
//    per industry; owner confirms/adjusts on one screen, not a 50-item form.
function Features({ form, set }: { form: FD; set: Setter }) {
  const featureSet = getFeatureSetForBusiness(form.industry, form.business_model);

  // Seed defaults into form.feature_choices the first time this step is seen
  // for this industry (industry is already known — this step runs after
  // Details). Re-seeds if the industry changes (owner went Back and changed it).
  useEffect(() => {
    const seeded = featureSet.reduce<Record<string, boolean>>((acc, f) => {
      acc[f.key] = form.feature_choices[f.key] ?? f.defaultOn;
      return acc;
    }, {});
    const changed = featureSet.some(f => form.feature_choices[f.key] === undefined);
    if (changed) set('feature_choices', seeded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.industry, form.business_model]);

  if (featureSet.length === 0) return null;

  return (
    <div className="space-y-3">
      {featureSet.map(f => {
        const on = form.feature_choices[f.key] ?? f.defaultOn;
        return (
          <div key={f.key} className="flex items-center justify-between gap-3 p-3 border border-[rgba(45,82,64,0.15)] rounded-xl">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#2D5240]">{f.label}</p>
              <p className="text-xs text-[rgba(0,0,0,0.45)] mt-0.5">{f.description}</p>
            </div>
            <button
              type="button"
              onClick={() => set('feature_choices', { ...form.feature_choices, [f.key]: !on })}
              aria-pressed={on}
              className="flex-shrink-0 relative rounded-full transition-colors"
              style={{ width: 44, height: 24, background: on ? '#2D5240' : 'rgba(0,0,0,0.15)' }}
            >
              <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all" style={{ left: on ? 22 : 2 }} />
            </button>
          </div>
        );
      })}
      <p className="text-xs text-[rgba(0,0,0,0.4)] pt-1">You can change any of this later in Settings.</p>
    </div>
  );
}

function Products({ form, set }: { form: FD; set: Setter }) {
  const products = form.products;
  const [csvError, setCsvError] = useState('');
  const [photoState, setPhotoState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [photoError, setPhotoError] = useState('');

  function updateProduct(i: number, field: 'name' | 'price' | 'category', value: string) {
    const next = products.map((p, idx) => idx === i ? { ...p, [field]: value } : p);
    set('products', next);
  }
  function addProduct() {
    set('products', [...products, { name: '', price: '', category: '' }]);
  }
  function removeProduct(i: number) {
    set('products', products.filter((_, idx) => idx !== i));
  }

  function handleCsvFile(file: File) {
    setCsvError('');
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h.trim(),
      complete: result => {
        const fields = result.meta.fields ?? [];
        const mapping: Record<string, 'name' | 'price' | 'category'> = {};
        for (const h of fields) {
          const mapped = CSV_HEADER_MAP[h.toLowerCase().trim()];
          if (mapped) mapping[h] = mapped;
        }
        if (!mapping || !Object.values(mapping).includes('name')) {
          setCsvError("Couldn't find a name/price column — check your CSV has headers like Name, Price, Category.");
          return;
        }
        const rows = result.data
          .map(row => {
            const item = { name: '', price: '', category: '' };
            for (const [rawHeader, rawValue] of Object.entries(row)) {
              const field = mapping[rawHeader];
              if (field) item[field] = String(rawValue ?? '').trim();
            }
            return item;
          })
          .filter(item => item.name.length > 0);
        if (rows.length === 0) {
          setCsvError('No valid rows found in that CSV.');
          return;
        }
        set('products', [...products, ...rows]);
      },
      error: () => setCsvError('Could not read that file — is it a valid CSV?'),
    });
  }

  async function handlePhotoFile(file: File) {
    setPhotoState('loading'); setPhotoError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/pos/menu-extract', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setPhotoState('error');
        setPhotoError(data.error || 'Could not read that photo — try a clearer, well-lit shot or add items manually.');
        return;
      }
      const items = Array.isArray(data.items) ? data.items : [];
      if (items.length === 0) {
        setPhotoState('error');
        setPhotoError("Couldn't find any items in that photo — try a clearer shot or add items manually.");
        return;
      }
      set('products', [
        ...products,
        ...items.map((it: { name: string; price: number; category: string }) => ({
          name: it.name, price: String(it.price ?? ''), category: it.category || '',
        })),
      ]);
      setPhotoState('idle');
    } catch {
      setPhotoState('error');
      setPhotoError('Something went wrong reading that photo — add items manually instead.');
    }
  }

  if (form.business_model === 'service') {
    return (
      <div className="text-sm text-[rgba(0,0,0,0.5)] py-4">
        Not applicable for service businesses — you can add bookable services any time from your dashboard.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-[rgba(0,0,0,0.4)]">
        Add at least one product — Aria uses this to set up your categories, POS, and dashboard. Add a few now; you can always add the rest later.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-[rgba(45,82,64,0.2)] text-sm text-[#2D5240] font-medium cursor-pointer hover:border-[#2D5240] transition-colors">
          Import CSV
          <input type="file" accept=".csv,text/csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); e.target.value = ''; }} />
        </label>
        <label className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-[rgba(45,82,64,0.2)] text-sm text-[#2D5240] font-medium cursor-pointer hover:border-[#2D5240] transition-colors">
          {photoState === 'loading' ? 'Reading photo…' : 'Import from photo'}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={photoState === 'loading'}
            onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoFile(f); e.target.value = ''; }} />
        </label>
      </div>
      {csvError && <p className="text-xs text-amber-600">{csvError}</p>}
      {photoState === 'error' && <p className="text-xs text-amber-600">{photoError}</p>}

      {products.length === 0 && (
        <p className="text-xs text-[rgba(0,0,0,0.4)]">No products yet — add one manually, or import a CSV / menu photo above.</p>
      )}
      {products.map((p, i) => (
        <div key={i} className="p-3 border border-[rgba(45,82,64,0.15)] rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#2D5240]">Product {i + 1}</span>
            <button type="button" onClick={() => removeProduct(i)} className="text-xs text-[rgba(0,0,0,0.4)] hover:text-red-600">Remove</button>
          </div>
          <Field label="Name" value={p.name} onChange={v => updateProduct(i, 'name', v)} placeholder="e.g. Flat White" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price ($)" value={p.price} onChange={v => updateProduct(i, 'price', v)} type="number" placeholder="5.50" />
            <Field label="Category" value={p.category} onChange={v => updateProduct(i, 'category', v)} placeholder="e.g. Coffee" />
          </div>
        </div>
      ))}
      <button type="button" onClick={addProduct}
        className="w-full py-2.5 rounded-lg border-2 border-dashed border-[rgba(45,82,64,0.3)] text-sm text-[#2D5240] font-medium hover:border-[#2D5240] transition-colors">
        + Add a product manually
      </button>
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
      {/* PP STEP 3 — first goal (ties to I2 weekly_revenue_target). Skippable. */}
      <div>
        <label className="block text-xs font-medium text-[#2D5240] mb-1">Weekly revenue target (optional)</label>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'rgba(0,0,0,0.35)', pointerEvents: 'none' }}>$</span>
          <input
            type="number" min={0} max={9999999} step={50} inputMode="decimal"
            value={form.weekly_revenue_target}
            onChange={e => set('weekly_revenue_target', e.target.value)}
            placeholder="e.g. 5000"
            className="w-full border border-[rgba(45,82,64,0.2)] rounded-lg pl-6 pr-3 py-3 text-sm text-[#1a1a16] placeholder-[rgba(0,0,0,0.3)] focus:outline-none focus:border-[#2D5240] focus:ring-1 focus:ring-[rgba(45,82,64,0.3)]" />
        </div>
        <p className="text-xs text-[rgba(0,0,0,0.4)] mt-1.5">Aria tracks your progress against this and flags when you&apos;re falling behind. You can set or change it later in Settings.</p>
      </div>
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
