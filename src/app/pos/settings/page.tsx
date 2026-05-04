'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Settings {
  business_name: string;
  currency: string;
  tax_inclusive: boolean;
  receipt_footer: string;
  receipt_header: string;
  business_abn: string;
  business_address: string;
  business_phone: string;
  business_website: string;
  receipt_show_gst: boolean;
  receipt_show_cashier: boolean;
  receipt_show_loyalty: boolean;
  low_stock_notify: boolean;
  loyalty_enabled: boolean;
  cash_rounding: boolean;
}

const SETTING_SECTIONS = [
  { label: 'Payment Methods', href: '/pos/settings/payments', desc: 'Configure EFTPOS, cash, and split payment options' },
  { label: 'Tax Rates', href: '/pos/settings/tax', desc: 'Manage GST and custom tax rates' },
  { label: 'Loyalty Program', href: '/pos/settings/loyalty', desc: 'Points per dollar, redemption thresholds' },
  { label: 'Users & Permissions', href: '/pos/settings/users', desc: 'Manage register staff and access levels' },
  { label: 'Surcharging', href: '/pos/settings/surcharging', desc: 'Apply card surcharges or rounding rules' },
  { label: 'Integrations', href: '/pos/settings/integrations', desc: 'Xero, accounting, and third-party connections' },
];

const DEFAULT: Settings = {
  business_name: '', currency: 'AUD', tax_inclusive: true,
  receipt_footer: 'Thank you for your business!', receipt_header: '',
  business_abn: '', business_address: '', business_phone: '', business_website: '',
  receipt_show_gst: true, receipt_show_cashier: true, receipt_show_loyalty: true,
  low_stock_notify: true, loyalty_enabled: false, cash_rounding: true,
};

export default function SettingsPage() {
  const [form, setForm]     = useState<Settings>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [tab,     setTab]     = useState<'general' | 'receipt'>('general');

  useEffect(() => {
    fetch('/api/pos/settings').then(r => r.json()).then(d => {
      if (d.settings) setForm({ ...DEFAULT, ...d.settings });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    await fetch('/api/pos/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  const F = (key: keyof Settings) => ({
    value: form[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value })),
  });
  const CHK = (key: keyof Settings) => ({
    checked: form[key] as boolean,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [key]: e.target.checked })),
  });

  const inputCls = 'w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] focus:outline-none focus:border-[#2563eb]';

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a16]">Settings</h1>
          <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">POS configuration and receipt template</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-xs text-violet-600 font-medium">Saved!</span>}
          <button onClick={save} disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#7C3AED,#6D28D9)' }}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {(['general', 'receipt'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${tab === t ? 'bg-white shadow-sm text-[#1a1a16]' : 'text-[rgba(26,26,22,.5)] hover:text-[#1a1a16]'}`}>
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-6 h-6 rounded-full border-2 border-violet-300 border-t-violet-600 animate-spin" /></div>
      ) : tab === 'general' ? (
        <>
          <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] shadow-sm p-6 mb-6 space-y-4">
            <h2 className="text-sm font-semibold text-[rgba(26,26,22,.6)] uppercase tracking-wider">Business</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Business Name</label>
                <input {...F('business_name')} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Currency</label>
                <select {...F('currency')} className={inputCls}>
                  {['AUD', 'NZD', 'USD', 'GBP', 'EUR', 'CAD', 'SGD'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-3 pt-1">
              {([
                ['tax_inclusive',    'Tax-inclusive pricing (GST included in displayed prices)'],
                ['cash_rounding',    'Cash rounding — round to nearest 5 cents'],
                ['low_stock_notify', 'Notify when stock is low'],
                ['loyalty_enabled',  'Enable loyalty points program'],
              ] as const).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" {...CHK(k as keyof Settings)} className="rounded border-[rgba(0,0,0,.2)] accent-violet-600 w-4 h-4" />
                  <span className="text-sm text-[#1a1a16]">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Sub-sections */}
          <h2 className="text-xs font-semibold text-[rgba(26,26,22,.5)] uppercase tracking-wider mb-3">More Settings</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SETTING_SECTIONS.map(s => (
              <Link key={s.href} href={s.href}
                className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-4 shadow-sm hover:border-violet-400 transition-colors group">
                <p className="text-[13px] font-semibold text-[#1a1a16] group-hover:text-violet-600 transition-colors">{s.label}</p>
                <p className="text-[11px] text-[rgba(26,26,22,.45)] mt-0.5">{s.desc}</p>
              </Link>
            ))}
          </div>
        </>
      ) : (
        /* Receipt tab */
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] shadow-sm p-6 space-y-4">
          <h2 className="text-sm font-semibold text-[rgba(26,26,22,.6)] uppercase tracking-wider">Receipt Template</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">ABN</label>
              <input {...F('business_abn')} placeholder="12 345 678 901" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Phone</label>
              <input {...F('business_phone')} placeholder="+61 2 1234 5678" className={inputCls} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Business Address</label>
            <textarea {...F('business_address')} rows={2} placeholder="123 Main St, Sydney NSW 2000"
              className={inputCls + ' resize-none'} />
          </div>

          <div>
            <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Website</label>
            <input {...F('business_website')} placeholder="https://yourstore.com.au" className={inputCls} />
          </div>

          <div>
            <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Receipt Header</label>
            <textarea {...F('receipt_header')} rows={2} placeholder="Custom text at the top of every receipt"
              className={inputCls + ' resize-none'} />
          </div>

          <div>
            <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Receipt Footer</label>
            <textarea {...F('receipt_footer')} rows={2} placeholder="Thank you for your business!"
              className={inputCls + ' resize-none'} />
          </div>

          <div className="flex flex-col gap-3 pt-1 border-t border-[rgba(0,0,0,.06)]">
            <p className="text-xs font-medium text-[rgba(26,26,22,.5)] uppercase tracking-wider pt-1">Show on Receipt</p>
            {([
              ['receipt_show_gst',     'GST breakdown (excl. GST + GST amount)'],
              ['receipt_show_cashier', 'Cashier name'],
              ['receipt_show_loyalty', 'Loyalty points earned'],
            ] as const).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" {...CHK(k as keyof Settings)} className="rounded border-[rgba(0,0,0,.2)] accent-violet-600 w-4 h-4" />
                <span className="text-sm text-[#1a1a16]">{label}</span>
              </label>
            ))}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-[rgba(0,0,0,.06)]">
            <p className="text-xs text-[rgba(26,26,22,.4)] flex-1">
              Run the SQL migration to add receipt columns to pos_settings before saving:
              <code className="ml-1 text-[10px] bg-gray-100 px-1 rounded">supabase/migrations/20260504000001_pos_promotions_receipt.sql</code>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
