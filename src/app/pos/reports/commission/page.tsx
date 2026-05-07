'use client';
import { useState, useEffect, useCallback } from 'react';
import ReportHeader from '@/components/reports/ReportHeader';
import ReportTable, { Column } from '@/components/reports/ReportTable';
import AriaInsightCard from '@/components/reports/AriaInsightCard';
import DateRangePicker, { DateRange } from '@/components/reports/DateRangePicker';
import ExportButtons from '@/components/reports/ExportButtons';
import { fmtAUD, fmtPct } from '@/lib/recharts-theme';
import { track } from '@/lib/analytics';

interface CommRow extends Record<string, unknown> { name: string; total: number; rule: string; commission: number; }
interface Rule { id: string; staff_id: string | null; rule_type: string; rate_pct: number; flat_cents: number; applies_to: string; effective_from: string; }

const iS: React.CSSProperties = { background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '5px 10px', fontSize: 12, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' };
const pBtn = (active: boolean): React.CSSProperties => ({ padding: '5px 12px', borderRadius: 6, border: '1px solid', borderColor: active ? 'var(--violet)' : 'var(--border-default)', background: active ? 'var(--violet-dim)' : 'var(--bg-elevated)', color: active ? 'var(--violet)' : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' });

export default function CommissionReportPage() {
  const [range, setRange] = useState<DateRange>({ from: new Date(Date.now() - 29 * 86400000), to: new Date(), preset: 'This Month' });
  const [rows, setRows] = useState<CommRow[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [insight, setInsight] = useState<string[] | null>(null);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalCommission, setTotalCommission] = useState(0);
  const [commPct, setCommPct] = useState(0);
  const [showAddRule, setShowAddRule] = useState(false);
  const [newRule, setNewRule] = useState({ rule_type: 'pct_sale', rate_pct: '5', applies_to: 'all', effective_from: new Date().toISOString().split('T')[0] });

  const load = useCallback(() => {
    setLoading(true);
    const from = range.from.toISOString().split('T')[0];
    const to = range.to.toISOString().split('T')[0];
    fetch(`/api/pos/reports/commission?from=${from}&to=${to}`)
      .then(r => r.json())
      .then(d => {
        setRows(d.rows ?? []);
        setRules(d.rules ?? []);
        setTotalRevenue(d.totalRevenue ?? 0);
        setTotalCommission(d.totalCommission ?? 0);
        setCommPct(d.commissionPct ?? 0);
        setInsight(d.insight?.bullets ?? null);
        setLoading(false);
        track('report_viewed', { type: 'commission' });
      })
      .catch(() => setLoading(false));
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const columns: Column[] = [
    { key: 'name', label: 'STAFF', sortable: true, format: (v) => <span style={{ fontWeight: 600 }}>{String(v)}</span> },
    { key: 'total', label: 'SALES TOTAL', align: 'right', sortable: true, format: (v) => fmtAUD(v as number) },
    { key: 'rule', label: 'RULE APPLIED' },
    { key: 'commission', label: 'COMMISSION $', align: 'right', sortable: true, format: (v) => <span style={{ color: '#34D399', fontWeight: 700 }}>{fmtAUD(v as number)}</span> },
  ];

  const totals = { total: totalRevenue, commission: totalCommission };

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif" }}>
      <ReportHeader
        title="Commission"
        subtitle="Staff earnings and commission rules"
        filters={<DateRangePicker value={range} onChange={setRange} />}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowAddRule(true)} style={{ ...pBtn(false), background: 'var(--violet)', color: '#fff', borderColor: 'var(--violet)' }}>+ Add Rule</button>
            <ExportButtons data={rows} reportType="commission" />
          </div>
        }
      />
      <div style={{ padding: '0 24px 24px' }}>
        <AriaInsightCard bullets={insight ?? undefined} loading={loading} />

        {/* Commission summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total Revenue', value: fmtAUD(totalRevenue), color: 'var(--text-primary)' },
            { label: 'Total Commission', value: fmtAUD(totalCommission), color: '#34D399' },
            { label: 'Commission %', value: fmtPct(commPct), color: commPct > 15 ? '#F87171' : '#FBBF24' },
          ].map(c => (
            <div key={c.label} style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: '14px 16px', boxShadow: 'var(--shadow-card)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{c.label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: c.color }}>{c.value}</div>
            </div>
          ))}
        </div>

        <ReportTable columns={columns} rows={rows} loading={loading} totalsRow={totals} emptyIcon="💰" emptyMessage="No commission data for this period." />

        {/* Rules list */}
        {rules.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>Active Commission Rules</div>
            <div style={{ background: 'var(--bg-surface)', borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
              {rules.map((r, i) => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderTop: i > 0 ? '1px solid var(--divider)' : 'none', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-primary)' }}>{r.staff_id ? `Staff #${r.staff_id.slice(0,8)}` : 'All Staff'} — {r.applies_to}</span>
                  <span style={{ color: 'var(--violet)', fontWeight: 700 }}>{r.rate_pct}% of sale</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>from {r.effective_from}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add Rule Modal */}
      {showAddRule && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 16, padding: 24, width: 400, boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>Add Commission Rule</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Rule Type</label>
                <select value={newRule.rule_type} onChange={e => setNewRule(p => ({ ...p, rule_type: e.target.value }))} style={iS}>
                  <option value="pct_sale">% of Sale</option>
                  <option value="pct_margin">% of Margin</option>
                  <option value="flat_per_item">Flat per Item</option>
                  <option value="tiered">Tiered</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Rate %</label>
                <input type="number" value={newRule.rate_pct} onChange={e => setNewRule(p => ({ ...p, rate_pct: e.target.value }))} style={iS} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Applies To</label>
                <select value={newRule.applies_to} onChange={e => setNewRule(p => ({ ...p, applies_to: e.target.value }))} style={iS}>
                  <option value="all">All</option>
                  <option value="category">Category</option>
                  <option value="brand">Brand</option>
                  <option value="supplier">Supplier</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Effective From</label>
                <input type="date" value={newRule.effective_from} onChange={e => setNewRule(p => ({ ...p, effective_from: e.target.value }))} style={iS} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAddRule(false)} style={{ ...pBtn(false), padding: '8px 18px' }}>Cancel</button>
              <button onClick={() => {
                fetch('/api/pos/commission-rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newRule) })
                  .then(() => { setShowAddRule(false); load(); }).catch(() => setShowAddRule(false));
              }} style={{ ...pBtn(true), padding: '8px 18px', background: 'var(--violet)', color: '#fff', borderColor: 'var(--violet)' }}>Save Rule</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
