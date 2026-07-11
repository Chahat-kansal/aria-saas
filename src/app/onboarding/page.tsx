'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { SitePreviewCard } from '@/components/SitePreviewCard';
import type { SitePreviewResult } from '@/app/api/site-preview/route';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import Papa from 'papaparse';
import { getFeatureSetForBusiness } from '@/lib/industry-features';
import { Tag, MessageSquareText, ShieldCheck, PackageSearch, ShoppingBag, CalendarCheck, Boxes, type LucideIcon } from 'lucide-react';

// ONBOARD-WIZARD-1 — rebuilt as a clean 4-step wizard matching
// public/_refs/onboarding-welcome.png + onboarding-features.png: the same
// cream/lime/ink "Locked Pipel" design system already used across the CX
// customer app (Cormorant + Outfit, #d9f54e lime, #0a0a0a ink) — see
// src/app/loyalty/wallet/page.tsx for the same token set — not the
// dashboard's forest-green system. Every field the old 7-step wizard
// collected (identity/abn/details/operations/features/products/goals) is
// still collected here (RULE0) — just regrouped into 4 visual steps, with
// the always-optional ones (owner contact, staff/revenue, website, goals)
// folded into a collapsible "more details" panel on step 2 instead of
// their own separate screens.
const INK = '#0a0a0a', CREAM = '#fafafa', SURFACE = '#ffffff', INK_SOFT = '#888888', LIME = '#d9f54e';
const BORDER = `1.5px solid ${INK}`;
const FONT_BODY = "var(--font-body, 'Outfit', system-ui, sans-serif)";
const FONT_DISPLAY = "var(--font-display, 'Cormorant', Georgia, serif)";

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

const VISUAL_STEPS = ['welcome', 'details', 'features', 'products'] as const;
type VisualStep = typeof VISUAL_STEPS[number];
type Setter = (k: keyof FD, v: FD[keyof FD]) => void;

const ENTITY_TYPES = ['Sole Trader', 'Partnership', 'Company (Pty Ltd)', 'Trust', 'Other'];
const INDUSTRIES = ['liquor', 'cafe', 'convenience', 'bakery', 'restaurant', 'retail', 'warehouse', 'other'];
const SERVICE_INDUSTRIES = ['swim school', 'childcare / kindergarten', 'clinic / allied health', 'tutoring', 'fitness / studio', 'services other'];
const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];
const STAFF_OPTS = ['Just me', '2–5', '6–15', '16–50', '51+'];
const REV_OPTS = ['Under $10k', '$10k–$25k', '$25k–$50k', '$50k–$100k', '$100k–$250k', '$250k+'];
const CHALLENGES = ['cash flow', 'staffing', 'marketing', 'stock', 'compliance', 'time', 'winning customers back', 'knowing my numbers'];

// Human, warm labels for the "Let's set up your X" / "what I've set up for
// a X" headlines — matches the reference copy ("a bottle shop") exactly
// for liquor rather than the raw industry key.
const INDUSTRY_LABELS: Record<string, string> = {
  liquor: 'bottle shop', cafe: 'café', convenience: 'convenience store', bakery: 'bakery',
  restaurant: 'restaurant', retail: 'retail shop', warehouse: 'warehouse', other: 'business',
  'swim school': 'swim school', 'childcare / kindergarten': 'childcare centre',
  'clinic / allied health': 'clinic', 'tutoring': 'tutoring business',
  'fitness / studio': 'studio', 'services other': 'business',
};
function industryLabel(industry: string): string { return INDUSTRY_LABELS[industry] || 'business'; }
function articleFor(word: string): string { return /^[aeiou]/i.test(word) ? 'an' : 'a'; }

const FEATURE_ICONS: Record<string, LucideIcon> = {
  loyalty: Tag, reviews: MessageSquareText, compliance: ShieldCheck,
  reorder: PackageSearch, ordering: ShoppingBag, bookings: CalendarCheck, wholesale: Boxes,
};

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

interface AbnDup { duplicate: boolean; owned_by_me?: boolean; business_id?: string | null; business_name?: string | null }

function canAdvance(step: VisualStep, f: FD, abnDup: AbnDup | null): boolean {
  if (step === 'details') {
    if (f.legal_name.trim().length === 0 || f.owner_name.trim().length === 0) return false;
    if (f.business_model.length === 0 || f.industry.length === 0) return false;
    if (abnDup?.duplicate && !abnDup.owned_by_me) return false; // someone else already owns this ABN
    return true;
  }
  // Products — this is the seed data Aria derives categories/outlet/tax/
  // loyalty from, so product/POS businesses need at least 1 (manual/CSV/
  // photo — any source). Service businesses skip products entirely.
  if (step === 'products') return f.business_model === 'service' || f.products.length > 0;
  // welcome (nothing to fill in) and features (sensible defaults pre-ticked) are always advanceable.
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
  const [abnDup, setAbnDup] = useState<AbnDup | null>(null);
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
        // Defensive: an in-progress user from the OLD 7-step wizard's step
        // keys (identity/abn/operations/goals etc.) won't match VISUAL_STEPS
        // — fall back to step 0 rather than crashing; their saved step_data
        // still loads below either way.
        const i = VISUAL_STEPS.indexOf(onb.current_step as VisualStep);
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

  async function saveStep(nextStep: string) {
    const res = await fetch('/api/onboarding/step', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: VISUAL_STEPS[idx], next_step: nextStep, form }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to save');
  }

  async function goNext() {
    setSaving(true); setErr('');
    try {
      const isLast = idx === VISUAL_STEPS.length - 1;
      await saveStep(isLast ? 'provisioning' : VISUAL_STEPS[idx + 1]);
      if (!isLast) { setIdx(idx + 1); setSaving(false); return; }

      const subRes = await fetch('/api/onboarding/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form, abn_valid: abnState === 'valid' }),
      });
      const subJson = await subRes.json();
      setSaving(false);
      if (!subRes.ok) { setErr(subJson.error || 'Submit failed'); return; }
      router.push(subJson.route === 'provisioning' ? '/onboarding/provisioning' : '/onboarding/review');
    } catch (e) {
      setErr((e as Error).message || 'Something went wrong'); setSaving(false);
    }
  }

  // "I'll do this later" — the escape hatch present on every step. Saves
  // whatever's been entered so far (even nothing at all — /api/onboarding/
  // step already falls back to a default business name) and drops the
  // owner into their dashboard; dashboard/layout.tsx never gates on
  // onboarding_complete, so this is always a safe landing spot, and
  // resuming /onboarding later picks up exactly where they left off.
  async function skipForNow() {
    setSaving(true); setErr('');
    try {
      await saveStep(VISUAL_STEPS[idx]);
      router.push('/dashboard');
    } catch (e) {
      setErr((e as Error).message || 'Something went wrong'); setSaving(false);
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: CREAM, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: 999, border: `2px solid ${INK}`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
      <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
    </div>
  );

  const step = VISUAL_STEPS[idx];

  return (
    <div style={{ minHeight: '100vh', background: CREAM, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 20px 32px', fontFamily: FONT_BODY }}>
      <style>{`
        @keyframes onboardStepIn{0%{opacity:0;transform:translateY(14px) scale(.985)}60%{opacity:1;transform:translateY(-2px) scale(1.005)}100%{transform:translateY(0) scale(1)}}
        .onboard-step-in{animation:onboardStepIn .5s cubic-bezier(.22,1,.36,1) both}
        @media (prefers-reduced-motion: reduce){.onboard-step-in{animation:none!important}}
        .onboard-input:focus{border-color:${INK} !important;box-shadow:0 0 0 3px rgba(217,245,78,0.35)}
      `}</style>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 600, color: INK, marginBottom: step === 'welcome' ? 32 : 16 }}>aria</div>
        {step !== 'welcome' && <ProgressBar current={idx} total={VISUAL_STEPS.length} />}

        <div key={idx} className="onboard-step-in" style={{ marginTop: step === 'welcome' ? 0 : 24 }}>
          {err && (
            <div style={{ marginBottom: 16, padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, fontSize: 13, color: '#b91c1c' }}>
              {err}
            </div>
          )}

          {step === 'welcome' && (
            <WelcomeScreen
              industryLabel={form.industry ? industryLabel(form.industry) : 'business'}
              saving={saving}
              onStart={() => setIdx(1)}
              onSkip={skipForNow}
            />
          )}

          {step === 'details' && (
            <DetailsScreen
              form={form} set={set} abnState={abnState} abnDup={abnDup} switchingBiz={switchingBiz}
              onGoToExisting={goToExistingBusiness}
              onABNBlur={() => {
                const s = form.abn.replace(/\s/g, '');
                const valid = s.length === 0 ? 'empty' : validateABN(form.abn) ? 'valid' : 'invalid';
                setAbnState(valid);
                if (valid === 'valid') checkAbnDuplicate(); else setAbnDup(null);
              }}
            />
          )}

          {step === 'features' && <FeaturesScreen form={form} set={set} />}
          {step === 'products' && <ProductsScreen form={form} set={set} />}

          {step !== 'welcome' && (
            <div style={{ marginTop: 28 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                {idx > 1 && (
                  <button onClick={() => setIdx(idx - 1)} disabled={saving}
                    style={{ flex: '0 0 auto', padding: '14px 20px', borderRadius: 999, border: BORDER, background: SURFACE, color: INK, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_BODY, opacity: saving ? 0.5 : 1 }}>
                    Back
                  </button>
                )}
                {(() => {
                  const blocked = saving || !canAdvance(step, form, abnDup);
                  return (
                    <button onClick={goNext} disabled={blocked}
                      style={{ flex: 1, padding: '14px 20px', borderRadius: 999, border: 'none', background: LIME, color: INK, fontSize: 15, fontWeight: 700, cursor: blocked ? 'not-allowed' : 'pointer', fontFamily: FONT_BODY, opacity: blocked ? 0.5 : 1 }}>
                      {saving ? 'Saving…' : idx === VISUAL_STEPS.length - 1 ? 'Finish setup' : 'Continue'}
                    </button>
                  );
                })()}
              </div>
              <button onClick={skipForNow} disabled={saving}
                style={{ display: 'block', margin: '16px auto 0', background: 'none', border: 'none', color: INK_SOFT, fontSize: 13, cursor: 'pointer', fontFamily: FONT_BODY }}>
                I&apos;ll do this later
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{
          width: 8, height: 8, borderRadius: 999,
          background: i === current ? LIME : 'transparent',
          border: i === current ? 'none' : `1.5px solid rgba(10,10,10,0.25)`,
        }} />
      ))}
    </div>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.min(100, Math.round((current / total) * 100));
  return (
    <div style={{ height: 6, borderRadius: 999, background: 'rgba(10,10,10,0.1)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: pct + '%', background: LIME, borderRadius: 999, transition: 'width .3s ease' }} />
    </div>
  );
}

function WelcomeScreen({ industryLabel, saving, onStart, onSkip }: {
  industryLabel: string; saving: boolean; onStart: () => void; onSkip: () => void;
}) {
  return (
    <div style={{ textAlign: 'center' }}>
      <h1 style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 38, lineHeight: 1.15, color: INK, margin: '8px 0 16px', fontWeight: 500 }}>
        Let&apos;s set up your {industryLabel}
      </h1>
      <p style={{ color: INK_SOFT, fontSize: 15, lineHeight: 1.5, margin: '0 0 32px' }}>
        Your customer app, loyalty, and AI co-owner — live in 5 minutes
      </p>
      <ProgressDots total={VISUAL_STEPS.length} current={0} />
      <button onClick={onStart} disabled={saving}
        style={{ display: 'block', width: '100%', marginTop: 32, padding: '16px', borderRadius: 999, border: 'none', background: LIME, color: INK, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_BODY }}>
        Get started →
      </button>
      <button onClick={onSkip} disabled={saving}
        style={{ display: 'block', margin: '16px auto 0', background: 'none', border: 'none', color: INK_SOFT, fontSize: 13, cursor: 'pointer', fontFamily: FONT_BODY }}>
        I&apos;ll do this later
      </button>
    </div>
  );
}

function ScreenHeading({ children }: { children: React.ReactNode }) {
  return (
    <h1 style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 30, lineHeight: 1.2, color: INK, margin: '0 0 20px', fontWeight: 500 }}>
      {children}
    </h1>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: INK_SOFT, margin: '0 0 8px' }}>
      {children}
    </p>
  );
}

function TextField({ label, value, onChange, type = 'text', placeholder, required }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; required?: boolean;
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: INK, marginBottom: 6 }}>{label}{required && ' *'}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="onboard-input"
        style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid rgba(10,10,10,0.15)', background: SURFACE, color: INK, fontSize: 14, fontFamily: FONT_BODY, outline: 'none', boxSizing: 'border-box' }} />
    </div>
  );
}

function SelectField({ label, value, onChange, options, placeholder, required }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; placeholder?: string; required?: boolean;
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: INK, marginBottom: 6 }}>{label}{required && ' *'}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="onboard-input"
        style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid rgba(10,10,10,0.15)', background: SURFACE, color: INK, fontSize: 14, fontFamily: FONT_BODY, outline: 'none', boxSizing: 'border-box' }}>
        <option value="">{placeholder || 'Select…'}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function DetailsScreen({ form, set, abnState, abnDup, switchingBiz, onGoToExisting, onABNBlur }: {
  form: FD; set: Setter; abnState: 'valid' | 'invalid' | 'empty';
  abnDup: AbnDup | null; switchingBiz: boolean; onGoToExisting: () => void; onABNBlur: () => void;
}) {
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ entity_name?: string; gst_registered?: boolean; active?: boolean } | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyUnavailable, setVerifyUnavailable] = useState(false);
  const [manualAddress, setManualAddress] = useState(!!form.address && !form.lat);
  const [showMore, setShowMore] = useState(false);
  const [preview, setPreview] = useState<SitePreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const industryOptions = form.business_model === 'service' ? SERVICE_INDUSTRIES : INDUSTRIES;

  async function verifyABN() {
    const clean = form.abn.replace(/\D/g, '');
    if (clean.length !== 11) return;
    setVerifying(true); setVerifyError(null); setVerifyResult(null); setVerifyUnavailable(false);
    try {
      const res = await fetch('/api/abn-lookup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ abn: clean }),
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

  function toggleChallenge(c: string) {
    const next = form.biggest_challenge.includes(c)
      ? form.biggest_challenge.filter(x => x !== c)
      : [...form.biggest_challenge, c];
    set('biggest_challenge', next);
  }

  const canVerify = form.abn.replace(/\D/g, '').length === 11;

  return (
    <div>
      <ScreenHeading>Tell us about your business</ScreenHeading>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <SectionLabel>Business</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <TextField label="Business name" required value={form.trading_name || form.legal_name}
              onChange={v => { set('trading_name', v); set('legal_name', v); }} placeholder="e.g. Global Liquor" />
            <TextField label="Your name" required value={form.owner_name} onChange={v => set('owner_name', v)} placeholder="Owner / manager" />

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: INK, marginBottom: 6 }}>Does your business sell products, or provide services and classes? *</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {(['product', 'service'] as const).map(m => (
                  <button key={m} type="button" onClick={() => { set('business_model', m); set('industry', ''); }}
                    style={{
                      padding: '12px', borderRadius: 12, textAlign: 'left', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_BODY,
                      border: form.business_model === m ? BORDER : '1.5px solid rgba(10,10,10,0.15)',
                      background: form.business_model === m ? LIME : SURFACE, color: INK,
                    }}>
                    {m === 'product' ? 'We sell products' : 'We provide services / classes'}
                  </button>
                ))}
              </div>
            </div>

            {form.business_model && (
              <SelectField label="Industry" required value={form.industry} onChange={v => set('industry', v)} options={industryOptions} />
            )}
          </div>
        </div>

        <div>
          <SectionLabel>ABN (optional)</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="text" value={form.abn} onChange={e => set('abn', e.target.value)} onBlur={onABNBlur}
                  placeholder="XX XXX XXX XXX" className="onboard-input"
                  style={{ flex: 1, padding: '12px 14px', borderRadius: 12, border: '1.5px solid rgba(10,10,10,0.15)', background: SURFACE, color: INK, fontSize: 14, fontFamily: FONT_BODY, outline: 'none' }} />
                <button type="button" onClick={verifyABN} disabled={!canVerify || verifying}
                  style={{ padding: '0 16px', borderRadius: 12, border: BORDER, background: SURFACE, color: INK, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: FONT_BODY, opacity: (!canVerify || verifying) ? 0.4 : 1 }}>
                  {verifying ? 'Checking…' : 'Verify'}
                </button>
              </div>
              {abnState === 'valid' && !verifyResult && <p style={{ fontSize: 12, color: '#16a34a', marginTop: 6 }}>✓ Valid ABN format</p>}
              {abnState === 'invalid' && <p style={{ fontSize: 12, color: '#b45309', marginTop: 6 }}>⚠ Invalid ABN format</p>}
              {verifyUnavailable && <p style={{ fontSize: 12, color: INK_SOFT, marginTop: 6 }}>ABN verification isn&apos;t available right now — no problem, just continue and add it later.</p>}
              {!verifyUnavailable && verifyError && <p style={{ fontSize: 12, color: '#b45309', marginTop: 6 }}>⚠ {verifyError}</p>}
              {verifyResult && (
                <div style={{ marginTop: 8, padding: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#15803d', margin: '0 0 2px' }}>✓ Verified with Australian Business Register</p>
                  {verifyResult.entity_name && <p style={{ fontSize: 12, color: '#16a34a', margin: 0 }}>Registered name: <strong>{verifyResult.entity_name}</strong></p>}
                </div>
              )}
              {abnDup?.duplicate && abnDup.owned_by_me && (
                <div style={{ marginTop: 8, padding: 10, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#92400e', margin: '0 0 8px' }}>You already have {abnDup.business_name ?? 'a business'} set up on this ABN.</p>
                  <button type="button" onClick={onGoToExisting} disabled={switchingBiz}
                    style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 8, border: 'none', background: INK, color: SURFACE, cursor: 'pointer', opacity: switchingBiz ? 0.5 : 1 }}>
                    {switchingBiz ? 'Switching…' : 'Go to that business'}
                  </button>
                </div>
              )}
              {abnDup?.duplicate && !abnDup.owned_by_me && (
                <div style={{ marginTop: 8, padding: 10, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10 }}>
                  <p style={{ fontSize: 12, color: '#92400e', margin: 0 }}>This ABN is already registered with Aria. If this is your business, contact support to request access.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          <SectionLabel>Business address</SectionLabel>
          {manualAddress ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <TextField label="Street address" value={form.address} onChange={v => set('address', v)} placeholder="123 Example St" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <TextField label="City / Suburb" value={form.city} onChange={v => set('city', v)} placeholder="Sydney" />
                <SelectField label="State" value={form.business_state} onChange={v => set('business_state', v)} options={AU_STATES} />
              </div>
              <TextField label="Postcode" value={form.postcode} onChange={v => set('postcode', v)} placeholder="2000" />
              <button type="button" onClick={() => setManualAddress(false)} style={{ fontSize: 12, color: INK, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', alignSelf: 'flex-start', fontFamily: FONT_BODY }}>
                Use address lookup instead
              </button>
            </div>
          ) : (
            <AddressAutocomplete
              initialValue={form.formatted_address || form.address}
              placeholder="Start typing your street address…"
              onManualEntry={() => setManualAddress(true)}
              onSelect={a => {
                set('address', a.address_line1); set('city', a.suburb); set('business_state', a.state); set('postcode', a.postcode);
                set('lat', a.lat !== null ? String(a.lat) : ''); set('lng', a.lng !== null ? String(a.lng) : '');
                set('place_id', a.place_id ?? ''); set('formatted_address', a.formatted);
              }}
            />
          )}
        </div>

        <div>
          <button type="button" onClick={() => setShowMore(s => !s)}
            style={{ fontSize: 12, fontWeight: 700, color: INK, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: FONT_BODY }}>
            {showMore ? '− Hide extra details' : '+ Add more details (optional)'}
          </button>
          {showMore && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <TextField label="Email" type="email" value={form.email} onChange={v => set('email', v)} placeholder="you@example.com" />
                <TextField label="Phone" type="tel" value={form.phone} onChange={v => set('phone', v)} placeholder="04XX XXX XXX" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <SelectField label="Entity type" value={form.entity_type} onChange={v => set('entity_type', v)} options={ENTITY_TYPES} />
                <TextField label="ACN" value={form.acn} onChange={v => set('acn', v)} placeholder="XXX XXX XXX" />
              </div>
              <TextField label="Industry subtype" value={form.industry_subtype} onChange={v => set('industry_subtype', v)} placeholder="e.g. craft beer, Vietnamese restaurant" />
              <TextField label="Year established" value={form.year_established} onChange={v => set('year_established', v)} placeholder="2018" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <SelectField label="Staff count" value={form.staff_count} onChange={v => set('staff_count', v)} options={STAFF_OPTS} />
                <SelectField label="Monthly revenue (approx.)" value={form.monthly_revenue} onChange={v => set('monthly_revenue', v)} options={REV_OPTS} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: INK, marginBottom: 6 }}>Website</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="url" value={form.website} onChange={e => { set('website', e.target.value); setPreview(null); setConfirmed(false); }}
                    placeholder="https://yourbusiness.com.au" className="onboard-input"
                    style={{ flex: 1, padding: '12px 14px', borderRadius: 12, border: '1.5px solid rgba(10,10,10,0.15)', background: SURFACE, color: INK, fontSize: 14, fontFamily: FONT_BODY, outline: 'none' }} />
                  <button type="button" onClick={startPreview} disabled={previewing || !form.website.trim()}
                    style={{ padding: '0 14px', borderRadius: 12, border: 'none', background: INK, color: SURFACE, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', opacity: (previewing || !form.website.trim()) ? 0.4 : 1 }}>
                    {previewing ? 'Checking…' : confirmed ? 'Confirmed ✓' : 'Preview'}
                  </button>
                </div>
                {preview && (
                  <div style={{ marginTop: 10 }}>
                    <SitePreviewCard result={preview}
                      onConfirm={() => { if (preview.ok) set('website', preview.finalUrl); setConfirmed(true); setPreview(null); }}
                      onReject={() => setPreview(null)} />
                  </div>
                )}
              </div>
              <TextField label="Google Business URL" type="url" value={form.google_business_url} onChange={v => set('google_business_url', v)} placeholder="https://g.page/..." />
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: INK, marginBottom: 6 }}>Weekly revenue target</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: INK_SOFT, pointerEvents: 'none' }}>$</span>
                  <input type="number" min={0} max={9999999} step={50} inputMode="decimal" value={form.weekly_revenue_target}
                    onChange={e => set('weekly_revenue_target', e.target.value)} placeholder="e.g. 5000" className="onboard-input"
                    style={{ width: '100%', padding: '12px 14px 12px 26px', borderRadius: 12, border: '1.5px solid rgba(10,10,10,0.15)', background: SURFACE, color: INK, fontSize: 14, fontFamily: FONT_BODY, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: INK, marginBottom: 8 }}>Biggest challenges right now?</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {CHALLENGES.map(c => (
                    <button key={c} type="button" onClick={() => toggleChallenge(c)}
                      style={{
                        padding: '8px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_BODY,
                        border: form.biggest_challenge.includes(c) ? BORDER : '1.5px solid rgba(10,10,10,0.15)',
                        background: form.biggest_challenge.includes(c) ? LIME : SURFACE, color: INK,
                      }}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: INK, marginBottom: 6 }}>Anything else?</label>
                <textarea value={form.goals_notes} onChange={e => set('goals_notes', e.target.value)} rows={3}
                  placeholder="Tell us more about your goals or challenges…" className="onboard-input"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid rgba(10,10,10,0.15)', background: SURFACE, color: INK, fontSize: 14, fontFamily: FONT_BODY, outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// FEATURE-CONFIRM (matches onboarding-features.png) — real, functional
// toggles from getFeatureSetForBusiness (writes pos_loyalty_config /
// feature_flags via the shared applyFeatureChoices core), styled as white
// cards with icon badges + lime ON/OFF switches. The reference mockup's
// illustrative "Point of Sale / Inventory / Customer App" aren't real
// per-business toggles in this schema (POS/CX app are always-on for
// product businesses, not feature_flags) — showing the ACTUAL toggleable
// set here (loyalty/reviews/compliance/reorder/etc.) keeps every switch
// on this screen genuinely wired to something real (RULE0: no fake UI).
function FeaturesScreen({ form, set }: { form: FD; set: Setter }) {
  const featureSet = getFeatureSetForBusiness(form.industry, form.business_model);
  const label = industryLabel(form.industry);

  useEffect(() => {
    const seeded = featureSet.reduce<Record<string, boolean>>((acc, f) => {
      acc[f.key] = form.feature_choices[f.key] ?? f.defaultOn;
      return acc;
    }, {});
    const changed = featureSet.some(f => form.feature_choices[f.key] === undefined);
    if (changed) set('feature_choices', seeded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.industry, form.business_model]);

  return (
    <div>
      <ScreenHeading>Here&apos;s what I&apos;ve set up for {articleFor(label)} {label}</ScreenHeading>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {featureSet.map(f => {
          const on = form.feature_choices[f.key] ?? f.defaultOn;
          const Icon = FEATURE_ICONS[f.key] ?? Tag;
          return (
            <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, borderRadius: 18, background: SURFACE, boxShadow: '0 1px 3px rgba(10,10,10,0.08)' }}>
              <div style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 12, background: 'rgba(10,10,10,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={20} color={INK} strokeWidth={1.75} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: INK, margin: 0 }}>{f.label}</p>
                <p style={{ fontSize: 12, color: INK_SOFT, margin: '2px 0 0' }}>{f.description}</p>
              </div>
              <button type="button" onClick={() => set('feature_choices', { ...form.feature_choices, [f.key]: !on })} aria-pressed={on}
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 4px 4px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', background: on ? LIME : 'rgba(10,10,10,0.1)' }}>
                {on && <span style={{ fontSize: 11, fontWeight: 800, color: INK }}>ON</span>}
                <span style={{ width: 22, height: 22, borderRadius: 999, background: SURFACE, boxShadow: '0 1px 2px rgba(0,0,0,0.25)' }} />
              </button>
            </div>
          );
        })}
      </div>
      <p style={{ textAlign: 'center', fontSize: 12, color: INK_SOFT, margin: '18px 0 0' }}>You can change any of this later</p>
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

// PRODUCTS — this is the seed Aria derives everything downstream from
// (industry-aware categories, default outlet + register, AU tax codes,
// trading hours) with ZERO AI calls in provisioning (see
// src/app/api/onboarding/provision/route.ts — the synchronous Anthropic
// briefing call was replaced with a deterministic template specifically so
// provisioning can never be blocked by AI credit/availability issues).
function ProductsScreen({ form, set }: { form: FD; set: Setter }) {
  const products = form.products;
  const [csvError, setCsvError] = useState('');
  const [photoState, setPhotoState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [photoError, setPhotoError] = useState('');

  function updateProduct(i: number, field: 'name' | 'price' | 'category', value: string) {
    set('products', products.map((p, idx) => idx === i ? { ...p, [field]: value } : p));
  }
  function addProduct() { set('products', [...products, { name: '', price: '', category: '' }]); }
  function removeProduct(i: number) { set('products', products.filter((_, idx) => idx !== i)); }

  function handleCsvFile(file: File) {
    setCsvError('');
    Papa.parse<Record<string, string>>(file, {
      header: true, skipEmptyLines: true, transformHeader: h => h.trim(),
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
        if (rows.length === 0) { setCsvError('No valid rows found in that CSV.'); return; }
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
      set('products', [...products, ...items.map((it: { name: string; price: number; category: string }) => ({
        name: it.name, price: String(it.price ?? ''), category: it.category || '',
      }))]);
      setPhotoState('idle');
    } catch {
      setPhotoState('error');
      setPhotoError('Something went wrong reading that photo — add items manually instead.');
    }
  }

  if (form.business_model === 'service') {
    return (
      <div>
        <ScreenHeading>Almost there</ScreenHeading>
        <p style={{ fontSize: 13, color: INK_SOFT }}>Not applicable for service businesses — you can add bookable services any time from your dashboard.</p>
      </div>
    );
  }

  return (
    <div>
      <ScreenHeading>Add your first products</ScreenHeading>
      <p style={{ fontSize: 12.5, color: INK_SOFT, margin: '0 0 16px' }}>
        Add at least one — Aria uses it to set up your categories, POS, outlet, tax, and loyalty automatically. Zero AI calls, so this never gets stuck waiting on anything. Add a few now; add the rest anytime later.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px', borderRadius: 12, border: '1.5px solid rgba(10,10,10,0.15)', fontSize: 13, color: INK, fontWeight: 600, cursor: 'pointer', background: SURFACE }}>
          Import CSV
          <input type="file" accept=".csv,text/csv" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); e.target.value = ''; }} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px', borderRadius: 12, border: '1.5px solid rgba(10,10,10,0.15)', fontSize: 13, color: INK, fontWeight: 600, cursor: 'pointer', background: SURFACE }}>
          {photoState === 'loading' ? 'Reading photo…' : 'Import from photo'}
          <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} disabled={photoState === 'loading'}
            onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoFile(f); e.target.value = ''; }} />
        </label>
      </div>
      {csvError && <p style={{ fontSize: 12, color: '#b45309', margin: '0 0 10px' }}>{csvError}</p>}
      {photoState === 'error' && <p style={{ fontSize: 12, color: '#b45309', margin: '0 0 10px' }}>{photoError}</p>}

      {products.length === 0 && (
        <p style={{ fontSize: 12, color: INK_SOFT, margin: '0 0 12px' }}>No products yet — add one manually, or import a CSV / menu photo above.</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {products.map((p, i) => (
          <div key={i} style={{ padding: 14, borderRadius: 14, background: SURFACE, boxShadow: '0 1px 3px rgba(10,10,10,0.08)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>Product {i + 1}</span>
              <button type="button" onClick={() => removeProduct(i)} style={{ fontSize: 12, color: INK_SOFT, background: 'none', border: 'none', cursor: 'pointer' }}>Remove</button>
            </div>
            <TextField label="Name" value={p.name} onChange={v => updateProduct(i, 'name', v)} placeholder="e.g. Flat White" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <TextField label="Price ($)" type="number" value={p.price} onChange={v => updateProduct(i, 'price', v)} placeholder="5.50" />
              <TextField label="Category" value={p.category} onChange={v => updateProduct(i, 'category', v)} placeholder="e.g. Coffee" />
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={addProduct}
        style={{ width: '100%', marginTop: 10, padding: '12px', borderRadius: 12, border: '1.5px dashed rgba(10,10,10,0.25)', background: 'none', fontSize: 13, color: INK, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_BODY }}>
        + Add a product manually
      </button>
    </div>
  );
}
