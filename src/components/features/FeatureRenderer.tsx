'use client';
import { useEffect, useState, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface FeatureConfig {
  // MetricCard
  query?:        QueryConfig;
  format?:       'currency' | 'number' | 'percent';
  prefix?:       string;
  suffix?:       string;
  compare?:      QueryConfig;
  icon?:         string;
  color?:        string;
  // Leaderboard
  rows?:         QueryConfig;
  value_label?:  string;
  value_format?: 'currency' | 'number' | 'percent';
  limit?:        number;
  // Tracker
  trackers?:     QueryConfig;
  goal?:         number;
  goal_label?:   string;
  // Calculator
  inputs?:       CalcInput[];
  formula?:      string;
  result_label?: string;
  result_format?: 'currency' | 'number' | 'percent';
  // DataTable
  columns?:      ColumnDef[];
  group_by?:     string;
  // Alert Feed
  alerts?:       QueryConfig;
  alert_message_template?: string;
  // Common
  date_range?:   string;
  empty_message?: string;
}

interface QueryConfig {
  table:       string;
  type:        'sum' | 'count' | 'group_sum' | 'count_per_customer' | 'rows';
  field?:      string;
  group_field?: string;
  filters?:    Record<string, unknown>;
  date_field?:  string;
  date_range?:  string;
  order_by?:   string;
  order_dir?:  'asc' | 'desc';
  limit?:      number;
}

interface CalcInput {
  key:     string;
  label:   string;
  default: number;
  min?:    number;
  max?:    number;
  step?:   number;
}

interface ColumnDef {
  field:   string;
  label:   string;
  format?: 'currency' | 'number' | 'percent' | 'text';
}

export interface BusinessFeature {
  id:           string;
  name:         string;
  description?: string;
  feature_type: string;
  config:       FeatureConfig;
  is_active:    boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(value: unknown, format: 'currency' | 'number' | 'percent' | 'text' | undefined, prefix?: string, suffix?: string): string {
  const n = Number(value);
  if (isNaN(n) && format !== 'text') return String(value ?? '—');
  if (format === 'currency') return (prefix ?? '$') + n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (suffix ?? '');
  if (format === 'percent') return n.toFixed(1) + '%' + (suffix ?? '');
  if (format === 'number')  return (prefix ?? '') + n.toLocaleString('en-AU') + (suffix ?? '');
  if (format === 'text')    return String(value ?? '—');
  return (prefix ?? '') + n.toLocaleString('en-AU', { maximumFractionDigits: 2 }) + (suffix ?? '');
}

async function runQuery(businessId: string, q: QueryConfig): Promise<unknown> {
  const res = await fetch('/api/features/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ business_id: businessId, query: q }),
  });
  if (!res.ok) throw new Error(`query failed: ${res.status}`);
  const { result } = await res.json();
  return result;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({ feature, businessId }: { feature: BusinessFeature; businessId: string }) {
  const [value, setValue]   = useState<string | null>(null);
  const [change, setChange] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!feature.config.query) { setLoading(false); return; }
    (async () => {
      try {
        const v = await runQuery(businessId, feature.config.query!);
        setValue(fmt(v, feature.config.format, feature.config.prefix, feature.config.suffix));
        if (feature.config.compare) {
          const prev = await runQuery(businessId, feature.config.compare);
          const curr = Number(v), pr = Number(prev);
          if (pr !== 0) setChange(((curr - pr) / pr) * 100);
        }
      } catch { /* show — */ }
      setLoading(false);
    })();
  }, [businessId, feature]);

  const color = feature.config.color ?? '#1D9E75';

  return (
    <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>{feature.name}</p>
        {feature.config.icon && <span className="text-xl">{feature.config.icon}</span>}
      </div>
      {loading ? (
        <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: color }} />
      ) : (
        <>
          <p className="text-3xl font-bold text-white">{value ?? '—'}</p>
          {change !== null && (
            <p className="text-xs mt-1" style={{ color: change >= 0 ? '#1D9E75' : '#ef4444' }}>
              {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}% vs prior period
            </p>
          )}
        </>
      )}
      {feature.description && (
        <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.35)' }}>{feature.description}</p>
      )}
    </div>
  );
}

function Leaderboard({ feature, businessId }: { feature: BusinessFeature; businessId: string }) {
  const [rows, setRows]     = useState<Array<{ name: string; value: unknown }>>([]);
  const [loading, setLoading] = useState(true);
  const medals = ['🥇', '🥈', '🥉'];

  useEffect(() => {
    if (!feature.config.rows) { setLoading(false); return; }
    (async () => {
      try {
        const r = await runQuery(businessId, { ...feature.config.rows!, limit: feature.config.limit ?? 10 });
        setRows(Array.isArray(r) ? r : []);
      } catch { /* show empty */ }
      setLoading(false);
    })();
  }, [businessId, feature]);

  return (
    <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <p className="text-sm font-medium mb-4" style={{ color: 'rgba(255,255,255,0.6)' }}>{feature.name}</p>
      {loading ? (
        <div className="w-5 h-5 rounded-full border-2 border-t-transparent border-[#1D9E75] animate-spin" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">{feature.config.empty_message ?? 'No data yet'}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base flex-shrink-0">{medals[i] ?? `${i + 1}.`}</span>
                <span className="text-sm text-white truncate">{row.name}</span>
              </div>
              <span className="text-sm font-semibold flex-shrink-0" style={{ color: '#1D9E75' }}>
                {fmt(row.value, feature.config.value_format)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Tracker({ feature, businessId }: { feature: BusinessFeature; businessId: string }) {
  const [items, setItems]   = useState<Array<{ name: string; value: unknown }>>([]);
  const [loading, setLoading] = useState(true);
  const goal = feature.config.goal ?? 10;

  useEffect(() => {
    if (!feature.config.trackers) { setLoading(false); return; }
    (async () => {
      try {
        const r = await runQuery(businessId, { ...feature.config.trackers!, limit: feature.config.limit ?? 20 });
        setItems(Array.isArray(r) ? r : []);
      } catch { /* show empty */ }
      setLoading(false);
    })();
  }, [businessId, feature]);

  return (
    <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <p className="text-sm font-medium mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>{feature.name}</p>
      {feature.config.goal_label && (
        <p className="text-xs mb-4 text-gray-500">Goal: {goal} {feature.config.goal_label}</p>
      )}
      {loading ? (
        <div className="w-5 h-5 rounded-full border-2 border-t-transparent border-[#1D9E75] animate-spin" />
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500">{feature.config.empty_message ?? 'No data yet'}</p>
      ) : (
        <div className="space-y-3">
          {items.map((item, i) => {
            const pct = Math.min(100, (Number(item.value) / goal) * 100);
            const done = pct >= 100;
            return (
              <div key={i}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-white">{item.name}</span>
                  <span style={{ color: done ? '#1D9E75' : 'rgba(255,255,255,0.5)' }}>
                    {done ? '✓ Complete!' : `${Number(item.value)} / ${goal}`}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: done ? '#1D9E75' : '#3b82f6' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Calculator({ feature }: { feature: BusinessFeature }) {
  const inputs = feature.config.inputs ?? [];
  const [vals, setVals] = useState<Record<string, number>>(
    Object.fromEntries(inputs.map(i => [i.key, i.default]))
  );
  const [result, setResult] = useState<number>(0);

  const compute = useCallback(() => {
    try {
      // formula is generated by Claude — keys are restricted to defined input keys only
      const fn = new Function(...Object.keys(vals), `return ${feature.config.formula ?? '0'};`);
      setResult(fn(...Object.values(vals)));
    } catch { setResult(0); }
  }, [vals, feature.config.formula]);

  useEffect(() => { compute(); }, [compute]);

  return (
    <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <p className="text-sm font-medium mb-4" style={{ color: 'rgba(255,255,255,0.6)' }}>{feature.name}</p>
      <div className="space-y-3 mb-4">
        {inputs.map(inp => (
          <div key={inp.key}>
            <label className="text-xs text-gray-400 mb-1 block">{inp.label}</label>
            <input
              type="number"
              value={vals[inp.key] ?? inp.default}
              min={inp.min}
              max={inp.max}
              step={inp.step ?? 1}
              onChange={e => setVals(p => ({ ...p, [inp.key]: parseFloat(e.target.value) || 0 }))}
              className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
            />
          </div>
        ))}
      </div>
      <div className="rounded-xl p-3" style={{ background: 'rgba(29,158,117,0.12)', border: '1px solid rgba(29,158,117,0.25)' }}>
        <p className="text-xs text-gray-400 mb-0.5">{feature.config.result_label ?? 'Result'}</p>
        <p className="text-2xl font-bold" style={{ color: '#1D9E75' }}>
          {fmt(result, feature.config.result_format ?? 'currency')}
        </p>
      </div>
    </div>
  );
}

function DataTable({ feature, businessId }: { feature: BusinessFeature; businessId: string }) {
  const [rows, setRows]     = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const cols = feature.config.columns ?? [];

  useEffect(() => {
    if (!feature.config.query) { setLoading(false); return; }
    (async () => {
      try {
        const r = await runQuery(businessId, { ...feature.config.query!, type: 'rows' });
        setRows(Array.isArray(r) ? r : []);
      } catch { /* show empty */ }
      setLoading(false);
    })();
  }, [businessId, feature]);

  return (
    <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <p className="text-sm font-medium mb-4" style={{ color: 'rgba(255,255,255,0.6)' }}>{feature.name}</p>
      {loading ? (
        <div className="w-5 h-5 rounded-full border-2 border-t-transparent border-[#1D9E75] animate-spin" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">{feature.config.empty_message ?? 'No data yet'}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {cols.map(c => (
                  <th key={c.field} className="text-left pb-2 text-xs text-gray-500 font-medium pr-4">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  {cols.map(c => (
                    <td key={c.field} className="py-2 pr-4 text-white">{fmt(row[c.field], c.format)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

export default function FeatureRenderer({ feature, businessId }: { feature: BusinessFeature; businessId: string }) {
  if (!feature.is_active) return null;
  switch (feature.feature_type) {
    case 'metric_card':  return <MetricCard   feature={feature} businessId={businessId} />;
    case 'leaderboard':  return <Leaderboard  feature={feature} businessId={businessId} />;
    case 'tracker':      return <Tracker      feature={feature} businessId={businessId} />;
    case 'calculator':   return <Calculator   feature={feature} />;
    case 'data_table':   return <DataTable    feature={feature} businessId={businessId} />;
    default:
      return (
        <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-sm text-gray-400">{feature.name}</p>
          <p className="text-xs text-gray-600 mt-1">Unsupported type: {feature.feature_type}</p>
        </div>
      );
  }
}
