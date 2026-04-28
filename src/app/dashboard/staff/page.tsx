'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface StaffMember {
  id: string; first_name: string; last_name: string; preferred_name: string | null;
  profile_photo_url: string | null; position: string; department: string | null;
  employment_type: string; status: string; start_date: string | null;
  right_to_work_verified: boolean; visa_type: string | null; visa_expiry_date: string | null;
  mobile: string | null; work_email: string | null;
}

const EMP_TYPE_COLORS: Record<string, string> = {
  full_time: 'bg-green-900/30 text-green-400',
  part_time: 'bg-blue-900/30 text-blue-400',
  casual: 'bg-yellow-900/30 text-yellow-400',
  contractor: 'bg-purple-900/30 text-purple-400',
  volunteer: 'bg-gray-800 text-gray-400',
};

const EMP_TYPE_LABELS: Record<string, string> = {
  full_time: 'Full-time', part_time: 'Part-time', casual: 'Casual',
  contractor: 'Contractor', volunteer: 'Volunteer',
};

function daysUntil(date: string | null) {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

function Avatar({ staff, size = 'md' }: { staff: StaffMember; size?: 'sm' | 'md' | 'lg' }) {
  const name = staff.preferred_name || `${staff.first_name} ${staff.last_name}`;
  const initials = name.split(' ').slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? '').join('');
  const sizes = { sm: 'w-8 h-8 text-xs', md: 'w-12 h-12 text-sm', lg: 'w-16 h-16 text-lg' };
  if (staff.profile_photo_url) {
    return <img src={staff.profile_photo_url} alt={name} className={`${sizes[size]} rounded-full object-cover`} />;
  }
  return (
    <div className={`${sizes[size]} rounded-full bg-[rgba(29,158,117,0.2)] border border-[rgba(29,158,117,0.3)] flex items-center justify-center font-semibold flex-shrink-0`}
      style={{ color: '#1D9E75' }}>
      {initials}
    </div>
  );
}

const BLANK_FORM = {
  first_name: '', last_name: '', preferred_name: '', position: '', department: '',
  employment_type: 'full_time', start_date: '', work_email: '', mobile: '',
  emergency_contact_name: '', emergency_contact_phone: '', emergency_contact_relationship: '',
  pay_type: 'hourly', pay_rate_cents: '', pay_per_annum_cents: '',
  visa_type: '', visa_subclass: '', visa_expiry_date: '', right_to_work_verified: false,
  visa_work_restrictions: '',
};

export default function StaffPage() {
  const { business } = useBusinessContext();
  const router = useRouter();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [addStep, setAddStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState('');
  const [form, setForm] = useState({ ...BLANK_FORM });

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/staff?business_id=${business.id}${filter !== 'all' ? `&status=${filter}` : ''}`).then(r => r.json());
      setStaff(res.staff ?? []);
    } catch {
      setError('Failed to load team members.');
    }
    setLoading(false);
  }, [business?.id, filter]);

  useEffect(() => { load(); }, [load]);

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  async function saveStaff() {
    if (!business?.id) return;
    setSaving(true);
    setAddError('');
    const payload = {
      ...form,
      business_id: business.id,
      pay_rate_cents: form.pay_rate_cents ? Math.round(parseFloat(form.pay_rate_cents as string) * 100) : null,
      pay_per_annum_cents: form.pay_per_annum_cents ? Math.round(parseFloat(form.pay_per_annum_cents as string) * 100) : null,
      preferred_name: form.preferred_name || null,
      department: form.department || null,
      start_date: form.start_date || null,
      visa_expiry_date: form.visa_expiry_date || null,
      visa_work_restrictions: form.visa_work_restrictions || null,
    };
    const res = await fetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(r => r.json());
    setSaving(false);
    if (res.error) { setAddError(res.error); return; }
    setShowAdd(false);
    setAddStep(1);
    setForm({ ...BLANK_FORM });
    load();
  }

  // Computed stats
  const active = staff.filter(s => s.status === 'active');
  const onLeave = staff.filter(s => s.status === 'on_leave');
  const visaAlerts = staff.filter(s => {
    if (!s.visa_expiry_date || s.status !== 'active') return false;
    if (s.visa_type === 'Australian Citizen' || s.visa_type === 'Permanent Resident') return false;
    const d = daysUntil(s.visa_expiry_date);
    return d !== null && d <= 60;
  });
  const rtwUnverified = staff.filter(s => !s.right_to_work_verified && s.status === 'active');

  const avgTenureMonths = active.length ? Math.round(
    active.filter(s => s.start_date).reduce((sum, s) => {
      return sum + (Date.now() - new Date(s.start_date!).getTime()) / (1000 * 60 * 60 * 24 * 30);
    }, 0) / active.filter(s => s.start_date).length
  ) : 0;

  const filtered = staff.filter(s => {
    if (search) {
      const q = search.toLowerCase();
      const name = `${s.first_name} ${s.last_name} ${s.preferred_name ?? ''} ${s.position}`.toLowerCase();
      if (!name.includes(q)) return false;
    }
    return true;
  });

  const inputCls = 'w-full px-3 py-2 rounded-xl text-sm text-white outline-none bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.08)] focus:border-[rgba(29,158,117,0.5)]';

  if (loading && staff.length === 0) {
    return (
      <div className="p-6 max-w-5xl mx-auto animate-pulse space-y-4">
        <div className="h-8 bg-[rgba(255,255,255,0.06)] rounded-xl w-48" />
        <div className="h-4 bg-[rgba(255,255,255,0.04)] rounded w-72" />
        <div className="grid grid-cols-4 gap-4 mt-6">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-[rgba(255,255,255,0.04)] rounded-xl" />)}
        </div>
        <div className="h-64 bg-[rgba(255,255,255,0.04)] rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="rounded-xl px-5 py-4" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <p className="text-sm font-medium text-red-400">Something went wrong</p>
          <p className="text-xs mt-1" style={{ color: 'rgba(239,68,68,0.6)' }}>{error}</p>
          <button onClick={load} className="text-xs text-red-400 underline mt-2 hover:text-red-300">Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Team</h1>
          <p style={{ color: '#6b7280' }}>
            {staff.length} member{staff.length !== 1 ? 's' : ''} · {active.length} active · {onLeave.length} on leave
          </p>
        </div>
        <button onClick={() => { setShowAdd(true); setAddStep(1); setForm({ ...BLANK_FORM }); }}
          className="shrink-0 px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: '#1D9E75' }}>
          + Add team member
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total headcount', value: staff.length, color: '#fff' },
          { label: 'Avg tenure', value: `${avgTenureMonths}mo`, color: '#fff' },
          { label: 'Visa renewals due', value: visaAlerts.length, color: visaAlerts.length > 0 ? '#ef4444' : '#1D9E75' },
          { label: 'Right to work pending', value: rtwUnverified.length, color: rtwUnverified.length > 0 ? '#f59e0b' : '#1D9E75' },
        ].map(c => (
          <div key={c.label} className="rounded-xl p-4" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs mb-1" style={{ color: '#6b7280' }}>{c.label}</p>
            <p className="text-2xl font-semibold" style={{ color: c.color }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Alerts panel */}
      {(visaAlerts.length > 0 || rtwUnverified.length > 0) && (
        <div className="mb-6 space-y-2">
          {visaAlerts.map(s => {
            const d = daysUntil(s.visa_expiry_date);
            return (
              <div key={s.id} className="flex items-center justify-between px-4 py-3 rounded-xl"
                style={{ background: (d ?? 99) <= 30 ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)', border: `1px solid ${(d ?? 99) <= 30 ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}` }}>
                <p className="text-sm" style={{ color: (d ?? 99) <= 30 ? '#ef4444' : '#f59e0b' }}>
                  <strong>{s.first_name} {s.last_name}</strong> — visa expires in {d} days ({s.visa_expiry_date})
                </p>
                <button onClick={() => router.push(`/dashboard/staff/${s.id}`)}
                  className="text-xs px-3 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.08)', color: '#9ca3af' }}>
                  View profile
                </button>
              </div>
            );
          })}
          {rtwUnverified.map(s => (
            <div key={s.id} className="flex items-center justify-between px-4 py-3 rounded-xl"
              style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <p className="text-sm" style={{ color: '#f59e0b' }}>
                <strong>{s.first_name} {s.last_name}</strong> — right to work not verified
              </p>
              <button onClick={() => router.push(`/dashboard/staff/${s.id}`)}
                className="text-xs px-3 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.08)', color: '#9ca3af' }}>
                Verify now
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-5">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, position, department…"
          className="px-3 py-2 rounded-xl text-sm outline-none flex-1 min-w-48"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff' }} />
        <div className="flex gap-1">
          {['all', 'active', 'on_leave', 'terminated'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className="px-3 py-2 rounded-xl text-xs capitalize transition-colors"
              style={filter === s ? { background: '#1D9E75', color: '#fff' } : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>
              {s === 'on_leave' ? 'On Leave' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-xl p-12 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="text-3xl mb-3">👥</div>
          <p className="font-semibold text-white mb-1">No team members yet</p>
          <p className="text-sm mb-4" style={{ color: '#6b7280' }}>Add your first team member to track employment details, compliance, and more.</p>
          <button onClick={() => setShowAdd(true)} className="px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: '#1D9E75' }}>
            Add team member
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(s => {
            const displayName = s.preferred_name || `${s.first_name} ${s.last_name}`;
            const visaDays = daysUntil(s.visa_expiry_date);
            const visaAlert = s.visa_expiry_date && visaDays !== null && visaDays <= 60
              && s.visa_type !== 'Australian Citizen' && s.visa_type !== 'Permanent Resident';
            const startYear = s.start_date ? new Date(s.start_date).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }) : null;
            return (
              <button key={s.id} onClick={() => router.push(`/dashboard/staff/${s.id}`)}
                className="text-left rounded-xl p-4 transition-all hover:border-[rgba(29,158,117,0.3)]"
                style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-start gap-3 mb-3">
                  <Avatar staff={s} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm truncate">{displayName}</p>
                    <p className="text-xs truncate" style={{ color: '#9ca3af' }}>{s.position}{s.department ? ` · ${s.department}` : ''}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${EMP_TYPE_COLORS[s.employment_type] ?? 'bg-gray-800 text-gray-400'}`}>
                    {EMP_TYPE_LABELS[s.employment_type] ?? s.employment_type}
                  </span>
                  {startYear && <span className="text-xs px-2 py-0.5 rounded-full bg-[rgba(255,255,255,0.05)] text-gray-400">Since {startYear}</span>}
                  {visaAlert && (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: (visaDays ?? 99) <= 30 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', color: (visaDays ?? 99) <= 30 ? '#ef4444' : '#f59e0b' }}>
                      Visa {visaDays}d
                    </span>
                  )}
                  {!s.right_to_work_verified && s.status === 'active' && (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
                      RTW unverified
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Add Staff Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#13131a] rounded-2xl p-6 w-full max-w-lg border border-[rgba(255,255,255,0.1)] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-white font-semibold">Add team member</h3>
                <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>Step {addStep} of 4</p>
              </div>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-white text-lg">×</button>
            </div>

            {/* Progress */}
            <div className="flex gap-1 mb-5">
              {[1,2,3,4].map(n => (
                <div key={n} className="flex-1 h-1 rounded-full" style={{ background: n <= addStep ? '#1D9E75' : 'rgba(255,255,255,0.08)' }} />
              ))}
            </div>

            {addStep === 1 && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Basic Info</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">First name *</label>
                    <input value={form.first_name} onChange={f('first_name')} className={inputCls} placeholder="Alex" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Last name *</label>
                    <input value={form.last_name} onChange={f('last_name')} className={inputCls} placeholder="Smith" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Preferred name</label>
                  <input value={form.preferred_name} onChange={f('preferred_name')} className={inputCls} placeholder="e.g. Al" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Position *</label>
                  <input value={form.position} onChange={f('position')} className={inputCls} placeholder="e.g. Warehouse Team Lead" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Department</label>
                    <input value={form.department} onChange={f('department')} className={inputCls} placeholder="e.g. Operations" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Start date</label>
                    <input type="date" value={form.start_date} onChange={f('start_date')} className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Employment type</label>
                  <select value={form.employment_type} onChange={f('employment_type')} className={inputCls}>
                    {Object.entries(EMP_TYPE_LABELS).map(([v, l]) => <option key={v} value={v} style={{ background: '#1a1a2e' }}>{l}</option>)}
                  </select>
                </div>
              </div>
            )}

            {addStep === 2 && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Contact</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Work email</label>
                    <input type="email" value={form.work_email} onChange={f('work_email')} className={inputCls} placeholder="alex@company.com" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Mobile</label>
                    <input value={form.mobile} onChange={f('mobile')} className={inputCls} placeholder="04xx xxx xxx" />
                  </div>
                </div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider pt-2">Emergency Contact</p>
                <input value={form.emergency_contact_name} onChange={f('emergency_contact_name')} className={inputCls} placeholder="Contact name" />
                <div className="grid grid-cols-2 gap-3">
                  <input value={form.emergency_contact_phone} onChange={f('emergency_contact_phone')} className={inputCls} placeholder="Phone" />
                  <input value={form.emergency_contact_relationship} onChange={f('emergency_contact_relationship')} className={inputCls} placeholder="Relationship (e.g. Spouse)" />
                </div>
              </div>
            )}

            {addStep === 3 && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Compensation</p>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Pay type</label>
                  <select value={form.pay_type} onChange={f('pay_type')} className={inputCls}>
                    {[['hourly','Hourly'],['salary','Salary'],['daily','Daily rate'],['contractor','Contractor']].map(([v,l]) => (
                      <option key={v} value={v} style={{ background: '#1a1a2e' }}>{l}</option>
                    ))}
                  </select>
                </div>
                {(form.pay_type === 'hourly' || form.pay_type === 'daily') ? (
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Rate (A$/hr)</label>
                    <input type="number" min={0} step={0.01} value={form.pay_rate_cents} onChange={f('pay_rate_cents')} className={inputCls} placeholder="e.g. 29.00" />
                    <p className="text-xs mt-1" style={{ color: '#4b5563' }}>Australian minimum wage 2025-26: A$24.10/hr · Casual loading +25%</p>
                  </div>
                ) : (
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Annual salary (A$)</label>
                    <input type="number" min={0} value={form.pay_per_annum_cents} onChange={f('pay_per_annum_cents')} className={inputCls} placeholder="e.g. 65000" />
                  </div>
                )}
                <div className="px-3 py-2 rounded-xl" style={{ background: 'rgba(29,158,117,0.08)', border: '1px solid rgba(29,158,117,0.15)' }}>
                  <p className="text-xs" style={{ color: '#1D9E75' }}>Superannuation rate: 11.5% (2026 rate). Required for all eligible employees.</p>
                </div>
              </div>
            )}

            {addStep === 4 && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Visa & Right to Work</p>
                <div className="flex items-center gap-3 px-3 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <input type="checkbox" id="rtw" checked={form.right_to_work_verified as boolean} onChange={f('right_to_work_verified')} className="w-4 h-4 accent-[#1D9E75]" />
                  <label htmlFor="rtw" className="text-sm text-white cursor-pointer">Right to work verified</label>
                </div>
                <p className="text-xs" style={{ color: '#6b7280' }}>Required by Australian law. Verify passport, visa grant notice, or citizenship certificate.</p>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Visa / Residency status</label>
                  <select value={form.visa_type} onChange={f('visa_type')} className={inputCls}>
                    <option value="" style={{ background: '#1a1a2e' }}>Select…</option>
                    {['Australian Citizen','Permanent Resident','Subclass 482 (TSS)','Subclass 485 (Graduate)','Subclass 417 (Working Holiday)','Subclass 462 (Work & Holiday)','Subclass 500 (Student)','Subclass 186 (ENS)','Subclass 189 (SkillSelect)','Other'].map(v => (
                      <option key={v} value={v} style={{ background: '#1a1a2e' }}>{v}</option>
                    ))}
                  </select>
                </div>
                {form.visa_type && form.visa_type !== 'Australian Citizen' && form.visa_type !== 'Permanent Resident' && (
                  <>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Visa expiry date</label>
                      <input type="date" value={form.visa_expiry_date} onChange={f('visa_expiry_date')} className={inputCls} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Work restrictions</label>
                      <input value={form.visa_work_restrictions} onChange={f('visa_work_restrictions')} className={inputCls} placeholder="e.g. 40 hours per fortnight during semester" />
                    </div>
                    {(form.visa_type?.includes('417') || form.visa_type?.includes('462')) && (
                      <div className="px-3 py-2 rounded-xl" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                        <p className="text-xs" style={{ color: '#f59e0b' }}>Working Holiday visa holders are generally limited to 6 months with any one employer. Confirm conditions with a migration agent.</p>
                      </div>
                    )}
                  </>
                )}
                {addError && <p className="text-xs text-red-400 mt-1">{addError}</p>}
              </div>
            )}

            <div className="flex gap-2 mt-5">
              {addStep > 1 && (
                <button onClick={() => setAddStep(s => s - 1)} className="flex-1 py-2 rounded-xl text-sm" style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}>Back</button>
              )}
              {addStep < 4 ? (
                <button onClick={() => {
                  if (addStep === 1 && (!form.first_name || !form.last_name || !form.position)) {
                    setAddError('First name, last name, and position are required.');
                    return;
                  }
                  setAddError('');
                  setAddStep(s => s + 1);
                }} className="flex-1 py-2 rounded-xl text-sm font-medium text-white" style={{ background: '#1D9E75' }}>Next</button>
              ) : (
                <button onClick={saveStaff} disabled={saving} className="flex-1 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40" style={{ background: '#1D9E75' }}>
                  {saving ? 'Saving…' : 'Add team member'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
