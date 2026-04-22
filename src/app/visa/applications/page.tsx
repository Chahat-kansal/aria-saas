'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Application {
  id: string; client_id: string; visa_type: string; application_number: string;
  lodgement_date: string; status: string; expected_decision: string; outcome: string; notes: string;
  visa_clients?: { full_name: string };
}

const STATUSES = ['not_started', 'in_progress', 'lodged', 'awaiting_decision', 'approved', 'refused'];
const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not started', in_progress: 'In progress', lodged: 'Lodged',
  awaiting_decision: 'Awaiting decision', approved: 'Approved', refused: 'Refused',
};
const STATUS_COLORS: Record<string, [string, string]> = {
  not_started:       ['rgba(255,255,255,.4)', 'rgba(255,255,255,.05)'],
  in_progress:       ['#c4c0f7', 'rgba(127,119,221,.12)'],
  lodged:            ['#fbbf24', 'rgba(251,191,36,.12)'],
  awaiting_decision: ['#60a5fa', 'rgba(96,165,250,.12)'],
  approved:          ['#34d399', 'rgba(52,211,153,.12)'],
  refused:           ['#f87171', 'rgba(248,113,113,.12)'],
};

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase.from('visa_applications')
      .select('*, visa_clients(full_name)')
      .eq('agent_id', session.user.id)
      .order('created_at', { ascending: false });
    setApps(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function updateStatus(id: string, status: string) {
    setUpdating(id);
    await supabase.from('visa_applications').update({ status }).eq('id', id);
    setApps(a => a.map(app => app.id === id ? { ...app, status } : app));
    setUpdating(null);
  }

  function daysSince(d: string) {
    if (!d) return null;
    return Math.floor((Date.now() - new Date(d).getTime()) / 864e5);
  }

  const byStatus: Record<string, Application[]> = {};
  STATUSES.forEach(s => { byStatus[s] = apps.filter(a => a.status === s); });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Applications</h1>
        <p className="text-xs text-[rgba(255,255,255,.4)] mt-0.5">{apps.length} total applications</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 rounded-full border-2 border-[#7F77DD] border-t-transparent animate-spin" />
        </div>
      ) : apps.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-sm text-[rgba(255,255,255,.25)]">No applications yet</p>
          <p className="text-xs text-[rgba(255,255,255,.2)] mt-1">Add clients and create applications to track them here</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {STATUSES.map(status => {
            const [col] = STATUS_COLORS[status];
            return (
              <div key={status} className="flex flex-col gap-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: col }}>
                    {STATUS_LABELS[status]}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 text-[rgba(255,255,255,.35)]">
                    {byStatus[status].length}
                  </span>
                </div>
                {byStatus[status].map(app => {
                  const ds = daysSince(app.lodgement_date);
                  return (
                    <div key={app.id} className="rounded-xl p-3" style={{ background: '#111118', border: '1px solid rgba(255,255,255,.07)' }}>
                      <p className="text-xs font-medium text-white leading-snug mb-1">
                        {app.visa_clients?.full_name ?? 'Unknown client'}
                      </p>
                      {app.visa_type && (
                        <p className="text-[10px] text-[rgba(255,255,255,.4)] mb-2">{app.visa_type}</p>
                      )}
                      {app.application_number && (
                        <p className="text-[10px] text-[rgba(255,255,255,.3)] font-mono mb-2">{app.application_number}</p>
                      )}
                      {ds !== null && (
                        <p className="text-[10px] text-[rgba(255,255,255,.3)] mb-2">{ds}d since lodged</p>
                      )}
                      <select value={app.status}
                        onChange={e => updateStatus(app.id, e.target.value)}
                        disabled={updating === app.id}
                        className="w-full text-[10px] rounded-lg px-2 py-1.5 outline-none disabled:opacity-50"
                        style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.6)', border: '1px solid rgba(255,255,255,.08)' }}>
                        {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}