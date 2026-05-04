'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Settings {
  business_name: string; currency: string; tax_inclusive: boolean;
  receipt_footer: string; low_stock_notify: boolean; loyalty_enabled: boolean;
}

const SETTING_SECTIONS = [
  { label: 'Payment Methods', href: '/pos/settings/payments', desc: 'Configure EFTPOS, cash, and split payment options' },
  { label: 'Tax Rates', href: '/pos/settings/tax', desc: 'Manage GST and custom tax rates' },
  { label: 'Receipts', href: '/pos/settings/receipts', desc: 'Customise receipt header, footer, and format' },
  { label: 'Loyalty Program', href: '/pos/settings/loyalty', desc: 'Points per dollar, redemption thresholds' },
  { label: 'Users & Permissions', href: '/pos/settings/users', desc: 'Manage register staff and access levels' },
  { label: 'Surcharging', href: '/pos/settings/surcharging', desc: 'Apply card surcharges or rounding rules' },
  { label: 'Integrations', href: '/pos/settings/integrations', desc: 'Xero, accounting, and third-party connections' },
  { label: 'Enterprise Policies', href: '/pos/settings/enterprise', desc: 'Multi-store rules and enforcement policies' },
];

export default function SettingsPage() {
  const [form, setForm] = useState<Settings>({ business_name: '', currency: 'AUD', tax_inclusive: true, receipt_footer: '', low_stock_notify: true, loyalty_enabled: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/pos/settings').then(r => r.json()).then(d => {
      if (d.settings) setForm(d.settings);
      setLoading(false);
    });
  }, []);

  async function save() {
    setSaving(true);
    await fetch('/api/pos/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#1a1a16]">General Settings</h1>
        <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Core POS configuration</p>
      </div>

      {/* General form */}
      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] shadow-sm p-6 mb-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Business Name</label>
            <input value={form.business_name} onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))}
              className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] focus:outline-none focus:border-[#2563eb]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Currency</label>
            <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
              className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] focus:outline-none focus:border-[#2563eb]">
              {['AUD', 'NZD', 'USD', 'GBP', 'EUR', 'CAD', 'SGD'].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Receipt Footer</label>
          <textarea value={form.receipt_footer} onChange={e => setForm(f => ({ ...f, receipt_footer: e.target.value }))} rows={2}
            placeholder="e.g. Thank you for shopping with us!"
            className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] placeholder-[rgba(26,26,22,.3)] focus:outline-none focus:border-[#2563eb] resize-none" />
        </div>
        <div className="flex flex-col gap-3">
          {[['tax_inclusive', 'Tax-inclusive pricing'], ['low_stock_notify', 'Notify when stock is low'], ['loyalty_enabled', 'Enable loyalty points']] .map(([k, label]) => (
            <label key={k} className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={form[k as keyof Settings] as boolean}
                onChange={e => setForm(f => ({ ...f, [k]: e.target.checked }))}
                className="rounded border-[rgba(0,0,0,.2)] accent-[#2563eb]" />
              <span className="text-sm text-[#1a1a16]">{label}</span>
            </label>
          ))}
        </div>
        <div className="flex items-center justify-end gap-3 pt-2">
          {saved && <span className="text-xs text-violet-600 font-medium">Saved!</span>}
          <button onClick={save} disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Sub-sections */}
      <h2 className="text-xs font-semibold text-[rgba(26,26,22,.5)] uppercase tracking-wider mb-3">More Settings</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SETTING_SECTIONS.map(s => (
          <Link key={s.href} href={s.href}
            className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-4 shadow-sm hover:border-[#2563eb] transition-colors group">
            <p className="text-[13px] font-semibold text-[#1a1a16] group-hover:text-[#2563eb] transition-colors">{s.label}</p>
            <p className="text-[11px] text-[rgba(26,26,22,.45)] mt-0.5">{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}