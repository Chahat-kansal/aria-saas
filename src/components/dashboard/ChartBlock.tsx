'use client';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

interface ChartData {
  type: 'bar' | 'line' | 'pie';
  title: string;
  data: { label: string; value: number; color?: string }[];
  unit: 'currency' | 'count' | 'percentage';
}

const PALETTE = ['#1D9E75','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16'];

function fmt(value: number, unit: string) {
  if (unit === 'currency') return `A$${value.toLocaleString('en-AU', { maximumFractionDigits: 0 })}`;
  if (unit === 'percentage') return `${value}%`;
  return value.toLocaleString();
}

function CustomTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1a24] border border-[rgba(255,255,255,0.1)] rounded-xl px-3 py-2 text-xs">
      <p className="text-[rgba(255,255,255,0.5)] mb-1">{label}</p>
      <p className="text-white font-semibold">{fmt(payload[0].value, unit)}</p>
    </div>
  );
}

export default function ChartBlock({ chart }: { chart: ChartData }) {
  const { type, title, data, unit } = chart;
  const chartData = data.map(d => ({ name: d.label, value: d.value, fill: d.color }));

  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.08)] overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.03)' }}>
      <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.06)]">
        <p className="text-xs font-semibold text-white">{title}</p>
      </div>
      <div className="p-4">
        {type === 'bar' && (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => unit === 'currency' ? `A$${(v/1000).toFixed(0)}k` : String(v)} />
              <Tooltip content={<CustomTooltip unit={unit} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill ?? PALETTE[i % PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {type === 'line' && (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => unit === 'currency' ? `A$${(v/1000).toFixed(0)}k` : String(v)} />
              <Tooltip content={<CustomTooltip unit={unit} />} />
              <Line type="monotone" dataKey="value" stroke="#1D9E75" strokeWidth={2}
                dot={{ fill: '#1D9E75', strokeWidth: 0, r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        )}

        {type === 'pie' && (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                outerRadius={80}
                label={false}
                labelLine={false}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill ?? PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip unit={unit} />} />
              <Legend wrapperStyle={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
