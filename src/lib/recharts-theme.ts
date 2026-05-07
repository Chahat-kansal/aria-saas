export const ChartTheme = {
  colors: [
    '#EC4899','#8B5CF6','#3B82F6','#14B8A6','#F59E0B',
    '#94A3B8','#A855F7','#06B6D4','#EAB308','#EF4444',
  ],
  grid: { stroke: 'var(--divider)', strokeDasharray: '3 3' },
  axis: {
    tick: { fill: 'var(--text-tertiary)', fontSize: 11 },
    tickLine: { stroke: 'var(--divider)' },
    axisLine: { stroke: 'var(--divider)' },
  },
  tooltip: {
    contentStyle: {
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-default)',
      borderRadius: 12,
      padding: '8px 12px',
      boxShadow: 'var(--shadow-md)',
      fontSize: 13,
    },
    labelStyle: { color: 'var(--text-secondary)', marginBottom: 4 },
    itemStyle: { color: 'var(--text-primary)' },
    cursor: { fill: 'rgba(124,58,237,0.06)' },
    formatter: (value: unknown, name: string): [string, string] => [
      typeof value === 'number'
        ? new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value)
        : String(value),
      name,
    ],
  },
  legend: {
    iconType: 'circle' as const,
    wrapperStyle: { paddingTop: 12, fontSize: 12 },
  },
};

export function fmtAUD(dollars: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(dollars);
}

export function fmtCount(n: number): string {
  return new Intl.NumberFormat('en-AU').format(n);
}

export function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

export function fmtDate(d: string | Date, period: 'day' | 'week' | 'month' | 'year' = 'day'): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (period === 'month' || period === 'year') {
    return dt.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
  }
  return dt.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}
