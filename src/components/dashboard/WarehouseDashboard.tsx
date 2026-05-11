'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Business { id: string; name: string; owner_name: string | null; }
interface KPIs { stock_value_cents: number; low_stock_count: number; pending_po_count: number; expiring_lots_count: number; expiring_lots_value_cents: number; out_of_stock_count: number; }
interface GRN { id: string; grn_number: string; supplier_name: string | null; received_at: string; status: string; items: any[]; }
interface ExpiringLot { id: string; item_name: string; lot_number: string; quantity_remaining: number; expiry_date: string; unit_cost_cents: number | null; }
interface Recommendation { id: string; priority: string; title: string; description: string; action_label: string; action_type: string; }

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function daysUntil(date: string) {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

function fmt(cents: number) {
  return 'A$' + (cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function WarehouseDashboard({ business }: { business: Business }) {
  const router = useRouter();
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [grns, setGrns] = useState<GRN[]>([]);
  const [expiring, setExpiring] = useState<ExpiringLot[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  const firstName = business.owner_name?.split(' ')[0] ?? 'there';
  const dateStr = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    const bid = business.id;
    Promise.all([
      fetch(`/api/warehouse/kpis?business_id=${bid}`).then(r => r.json()),
      fetch(`/api/warehouse/grn?business_id=${bid}&date=${today}`).then(r => r.json()),
      fetch(`/api/warehouse/lots?business_id=${bid}&expiring=60`).then(r => r.json()),
      fetch('/api/aria/daily-briefing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: bid }) })
        .then(r => (r.status === 401 || r.status === 429 || !r.ok) ? { recommendations: [] } : r.json())
        .catch(() => ({ recommendations: [] })),
    ]).then(([k, g, e, b]) => {
      setKpis(k);
      setGrns((g.grns ?? []).slice(0, 5));
      setExpiring((e.lots ?? []).slice(0, 10));
      setRecs((b.recommendations ?? []).slice(0, 3));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [business.id, today]);

  function askAriaAboutLot(lot: ExpiringLot) {
    const days = daysUntil(lot.expiry_date);
    const q = encodeURIComponent(`I have ${lot.quantity_remaining} units of ${lot.item_name} (lot ${lot.lot_number}) expiring in ${days} days. What should I do to clear this stock and minimise losses?`);
    router.push(`/dashboard/ask-aria?q=${q}`);
  }

  const PRIORITY_COLOR: Record<string, string> = { high: '#ef4444', medium: '#f59e0b', low: '#1D9E75' };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">{greeting()}, {firstName}</h1>
          <p style={{ color: '#6b7280' }}>{dateStr} · {business.name}</p>
        </div>
        <Link href="/dashboard/ask-aria" className="px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: '#1D9E75' }}>
          Ask Aria →
        </Link>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total stock value', value: kpis ? fmt(kpis.stock_value_cents) : '…', sub: `${kpis?.out_of_stock_count ?? 0} items out of stock`, color: '#fff' },
          { label: 'Items needing reorder', value: loading ? '…' : String(kpis?.low_stock_count ?? 0), sub: 'at or below reorder point', color: (kpis?.low_stock_count ?? 0) > 10 ? '#ef4444' : (kpis?.low_stock_count ?? 0) > 0 ? '#f59e0b' : '#1D9E75' },
          { label: 'Pending purchase orders', value: loading ? '…' : String(kpis?.pending_po_count ?? 0), sub: 'draft + sent', color: '#fff' },
          { label: 'Lots expiring ≤30 days', value: loading ? '…' : String(kpis?.expiring_lots_count ?? 0), sub: kpis ? `${fmt(kpis.expiring_lots_value_cents)} at risk` : '…', color: (kpis?.expiring_lots_count ?? 0) > 0 ? '#ef4444' : '#1D9E75' },
        ].map(k => (
          <div key={k.label} className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs mb-1" style={{ color: '#6b7280' }}>{k.label}</p>
            <p className="text-2xl font-semibold" style={{ color: k.color }}>{k.value}</p>
            <p className="text-xs mt-1" style={{ color: '#4b5563' }}>{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Two-column row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Today's inbound */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="px-5 py-4 flex items-center justify-between" style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <h2 className="font-medium text-white">Today&apos;s inbound</h2>
            <Link href="/dashboard/warehouse/inbound" className="text-xs px-3 py-1.5 rounded-lg text-white" style={{ background: '#1D9E75' }}>+ New receiving</Link>
          </div>
          <div style={{ background: '#0d0d14' }}>
            {grns.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm" style={{ color: '#4b5563' }}>No goods received today</p>
            ) : grns.map(g => (
              <div key={g.id} className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div>
                  <p className="text-sm font-medium text-white">{g.grn_number}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>{g.supplier_name ?? 'Unknown supplier'} · {new Date(g.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${g.status === 'confirmed' ? 'bg-green-900/30 text-green-400' : g.status === 'discrepancy' ? 'bg-red-900/30 text-red-400' : 'bg-[rgba(255,255,255,0.06)] text-gray-400'}`}>
                  {g.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Aria's daily brief */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="px-5 py-4 flex items-center justify-between" style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#1D9E75] flex items-center justify-center text-[9px] font-bold text-white">A</span>
              <h2 className="font-medium text-white">Aria&apos;s daily brief</h2>
            </div>
          </div>
          <div className="p-4 space-y-3" style={{ background: '#0d0d14' }}>
            {recs.length === 0 ? (
              <p className="text-sm text-center py-4" style={{ color: '#4b5563' }}>Generating insights…</p>
            ) : recs.map(r => (
              <div key={r.id} className="flex gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: PRIORITY_COLOR[r.priority] ?? '#6b7280' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white">{r.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>{r.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Expiry alerts */}
      {expiring.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(239,68,68,0.2)' }}>
          <div className="px-5 py-4" style={{ background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
            <h2 className="font-medium text-white">⚠️ Expiry alerts — next 60 days</h2>
          </div>
          <table className="w-full text-sm" style={{ background: '#0d0d14' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Product', 'Lot #', 'Qty Remaining', 'Expiry Date', 'Days Left', 'Action'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: '#6b7280' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {expiring.map(lot => {
                const days = daysUntil(lot.expiry_date);
                return (
                  <tr key={lot.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td className="px-4 py-3 text-white font-medium">{lot.item_name}</td>
                    <td className="px-4 py-3" style={{ color: '#9ca3af' }}>{lot.lot_number}</td>
                    <td className="px-4 py-3 text-white">{lot.quantity_remaining}</td>
                    <td className="px-4 py-3" style={{ color: '#9ca3af' }}>{lot.expiry_date}</td>
                    <td className="px-4 py-3">
                      <span style={{ color: days < 14 ? '#ef4444' : days < 30 ? '#f59e0b' : '#1D9E75' }} className="font-medium">{days}d</span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => askAriaAboutLot(lot)} className="text-xs px-3 py-1 rounded-lg text-white transition-colors" style={{ background: '#1D9E75' }}>
                        Get Aria&apos;s help
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {expiring.length === 0 && !loading && (
        <div className="rounded-xl p-6 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-white font-medium">No lots expiring in the next 60 days 🎉</p>
          <p className="text-xs mt-1" style={{ color: '#6b7280' }}>Your stock is in great shape.</p>
        </div>
      )}
    </div>
  );
}
