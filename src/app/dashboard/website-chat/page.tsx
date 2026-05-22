'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

interface FAQ { q: string; a: string; }
interface OpeningHours { [day: string]: string; }

interface WidgetConfig {
  id?: string;
  enabled: boolean;
  api_key?: string;
  bot_name: string;
  primary_color: string;
  greeting: string;
  opening_hours: OpeningHours;
  services: string;
  faqs: FAQ[];
  guardrails: string;
  escalation_message: string;
  escalation_phone: string;
  escalation_email: string;
  show_talk_to_staff: boolean;
  allowed_domain?: string;
  // Assistant behaviour
  assistant_role: string;
  tone: string;
  answer_length: string;
  // Product visibility
  show_prices: boolean;
  stock_visibility: string;
  show_out_of_stock: boolean;
  // Policies
  delivery_policy: string;
  pickup_policy: string;
  returns_policy: string;
  age_restricted_policy: string;
  custom_rules: string;
  appointments_enabled: boolean;
  appointment_duration_mins: number;
  appointment_lead_days: number;
  appointment_services: string;
  notification_phone: string;
  notification_email: string;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const DEFAULT_CONFIG: WidgetConfig = {
  enabled: false,
  bot_name: 'Aria',
  primary_color: '#1D9E75',
  greeting: 'Hi! How can I help you today?',
  opening_hours: {},
  services: '',
  faqs: [],
  guardrails: '',
  escalation_message: 'Please contact us directly for more information.',
  escalation_phone: '',
  escalation_email: '',
  show_talk_to_staff: true,
  allowed_domain: '',
  assistant_role: 'sales',
  tone: 'friendly',
  answer_length: 'normal',
  show_prices: true,
  stock_visibility: 'in_out',
  show_out_of_stock: false,
  delivery_policy: '',
  pickup_policy: '',
  returns_policy: '',
  age_restricted_policy: '',
  custom_rules: '',
  appointments_enabled: false,
  appointment_duration_mins: 60,
  appointment_lead_days: 14,
  appointment_services: '',
  notification_phone: '',
  notification_email: '',
};

const inputCls = 'w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.08)] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[rgba(29,158,117,0.5)] transition-colors placeholder:text-[rgba(255,255,255,0.25)]';
const textareaCls = `${inputCls} resize-none`;

export default function WebsiteChatPage() {
  const { business } = useBusinessContext();
  const [config, setConfig] = useState<WidgetConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('setup');

  const load = useCallback(async () => {
    if (!business?.id) return;
    // Use maybeSingle() — 406 fix: returns null instead of error when no row exists
    const { data } = await supabase
      .from('widget_configs')
      .select('*')
      .eq('business_id', business.id)
      .maybeSingle();

    if (data) {
      setConfig({
        id: data.id,
        enabled: data.enabled ?? false,
        api_key: data.api_key,
        bot_name: data.bot_name ?? 'Aria',
        primary_color: data.primary_color ?? '#1D9E75',
        greeting: data.greeting ?? DEFAULT_CONFIG.greeting,
        opening_hours: (data.opening_hours as OpeningHours) ?? {},
        services: data.services ?? '',
        faqs: (data.faqs as FAQ[]) ?? [],
        guardrails: data.guardrails ?? '',
        escalation_message: data.escalation_message ?? DEFAULT_CONFIG.escalation_message,
        escalation_phone: data.escalation_phone ?? '',
        escalation_email: data.escalation_email ?? '',
        show_talk_to_staff: data.show_talk_to_staff ?? true,
        allowed_domain: data.allowed_domain ?? '',
        assistant_role: data.assistant_role ?? 'sales',
        tone: data.tone ?? 'friendly',
        answer_length: data.answer_length ?? 'normal',
        show_prices: data.show_prices ?? true,
        stock_visibility: data.stock_visibility ?? 'in_out',
        show_out_of_stock: data.show_out_of_stock ?? false,
        delivery_policy: data.delivery_policy ?? '',
        pickup_policy: data.pickup_policy ?? '',
        returns_policy: data.returns_policy ?? '',
        age_restricted_policy: data.age_restricted_policy ?? '',
        custom_rules: data.custom_rules ?? '',
        appointments_enabled: data.appointments_enabled ?? false,
        appointment_duration_mins: data.appointment_duration_mins ?? 60,
        appointment_lead_days: data.appointment_lead_days ?? 14,
        appointment_services: data.appointment_services ?? '',
        notification_phone: data.notification_phone ?? '',
        notification_email: data.notification_email ?? '',
      });
    }
    // If data is null (no config exists yet) DEFAULT_CONFIG is already set — no error
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!business?.id) return;
    setSaving(true);
    const payload = {
      business_id: business.id,
      enabled: config.enabled,
      bot_name: config.bot_name,
      primary_color: config.primary_color,
      greeting: config.greeting,
      opening_hours: config.opening_hours,
      services: config.services,
      faqs: config.faqs,
      guardrails: config.guardrails,
      escalation_message: config.escalation_message,
      escalation_phone: config.escalation_phone || null,
      escalation_email: config.escalation_email || null,
      show_talk_to_staff: config.show_talk_to_staff,
      allowed_domain: config.allowed_domain || null,
      assistant_role: config.assistant_role,
      tone: config.tone,
      answer_length: config.answer_length,
      show_prices: config.show_prices,
      stock_visibility: config.stock_visibility,
      show_out_of_stock: config.show_out_of_stock,
      delivery_policy: config.delivery_policy || null,
      pickup_policy: config.pickup_policy || null,
      returns_policy: config.returns_policy || null,
      age_restricted_policy: config.age_restricted_policy || null,
      custom_rules: config.custom_rules || null,
      updated_at: new Date().toISOString(),
    };

    await supabase
      .from('widget_configs')
      .upsert(payload, { onConflict: 'business_id' });

    await load();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function copyEmbed() {
    if (!config.api_key) return;
    const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://yourapp.com';
    const code = `<script src="${appUrl}/api/public/widget/embed/${config.api_key}" defer></script>`;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function addFaq() {
    setConfig(c => ({ ...c, faqs: [...c.faqs, { q: '', a: '' }] }));
  }
  function updateFaq(i: number, field: 'q' | 'a', val: string) {
    setConfig(c => { const faqs = [...c.faqs]; faqs[i] = { ...faqs[i], [field]: val }; return { ...c, faqs }; });
  }
  function removeFaq(i: number) {
    setConfig(c => ({ ...c, faqs: c.faqs.filter((_, idx) => idx !== i) }));
  }

  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';

  // Setup checklist items
  const checklist = [
    { label: 'Widget enabled', done: config.enabled },
    { label: 'Bot name set', done: !!config.bot_name },
    { label: 'Greeting message set', done: !!config.greeting },
    { label: 'Opening hours added', done: Object.values(config.opening_hours).some(v => v.trim()) },
    { label: 'FAQs added', done: config.faqs.length > 0 },
    { label: 'Escalation contact set', done: !!(config.escalation_phone || config.escalation_email) },
    { label: 'Allowed domain set', done: !!config.allowed_domain },
    { label: 'Embed code added to website', done: !!config.api_key && config.enabled },
  ];
  const checklistDone = checklist.filter(c => c.done).length;

  const SECTIONS = [
    { id: 'setup', label: 'Setup' },
    { id: 'behaviour', label: 'Behaviour' },
    { id: 'products', label: 'Products' },
    { id: 'handoff', label: 'Handoff' },
    { id: 'policies', label: 'Policies' },
    { id: 'security', label: 'Security' },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-[#0d0d14] min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-white mb-1">Website Chat Widget</h1>
            <p className="text-sm text-[rgba(255,255,255,0.4)]">
              Embed an AI assistant on your website. It uses real business data to answer customer questions.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/dashboard/website-chat/conversations"
              className="text-xs text-[rgba(255,255,255,0.4)] hover:text-white transition-colors border border-[rgba(255,255,255,0.1)] rounded-xl px-3 py-2">
              Conversations →
            </Link>
          </div>
        </div>

        {/* Enable toggle + embed code */}
        <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-2xl p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-semibold text-white">Widget enabled</div>
              <div className="text-xs text-[rgba(255,255,255,0.4)] mt-0.5">
                {config.enabled ? '● Live on your website' : '○ Widget is disabled'}
              </div>
            </div>
            <button
              onClick={() => setConfig(c => ({ ...c, enabled: !c.enabled }))}
              className={`relative flex-shrink-0 rounded-full transition-colors ${config.enabled ? 'bg-[#1D9E75]' : 'bg-[rgba(255,255,255,0.15)]'}`}
              style={{ height: '24px', width: '44px' }}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${config.enabled ? 'left-5' : 'left-0.5'}`} />
            </button>
          </div>
          {config.api_key ? (
            <div className="bg-[rgba(29,158,117,0.06)] border border-[rgba(29,158,117,0.2)] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[#1D9E75]">Embed code</span>
                <button onClick={copyEmbed}
                  className="text-[11px] font-medium px-3 py-1 rounded-lg bg-[#1D9E75] text-white hover:bg-[#179968] transition-colors">
                  {copied ? '✓ Copied!' : 'Copy code'}
                </button>
              </div>
              <code className="text-[11px] text-[rgba(255,255,255,0.5)] break-all block">
                {`<script src="${appUrl}/widget.js" data-key="${config.api_key}" defer></script>`}
              </code>
              <p className="text-[11px] text-[rgba(255,255,255,0.3)] mt-2">Paste before the &lt;/body&gt; tag on your website.</p>
            </div>
          ) : (
            <div className="text-xs text-[rgba(255,255,255,0.3)] bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-xl px-4 py-3">
              Save your config to generate the embed code.
            </div>
          )}
        </div>

        {/* Setup checklist */}
        <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-2xl p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Setup checklist</h3>
            <span className="text-xs text-[rgba(255,255,255,0.4)]">{checklistDone}/{checklist.length} done</span>
          </div>
          <div className="w-full bg-[rgba(255,255,255,0.06)] rounded-full h-1.5 mb-4">
            <div className="bg-[#1D9E75] h-1.5 rounded-full transition-all" style={{ width: String((checklistDone / checklist.length) * 100) + '%' }} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {checklist.map(item => (
              <div key={item.label} className="flex items-center gap-2">
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] flex-shrink-0 ${item.done ? 'bg-[#1D9E75] text-white' : 'bg-[rgba(255,255,255,0.07)] text-[rgba(255,255,255,0.3)]'}`}>
                  {item.done ? '✓' : '·'}
                </span>
                <span className={`text-[11px] ${item.done ? 'text-[rgba(255,255,255,0.6)]' : 'text-[rgba(255,255,255,0.3)]'}`}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Section nav */}
        <div className="flex gap-1 mb-5 overflow-x-auto pb-1">
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${activeSection === s.id ? 'bg-[#1D9E75] text-white' : 'text-[rgba(255,255,255,0.4)] hover:text-white bg-[rgba(255,255,255,0.05)]'}`}>
              {s.label}
            </button>
          ))}
        </div>

        {/* ── SETUP SECTION ── */}
        {activeSection === 'setup' && (
          <div className="space-y-4">
            <Panel title="Appearance">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Bot name">
                  <input value={config.bot_name} onChange={e => setConfig(c => ({ ...c, bot_name: e.target.value }))}
                    className={inputCls} placeholder="Aria" />
                </Field>
                <Field label="Primary colour">
                  <div className="flex items-center gap-2">
                    <input type="color" value={config.primary_color}
                      onChange={e => setConfig(c => ({ ...c, primary_color: e.target.value }))}
                      className="w-9 h-9 rounded-lg border-0 cursor-pointer bg-transparent" />
                    <input value={config.primary_color} onChange={e => setConfig(c => ({ ...c, primary_color: e.target.value }))}
                      className={`${inputCls} flex-1`} placeholder="#1D9E75" />
                  </div>
                </Field>
              </div>
              <Field label="Greeting message">
                <input value={config.greeting} onChange={e => setConfig(c => ({ ...c, greeting: e.target.value }))}
                  className={inputCls} placeholder="Hi! How can I help you today?" />
              </Field>
            </Panel>

            <Panel title="Opening hours">
              <div className="space-y-2">
                {DAYS.map(day => (
                  <div key={day} className="flex items-center gap-3">
                    <span className="text-xs text-[rgba(255,255,255,0.4)] w-24 flex-shrink-0">{day}</span>
                    <input value={config.opening_hours[day] ?? ''}
                      onChange={e => setConfig(c => ({ ...c, opening_hours: { ...c.opening_hours, [day]: e.target.value } }))}
                      className={`${inputCls} flex-1 text-xs`} placeholder="e.g. 9am – 5pm or Closed" />
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="FAQs">
              <div className="space-y-3">
                {config.faqs.map((faq, i) => (
                  <div key={i} className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] rounded-xl p-3">
                    <div className="flex items-start gap-2 mb-2">
                      <input value={faq.q} onChange={e => updateFaq(i, 'q', e.target.value)}
                        className={`${inputCls} flex-1 text-xs`} placeholder="Question…" />
                      <button onClick={() => removeFaq(i)} className="text-[rgba(255,255,255,0.25)] hover:text-red-400 transition-colors mt-2">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                    <textarea value={faq.a} onChange={e => updateFaq(i, 'a', e.target.value)}
                      rows={2} className={`${textareaCls} w-full text-xs`} placeholder="Answer…" />
                  </div>
                ))}
                <button onClick={addFaq} className="text-xs font-medium text-[#1D9E75] hover:text-white transition-colors flex items-center gap-1.5">
                  <span className="text-lg leading-none">+</span> Add FAQ
                </button>
              </div>
            </Panel>
          </div>
        )}

        {/* ── BEHAVIOUR SECTION ── */}
        {activeSection === 'behaviour' && (
          <div className="space-y-4">
            <Panel title="Assistant role">
              <p className="text-xs text-[rgba(255,255,255,0.4)] mb-3">How should the assistant primarily behave?</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'sales', label: 'Sales assistant', desc: 'Focuses on products, prices, and buying decisions' },
                  { value: 'support', label: 'Support assistant', desc: 'Helps with questions, issues, and service information' },
                  { value: 'product', label: 'Product assistant', desc: 'Expert on your specific product range and specs' },
                  { value: 'booking', label: 'Booking assistant', desc: 'Helps customers book appointments or services' },
                ].map(opt => (
                  <button key={opt.value} onClick={() => setConfig(c => ({ ...c, assistant_role: opt.value }))}
                    className={`text-left p-3 rounded-xl border transition-colors ${config.assistant_role === opt.value ? 'border-[#1D9E75] bg-[rgba(29,158,117,0.1)]' : 'border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.15)]'}`}>
                    <p className={`text-xs font-semibold mb-0.5 ${config.assistant_role === opt.value ? 'text-[#1D9E75]' : 'text-white'}`}>{opt.label}</p>
                    <p className="text-[10px] text-[rgba(255,255,255,0.35)]">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </Panel>

            <Panel title="Tone">
              <div className="grid grid-cols-4 gap-2">
                {['Friendly', 'Professional', 'Casual', 'Premium'].map(t => (
                  <button key={t} onClick={() => setConfig(c => ({ ...c, tone: t.toLowerCase() }))}
                    className={`py-2 rounded-xl text-xs font-medium transition-colors ${config.tone === t.toLowerCase() ? 'bg-[#1D9E75] text-white' : 'bg-[rgba(255,255,255,0.05)] text-[rgba(255,255,255,0.5)] hover:text-white border border-[rgba(255,255,255,0.08)]'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </Panel>

            <Panel title="Answer length">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'short', label: 'Short', desc: '1–2 sentences' },
                  { value: 'normal', label: 'Normal', desc: '2–4 sentences' },
                  { value: 'detailed', label: 'Detailed', desc: 'Full explanation' },
                ].map(opt => (
                  <button key={opt.value} onClick={() => setConfig(c => ({ ...c, answer_length: opt.value }))}
                    className={`p-3 rounded-xl border text-center transition-colors ${config.answer_length === opt.value ? 'border-[#1D9E75] bg-[rgba(29,158,117,0.1)]' : 'border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.15)]'}`}>
                    <p className={`text-xs font-semibold ${config.answer_length === opt.value ? 'text-[#1D9E75]' : 'text-white'}`}>{opt.label}</p>
                    <p className="text-[10px] text-[rgba(255,255,255,0.35)] mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </Panel>

            <Panel title="Services & top products">
              <textarea value={config.services} onChange={e => setConfig(c => ({ ...c, services: e.target.value }))}
                rows={3} className={`${textareaCls} w-full`}
                placeholder="e.g. Oat flat white ($5.50), Bacon roll ($8), House blend beans ($18/250g)…" />
              <p className="text-[11px] text-[rgba(255,255,255,0.3)] mt-1">
                Used for pricing and availability questions. Auto-populated from Aria POS when products are connected.
              </p>
            </Panel>
          </div>
        )}

        {/* ── PRODUCTS SECTION ── */}
        {activeSection === 'products' && (
          <div className="space-y-4">
            <Panel title="Product visibility">
              <Field label="Show prices to website visitors">
                <Toggle value={config.show_prices} onChange={v => setConfig(c => ({ ...c, show_prices: v }))} />
              </Field>
              <Field label="Stock visibility">
                <select value={config.stock_visibility} onChange={e => setConfig(c => ({ ...c, stock_visibility: e.target.value }))}
                  className={inputCls}>
                  <option value="exact" style={{ background: '#1a1a2e' }}>Exact stock numbers</option>
                  <option value="levels" style={{ background: '#1a1a2e' }}>Low / Medium / High</option>
                  <option value="in_out" style={{ background: '#1a1a2e' }}>In stock / Out of stock only</option>
                  <option value="hide" style={{ background: '#1a1a2e' }}>Hide stock info</option>
                </select>
              </Field>
              <Field label="Show out-of-stock products">
                <Toggle value={config.show_out_of_stock} onChange={v => setConfig(c => ({ ...c, show_out_of_stock: v }))}
                  description="If off, out-of-stock items won't be mentioned" />
              </Field>
            </Panel>
            <div className="bg-[rgba(29,158,117,0.06)] border border-[rgba(29,158,117,0.2)] rounded-xl p-4">
              <p className="text-xs font-semibold text-[#1D9E75] mb-1">Products connected from Aria POS</p>
              <p className="text-xs text-[rgba(255,255,255,0.5)]">
                The assistant automatically uses your live Aria POS product catalogue — prices, stock levels, and categories — to answer customer questions. No manual entry needed.
              </p>
              <Link href="/pos/products" className="text-xs text-[#1D9E75] hover:underline mt-2 inline-block">
                Manage products →
              </Link>
            </div>
          </div>
        )}

        {/* ── HANDOFF SECTION ── */}
        {activeSection === 'handoff' && (
          <div className="space-y-4">
            <Panel title="Human handoff">
              <p className="text-xs text-[rgba(255,255,255,0.4)] mb-3">
                Shown when the assistant can&apos;t help or the customer asks to speak to someone.
              </p>
              <Field label="Handoff message">
                <input value={config.escalation_message} onChange={e => setConfig(c => ({ ...c, escalation_message: e.target.value }))}
                  className={inputCls} placeholder="Please call us on 0400 000 000" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone number">
                  <input value={config.escalation_phone} onChange={e => setConfig(c => ({ ...c, escalation_phone: e.target.value }))}
                    className={inputCls} placeholder="0400 000 000" />
                </Field>
                <Field label="Email">
                  <input type="email" value={config.escalation_email} onChange={e => setConfig(c => ({ ...c, escalation_email: e.target.value }))}
                    className={inputCls} placeholder="hello@yourbusiness.com.au" />
                </Field>
              </div>
              <Field label="Show &quot;Talk to staff&quot; suggestion">
                <Toggle value={config.show_talk_to_staff} onChange={v => setConfig(c => ({ ...c, show_talk_to_staff: v }))}
                  description="Prompts visitor to contact staff when relevant" />
              </Field>
            </Panel>
            <Panel title="Guardrails">
              <Field label="Things the assistant should never say or do">
                <textarea value={config.guardrails} onChange={e => setConfig(c => ({ ...c, guardrails: e.target.value }))}
                  rows={3} className={`${textareaCls} w-full`}
                  placeholder="e.g. Never confirm stock without checking live inventory. Never promise delivery. Never discuss competitor products." />
              </Field>
            </Panel>
          </div>
        )}

        {/* ── POLICIES SECTION ── */}
        {activeSection === 'policies' && (
          <div className="space-y-4">
            <Panel title="Business policies">
              <p className="text-xs text-[rgba(255,255,255,0.4)] mb-3">
                The assistant uses these to answer policy questions. Leave blank if not applicable.
              </p>
              <Field label="Delivery policy">
                <textarea value={config.delivery_policy} onChange={e => setConfig(c => ({ ...c, delivery_policy: e.target.value }))}
                  rows={2} className={`${textareaCls} w-full`}
                  placeholder="e.g. We deliver within 5km, free over $50. Allow 1–2 business days." />
              </Field>
              <Field label="Click & collect / pickup policy">
                <textarea value={config.pickup_policy} onChange={e => setConfig(c => ({ ...c, pickup_policy: e.target.value }))}
                  rows={2} className={`${textareaCls} w-full`}
                  placeholder="e.g. Order online, collect same day from our Fitzroy store." />
              </Field>
              <Field label="Returns & refunds policy">
                <textarea value={config.returns_policy} onChange={e => setConfig(c => ({ ...c, returns_policy: e.target.value }))}
                  rows={2} className={`${textareaCls} w-full`}
                  placeholder="e.g. Change of mind returns within 7 days with receipt. No refunds on food." />
              </Field>
              <Field label="Age-restricted product policy">
                <textarea value={config.age_restricted_policy} onChange={e => setConfig(c => ({ ...c, age_restricted_policy: e.target.value }))}
                  rows={2} className={`${textareaCls} w-full`}
                  placeholder="e.g. Alcohol and tobacco are age-restricted. ID is required. We do not sell to anyone under 18." />
              </Field>
              <Field label="Custom rules">
                <textarea value={config.custom_rules} onChange={e => setConfig(c => ({ ...c, custom_rules: e.target.value }))}
                  rows={3} className={`${textareaCls} w-full`}
                  placeholder="Any other rules the assistant should follow…" />
              </Field>
            </Panel>
          </div>
        )}

        {/* ── SECURITY SECTION ── */}
        {activeSection === 'security' && (
          <div className="space-y-4">
            <Panel title="Domain restriction">
              <Field label="Allowed domain (optional)">
                <input value={config.allowed_domain ?? ''} onChange={e => setConfig(c => ({ ...c, allowed_domain: e.target.value }))}
                  className={inputCls} placeholder="e.g. mybottleshop.com.au" />
              </Field>
              <p className="text-xs text-[rgba(255,255,255,0.3)] mt-1">
                If set, the widget will only respond to requests from this domain. Leave blank to allow all origins.
              </p>
            </Panel>
            {config.api_key && (
              <Panel title="API key">
                <p className="text-xs text-[rgba(255,255,255,0.4)] mb-2">Your widget API key. Keep this private.</p>
                <div className="font-mono text-xs text-[rgba(255,255,255,0.5)] bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-xl px-4 py-3 break-all">
                  {config.api_key}
                </div>
              </Panel>
            )}
          </div>
        )}

{activeSection === 'appointments' && (
<div className="space-y-4">
  <Panel title="Enable appointment booking">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-white">Allow visitors to book appointments via chat</p>
        <p className="text-xs text-[rgba(255,255,255,0.4)] mt-1">When enabled, Aria collects booking details and notifies you via SMS instantly.</p>
      </div>
      <button onClick={() => setConfig(c => ({ ...c, appointments_enabled: !c.appointments_enabled }))}
        style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
          background: config.appointments_enabled ? '#1D9E75' : 'rgba(255,255,255,0.15)',
          position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
        <span style={{ position: 'absolute', top: 3, left: config.appointments_enabled ? 23 : 3,
          width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', display: 'block' }}/>
      </button>
    </div>
  </Panel>
  {config.appointments_enabled && (<>
    <Panel title="Appointment settings">
      <div className="space-y-3">
        <Field label="Services (one per line — leave blank if all are bookable)">
          <textarea value={config.appointment_services} onChange={e => setConfig(c => ({ ...c, appointment_services: e.target.value }))}
            className={textareaCls} rows={4} placeholder="Haircut
Colour treatment
Blowout"/>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Book up to (days ahead)">
            <input type="number" value={config.appointment_lead_days} min={1} max={90}
              onChange={e => setConfig(c => ({ ...c, appointment_lead_days: parseInt(e.target.value) || 14 }))}
              className={inputCls}/>
          </Field>
          <Field label="Default duration (minutes)">
            <input type="number" value={config.appointment_duration_mins} min={15} max={480}
              onChange={e => setConfig(c => ({ ...c, appointment_duration_mins: parseInt(e.target.value) || 60 }))}
              className={inputCls}/>
          </Field>
        </div>
      </div>
    </Panel>
    <Panel title="SMS notifications to you">
      <p className="text-xs text-[rgba(255,255,255,0.4)] mb-3">You receive an instant SMS when a visitor books via your website chat.</p>
      <div className="space-y-3">
        <Field label="Your mobile for booking alerts">
          <input value={config.notification_phone} onChange={e => setConfig(c => ({ ...c, notification_phone: e.target.value }))}
            className={inputCls} placeholder="+61412345678" type="tel"/>
        </Field>
        <Field label="Your email for booking alerts (optional)">
          <input value={config.notification_email} onChange={e => setConfig(c => ({ ...c, notification_email: e.target.value }))}
            className={inputCls} placeholder="owner@yourbusiness.com.au" type="email"/>
        </Field>
      </div>
      <div className="mt-3 p-3 rounded-xl text-xs leading-relaxed" style={{ background: 'rgba(29,158,117,0.06)', border: '1px solid rgba(29,158,117,0.15)' }}>
        <p className="text-[rgba(255,255,255,0.5)] mb-1">Example SMS you will receive:</p>
        <p className="text-[rgba(29,158,117,0.8)] font-mono text-[11px]">
          📅 New booking via website chat! Customer: Sarah Johnson. Date: Mon 26 May. Time: 2:00 PM. Service: Haircut. Phone: 0412 345 678. View: ariaos.site/dashboard/bookings
        </p>
      </div>
    </Panel>
  </>)}
</div>
)}

        {/* Save button */}
        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-[rgba(255,255,255,0.07)]">
          <button onClick={save} disabled={saving}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-[#1D9E75] hover:bg-[#179968] text-white transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save changes'}
          </button>
          <span className="text-xs text-[rgba(255,255,255,0.25)]">Changes save to your account and update the live widget.</span>
        </div>
      </div>

      {/* Live preview */}
      <div className="fixed bottom-6 right-6 z-30">
        <button onClick={() => setPreviewOpen(p => !p)}
          className="text-xs font-medium px-3 py-2 rounded-xl border border-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.5)] hover:text-white bg-[#13131a] transition-colors">
          {previewOpen ? 'Hide preview' : 'Preview widget'}
        </button>
        {previewOpen && (
          <div className="absolute bottom-12 right-0 w-80 bg-white rounded-2xl shadow-2xl overflow-hidden border"
            style={{ borderColor: config.primary_color + '33' }}>
            <div className="px-4 py-3 flex items-center gap-2" style={{ background: config.primary_color }}>
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-bold">
                {config.bot_name[0]?.toUpperCase()}
              </div>
              <span className="text-white text-sm font-semibold">{config.bot_name}</span>
            </div>
            <div className="p-4">
              <div className="inline-block bg-gray-100 rounded-2xl rounded-tl-sm px-3 py-2 text-sm text-gray-700 max-w-[240px]">
                {config.greeting}
              </div>
            </div>
            <div className="px-4 pb-4">
              <div className="flex gap-2 border border-gray-200 rounded-xl px-3 py-2">
                <input className="flex-1 text-sm outline-none text-gray-400" placeholder="Type a message…" readOnly />
                <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: config.primary_color }}>
                  <svg viewBox="0 0 24 24" fill="white" className="w-3 h-3"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                </div>
              </div>
              <p className="text-[9px] text-gray-300 text-center mt-2">Powered by Aria</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-white mb-4">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[rgba(255,255,255,0.4)] mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ value, onChange, description }: { value: boolean; onChange: (v: boolean) => void; description?: string }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={() => onChange(!value)}
        className={`relative flex-shrink-0 rounded-full transition-colors ${value ? 'bg-[#1D9E75]' : 'bg-[rgba(255,255,255,0.15)]'}`}
        style={{ height: '22px', width: '40px' }}>
        <span className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-all ${value ? 'left-4.5' : 'left-0.5'}`}
          style={{ width: '18px', height: '18px', left: value ? '18px' : '2px' }} />
      </button>
      {description && <span className="text-xs text-[rgba(255,255,255,0.35)]">{description}</span>}
    </div>
  );
}
