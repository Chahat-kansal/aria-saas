'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import { supabase } from '@/lib/supabase';

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
  allowed_domain?: string;
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
  allowed_domain: '',
};

export default function WebsiteChatPage() {
  const { business } = useBusinessContext();
  const [config, setConfig] = useState<WidgetConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const load = useCallback(async () => {
    if (!business?.id) return;
    const { data } = await supabase
      .from('widget_configs')
      .select('*')
      .eq('business_id', business.id)
      .single();

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
        allowed_domain: data.allowed_domain ?? '',
      });
    }
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
      allowed_domain: config.allowed_domain || null,
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
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://yourdomain.com';
    const code = `<script src="${appUrl}/widget.js" data-key="${config.api_key}" defer></script>`;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function addFaq() {
    setConfig(c => ({ ...c, faqs: [...c.faqs, { q: '', a: '' }] }));
  }

  function updateFaq(i: number, field: 'q' | 'a', val: string) {
    setConfig(c => {
      const faqs = [...c.faqs];
      faqs[i] = { ...faqs[i], [field]: val };
      return { ...c, faqs };
    });
  }

  function removeFaq(i: number) {
    setConfig(c => ({ ...c, faqs: c.faqs.filter((_, idx) => idx !== i) }));
  }

  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://yourdomain.com';

  return (
    <div className="flex-1 overflow-y-auto bg-[#0d0d14] min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-white mb-1">Website Chat Widget</h1>
          <p className="text-sm text-[rgba(255,255,255,0.4)]">
            Embed an AI chat assistant on your website. It knows your business and answers customer questions automatically.
          </p>
        </div>

        {/* Enable toggle */}
        <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-2xl p-5 mb-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[14px] font-semibold text-white">Widget enabled</div>
              <div className="text-[12px] text-[rgba(255,255,255,0.4)] mt-0.5">
                {config.enabled ? 'Live on your website' : 'Widget is currently disabled'}
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
        </div>

        {/* Embed code */}
        {config.api_key && (
          <div className="bg-[rgba(29,158,117,0.06)] border border-[rgba(29,158,117,0.2)] rounded-2xl p-5 mb-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-semibold text-[#1D9E75]">Embed code</span>
              <button
                onClick={copyEmbed}
                className="text-[11px] font-medium px-3 py-1 rounded-lg bg-[#1D9E75] text-white hover:bg-[#179968] transition-colors"
              >
                {copied ? '✓ Copied!' : 'Copy code'}
              </button>
            </div>
            <code className="text-[11px] text-[rgba(255,255,255,0.5)] break-all">
              {`<script src="${appUrl}/widget.js" data-key="${config.api_key}" defer></script>`}
            </code>
            <p className="text-[11px] text-[rgba(255,255,255,0.3)] mt-2">
              Paste this before the &lt;/body&gt; tag on your website.
            </p>
          </div>
        )}

        {/* Appearance */}
        <Section title="Appearance">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Bot name">
              <input
                value={config.bot_name}
                onChange={e => setConfig(c => ({ ...c, bot_name: e.target.value }))}
                className="input-dark"
                placeholder="Aria"
              />
            </Field>
            <Field label="Primary colour">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={config.primary_color}
                  onChange={e => setConfig(c => ({ ...c, primary_color: e.target.value }))}
                  className="w-10 h-9 rounded-lg border-0 cursor-pointer bg-transparent"
                />
                <input
                  value={config.primary_color}
                  onChange={e => setConfig(c => ({ ...c, primary_color: e.target.value }))}
                  className="input-dark flex-1"
                  placeholder="#1D9E75"
                />
              </div>
            </Field>
          </div>
          <Field label="Greeting message">
            <input
              value={config.greeting}
              onChange={e => setConfig(c => ({ ...c, greeting: e.target.value }))}
              className="input-dark"
              placeholder="Hi! How can I help you today?"
            />
          </Field>
        </Section>

        {/* Opening hours */}
        <Section title="Opening hours">
          <div className="grid grid-cols-1 gap-2">
            {DAYS.map(day => (
              <div key={day} className="flex items-center gap-3">
                <span className="text-[12px] text-[rgba(255,255,255,0.5)] w-24 flex-shrink-0">{day}</span>
                <input
                  value={config.opening_hours[day] ?? ''}
                  onChange={e => setConfig(c => ({
                    ...c,
                    opening_hours: { ...c.opening_hours, [day]: e.target.value },
                  }))}
                  className="input-dark flex-1 text-[12px]"
                  placeholder="e.g. 9am – 5pm or Closed"
                />
              </div>
            ))}
          </div>
        </Section>

        {/* Services */}
        <Section title="Services / top products">
          <textarea
            value={config.services}
            onChange={e => setConfig(c => ({ ...c, services: e.target.value }))}
            rows={3}
            className="input-dark w-full resize-none"
            placeholder="e.g. Haircuts ($45), Colour ($120), Blow dry ($35)…"
          />
          <p className="text-[11px] text-[rgba(255,255,255,0.3)] mt-1">
            The bot will use this to answer pricing and availability questions.
          </p>
        </Section>

        {/* FAQs */}
        <Section title="FAQs">
          <div className="space-y-3">
            {config.faqs.map((faq, i) => (
              <div key={i} className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] rounded-xl p-3">
                <div className="flex items-start gap-2 mb-2">
                  <input
                    value={faq.q}
                    onChange={e => updateFaq(i, 'q', e.target.value)}
                    className="input-dark flex-1 text-[12px]"
                    placeholder="Question…"
                  />
                  <button onClick={() => removeFaq(i)} className="text-[rgba(255,255,255,0.25)] hover:text-red-400 transition-colors mt-2">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
                <textarea
                  value={faq.a}
                  onChange={e => updateFaq(i, 'a', e.target.value)}
                  rows={2}
                  className="input-dark w-full text-[12px] resize-none"
                  placeholder="Answer…"
                />
              </div>
            ))}
            <button
              onClick={addFaq}
              className="text-[12px] font-medium text-[#1D9E75] hover:text-white transition-colors flex items-center gap-1.5"
            >
              <span className="text-lg leading-none">+</span> Add FAQ
            </button>
          </div>
        </Section>

        {/* Guardrails */}
        <Section title="Guardrails & escalation">
          <Field label="Things the bot should never say">
            <textarea
              value={config.guardrails}
              onChange={e => setConfig(c => ({ ...c, guardrails: e.target.value }))}
              rows={2}
              className="input-dark w-full resize-none"
              placeholder="e.g. Never confirm appointments without checking availability. Never discuss refunds."
            />
          </Field>
          <Field label="Escalation message (shown when bot can't help)">
            <input
              value={config.escalation_message}
              onChange={e => setConfig(c => ({ ...c, escalation_message: e.target.value }))}
              className="input-dark"
              placeholder="Please call us on 0400 000 000"
            />
          </Field>
        </Section>

        {/* Domain whitelist */}
        <Section title="Security">
          <Field label="Allowed domain (optional)">
            <input
              value={config.allowed_domain ?? ''}
              onChange={e => setConfig(c => ({ ...c, allowed_domain: e.target.value }))}
              className="input-dark"
              placeholder="e.g. mybottleshop.com.au"
            />
          </Field>
          <p className="text-[11px] text-[rgba(255,255,255,0.3)] mt-1">
            If set, the chatbot will only respond to requests from this domain. Leave blank to allow all origins.
          </p>
        </Section>

        {/* Save */}
        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={save}
            disabled={saving}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-[#1D9E75] hover:bg-[#179968] text-white transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save changes'}
          </button>
          <a
            href="/dashboard/website-chat/conversations"
            className="text-[12px] text-[rgba(255,255,255,0.4)] hover:text-white transition-colors"
          >
            View conversations →
          </a>
        </div>
      </div>

      {/* Live preview panel */}
      <div className="fixed bottom-6 right-6 z-30">
        <button
          onClick={() => setPreviewOpen(p => !p)}
          className="text-[11px] font-medium px-3 py-2 rounded-xl border border-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.5)] hover:text-white bg-[#13131a] transition-colors"
        >
          {previewOpen ? 'Hide preview' : 'Preview widget'}
        </button>
        {previewOpen && (
          <div
            className="absolute bottom-10 right-0 w-80 bg-white rounded-2xl shadow-2xl overflow-hidden border"
            style={{ borderColor: config.primary_color + '33' }}
          >
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
                  <svg viewBox="0 0 24 24" fill="white" className="w-3 h-3">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                  </svg>
                </div>
              </div>
              <p className="text-[9px] text-gray-300 text-center mt-2">Powered by Aria</p>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .input-dark {
          width: 100%;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          padding: 8px 12px;
          color: white;
          font-size: 13px;
          outline: none;
          transition: border-color 0.15s;
        }
        .input-dark:focus {
          border-color: rgba(29,158,117,0.5);
        }
        .input-dark::placeholder {
          color: rgba(255,255,255,0.25);
        }
      `}</style>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-2xl p-5 mb-4">
      <h3 className="text-[13px] font-semibold text-white mb-4">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-[rgba(255,255,255,0.4)] mb-1.5">{label}</label>
      {children}
    </div>
  );
}