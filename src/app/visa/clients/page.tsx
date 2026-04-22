'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface Client {
  id: string; full_name: string; email: string; phone: string; nationality: string;
  visa_type: string; application_status: string; lodgement_date: string;
  visa_expiry: string; passport_expiry: string; created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  approved: 'Approved', in_progress: 'In progress', lodged: 'Lodged',
  refused: 'Refused', not_started: 'Not started', bridging: 'Bridging',
};
const STATUS_COLORS: Record<string, [string, string]> = {
  approved:    ['#34d399', 'rgba(52,211,153,.12)'],
  in_progress: ['#c4c0f7', 'rgba(127,119,221,.12)'],
  lodged:      ['#fbbf24', 'rgba(251,191,36,.12)'],
  refused:     ['#f87171', 'rgba(248,113,113,.12)'],
  not_started: ['rgba(255,255,255,.35)', 'rgba(255,255,255,.05)'],
  bridging:    ['#60a5fa', 'rgba(96,165,250,.12)'],
};

function daysUntil(dateStr: string) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 864e5);
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterVisa, setFilterVisa] = useState('');
  const [selected, setSelected] = useState<Client | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase.from('visa_clients').select('*')
        .eq('agent_id', session.user.id).order('created_at', { ascending: false });
      setClients(data || []);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    const matchQ = !q || c.full_name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.visa_type?.includes(q);
    const matchS = !filterStatus || c.application_status === filterStatus;
    const matchV = !filterVisa || c.visa_type === filterVisa;
    return matchQ && matchS && matchV;
  });

  const visaTypes = [...new Set(clients.map(c => c.visa_type).filter(Boolean))];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">All clients</h1>
          <p className="text-xs text-[rgba(255,255,255,.4)] mt-0.5">{clients.length} total clients</p>
        </div>
        <Link href="/visa/clients/new"
          className="text-sm font-medium px-4 py-2 rounded-xl text-white transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg,#7F77DD,#5f57c0)' }}>
          + Add client
        </Link>
      </div>

      <div className="flex gap-3 mb-5">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search clients…"
          className="flex-1 bg-[#111118] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[rgba(255,255,255,.3)] outline-none focus:border-[#7F77DD]/50" />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-[#111118] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-[rgba(255,255,255,.7)] outline-none focus:border-[#7F77DD]/50">
          <option value="">All statuses</option>
          {Object.keys(STATUS_LABELS).map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <select value={filterVisa} onChange={e => setFilterVisa(e.target.value)}
          className="bg-[#111118] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-[rgba(255,255,255,.7)] outline-none focus:border-[#7F77DD]/50">
          <option value="">All visa types</option>
          {visaTypes.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 rounded-full border-2 border-[#7F77DD] border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,.07)' }}>
          <table className="w-full">
            <thead>
              <tr style={{ background: 'rgba(255,255,255,.03)', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                {['Client', 'Visa type', 'Status', 'Lodged', 'Expiry', 'Days left', ''].map(h => (
                  <th key={h} className="text-left text-[10px] uppercase tracking-wider text-[rgba(255,255,255,.3)] px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-sm text-[rgba(255,255,255,.25)] py-12">No clients found</td></tr>
              ) : filtered.map(c => {
                const days = daysUntil(c.visa_expiry);
                const [color, bg] = STATUS_COLORS[c.application_status] ?? STATUS_COLORS['not_started'];
                return (
                  <tr key={c.id} onClick={() => setSelected(c)} style={{ borderBottom: '1px solid rgba(255,255,255,.04)', cursor: 'pointer' }}
                    className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                          style={{ background: 'rgba(127,119,221,.2)', color: '#c4c0f7' }}>
                          {c.full_name[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm text-white font-medium">{c.full_name}</p>
                          <p className="text-[11px] text-[rgba(255,255,255,.35)]">{c.email || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-[rgba(255,255,255,.7)]">{c.visa_type || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] px-2 py-1 rounded-full" style={{ color, background: bg }}>
                        {STATUS_LABELS[c.application_status] ?? c.application_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-[rgba(255,255,255,.5)]">{c.lodgement_date || '—'}</td>
                    <td className="px-4 py-3 text-[11px] text-[rgba(255,255,255,.5)]">{c.visa_expiry || '—'}</td>
                    <td className="px-4 py-3">
                      {days !== null ? (
                        <span className={`text-[11px] font-medium ${days < 90 ? 'text-red-400' : days < 180 ? 'text-amber-400' : 'text-[rgba(255,255,255,.4)]'}`}>
                          {days < 0 ? 'Expired' : `${days}d`}
                        </span>
                      ) : <span className="text-[rgba(255,255,255,.25)] text-[11px]">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-[11px] text-[#7F77DD]">View →</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail panel */}
      {selected && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setSelected(null)}>
          <div className="flex-1 bg-black/50" />
          <div className="w-[420px] h-full overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}
            style={{ background: '#111118', borderLeft: '1px solid rgba(255,255,255,.08)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <h2 className="text-base font-semibold text-white">{selected.full_name}</h2>
              <button onClick={() => setSelected(null)} className="text-[rgba(255,255,255,.4)] hover:text-white text-lg">✕</button>
            </div>
            <div className="p-6 space-y-5 flex-1">
              <Section title="Personal">
                <Field label="Email" value={selected.email} />
                <Field label="Phone" value={selected.phone} />
                <Field label="Nationality" value={selected.nationality} />
                <Field label="Passport expiry" value={selected.passport_expiry} />
              </Section>
              <Section title="Visa">
                <Field label="Visa type" value={selected.visa_type} />
                <Field label="Status">
                  {(() => { const [c, b] = STATUS_COLORS[selected.application_status] ?? STATUS_COLORS['not_started'];
                    return <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ color: c, background: b }}>{STATUS_LABELS[selected.application_status] ?? selected.application_status}</span>; })()}
                </Field>
                <Field label="Lodgement date" value={selected.lodgement_date} />
                <Field label="Visa expiry" value={selected.visa_expiry} />
                {selected.visa_expiry && (
                  <Field label="Days remaining">
                    <span className={`text-sm font-medium ${(daysUntil(selected.visa_expiry) ?? 0) < 90 ? 'text-red-400' : 'text-[rgba(255,255,255,.7)]'}`}>
                      {daysUntil(selected.visa_expiry) ?? '—'}
                    </span>
                  </Field>
                )}
              </Section>
              <Section title="Created">
                <Field label="Added" value={new Date(selected.created_at).toLocaleDateString('en-AU')} />
              </Section>
            </div>
            <div className="px-6 pb-6">
              <Link href={`/visa/documents?client=${selected.id}`}
                className="w-full block text-center text-sm py-2.5 rounded-xl border border-[#7F77DD]/40 text-[#7F77DD] hover:bg-[#7F77DD]/10 transition-colors">
                View documents
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-widest text-[rgba(255,255,255,.25)] mb-3">{title}</p>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Field({ label, value, children }: { label: string; value?: string | null; children?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-[rgba(255,255,255,.4)] flex-shrink-0">{label}</span>
      {children ?? <span className="text-xs text-[rgba(255,255,255,.75)] text-right">{value || '—'}</span>}
    </div>
  );
}