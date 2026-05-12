'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import { AriaIntelligencePanel } from '@/components/dashboard/AriaIntelligencePanel';

interface LapsedCustomer { id: string; name: string; phone: string | null; last_visit: string | null; total_spend: number | null; }
interface Campaign { id: string; name: string | null; type: string; message: string | null; status: string | null; sms_sent: boolean | null; created_at: string; error: string | null; }

function daysAgo(date: string | null) {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

export default function WinbackPage() {
  const { business } = useBusinessContext();
  const [customers, setCustomers] = useState<LapsedCustomer[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number; noPhone: number } | null>(null);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const [custRes, campRes] = await Promise.all([
      fetch(`/api/customers?business_id=${business.id}&lapsed=60`).then(r => r.json()).catch(() => ({ customers: [] })),
      fetch(`/api/campaigns?business_id=${business.id}&type=winback`).then(r => r.json()).catch(() => ({ campaigns: [] })),
    ]);
    const lapsed: LapsedCustomer[] = custRes.customers ?? custRes.data ?? [];
    setCustomers(lapsed);
    setCampaigns(campRes.campaigns ?? campRes.data ?? []);
    // Pre-select all with phones
    const initSel: Record<string, boolean> = {};
    lapsed.forEach((c: LapsedCustomer) => { if (c.phone) initSel[c.id] = true; });
    setSelected(initSel);
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  async function generateMessage() {
    if (!business?.id) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/aria/winback-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id }),
      }).then(r => r.json());
      if (res.message) setMessage(res.message);
    } catch { /* keep existing */ }
    setGenerating(false);
  }

  // Auto-generate message on load
  useEffect(() => { if (business?.id && !message) generateMessage(); }, [business?.id]);

  async function sendCampaign() {
    if (!business?.id || !message.trim()) return;
    const targets = customers.filter(c => selected[c.id] && c.phone);
    if (targets.length === 0) return;
    const confirmed = window.confirm(`Send this SMS to ${targets.length} customer${targets.length > 1 ? 's' : ''}?\n\n"${message.slice(0, 100)}${message.length > 100 ? '…' : ''}"\n\nThis will send real SMS messages that cannot be undone.`);
    if (!confirmed) return;
    setSending(true);
    setSendResult(null);
    const res = await fetch('/api/aria/winback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: business.id,
        customer_ids: targets.map(c => c.id),
        message,
      }),
    }).then(r => r.json()).catch(() => ({ sent: 0, errors: 0 }));
    setSendResult({ sent: res.sent ?? 0, failed: res.errors ?? 0, noPhone: customers.filter(c => selected[c.id] && !c.phone).length });
    setSending(false);
    load();
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;
  const withPhone = customers.filter(c => selected[c.id] && c.phone).length;
  const stats = {
    lapsed: customers.length,
    atRisk: customers.filter(c => { const d = daysAgo(c.last_visit); return d !== null && d >= 30 && d < 60; }).length,
    wonBackThisMonth: campaigns.filter(c => c.created_at && new Date(c.created_at) > new Date(Date.now() - 30 * 86400000)).length,
    lastCampaign: campaigns[0]?.created_at ? new Date(campaigns[0].created_at).toLocaleDateString() : 'Never',
  };

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto animate-pulse space-y-4">
        <div className="h-8 bg-[rgba(255,255,255,0.06)] rounded-xl w-64" />
        <div className="grid grid-cols-4 gap-4"><div className="h-24 bg-[rgba(255,255,255,0.04)] rounded-xl col-span-4" /></div>
        <div className="h-64 bg-[rgba(255,255,255,0.04)] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white mb-1">Customer Winback</h1>
        <p style={{ color: '#6b7280' }}>Re-engage customers who haven't visited in 60+ days</p>
      </div>

      <AriaIntelligencePanel mode="customer" />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Lapsed (60d+)', value: stats.lapsed, color: '#ef4444' },
          { label: 'At risk (30-60d)', value: stats.atRisk, color: '#f59e0b' },
          { label: 'Campaigns this month', value: stats.wonBackThisMonth, color: '#fff' },
          { label: 'Last campaign', value: stats.lastCampaign, color: '#9ca3af' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs mb-1" style={{ color: '#6b7280' }}>{s.label}</p>
            <p className="text-xl font-semibold" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {sendResult && (
        <div className="mb-4 px-5 py-4 rounded-xl" style={{ background: 'rgba(29,158,117,0.1)', border: '1px solid rgba(29,158,117,0.2)' }}>
          <p className="text-sm font-medium" style={{ color: '#1D9E75' }}>
            Campaign sent! {sendResult.sent} messages delivered
            {sendResult.noPhone > 0 && `, ${sendResult.noPhone} skipped (no phone)`}
            {sendResult.failed > 0 && `, ${sendResult.failed} failed`}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Customer list */}
        <div className="lg:col-span-3">
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <h2 className="font-medium text-white">Lapsed customers</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => {
                  const all: Record<string, boolean> = {};
                  customers.forEach(c => { if (c.phone) all[c.id] = true; });
                  setSelected(all);
                }} className="text-xs px-2 py-1 rounded-lg" style={{ color: '#1D9E75', background: 'rgba(29,158,117,0.1)' }}>All</button>
                <button onClick={() => setSelected({})} className="text-xs px-2 py-1 rounded-lg" style={{ color: '#9ca3af', background: 'rgba(255,255,255,0.06)' }}>None</button>
              </div>
            </div>
            {customers.length === 0 ? (
              <div className="px-5 py-12 text-center" style={{ background: '#0d0d14' }}>
                <div className="text-3xl mb-3">👥</div>
                <p className="text-sm font-medium text-white mb-1">No lapsed customers</p>
                <p className="text-xs" style={{ color: '#6b7280' }}>Customers who haven't visited in 60+ days will appear here.</p>
              </div>
            ) : (
              <table className="w-full text-sm" style={{ background: '#0d0d14' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    {['Include', 'Name', 'Last Visit', 'Days', 'LTV'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: '#6b7280' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {customers.map(c => {
                    const days = daysAgo(c.last_visit);
                    const hasPhone = !!c.phone;
                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td className="px-4 py-3">
                          {hasPhone ? (
                            <input type="checkbox" checked={!!selected[c.id]} onChange={e => setSelected(p => ({ ...p, [c.id]: e.target.checked }))} className="w-4 h-4 accent-[#1D9E75]" />
                          ) : (
                            <span className="text-xs" style={{ color: '#4b5563' }}>No phone</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-white font-medium">{c.name}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: '#9ca3af' }}>
                          {c.last_visit ? new Date(c.last_visit).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium" style={{ color: (days ?? 0) > 90 ? '#ef4444' : '#f59e0b' }}>
                            {days !== null ? `${days}d` : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: '#9ca3af' }}>
                          A${(c.total_spend ?? 0).toFixed(0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Campaign builder */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium text-white text-sm">SMS Message</h2>
              <button onClick={generateMessage} disabled={generating}
                className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-40 flex items-center gap-1"
                style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.2)' }}>
                {generating ? <><span className="inline-block w-2.5 h-2.5 border border-[#1D9E75] border-t-transparent rounded-full animate-spin" />Generating…</> : '✦ Regenerate with Aria'}
              </button>
            </div>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={5}
              maxLength={160}
              placeholder="AI-generated message will appear here…"
              className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff' }}
            />
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs" style={{ color: message.length > 150 ? '#ef4444' : '#4b5563' }}>{message.length}/160</p>
              {message.length > 160 && <p className="text-xs text-red-400">Exceeds SMS limit</p>}
            </div>
          </div>

          <button
            onClick={sendCampaign}
            disabled={sending || withPhone === 0 || !message.trim() || message.length > 160}
            className="w-full py-3 rounded-xl text-sm font-medium text-white disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: '#1D9E75' }}>
            {sending ? <><span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Sending…</> : `Send to ${withPhone} customer${withPhone !== 1 ? 's' : ''}`}
          </button>
          {withPhone === 0 && customers.length > 0 && (
            <p className="text-xs text-center" style={{ color: '#6b7280' }}>Select customers with phone numbers to enable sending.</p>
          )}

          {/* Campaign history */}
          {campaigns.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Past campaigns</p>
              <div className="space-y-2">
                {campaigns.slice(0, 8).map(c => (
                  <div key={c.id} className="px-4 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-white">{new Date(c.created_at).toLocaleDateString()}</p>
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={c.sms_sent ? { background: 'rgba(29,158,117,0.15)', color: '#1D9E75' } : { background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                        {c.sms_sent ? 'Sent' : c.error ? 'Failed' : c.status ?? 'Pending'}
                      </span>
                    </div>
                    {c.message && <p className="text-xs mt-1 italic truncate" style={{ color: '#6b7280' }}>"{c.message.slice(0, 70)}{c.message.length > 70 ? '…' : ''}"</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
