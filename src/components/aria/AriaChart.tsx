'use client';

import {
  ResponsiveContainer,
  LineChart,
  BarChart,
  AreaChart,
  PieChart,
  Pie,
  Cell,
  Line,
  Bar,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { ChartTheme, fmtAUD } from '@/lib/recharts-theme';

export interface ChartSpec {
  type: 'line' | 'bar' | 'area' | 'pie' | 'stacked-bar';
  data: Record<string, unknown>[];
  x_field: string;
  y_field: string;
  series_field?: string;
  title: string;
  height?: number;
}

interface AriaChartProps {
  chart_spec: ChartSpec;
}

function getUniqueSeries(data: Record<string, unknown>[], field: string): string[] {
  const seen = new Set<string>();
  for (const row of data) {
    const val = String(row[field] ?? '');
    seen.add(val);
  }
  return Array.from(seen);
}

function yFormatter(v: unknown): string {
  if (typeof v !== 'number') return String(v);
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}k`;
  return String(v);
}

export default function AriaChart({ chart_spec }: AriaChartProps) {
  const { type, data, x_field, y_field, series_field, title, height = 300 } = chart_spec;

  const titleStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: 8,
    fontFamily: 'Manrope, sans-serif',
  };

  const axisTick = ChartTheme.axis.tick;
  const axisLine = ChartTheme.axis.axisLine;
  const tickLine = ChartTheme.axis.tickLine;

  if (type === 'pie') {
    return (
      <div>
        <div style={titleStyle}>{title}</div>
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={data}
              dataKey={y_field}
              nameKey={x_field}
              cx="50%"
              cy="50%"
              outerRadius={height / 2 - 20}
              label
            >
              {data.map((_entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={ChartTheme.colors[index % ChartTheme.colors.length]}
                />
              ))}
            </Pie>
            <Tooltip contentStyle={ChartTheme.tooltip.contentStyle} labelStyle={ChartTheme.tooltip.labelStyle} itemStyle={ChartTheme.tooltip.itemStyle} cursor={ChartTheme.tooltip.cursor} />
            <Legend {...ChartTheme.legend} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const seriesKeys = series_field ? getUniqueSeries(data, series_field) : null;

  const commonAxes = (
    <>
      <CartesianGrid {...ChartTheme.grid} />
      <XAxis
        dataKey={x_field}
        tick={axisTick}
        tickLine={tickLine}
        axisLine={axisLine}
      />
      <YAxis
        tickFormatter={yFormatter}
        tick={axisTick}
        tickLine={tickLine}
        axisLine={axisLine}
      />
      <Tooltip contentStyle={ChartTheme.tooltip.contentStyle} labelStyle={ChartTheme.tooltip.labelStyle} itemStyle={ChartTheme.tooltip.itemStyle} cursor={ChartTheme.tooltip.cursor} formatter={(v) => [fmtAUD(Number(v)), '']} />
      <Legend {...ChartTheme.legend} />
    </>
  );

  if (type === 'line') {
    return (
      <div>
        <div style={titleStyle}>{title}</div>
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data}>
            {commonAxes}
            {seriesKeys ? (
              seriesKeys.map((s, i) => (
                <Line
                  key={s}
                  type="monotone"
                  dataKey={s}
                  stroke={ChartTheme.colors[i % ChartTheme.colors.length]}
                  dot={false}
                  strokeWidth={2}
                />
              ))
            ) : (
              <Line
                type="monotone"
                dataKey={y_field}
                stroke={ChartTheme.colors[0]}
                dot={false}
                strokeWidth={2}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === 'area') {
    return (
      <div>
        <div style={titleStyle}>{title}</div>
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data}>
            {commonAxes}
            {seriesKeys ? (
              seriesKeys.map((s, i) => (
                <Area
                  key={s}
                  type="monotone"
                  dataKey={s}
                  stroke={ChartTheme.colors[i % ChartTheme.colors.length]}
                  fill={ChartTheme.colors[i % ChartTheme.colors.length]}
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              ))
            ) : (
              <Area
                type="monotone"
                dataKey={y_field}
                stroke={ChartTheme.colors[0]}
                fill={ChartTheme.colors[0]}
                fillOpacity={0.2}
                strokeWidth={2}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === 'bar' || type === 'stacked-bar') {
    const stacked = type === 'stacked-bar';
    return (
      <div>
        <div style={titleStyle}>{title}</div>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data}>
            {commonAxes}
            {seriesKeys ? (
              seriesKeys.map((s, i) => (
                <Bar
                  key={s}
                  dataKey={s}
                  fill={ChartTheme.colors[i % ChartTheme.colors.length]}
                  stackId={stacked ? 'a' : undefined}
                  radius={stacked ? undefined : [3, 3, 0, 0]}
                />
              ))
            ) : (
              <Bar
                dataKey={y_field}
                fill={ChartTheme.colors[0]}
                radius={[3, 3, 0, 0]}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return null;
}
