'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const C = { bg: 'var(--bg-base)', card: 'var(--bg-surface)', border: 'transparent', text: 'var(--text-primary)', muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)', violet: '#8B5CF6', green: '#22C55E', red: '#EF4444' };
const iStyle: React.CSSProperties = { background: 'var(--bg-base)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', fontSize: 13, color: C.text, outline: 'none', width: '100%', fontFamily: 'inherit' };
const lStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6 };

interface Settings {
  business_name: string; currency: string; tax_inclusive: boolean;
  receipt_footer: string; receipt_header: string; business_abn: string;
  business_address: string; business_phone: string; business_website: string;
  receipt_show_gst: boolean; receipt_show_cashier: boolean; receipt_show_loyalty: boolean;
  low_stock_notify: boolean; loyalty_enabled: boolean; cash_rounding: boolean;
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

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif", padding: '20px 24px', maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 2 }}>Settings</h1>
          <p style={{ fontSize: 12, color: C.muted }}>POS configuration and receipt template</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {saved && <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>Saved!</span>}
          <button onClick={save} disabled={saving}
            style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {(['general', 'receipt'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '7px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, textTransform: 'capitalize', cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: tab === t ? C.card : 'transparent', color: tab === t ? C.text : C.muted }}>
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 48 }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', border: `2px solid rgba(139,92,246,0.3)`, borderTopColor: C.violet, animation: 'pos-processing 0.7s linear infinite' }} />
        </div>
      ) : tab === 'general' ? (
        <>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 22px', marginBottom: 14 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>Business</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={lStyle}>Business Name</label>
                <input {...F('business_name')} style={iStyle} />
              </div>
              <div>
                <label style={lStyle}>Currency</label>
                <select {...F('currency')} style={{ ...iStyle, background: 'var(--bg-base)' }}>
                  {['AUD', 'NZD', 'USD', 'GBP', 'EUR', 'CAD', 'SGD'].map(c => (
                    <option key={c} style={{ background: 'var(--bg-base)', color: C.text }}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {([
                ['tax_inclusive',    'Tax-inclusive pricing (GST included in displayed prices)'],
                ['cash_rounding',    'Cash rounding — round to nearest 5 cents'],
                ['low_stock_notify', 'Notify when stock is low'],
                ['loyalty_enabled',  'Enable loyalty points program'],
              ] as const).map(([k, label]) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" {...CHK(k as keyof Settings)} style={{ accentColor: C.violet, width: 14, height: 14 }} />
                  <span style={{ fontSize: 13, color: C.text }}>{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Sub-sections */}
          <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>More Settings</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
            {SETTING_SECTIONS.map(s => (
              <Link key={s.href} href={s.href}
                style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 18px', textDecoration: 'none', display: 'block' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 3 }}>{s.label}</p>
                <p style={{ fontSize: 11, color: C.muted }}>{s.desc}</p>
              </Link>
            ))}
          </div>
        </>
      ) : (
        /* Receipt tab */
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 22px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>Receipt Template</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={lStyle}>ABN</label>
              <input {...F('business_abn')} placeholder="12 345 678 901" style={iStyle} />
            </div>
            <div>
              <label style={lStyle}>Phone</label>
              <input {...F('business_phone')} placeholder="+61 2 1234 5678" style={iStyle} />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={lStyle}>Business Address</label>
            <textarea {...F('business_address')} rows={2} placeholder="123 Main St, Sydney NSW 2000"
              style={{ ...iStyle, resize: 'vertical' }} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={lStyle}>Website</label>
            <input {...F('business_website')} placeholder="https://yourstore.com.au" style={iStyle} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={lStyle}>Receipt Header</label>
            <textarea {...F('receipt_header')} rows={2} placeholder="Custom text at the top of every receipt"
              style={{ ...iStyle, resize: 'vertical' }} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={lStyle}>Receipt Footer</label>
            <textarea {...F('receipt_footer')} rows={2} placeholder="Thank you for your business!"
              style={{ ...iStyle, resize: 'vertical' }} />
          </div>

          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Show on Receipt</p>
            {([
              ['receipt_show_gst',     'GST breakdown (excl. GST + GST amount)'],
              ['receipt_show_cashier', 'Cashier name'],
              ['receipt_show_loyalty', 'Loyalty points earned'],
            ] as const).map(([k, label]) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 10 }}>
                <input type="checkbox" {...CHK(k as keyof Settings)} style={{ accentColor: C.violet, width: 14, height: 14 }} />
                <span style={{ fontSize: 13, color: C.text }}>{label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
