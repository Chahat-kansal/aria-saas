'use client';
import React, { useState } from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { fmtAUD, fmtCount, fmtPct } from '@/lib/recharts-theme';

interface OutletRow { name: string; value: number }

interface MetricCardProps {
  label: string;
  value: number;
  format?: 'aud' | 'count' | 'pct';
  delta?: number;
  deltaLabel?: string;
  sparklineData?: number[];
  perOutletRows?: OutletRow[];
}

function fmt(v: number, format?: string) {
  if (format === 'aud') return fmtAUD(v);
  if (format === 'pct') return fmtPct(v);
  return fmtCount(v);
}

export default function MetricCard({ label, value, format, delta, deltaLabel, sparklineData, perOutletRows }: MetricCardProps) {
  const [showOutlets, setShowOutlets] = useState(false);
  const sparkPoints = (sparklineData ?? []).map((v, i) => ({ i, v }));
  const hasDelta = delta !== undefined;
  const deltaPositive = (delta ?? 0) >= 0;

  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 14, padding: '16px 18px', boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>{label}</p>
        {perOutletRows && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setShowOutlets(false)} style={{ padding: '2px 6px', borderRadius: 4, border: 'none', background: !showOutlets ? 'var(--violet-dim)' : 'transparent', color: 'var(--text-secondary)', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}>📈</button>
            <button onClick={() => setShowOutlets(true)} style={{ padding: '2px 6px', borderRadius: 4, border: 'none', background: showOutlets ? 'var(--violet-dim)' : 'transparent', color: 'var(--text-secondary)', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}>⊞</button>
          </div>
        )}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
        {fmt(value, format)}
      </div>
      {hasDelta && (
        <div style={{ fontSize: 12, color: deltaPositive ? '#34D399' : '#F87171', fontWeight: 600 }}>
          {deltaPositive ? '↑' : '↓'} {Math.abs(delta!).toFixed(1)}% {deltaLabel ?? 'vs prev'}
        </div>
      )}
      {sparkPoints.length >= 2 && !showOutlets && (
        <ResponsiveContainer width="100%" height={60}>
          <LineChart data={sparkPoints} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <Line type="monotone" dataKey="v" stroke="var(--violet)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
      {showOutlets && perOutletRows && (
        <div style={{ marginTop: 4 }}>
          {perOutletRows.map(r => (
            <div key={r.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', padding: '3px 0', borderTop: '1px solid var(--divider)' }}>
              <span>{r.name}</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{fmt(r.value, format)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
