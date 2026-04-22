'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const VISA_TYPES = [
  '189 — Skilled Independent', '190 — Skilled Nominated', '491 — Skilled Work Regional',
  '482 — Temporary Skill Shortage', '186 — Employer Nomination Scheme', '187 — Regional Sponsored Migration',
  '500 — Student', '485 — Graduate Temporary', '820/801 — Partner (Temporary/Permanent)',
  '309/100 — Partner Offshore', '820 — Partner (Temporary)', '801 — Partner (Permanent)',
  '417 — Working Holiday', '462 — Work and Holiday',
  '103 — Parent', '143 — Contributory Parent', '804 — Aged Parent',
  '132 — Business Talent', '188 — Business Innovation', '888 — Business Innovation Permanent',
  '010 — Bridging A', '020 — Bridging B', 'Other',
];

const STATUSES = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'lodged', label: 'Lodged' },
  { value: 'approved', label: 'Approved' },
  { value: 'refused', label: 'Refused' },
  { value: 'bridging', label: 'Bridging' },
];

export default function NewClientPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', date_of_birth: '', nationality: '',
    passport_number: '', passport_expiry: '',
    visa_type: '', application_status: 'in_progress',
    lodgement_date: '', decision_date: '', visa_expiry: '',
    points_score: '', notes: '',
  });

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Not authenticated'); return; }
      const payload: any = {
        agent_id: session.user.id,
        full_name: form.full_name,
        email: form.email || null,
        phone: form.phone || null,
        date_of_birth: form.date_of_birth || null,
        nationality: form.nationality || null,
        passport_number: form.passport_number || null,
        passport_expiry: form.passport_expiry || null,
        visa_type: form.visa_type || null,
        application_status: form.application_status,
        lodgement_date: form.lodgement_date || null,
        decision_date: form.decision_date || null,
        visa_expiry: form.visa_expiry || null,
        notes: form.notes || null,
      };
      if (form.points_score) payload.points_score = parseInt(form.points_score);
      const { error: err } = await supabase.from('visa_clients').insert(payload);
      if (err) { setError(err.message); return; }
      router.push('/visa/clients');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full bg-[rgba(255,255,255,.04)] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-[rgba(255,255,255,.25)] outline-none focus:border-[rgba(127,119,221,.5)] transition-colors';
  const labelCls = 'block text-xs text-[rgba(255,255,255,.5)] mb-1.5';

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Link href="/visa/clients" className="text-xs text-[rgba(255,255,255,.35)] hover:text-white flex items-center gap-1.5 mb-6 transition-colors">
        ← Back to clients
      </Link>
      <h1 className="text-xl font-semibold text-white mb-6">Add new client</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Personal */}
        <div className="rounded-2xl p-6" style={{ background: '#111118', border: '1px solid rgba(255,255,255,.07)' }}>
          <h2 className="text-xs font-medium text-[rgba(255,255,255,.4)] uppercase tracking-wider mb-5">Personal information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className={labelCls}>Full name *</label>
              <input required value={form.full_name} onChange={e => set('full_name', e.target.value)}
                placeholder="Full legal name" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                placeholder="client@email.com" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)}
                placeholder="+61 4XX XXX XXX" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Date of birth</label>
              <input type="date" value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)}
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Nationality</label>
              <input value={form.nationality} onChange={e => set('nationality', e.target.value)}
                placeholder="e.g. Indian, Chinese" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Passport number</label>
              <input value={form.passport_number} onChange={e => set('passport_number', e.target.value)}
                placeholder="A12345678" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Passport expiry</label>
              <input type="date" value={form.passport_expiry} onChange={e => set('passport_expiry', e.target.value)}
                className={inputCls} />
            </div>
          </div>
        </div>

        {/* Visa */}
        <div className="rounded-2xl p-6" style={{ background: '#111118', border: '1px solid rgba(255,255,255,.07)' }}>
          <h2 className="text-xs font-medium text-[rgba(255,255,255,.4)] uppercase tracking-wider mb-5">Visa details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className={labelCls}>Visa type</label>
              <select value={form.visa_type} onChange={e => set('visa_type', e.target.value)} className={inputCls}>
                <option value="">Select visa subclass…</option>
                {VISA_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Application status</label>
              <select value={form.application_status} onChange={e => set('application_status', e.target.value)} className={inputCls}>
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Points score</label>
              <input type="number" value={form.points_score} onChange={e => set('points_score', e.target.value)}
                placeholder="e.g. 90" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Lodgement date</label>
              <input type="date" value={form.lodgement_date} onChange={e => set('lodgement_date', e.target.value)}
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Decision date</label>
              <input type="date" value={form.decision_date} onChange={e => set('decision_date', e.target.value)}
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Visa expiry</label>
              <input type="date" value={form.visa_expiry} onChange={e => set('visa_expiry', e.target.value)}
                className={inputCls} />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="rounded-2xl p-6" style={{ background: '#111118', border: '1px solid rgba(255,255,255,.07)' }}>
          <label className={labelCls}>Notes</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={4}
            placeholder="Any additional notes about this client or their case…"
            className={`${inputCls} resize-none`} />
        </div>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={saving}
            className="flex-1 py-3 rounded-xl text-sm font-medium text-white disabled:opacity-60 transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg,#7F77DD,#5f57c0)' }}>
            {saving ? 'Saving…' : 'Save client'}
          </button>
          <Link href="/visa/clients"
            className="px-6 py-3 rounded-xl text-sm text-[rgba(255,255,255,.5)] hover:text-white transition-colors border border-white/10">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}