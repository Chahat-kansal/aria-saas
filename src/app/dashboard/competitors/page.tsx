'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface Alert { id: string; competitor_name: string; alert_text: string; source_url: string | null; detected_at: string; alert_type: string; }

export default function CompetitorsPage() {
  const { business } = useBusinessContext();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [competitorUrl, setCompetitorUrl] = useState('');
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const res = await fetch(`/api/competitor-alerts?business_id=${business.id}`).then(r => r.json()).catch(() => ({ alerts: [] }));
    setAlerts(res.alerts ?? res.data ?? []);
    if (res.alerts?.length || res.data?.length) setLastScanned(res.alerts?.[0]?.detected_at ?? null);
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  async function scan() {
    if (!business?.id) return;
    setScanning(true); setError('');
    try {
      const params = new URLSearchParams({ business_id: business.id, radius_m: '5000' });
      const res = await fetch(`/api/aria/competitors?${params}`).then(r => r.json());
      if (res.error) throw new Error(res.error);
      setLastScanned(new Date().toISOString());
      load();
    } catch (e: any) {
      setError(e.message);
    }
    setScanning(false);
  }

  const byCompetitor = alerts.reduce((acc: Record<string, Alert[]>, a) => {
    const key = a.competitor_name ?? 'Unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {});

  const TYPE_ICONS: Record<string, string> = {
    pricing: '💰', promotion: '🎁', review: '⭐', new_service: '✨', web: '🌐', general: '📡',
  };

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto animate-pulse space-y-4">
        <div className="h-8 bg-[rgba(255,255,255,0.06)] rounded-xl w-48" />
        <div className="h-24 bg-[rgba(255,255,255,0.04)] rounded-xl" />
        <div className="h-64 bg-[rgba(255,255,255,0.04)] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Competitor Intelligence</h1>
          <p style={{ color: '#6b7280' }}>What your competitors are doing in {business?.city ?? 'your area'}</p>
          {lastScanned && <p className="text-xs mt-1" style={{ color: '#4b5563' }}>Last scanned: {new Date(lastScanned).toLocaleDateString()}</p>}
        </div>
        <button onClick={scan} disabled={scanning}
          className="shrink-0 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40 flex items-center gap-2"
          style={{ background: '#1D9E75' }}>
          {scanning ? <><span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Scanning…</> : '↻ Scan competitors'}
        </button>
      </div>

      {/* URL input */}
      <div className="mb-6 flex gap-2">
        <input value={competitorUrl} onChange={e => setCompetitorUrl(e.target.value)}
          placeholder="Add a competitor URL to scan (optional)"
          className="flex-1 px-3 py-2 rounded-xl text-sm text-white outline-none"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }} />
        <button onClick={scan} disabled={scanning || !competitorUrl}
          className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40"
          style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.08)' }}>
          Scan URL
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {[
          { label: 'Competitors tracked', value: Object.keys(byCompetitor).length },
          { label: 'Total alerts', value: alerts.length },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs mb-1" style={{ color: '#6b7280' }}>{s.label}</p>
            <p className="text-2xl font-semibold text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {Object.keys(byCompetitor).length > 0 ? (
        <div className="space-y-4">
          {Object.entries(byCompetitor).map(([name, items]) => (
            <div key={name} className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="px-5 py-4 flex items-center justify-between" style={{ background: '#13131a' }}>
                <h2 className="font-medium text-white">{name}</h2>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>
                  {items.length} alert{items.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div style={{ background: '#0d0d14' }}>
                {items.map(alert => (
                  <div key={alert.id} className="px-5 py-3 flex items-start gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="text-lg shrink-0">{TYPE_ICONS[alert.alert_type] ?? TYPE_ICONS.general}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white">{alert.alert_text}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs" style={{ color: '#6b7280' }}>
                          {alert.detected_at ? new Date(alert.detected_at).toLocaleDateString() : ''}
                        </span>
                        {alert.source_url && (
                          <a href={alert.source_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs hover:underline" style={{ color: '#1D9E75' }}>
                            View source →
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl p-12 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="text-3xl mb-3">🔍</div>
          <p className="font-semibold text-white mb-1">No competitor data yet</p>
          <p className="text-sm mb-4" style={{ color: '#6b7280' }}>
            Click "Scan competitors" to have Aria research what competitors in {business?.city ?? 'your area'} are doing.
          </p>
          <button onClick={scan} disabled={scanning} className="px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: '#1D9E75' }}>
            {scanning ? 'Scanning…' : 'Scan now'}
          </button>
        </div>
      )}
    </div>
  );
}
