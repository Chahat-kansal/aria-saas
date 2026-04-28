'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface StaffFull {
  id: string; first_name: string; last_name: string; preferred_name: string | null;
  profile_photo_url: string | null; position: string; department: string | null;
  employment_type: string; status: string; start_date: string | null; end_date: string | null;
  date_of_birth: string | null; gender: string | null;
  personal_email: string | null; work_email: string | null; mobile: string | null;
  emergency_contact_name: string | null; emergency_contact_phone: string | null; emergency_contact_relationship: string | null;
  pay_type: string; pay_rate_cents: number | null; pay_per_annum_cents: number | null; pay_frequency: string;
  superannuation_rate: number; tax_file_number: string | null;
  bank_account_name: string | null; bank_bsb: string | null; bank_account_number: string | null;
  right_to_work_verified: boolean; right_to_work_verified_date: string | null;
  visa_type: string | null; visa_subclass: string | null; visa_expiry_date: string | null;
  visa_work_restrictions: string | null; passport_country: string | null; passport_expiry_date: string | null;
  notes: string | null; business_id: string;
}
interface StaffDocument { id: string; document_type: string; document_name: string; file_url: string | null; expiry_date: string | null; uploaded_at: string; notes: string | null; }
interface LeaveRecord { id: string; leave_type: string; start_date: string; end_date: string; days_taken: number | null; status: string; notes: string | null; }

const TABS = ['Personal', 'Employment', 'Compensation', 'Visa & Right to Work', 'Documents', 'Leave'] as const;

function daysUntil(date: string | null) {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

function MaskedField({ value, label }: { value: string | null; label: string }) {
  const [revealed, setRevealed] = useState(false);
  if (!value) return <span style={{ color: '#4b5563' }}>Not recorded</span>;
  return (
    <div className="flex items-center gap-2">
      <span className="text-white font-mono text-sm">{revealed ? value : '●●●-●●●-●●●'}</span>
      <button onClick={() => setRevealed(r => !r)} className="text-xs underline" style={{ color: '#1D9E75' }}>
        {revealed ? 'Hide' : 'Reveal'}
      </button>
    </div>
  );
}

export default function StaffProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { business } = useBusinessContext();
  const [staff, setStaff] = useState<StaffFull | null>(null);
  const [documents, setDocuments] = useState<StaffDocument[]>([]);
  const [leave, setLeave] = useState<LeaveRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<typeof TABS[number]>('Personal');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<StaffFull>>({});
  const [saving, setSaving] = useState(false);
  const [visaInsight, setVisaInsight] = useState('');
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [showAddLeave, setShowAddLeave] = useState(false);
  const [docForm, setDocForm] = useState({ document_type: 'contract', document_name: '', expiry_date: '', notes: '', file_url: '' });
  const [leaveForm, setLeaveForm] = useState({ leave_type: 'annual', start_date: '', end_date: '', notes: '', status: 'pending' });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/staff/${id}`).then(r => r.json()).catch(() => ({}));
    if (res.staff) {
      setStaff(res.staff);
      setEditForm(res.staff);
      setDocuments(res.documents ?? []);
      setLeave(res.leave ?? []);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!staff) return;
    setSaving(true);
    const res = await fetch(`/api/staff/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    }).then(r => r.json());
    setSaving(false);
    if (res.staff) { setStaff(res.staff); setEditing(false); }
  }

  async function getVisaInsight() {
    if (!business?.id || !staff) return;
    setLoadingInsight(true);
    const res = await fetch('/api/aria/staff-visa-insight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_id: id, business_id: business.id }),
    }).then(r => r.json()).catch(() => ({}));
    setVisaInsight(res.insight ?? '');
    setLoadingInsight(false);
  }

  async function addDocument() {
    if (!staff) return;
    await fetch('/api/staff/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...docForm, staff_id: id, business_id: staff.business_id }),
    });
    setShowAddDoc(false);
    setDocForm({ document_type: 'contract', document_name: '', expiry_date: '', notes: '', file_url: '' });
    load();
  }

  async function addLeave() {
    if (!staff) return;
    await fetch('/api/staff/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...leaveForm, staff_id: id, business_id: staff.business_id }),
    });
    setShowAddLeave(false);
    setLeaveForm({ leave_type: 'annual', start_date: '', end_date: '', notes: '', status: 'pending' });
    load();
  }

  async function terminate() {
    if (!confirm('Mark this staff member as terminated? This is a soft delete.')) return;
    await fetch(`/api/staff/${id}`, { method: 'DELETE' });
    router.push('/dashboard/staff');
  }

  const ef = (k: keyof StaffFull) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setEditForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  const inputCls = 'w-full px-3 py-2 rounded-xl text-sm text-white outline-none bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.08)] focus:border-[rgba(29,158,117,0.5)]';

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto animate-pulse space-y-4">
        <div className="h-8 bg-[rgba(255,255,255,0.06)] rounded-xl w-48" />
        <div className="h-24 bg-[rgba(255,255,255,0.04)] rounded-xl" />
        <div className="h-64 bg-[rgba(255,255,255,0.04)] rounded-xl" />
      </div>
    );
  }
  if (!staff) return <div className="p-6 text-center" style={{ color: '#6b7280' }}>Staff member not found.</div>;

  const displayName = staff.preferred_name || `${staff.first_name} ${staff.last_name}`;
  const initials = displayName.split(' ').slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? '').join('');
  const visaDays = daysUntil(staff.visa_expiry_date);
  const age = staff.date_of_birth ? Math.floor((Date.now() - new Date(staff.date_of_birth).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) : null;

  const STATUS_COLORS: Record<string, string> = {
    active: 'bg-green-900/30 text-green-400',
    on_leave: 'bg-blue-900/30 text-blue-400',
    terminated: 'bg-red-900/30 text-red-400',
    probation: 'bg-yellow-900/30 text-yellow-400',
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Back */}
      <button onClick={() => router.push('/dashboard/staff')} className="text-xs mb-4 flex items-center gap-1 hover:text-white transition-colors" style={{ color: '#6b7280' }}>← Team</button>

      {/* Profile header */}
      <div className="rounded-xl p-5 mb-6" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            {staff.profile_photo_url ? (
              <img src={staff.profile_photo_url} alt={displayName} className="w-16 h-16 rounded-full object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-[rgba(29,158,117,0.2)] border border-[rgba(29,158,117,0.3)] flex items-center justify-center text-xl font-semibold flex-shrink-0" style={{ color: '#1D9E75' }}>{initials}</div>
            )}
            <div>
              <h1 className="text-xl font-semibold text-white">{displayName}</h1>
              <p style={{ color: '#9ca3af' }} className="text-sm">{staff.position}{staff.department ? ` · ${staff.department}` : ''}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[staff.status] ?? 'bg-gray-800 text-gray-400'}`}>{staff.status.replace('_', ' ')}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[rgba(255,255,255,0.06)] text-gray-400 capitalize">{staff.employment_type.replace('_', '-')}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button onClick={() => { setEditing(true); setEditForm(staff); }} className="px-3 py-1.5 rounded-xl text-xs" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>Edit</button>
            <button onClick={() => setShowAddDoc(true)} className="px-3 py-1.5 rounded-xl text-xs" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>+ Doc</button>
            <button onClick={() => setShowAddLeave(true)} className="px-3 py-1.5 rounded-xl text-xs" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>+ Leave</button>
            {staff.status !== 'terminated' && (
              <button onClick={terminate} className="px-3 py-1.5 rounded-xl text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>Terminate</button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-3 py-2 rounded-xl text-xs whitespace-nowrap transition-colors"
            style={tab === t ? { background: '#1D9E75', color: '#fff' } : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
        {tab === 'Personal' && (
          <div className="space-y-4">
            <Row label="Full name">{`${staff.first_name} ${staff.last_name}`}{staff.preferred_name ? ` (${staff.preferred_name})` : ''}</Row>
            <Row label="Date of birth">{staff.date_of_birth ? `${staff.date_of_birth}${age ? ` — ${age} years old` : ''}` : '—'}</Row>
            <Row label="Gender">{staff.gender ?? '—'}</Row>
            <Row label="Personal email">{staff.personal_email ?? '—'}</Row>
            <Row label="Mobile">{staff.mobile ?? '—'}</Row>
            <div className="border-t border-[rgba(255,255,255,0.06)] pt-4 mt-4">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Emergency Contact</p>
              <Row label="Name">{staff.emergency_contact_name ?? '—'}</Row>
              <Row label="Phone">{staff.emergency_contact_phone ?? '—'}</Row>
              <Row label="Relationship">{staff.emergency_contact_relationship ?? '—'}</Row>
            </div>
            {staff.notes && <Row label="Notes">{staff.notes}</Row>}
          </div>
        )}

        {tab === 'Employment' && (
          <div className="space-y-4">
            <Row label="Position">{staff.position}</Row>
            <Row label="Department">{staff.department ?? '—'}</Row>
            <Row label="Employment type" className="capitalize">{staff.employment_type.replace('_', ' ')}</Row>
            <Row label="Status" className="capitalize">{staff.status.replace('_', ' ')}</Row>
            <Row label="Start date">{staff.start_date ?? '—'}</Row>
            {staff.end_date && <Row label="End date">{staff.end_date}</Row>}
          </div>
        )}

        {tab === 'Compensation' && (
          <div className="space-y-4">
            <Row label="Pay type" className="capitalize">{staff.pay_type}</Row>
            {staff.pay_type === 'hourly' || staff.pay_type === 'daily' ? (
              <>
                <Row label="Rate">A${((staff.pay_rate_cents ?? 0) / 100).toFixed(2)}/hr</Row>
                <Row label="Est. annual">{staff.pay_rate_cents ? `A$${((staff.pay_rate_cents / 100) * 38 * 52).toFixed(0)}` : '—'}</Row>
              </>
            ) : (
              <>
                <Row label="Annual salary">A${((staff.pay_per_annum_cents ?? 0) / 100).toLocaleString()}</Row>
                <Row label="Est. fortnightly">{staff.pay_per_annum_cents ? `A$${((staff.pay_per_annum_cents / 100) / 26).toFixed(0)}` : '—'}</Row>
              </>
            )}
            <Row label="Pay frequency" className="capitalize">{staff.pay_frequency}</Row>
            <Row label="Superannuation">{staff.superannuation_rate}% · est. A${staff.pay_per_annum_cents ? ((staff.pay_per_annum_cents / 100) * (staff.superannuation_rate / 100)).toFixed(0) : staff.pay_rate_cents ? ((staff.pay_rate_cents / 100 * 38 * 52) * (staff.superannuation_rate / 100)).toFixed(0) : '—'}/yr</Row>
            <div className="border-t border-[rgba(255,255,255,0.06)] pt-4">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Sensitive — read carefully before revealing</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: '#6b7280' }}>Tax File Number</span>
                  <MaskedField value={staff.tax_file_number} label="TFN" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: '#6b7280' }}>Bank account name</span>
                  <span className="text-sm text-white">{staff.bank_account_name ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: '#6b7280' }}>BSB</span>
                  <MaskedField value={staff.bank_bsb} label="BSB" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: '#6b7280' }}>Account number</span>
                  <MaskedField value={staff.bank_account_number} label="Account" />
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'Visa & Right to Work' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: staff.right_to_work_verified ? 'rgba(29,158,117,0.1)' : 'rgba(245,158,11,0.08)', border: `1px solid ${staff.right_to_work_verified ? 'rgba(29,158,117,0.2)' : 'rgba(245,158,11,0.2)'}` }}>
              <div>
                <p className="text-sm font-medium" style={{ color: staff.right_to_work_verified ? '#1D9E75' : '#f59e0b' }}>
                  {staff.right_to_work_verified ? '✓ Right to work verified' : '⚠ Right to work NOT verified'}
                </p>
                {staff.right_to_work_verified_date && <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>Verified: {staff.right_to_work_verified_date}</p>}
              </div>
            </div>
            <p className="text-xs" style={{ color: '#6b7280' }}>Required by Australian law. Employers must verify all staff have the right to work before commencement.</p>

            <Row label="Visa / Residency">{staff.visa_type ?? '—'}</Row>
            {staff.visa_subclass && <Row label="Subclass">{staff.visa_subclass}</Row>}
            {staff.visa_expiry_date && (
              <div className="flex items-center justify-between py-2">
                <span className="text-xs" style={{ color: '#6b7280' }}>Visa expiry</span>
                <div className="text-right">
                  <p className="text-sm text-white">{staff.visa_expiry_date}</p>
                  {visaDays !== null && (
                    <p className="text-xs font-medium" style={{ color: visaDays < 0 ? '#ef4444' : visaDays < 30 ? '#ef4444' : visaDays < 90 ? '#f59e0b' : '#1D9E75' }}>
                      {visaDays < 0 ? `Expired ${Math.abs(visaDays)} days ago` : `${visaDays} days remaining`}
                    </p>
                  )}
                </div>
              </div>
            )}
            {staff.visa_work_restrictions && <Row label="Work restrictions">{staff.visa_work_restrictions}</Row>}
            <Row label="Passport country">{staff.passport_country ?? '—'}</Row>
            {staff.passport_expiry_date && <Row label="Passport expiry">{staff.passport_expiry_date}</Row>}

            {/* Aria visa insight */}
            <div className="mt-4 pt-4 border-t border-[rgba(255,255,255,0.06)]">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium" style={{ color: '#1D9E75' }}>✦ Aria Visa Insight</p>
                <button onClick={getVisaInsight} disabled={loadingInsight} className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-40" style={{ background: 'rgba(29,158,117,0.15)', color: '#1D9E75' }}>
                  {loadingInsight ? 'Analysing…' : visaInsight ? 'Refresh' : 'Get insight'}
                </button>
              </div>
              {visaInsight ? (
                <p className="text-sm leading-relaxed" style={{ color: '#9ca3af' }}>{visaInsight}</p>
              ) : (
                <p className="text-xs" style={{ color: '#4b5563' }}>Click "Get insight" for Aria's analysis of this staff member's visa situation.</p>
              )}
            </div>
          </div>
        )}

        {tab === 'Documents' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-white">Documents ({documents.length})</p>
              <button onClick={() => setShowAddDoc(true)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: '#1D9E75', color: '#fff' }}>+ Upload</button>
            </div>
            {documents.length === 0 ? (
              <div className="rounded-xl p-8 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="text-3xl mb-2">📄</div>
                <p className="text-sm text-white mb-1">No documents yet</p>
                <p className="text-xs" style={{ color: '#6b7280' }}>Upload contracts, visa copies, certifications, and more.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map(doc => {
                  const expDays = daysUntil(doc.expiry_date);
                  return (
                    <div key={doc.id} className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div>
                        <p className="text-sm text-white">{doc.document_name}</p>
                        <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
                          {doc.document_type.replace('_', ' ')} · {new Date(doc.uploaded_at).toLocaleDateString()}
                          {doc.expiry_date && ` · Expires ${doc.expiry_date}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {expDays !== null && expDays < 30 && (
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: expDays < 0 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', color: expDays < 0 ? '#ef4444' : '#f59e0b' }}>
                            {expDays < 0 ? 'Expired' : `${expDays}d`}
                          </span>
                        )}
                        {doc.file_url && <a href={doc.file_url} target="_blank" rel="noreferrer" className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>View</a>}
                        <button onClick={async () => { await fetch(`/api/staff/documents?id=${doc.id}`, { method: 'DELETE' }); load(); }}
                          className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>×</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'Leave' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-white">Leave history ({leave.length})</p>
              <button onClick={() => setShowAddLeave(true)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: '#1D9E75', color: '#fff' }}>+ Record leave</button>
            </div>
            {leave.length === 0 ? (
              <div className="rounded-xl p-8 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="text-3xl mb-2">🌴</div>
                <p className="text-sm text-white mb-1">No leave recorded</p>
                <p className="text-xs" style={{ color: '#6b7280' }}>Record annual, sick, and other leave here.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    {['Type', 'From', 'To', 'Days', 'Status', 'Notes'].map(h => (
                      <th key={h} className="pb-2 text-left text-xs font-medium" style={{ color: '#6b7280' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leave.map(l => (
                    <tr key={l.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td className="py-2.5 text-white capitalize">{l.leave_type}</td>
                      <td className="py-2.5" style={{ color: '#9ca3af' }}>{l.start_date}</td>
                      <td className="py-2.5" style={{ color: '#9ca3af' }}>{l.end_date}</td>
                      <td className="py-2.5 text-white">{l.days_taken ?? '—'}</td>
                      <td className="py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${l.status === 'approved' ? 'bg-green-900/30 text-green-400' : l.status === 'rejected' ? 'bg-red-900/30 text-red-400' : 'bg-yellow-900/30 text-yellow-400'}`}>
                          {l.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-xs" style={{ color: '#6b7280' }}>{l.notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Edit slide-in panel */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center md:justify-end z-50">
          <div className="bg-[#13131a] w-full md:w-[480px] md:h-full overflow-y-auto p-6 rounded-t-2xl md:rounded-none border-t md:border-l border-[rgba(255,255,255,0.1)]">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-semibold">Edit {displayName}</h3>
              <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-white">×</button>
            </div>
            <div className="space-y-3">
              <Section label="Basic">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="First name" value={editForm.first_name ?? ''} onChange={ef('first_name')} />
                  <Field label="Last name" value={editForm.last_name ?? ''} onChange={ef('last_name')} />
                </div>
                <Field label="Preferred name" value={editForm.preferred_name ?? ''} onChange={ef('preferred_name')} />
                <Field label="Position" value={editForm.position ?? ''} onChange={ef('position')} />
                <Field label="Department" value={editForm.department ?? ''} onChange={ef('department')} />
              </Section>
              <Section label="Contact">
                <Field label="Work email" type="email" value={editForm.work_email ?? ''} onChange={ef('work_email')} />
                <Field label="Mobile" value={editForm.mobile ?? ''} onChange={ef('mobile')} />
                <Field label="Personal email" type="email" value={editForm.personal_email ?? ''} onChange={ef('personal_email')} />
              </Section>
              <Section label="Employment">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Status</label>
                  <select value={editForm.status ?? 'active'} onChange={ef('status')} className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.08)]">
                    {['active','on_leave','probation','terminated'].map(s => <option key={s} value={s} style={{ background: '#1a1a2e' }}>{s.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <Field label="Start date" type="date" value={editForm.start_date ?? ''} onChange={ef('start_date')} />
              </Section>
              <Section label="Visa">
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="rtw_edit" checked={!!editForm.right_to_work_verified} onChange={ef('right_to_work_verified')} className="w-4 h-4 accent-[#1D9E75]" />
                  <label htmlFor="rtw_edit" className="text-sm text-white cursor-pointer">Right to work verified</label>
                </div>
                <Field label="Visa type" value={editForm.visa_type ?? ''} onChange={ef('visa_type')} />
                <Field label="Visa expiry" type="date" value={editForm.visa_expiry_date ?? ''} onChange={ef('visa_expiry_date')} />
                <Field label="Work restrictions" value={editForm.visa_work_restrictions ?? ''} onChange={ef('visa_work_restrictions')} />
              </Section>
              <Section label="Notes">
                <textarea value={editForm.notes ?? ''} onChange={ef('notes')} rows={3}
                  className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.08)]"
                  placeholder="Internal notes…" />
              </Section>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setEditing(false)} className="flex-1 py-2 rounded-xl text-sm" style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}>Cancel</button>
              <button onClick={save} disabled={saving} className="flex-1 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40" style={{ background: '#1D9E75' }}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Document Modal */}
      {showAddDoc && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#13131a] rounded-2xl p-6 w-full max-w-md border border-[rgba(255,255,255,0.1)]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Add document</h3>
              <button onClick={() => setShowAddDoc(false)} className="text-gray-400 hover:text-white">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Document type</label>
                <select value={docForm.document_type} onChange={e => setDocForm(p => ({ ...p, document_type: e.target.value }))} className={inputCls}>
                  {['contract','visa_copy','passport','certification','performance_review','right_to_work','tax_declaration','bank_details','other'].map(t => (
                    <option key={t} value={t} style={{ background: '#1a1a2e' }}>{t.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Document name *</label>
                <input value={docForm.document_name} onChange={e => setDocForm(p => ({ ...p, document_name: e.target.value }))} className={inputCls} placeholder="e.g. Employment contract 2024" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Expiry date (optional)</label>
                <input type="date" value={docForm.expiry_date} onChange={e => setDocForm(p => ({ ...p, expiry_date: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">File URL (optional)</label>
                <input value={docForm.file_url} onChange={e => setDocForm(p => ({ ...p, file_url: e.target.value }))} className={inputCls} placeholder="https://…" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowAddDoc(false)} className="flex-1 py-2 rounded-xl text-sm" style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}>Cancel</button>
              <button onClick={addDocument} disabled={!docForm.document_name} className="flex-1 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40" style={{ background: '#1D9E75' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Leave Modal */}
      {showAddLeave && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#13131a] rounded-2xl p-6 w-full max-w-md border border-[rgba(255,255,255,0.1)]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Record leave</h3>
              <button onClick={() => setShowAddLeave(false)} className="text-gray-400 hover:text-white">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Leave type</label>
                <select value={leaveForm.leave_type} onChange={e => setLeaveForm(p => ({ ...p, leave_type: e.target.value }))} className={inputCls}>
                  {['annual','sick','personal','parental','long_service','unpaid','compassionate','other'].map(t => (
                    <option key={t} value={t} style={{ background: '#1a1a2e' }}>{t.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">From *</label>
                  <input type="date" value={leaveForm.start_date} onChange={e => setLeaveForm(p => ({ ...p, start_date: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">To *</label>
                  <input type="date" value={leaveForm.end_date} onChange={e => setLeaveForm(p => ({ ...p, end_date: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Status</label>
                <select value={leaveForm.status} onChange={e => setLeaveForm(p => ({ ...p, status: e.target.value }))} className={inputCls}>
                  {['pending','approved','rejected'].map(s => <option key={s} value={s} style={{ background: '#1a1a2e' }}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Notes</label>
                <input value={leaveForm.notes} onChange={e => setLeaveForm(p => ({ ...p, notes: e.target.value }))} className={inputCls} placeholder="Optional notes" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowAddLeave(false)} className="flex-1 py-2 rounded-xl text-sm" style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}>Cancel</button>
              <button onClick={addLeave} disabled={!leaveForm.start_date || !leaveForm.end_date} className="flex-1 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40" style={{ background: '#1D9E75' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className="flex items-start justify-between py-2 border-b border-[rgba(255,255,255,0.04)] last:border-0">
      <span className="text-xs flex-shrink-0 w-36" style={{ color: '#6b7280' }}>{label}</span>
      <span className={`text-sm text-white text-right ${className}`}>{children}</span>
    </div>
  );
}
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">{label}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; type?: string }) {
  return (
    <div>
      <label className="text-xs text-gray-400 mb-1 block">{label}</label>
      <input type={type} value={value} onChange={onChange}
        className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.08)]" />
    </div>
  );
}
