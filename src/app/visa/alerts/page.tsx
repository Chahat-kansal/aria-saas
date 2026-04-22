'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Alert {
  id: string; title: string; description: string; source_url: string;
  visa_classes_affected: string[]; severity: string; affected_client_ids: string[];
  is_read: boolean; detected_at: string;
}

const SEV_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  critical: { label: 'Critical', color: '#f87171', bg: 'rgba(248,113,113,.12)', dot: 'bg-red-400 animate-pulse' },
  high:     { label: 'High',     color: '#fb923c', bg: 'rgba(251,146,60,.12)',  dot: 'bg-orange-400' },
  medium:   { label: 'Medium',   color: '#fbbf24', bg: 'rgba(251,191,36,.12)',  dot: 'bg-amber-400' },
  low:      { label: 'Low',      color: 'rgba(255,255,255,.4)', bg: 'rgba(255,255,255,.05)', dot: 'bg-white/30' },
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSev, setFilterSev] = useState('');
  const [filterRead, setFilterRead] = useState('unread');
  const [marking, setMarking] = useState<string | null>(null);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase.from('immigration_alerts').select('*')
      .eq('agent_id', session.user.id)
      .order('detected_at', { ascending: false });
    setAlerts(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function markRead(id: string) {
    setMarking(id);
    await supabase.from('immigration_alerts').update({ is_read: true }).eq('id', id);
    setAlerts(a => a.map(x => x.id === id ? { ...x, is_read: true } : x));
    setMarking(null);
  }

  async function markAllRead() {
    const ids = alerts.filter(a => !a.is_read).map(a => a.id);
    if (!ids.length) return;
    await supabase.from('immigration_alerts').update({ is_read: true }).in('id', ids);
    setAlerts(a => a.map(x => ({ ...x, is_read: true })));
  }

  const filtered = alerts.filter(a => {
    const ms = !filterSev || a.severity === filterSev;
    const mr = filterRead === 'all' || (filterRead === 'unread' && !a.is_read) || (filterRead === 'read' && a.is_read);
    return ms && mr;
  });

  const unreadCount = alerts.filter(a => !a.is_read).length;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Live alerts</h1>
          <p className="text-xs text-[rgba(255,255,255,.4)] mt-0.5">{unreadCount} unread · {alerts.length} total</p>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead}
            className="text-xs text-[rgba(255,255,255,.45)] hover:text-white border border-white/10 px-3 py-2 rounded-xl transition-colors">
            Mark all read
          </button>
        )}
      </div>

      <div className="flex gap-3 mb-5">
        <select value={filterSev} onChange={e => setFilterSev(e.target.value)}
          className="bg-[#111118] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-[rgba(255,255,255,.7)] outline-none">
          <option value="">All severities</option>
          {Object.entries(SEV_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterRead} onChange={e => setFilterRead(e.target.value)}
          className="bg-[#111118] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-[rgba(255,255,255,.7)] outline-none">
          <option value="unread">Unread</option>
          <option value="read">Read</option>
          <option value="all">All</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 rounded-full border-2 border-[#7F77DD] border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-3xl mb-3">🔔</p>
          <p className="text-sm text-[rgba(255,255,255,.3)]">No alerts</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(alert => {
            const sev = SEV_CONFIG[alert.severity] ?? SEV_CONFIG.medium;
            return (
              <div key={alert.id} className="rounded-2xl p-5 transition-opacity"
                style={{ background: '#111118', border: `1px solid ${alert.is_read ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.1)'}`, opacity: alert.is_read ? 0.65 : 1 }}>
                <div className="flex items-start gap-4">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1 ${sev.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <p className="text-sm font-medium text-white leading-snug">{alert.title}</p>
                      <span className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0" style={{ color: sev.color, background: sev.bg }}>
                        {sev.label}
                      </span>
                    </div>
                    {alert.description && (
                      <p className="text-xs text-[rgba(255,255,255,.5)] leading-relaxed mb-2">{alert.description}</p>
                    )}
                    {alert.visa_classes_affected?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {alert.visa_classes_affected.map((v: string) => (
                          <span key={v} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-[rgba(255,255,255,.5)]">
                            Subclass {v}
                          </span>
                        ))}
                      </div>
                    )}
                    {alert.affected_client_ids?.length > 0 && (
                      <p className="text-[11px] text-red-400 mb-2">
                        ⚠ {alert.affected_client_ids.length} of your clients affected
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-[10px] text-[rgba(255,255,255,.25)]">
                        {new Date(alert.detected_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      {alert.source_url && (
                        <a href={alert.source_url} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-[#7F77DD] hover:underline">
                          Source →
                        </a>
                      )}
                      {!alert.is_read && (
                        <button onClick={() => markRead(alert.id)} disabled={marking === alert.id}
                          className="text-[10px] text-[rgba(255,255,255,.35)] hover:text-white transition-colors disabled:opacity-50">
                          {marking === alert.id ? 'Marking…' : 'Mark read'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}