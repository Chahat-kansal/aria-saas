'use client';
import { useState, useEffect, useCallback } from 'react';

interface LeaderboardRow {
  name: string; sales_count: number; total_sales_cents: number;
  commission_cents: number; pending: number; paid: number;
}
interface Totals { total_commission_cents: number; total_sales_cents: number; pending_cents: number; }

function fmt(cents: number) { return `A$${(cents / 100).toFixed(2)}`; }
function fmtDate(d: Date) { return d.toISOString().split('T')[0]; }

export default function CommissionReportPage() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [from, setFrom] = useState(() => fmtDate(new Date(Date.now() - 30 * 86400000)));
  const [to, setTo] = useState(() => fmtDate(new Date()));
  const [paying, setPaying] = useState<string | null>(null);
  const [insight, setInsight] = useState<string | null>(null);
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/pos/products').then(r => r.json()).then(d => { if (d.business_id) setBusinessId(d.business_id); });
  }, []);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    const d = await fetch(`/api/pos/reports/commission?business_id=${businessId}&from=${from}&to=${to}`).then(r => r.json());
    setRows(d.leaderboard ?? []);
    setTotals(d.totals ?? null);
    setLoading(false);

    // Aria insight
    if (d.leaderboard?.length > 0 && !insight) {
      const top = d.leaderboard[0] as LeaderboardRow;
      const avg = (d.totals?.total_sales_cents ?? 0) / Math.max(d.leaderboard.reduce((s: number, r: LeaderboardRow) => s + r.sales_count, 0), 1);
      setInsight(`${top.name} is your top performer with ${fmt(top.commission_cents)} in commissions from ${top.sales_count} sales. Their average basket is ${fmt(Math.round(top.total_sales_cents / Math.max(top.sales_count, 1)))} vs team average of ${fmt(Math.round(avg))}.`);
    }
  }, [businessId, from, to, insight]);

  useEffect(() => { if (businessId) load(); }, [businessId, from, to, load]);

  async function markPaid(name: string) {
    if (!businessId) return;
    setPaying(name);
    await fetch('/api/pos/reports/commission', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId, pos_user_name: name, status: 'paid' }),
    });
    setPaying(null);
    load();
  }

  return (
    <div className="min-h-full bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Commission Report</h1>
          <p className="text-xs text-gray-500 mt-0.5">Staff commission earned by period</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none bg-white" />
          <span className="text-xs text-gray-400">to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none bg-white" />
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">
        {/* Aria insight */}
        {insight && (
          <div className="bg-white border border-gray-100 rounded-xl px-4 py-3 border-l-[3px] border-l-[#059669]">
            <p className="text-sm text-gray-700"><span className="font-semibold text-[#059669]">Aria: </span>{insight}</p>
          </div>
        )}

        {/* Summary cards */}
        {totals && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total commission earned', value: fmt(totals.total_commission_cents), color: 'text-gray-900' },
              { label: 'Pending payment', value: fmt(totals.pending_cents), color: 'text-amber-600' },
              { label: 'Total sales value', value: fmt(totals.total_sales_cents), color: 'text-gray-900' },
            ].map(s => (
              <div key={s.label} className="bg-white border border-gray-200 rounded-xl px-5 py-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{s.label}</p>
                <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Leaderboard */}
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
            <p className="text-2xl mb-2">🏆</p>
            <p className="text-gray-500 text-sm mb-2">No commission data for this period</p>
            <p className="text-xs text-gray-400">Commission is tracked when staff are attributed to sales at the register</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="grid px-5 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100"
              style={{ gridTemplateColumns: '2fr 80px 100px 100px 100px 80px' }}>
              <span>Staff member</span>
              <span className="text-right">Sales</span>
              <span className="text-right">Revenue</span>
              <span className="text-right">Commission</span>
              <span className="text-right">Pending</span>
              <span className="text-right">Action</span>
            </div>
            {rows.map((row, i) => (
              <div key={row.name}>
                <button
                  onClick={() => setExpandedStaff(expandedStaff === row.name ? null : row.name)}
                  className={`w-full grid px-5 py-3.5 text-sm items-center border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors text-left ${i === 0 ? 'bg-amber-50/50' : ''}`}
                  style={{ gridTemplateColumns: '2fr 80px 100px 100px 100px 80px' }}>
                  <div className="flex items-center gap-3">
                    {i === 0 && <span className="text-base">🥇</span>}
                    {i === 1 && <span className="text-base">🥈</span>}
                    {i === 2 && <span className="text-base">🥉</span>}
                    {i > 2 && (
                      <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">{row.name[0]?.toUpperCase()}</div>
                    )}
                    <span className="font-semibold text-gray-900">{row.name}</span>
                  </div>
                  <span className="text-right text-gray-600">{row.sales_count}</span>
                  <span className="text-right font-mono text-gray-700">{fmt(row.total_sales_cents)}</span>
                  <span className="text-right font-mono font-semibold text-gray-900">{fmt(row.commission_cents)}</span>
                  <span className={`text-right font-mono font-medium ${row.pending > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                    {row.pending > 0 ? fmt(row.pending) : '—'}
                  </span>
                  {row.pending > 0 ? (
                    <button onClick={e => { e.stopPropagation(); markPaid(row.name); }} disabled={paying === row.name}
                      className="justify-self-end text-xs px-2.5 py-1.5 rounded-lg text-white disabled:opacity-50"
                      style={{ background: '#059669' }}>
                      {paying === row.name ? '…' : 'Pay'}
                    </button>
                  ) : (
                    <span className="justify-self-end text-[10px] text-gray-300">paid ✓</span>
                  )}
                </button>
              </div>
            ))}
            {/* Totals row */}
            {totals && (
              <div className="grid px-5 py-3 text-sm items-center border-t-2 border-gray-200 bg-gray-50 font-semibold"
                style={{ gridTemplateColumns: '2fr 80px 100px 100px 100px 80px' }}>
                <span className="text-gray-700">Total</span>
                <span className="text-right text-gray-600">{rows.reduce((s, r) => s + r.sales_count, 0)}</span>
                <span className="text-right font-mono text-gray-700">{fmt(totals.total_sales_cents)}</span>
                <span className="text-right font-mono text-gray-900">{fmt(totals.total_commission_cents)}</span>
                <span className="text-right font-mono text-amber-600">{fmt(totals.pending_cents)}</span>
                <span />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
