'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import { supabase } from '@/lib/supabase';

interface AuditLog {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  'visa_client.viewed':       { label: 'Client viewed',     color: 'text-blue-400 bg-blue-400/10' },
  'visa_client.created':      { label: 'Client created',    color: 'text-[#1D9E75] bg-[rgba(29,158,117,0.1)]' },
  'visa_client.updated':      { label: 'Client updated',    color: 'text-amber-400 bg-amber-400/10' },
  'visa_client.deleted':      { label: 'Client deleted',    color: 'text-red-400 bg-red-400/10' },
  'visa_document.uploaded':   { label: 'Doc uploaded',      color: 'text-[#1D9E75] bg-[rgba(29,158,117,0.1)]' },
  'visa_document.downloaded': { label: 'Doc downloaded',    color: 'text-blue-400 bg-blue-400/10' },
  'visa_document.deleted':    { label: 'Doc deleted',       color: 'text-red-400 bg-red-400/10' },
  'business.switched':        { label: 'Business switch',   color: 'text-purple-400 bg-purple-400/10' },
  'auth.login':               { label: 'Login',             color: 'text-[rgba(255,255,255,0.5)] bg-[rgba(255,255,255,0.06)]' },
  'auth.logout':              { label: 'Logout',            color: 'text-[rgba(255,255,255,0.5)] bg-[rgba(255,255,255,0.06)]' },
  'data.exported':            { label: 'Data export',       color: 'text-amber-400 bg-amber-400/10' },
  'data.deletion_requested':  { label: 'Deletion request',  color: 'text-red-400 bg-red-400/10' },
};

const ACTION_TYPES = Object.keys(ACTION_LABELS);

export default function AuditLogPage() {
  const { business } = useBusinessContext();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('');
  const [filterDate, setFilterDate] = useState('');

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);

    let query = supabase
      .from('audit_logs')
      .select('*')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .limit(500);

    if (filterAction) query = query.eq('action', filterAction);
    if (filterDate) query = query.gte('created_at', new Date(filterDate).toISOString());

    const { data } = await query;
    setLogs((data ?? []) as AuditLog[]);
    setLoading(false);
  }, [business?.id, filterAction, filterDate]);

  useEffect(() => { load(); }, [load]);

  function exportCsv() {
    if (logs.length === 0) return;
    const header = ['Timestamp', 'Action', 'Resource Type', 'Resource ID', 'IP Address', 'User Agent'].join(',');
    const rows = logs.map(l => [
      new Date(l.created_at).toLocaleString('en-AU'),
      l.action,
      l.resource_type,
      l.resource_id ?? '',
      l.ip_address ?? '',
      `"${(l.user_agent ?? '').replace(/"/g, '""')}"`,
    ].join(','));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `aria-audit-log-${business?.id}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#0d0d14] min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold text-white mb-1">Audit Log</h1>
            <p className="text-sm text-[rgba(255,255,255,0.4)]">
              All data access and changes for compliance reporting. Required by MARA Code of Conduct.
            </p>
          </div>
          <button
            onClick={exportCsv}
            disabled={logs.length === 0}
            className="text-[12px] font-semibold px-4 py-2 rounded-xl bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.7)] hover:text-white hover:bg-[rgba(255,255,255,0.09)] transition-colors disabled:opacity-40"
          >
            Export CSV
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-5">
          <select
            value={filterAction}
            onChange={e => setFilterAction(e.target.value)}
            className="text-[12px] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.08)] rounded-xl px-3 py-2 text-[rgba(255,255,255,0.7)] outline-none"
          >
            <option value="">All actions</option>
            {ACTION_TYPES.map(a => (
              <option key={a} value={a}>{ACTION_LABELS[a]?.label ?? a}</option>
            ))}
          </select>
          <input
            type="date"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            className="text-[12px] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.08)] rounded-xl px-3 py-2 text-[rgba(255,255,255,0.7)] outline-none"
          />
          {(filterAction || filterDate) && (
            <button
              onClick={() => { setFilterAction(''); setFilterDate(''); }}
              className="text-[12px] text-[rgba(255,255,255,0.4)] hover:text-white transition-colors px-2"
            >
              Clear
            </button>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 rounded-full border-2 border-[#1D9E75] border-t-transparent animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16 text-[rgba(255,255,255,0.3)] text-sm">
            No audit events found.
          </div>
        ) : (
          <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.05)]">
                  {['Timestamp', 'Action', 'Resource', 'Resource ID', 'IP Address'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-[rgba(255,255,255,0.3)] uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => {
                  const meta = ACTION_LABELS[log.action] ?? { label: log.action, color: 'text-[rgba(255,255,255,0.4)] bg-[rgba(255,255,255,0.05)]' };
                  return (
                    <tr
                      key={log.id}
                      className={`border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)] transition-colors ${
                        i === logs.length - 1 ? 'border-0' : ''
                      }`}
                    >
                      <td className="px-4 py-3 text-[11px] text-[rgba(255,255,255,0.4)] whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('en-AU', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${meta.color}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[11px] text-[rgba(255,255,255,0.5)] capitalize">
                        {log.resource_type.replace('_', ' ')}
                      </td>
                      <td className="px-4 py-3 text-[10px] text-[rgba(255,255,255,0.3)] font-mono">
                        {log.resource_id ? log.resource_id.slice(0, 8) + '…' : '—'}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-[rgba(255,255,255,0.3)]">
                        {log.ip_address ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}