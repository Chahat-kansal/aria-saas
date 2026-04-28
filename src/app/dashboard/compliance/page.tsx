'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

const TOPICS_BY_INDUSTRY: Record<string, { title: string; items: string[] }[]> = {
  cafe: [
    { title: 'Food Safety', items: ['Food handler certificates for all staff', 'Temperature logs for fridges and hot-holding', 'HACCP plan documented and reviewed', 'Pest control records up to date'] },
    { title: 'Workplace', items: ['SafeWork induction completed for all staff', 'Fair Work pay rates current', 'Superannuation paid on time', 'Workers compensation insurance active'] },
    { title: 'Licensing', items: ['Council food business registration current', 'Liquor licence (if applicable) displayed', 'Business name registered with ASIC', 'Public liability insurance active'] },
  ],
  restaurant: [
    { title: 'Food Safety', items: ['Food handler certificates for all staff', 'Temperature logs for fridges and hot-holding', 'HACCP plan documented', 'Allergen menu information current'] },
    { title: 'Workplace', items: ['Fair Work pay rates current', 'Superannuation paid on time', 'Workers compensation insurance active', 'Staff rostering compliant with awards'] },
    { title: 'Licensing', items: ['Council food business registration current', 'Liquor licence displayed and current', 'Public liability insurance active', 'RSA certifications for liquor staff'] },
  ],
  salon: [
    { title: 'Health & Safety', items: ['Chemical handling training completed', 'Skin test protocols documented', 'Sterilisation logs maintained', 'First aid kit stocked and accessible'] },
    { title: 'Workplace', items: ['Fair Work pay rates current', 'Superannuation paid on time', 'Workers compensation insurance active', 'Privacy policy for client records'] },
    { title: 'Licensing', items: ['Business name registered', 'Public liability insurance active', 'Council registration (if applicable)', 'Product safety compliance for chemicals'] },
  ],
  retail: [
    { title: 'Consumer Law', items: ['Refund policy displayed clearly', 'Product warranties compliant with ACL', 'Price scanning accuracy checked', 'Gift card terms comply with ACL'] },
    { title: 'Workplace', items: ['Fair Work pay rates current', 'Superannuation paid on time', 'Workers compensation insurance active', 'Safe manual handling procedures'] },
    { title: 'Licensing', items: ['Business name registered with ASIC', 'Public liability insurance active', 'Fire safety compliance checked', 'EFTPOS surcharge disclosed'] },
  ],
  tradie: [
    { title: 'Licensing & Insurance', items: ['Contractor licence current', 'Public liability insurance active (min $5M)', 'Workers compensation insurance active', 'Professional indemnity insurance (if applicable)'] },
    { title: 'Work Health & Safety', items: ['WHS induction for all staff', 'SafeWork compliance for high-risk work', 'Site safety plan documented', 'PPE policy enforced'] },
    { title: 'Business', items: ['ABN registered and current', 'GST registered (if turnover >$75k)', 'Business name registered with ASIC', 'Fair Work pay rates current'] },
  ],
  professional: [
    { title: 'Professional', items: ['Professional membership current', 'Professional indemnity insurance active', 'CPD hours up to date', 'Registration renewal tracked'] },
    { title: 'Privacy & Data', items: ['Privacy policy compliant with Australian Privacy Act', 'Client data stored securely', 'Data breach response plan documented', 'Consent forms up to date'] },
    { title: 'Business', items: ['ABN and GST registration current', 'Public liability insurance active', 'Business name registered', 'Fair Work compliance checked'] },
  ],
  visa: [
    { title: 'MARA Requirements', items: ['MARA registration current', 'CPD hours completed for year', 'PI insurance active and sufficient', 'Client agreement templates up to date'] },
    { title: 'Compliance', items: ['OMARA Code of Conduct followed', 'Client files documented', 'Costs disclosure given to all clients', 'Complaints process documented'] },
    { title: 'Business', items: ['ABN and GST registration current', 'Trust account management compliant', 'Privacy obligations met', 'Business name registered'] },
  ],
};

const DEFAULT_TOPICS = [
  { title: 'Business Basics', items: ['ABN registered and current', 'Business name registered with ASIC', 'GST registered (if turnover >$75k)', 'Business bank account separate from personal'] },
  { title: 'Insurance', items: ['Public liability insurance active', 'Workers compensation insurance active', 'Professional indemnity (if applicable)', 'Business interruption insurance reviewed'] },
  { title: 'Workplace', items: ['Fair Work pay rates current (check fairwork.gov.au)', 'Superannuation paid on time (quarterly minimum)', 'Employment contracts signed by all staff', 'Workplace Health & Safety policy documented'] },
];

export default function CompliancePage() {
  const { business } = useBusinessContext();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const industry = business?.industry?.toLowerCase() ?? '';
  const topics = TOPICS_BY_INDUSTRY[industry] ?? DEFAULT_TOPICS;

  // Load persisted state
  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const res = await fetch(`/api/compliance?business_id=${business.id}`).then(r => r.json()).catch(() => ({ items: [] }));
    const persisted: Record<string, boolean> = {};
    for (const item of res.items ?? []) {
      if (item.checked) persisted[item.key] = true;
    }
    setChecked(persisted);
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  async function toggle(key: string) {
    if (!business?.id) return;
    const newVal = !checked[key];
    setChecked(prev => ({ ...prev, [key]: newVal }));
    setSaving(true);
    await fetch('/api/compliance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id, key, checked: newVal }),
    }).catch(() => null);
    setSaving(false);
  }

  const total = topics.reduce((sum, t) => sum + t.items.length, 0);
  const done = Object.values(checked).filter(Boolean).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Compliance Checklist</h1>
          <p style={{ color: '#6b7280' }}>Stay on top of your legal and regulatory obligations</p>
        </div>
        {saving && <span className="text-xs shrink-0" style={{ color: '#6b7280' }}>Saving…</span>}
      </div>

      {/* Progress */}
      <div className="rounded-xl p-5 mb-6 flex items-center gap-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="relative w-16 h-16 shrink-0">
          <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1D9E75" strokeWidth="3"
              strokeDasharray={`${pct} ${100 - pct}`} strokeLinecap="round" />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-white">{loading ? '…' : `${pct}%`}</span>
        </div>
        <div>
          <p className="font-medium text-white">{loading ? 'Loading…' : `${done} of ${total} completed`}</p>
          <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>
            {pct === 100 ? "You're fully compliant — great work!" : `${total - done} items still need attention`}
          </p>
          <p className="text-xs mt-1" style={{ color: '#4b5563' }}>Your progress is saved automatically</p>
        </div>
      </div>

      <div className="space-y-5">
        {topics.map(section => (
          <div key={section.title} className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="px-5 py-4" style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <h2 className="font-medium text-white">{section.title}</h2>
            </div>
            <div style={{ background: '#0d0d14' }}>
              {section.items.map(item => {
                const key = `${section.title}:${item}`;
                const isDone = !!checked[key];
                return (
                  <label key={item}
                    className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <input type="checkbox" checked={isDone} onChange={() => toggle(key)} className="sr-only" />
                    <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all"
                      style={{ background: isDone ? '#1D9E75' : 'rgba(255,255,255,0.06)', border: isDone ? 'none' : '1px solid rgba(255,255,255,0.15)' }}>
                      {isDone && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </div>
                    <span className="text-sm" style={{ color: isDone ? '#6b7280' : '#e5e7eb', textDecoration: isDone ? 'line-through' : 'none' }}>{item}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs text-center" style={{ color: '#4b5563' }}>
        This checklist is a guide only. Always consult a qualified professional for legal and compliance advice.
      </p>
    </div>
  );
}
