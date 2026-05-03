'use client';
import { useState, useEffect } from 'react';

interface CashierRow {
  name: string;
  sessions: number;
  transactions: number;
  revenue: number;
  cash_sales: number;
  card_sales: number;
  refunds: number;
  avg_basket: number;
}

interface Session {
  id: string;
  opened_by: string | null;
  opened_at: string;
  closed_at: string | null;
  total_cash_sales: number;
  total_card_sales: number;
  transaction_count: number;
}

export default function CashierReportPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/pos/sessions?all=true&days=${days}`)
      .then(r => r.json())
      .then(d => {
        const all: Session[] = d.sessions ?? d.allSessions ?? [];
        setSessions(all);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [days]);

  // Group sessions by cashier
  const cashierMap = new Map<string, CashierRow>();
  for (const s of sessions) {
    const name = s.opened_by || 'Unknown';
    const existing = cashierMap.get(name) ?? {
      name, sessions: 0, transactions: 0, revenue: 0,
      cash_sales: 0, card_sales: 0, refunds: 0, avg_basket: 0,
    };
    existing.sessions += 1;
    existing.transactions += s.transaction_count ?? 0;
    existing.cash_sales += s.total_cash_sales ?? 0;
    existing.card_sales += s.total_card_sales ?? 0;
    existing.revenue += (s.total_cash_sales ?? 0) + (s.total_card_sales ?? 0);
    cashierMap.set(name, existing);
  }
  const rows = Array.from(cashierMap.values()).map(r => ({
    ...r,
    avg_basket: r.transactions > 0 ? r.revenue / r.transactions : 0,
  })).sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalTx = rows.reduce((s, r) => s + r.transactions, 0);

  return (
    <div className="min-h-full bg-gray-50 overflow-y-auto">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Cashier Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">Performance breakdown by cashier</p>
        </div>
        <select value={days} onChange={e => setDays(Number(e.target.value))}
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none bg-white text-gray-700">
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={60}>Last 60 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">
        {/* Summary strip */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total revenue', value: `A$${totalRevenue.toFixed(2)}` },
            { label: 'Total transactions', value: totalTx.toString() },
            { label: 'Active cashiers', value: rows.length.toString() },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl px-5 py-4">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{s.label}</p>
              <p className="text-2xl font-bold font-mono text-gray-900">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 flex justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <p className="text-gray-400 text-sm">No session data for this period.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="grid text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3 border-b border-gray-100 bg-gray-50"
              style={{ gridTemplateColumns: '1fr 80px 80px 120px 100px 100px 100px' }}>
              <span>Cashier</span>
              <span className="text-right">Sessions</span>
              <span className="text-right">Txns</span>
              <span className="text-right">Revenue</span>
              <span className="text-right">Cash</span>
              <span className="text-right">Card</span>
              <span className="text-right">Avg basket</span>
            </div>
            {rows.map((row, i) => (
              <div key={row.name}
                className={`grid px-4 py-3 text-sm items-center border-b border-gray-50 last:border-0 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}
                style={{ gridTemplateColumns: '1fr 80px 80px 120px 100px 100px 100px' }}>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0">
                    {row.name[0]?.toUpperCase()}
                  </div>
                  <span className="font-medium text-gray-900">{row.name}</span>
                </div>
                <span className="text-right text-gray-600">{row.sessions}</span>
                <span className="text-right text-gray-600">{row.transactions}</span>
                <span className="text-right font-semibold font-mono text-gray-900">A${row.revenue.toFixed(2)}</span>
                <span className="text-right font-mono text-gray-500">A${row.cash_sales.toFixed(2)}</span>
                <span className="text-right font-mono text-gray-500">A${row.card_sales.toFixed(2)}</span>
                <span className="text-right font-mono text-gray-500">A${row.avg_basket.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
