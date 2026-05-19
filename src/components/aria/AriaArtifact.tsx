'use client'
import { useEffect, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'

const RAMP: Record<string, string> = {
  amber: '#EF9F27', blue: '#378ADD', teal: '#1D9E75', coral: '#D85A30',
  purple: '#7F77DD', green: '#639922', gray: '#888780', pink: '#D4537E', red: '#E24B4A',
}

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
  good:    { bg: 'rgba(127,184,151,0.12)', text: '#2D5240', icon: '✓' },
  warning: { bg: 'rgba(239,159,39,0.12)',  text: '#854F0B', icon: '⚠' },
  danger:  { bg: 'rgba(226,75,74,0.12)',   text: '#791F1F', icon: '!' },
  neutral: { bg: 'rgba(0,0,0,0.06)',       text: '#666',    icon: '·' },
}

interface ArtifactProps { type: string; title?: string; data: Record<string, unknown> }

export function AriaArtifact({ type, title, data }: ArtifactProps) {
  return (
    <div className="my-3 rounded-xl overflow-hidden"
      style={{ border: '1px solid rgba(127,184,151,0.25)', background: 'rgba(255,255,255,0.03)' }}>
      {title && (
        <div className="px-4 py-2.5" style={{ borderBottom: '1px solid rgba(127,184,151,0.15)', background: 'rgba(127,184,151,0.06)' }}>
          <p className="text-sm font-medium" style={{ color: '#7FB897' }}>{title}</p>
        </div>
      )}
      <div className="p-4">
        {type === 'line_chart'       && <LineChartView data={data} />}
        {type === 'bar_chart'        && <BarChartView data={data} />}
        {type === 'metric_cards'     && <MetricCardsView data={data} />}
        {type === 'comparison_table' && <ComparisonTableView data={data} />}
        {type === 'breakdown_table'  && <BreakdownTableView data={data} />}
        {type === 'action_card'      && <ActionCardView data={data} />}
        {type === 'list_with_status' && <ListWithStatusView data={data} />}
      </div>
    </div>
  )
}

function LineChartView({ data }: { data: Record<string, unknown> }) {
  const labels = data.labels as string[]
  const values = data.values as number[]
  const label = data.label as string
  const chartData = labels.map((l, i) => ({ name: l, value: values[i] ?? 0 }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,184,151,0.12)" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#888' }} stroke="none" />
        <YAxis tick={{ fontSize: 11, fill: '#888' }} stroke="none" />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: '1px solid rgba(127,184,151,0.3)', background: '#13131a', fontSize: 12 }}
          formatter={(v: unknown) => [`${v}`, label]}
        />
        <Line type="monotone" dataKey="value" stroke="#7FB897" strokeWidth={2.5}
          dot={{ r: 3, fill: '#7FB897', strokeWidth: 0 }} animationDuration={700} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function BarChartView({ data }: { data: Record<string, unknown> }) {
  const labels = data.labels as string[]
  const values = data.values as number[]
  const label = data.label as string
  const chartData = labels.map((l, i) => ({ name: l, value: values[i] ?? 0 }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,184,151,0.12)" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#888' }} stroke="none" />
        <YAxis tick={{ fontSize: 11, fill: '#888' }} stroke="none" />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: '1px solid rgba(127,184,151,0.3)', background: '#13131a', fontSize: 12 }}
          formatter={(v: unknown) => [`${v}`, label]}
        />
        <Bar dataKey="value" fill="#2D5240" radius={[4, 4, 0, 0]} animationDuration={700} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function MetricCardsView({ data }: { data: Record<string, unknown> }) {
  const [show, setShow] = useState(false)
  useEffect(() => { const t = setTimeout(() => setShow(true), 50); return () => clearTimeout(t) }, [])
  const cards = data.cards as Array<{ label: string; value: string; trend?: number }>
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {cards.map((c, i) => (
        <div key={i} className="rounded-lg p-3"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(127,184,151,0.12)', opacity: show ? 1 : 0, transition: `opacity 500ms ${i * 80}ms` }}>
          <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{c.label}</p>
          <p className="text-xl font-medium" style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', color: '#e5e7eb' }}>{c.value}</p>
          {typeof c.trend === 'number' && (
            <p className="text-xs mt-0.5" style={{ color: c.trend >= 0 ? '#7FB897' : '#f87171' }}>
              {c.trend >= 0 ? '↑' : '↓'} {Math.abs(c.trend)}%
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

function ComparisonTableView({ data }: { data: Record<string, unknown> }) {
  const headers = data.headers as string[]
  const rows = data.rows as string[][]
  const highlight = data.highlight_row as number | undefined
  return (
    <div className="overflow-hidden rounded-lg" style={{ border: '1px solid rgba(127,184,151,0.15)' }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: 'rgba(127,184,151,0.08)' }}>
            {headers.map((h, i) => (
              <th key={i} className="text-left px-3 py-2 text-xs font-medium uppercase tracking-wide" style={{ color: '#7FB897' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ borderTop: '1px solid rgba(127,184,151,0.08)', background: ri === highlight ? 'rgba(127,184,151,0.08)' : 'transparent' }}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2" style={{ color: ci === 0 ? 'rgba(255,255,255,0.6)' : '#e5e7eb' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BreakdownTableView({ data }: { data: Record<string, unknown> }) {
  const [show, setShow] = useState(false)
  useEffect(() => { const t = setTimeout(() => setShow(true), 80); return () => clearTimeout(t) }, [])
  const items = data.items as Array<{ label: string; value: number; color?: string }>
  const total = data.total as number
  const fmt = data.format as string
  const max = Math.max(...items.map(i => i.value), 1)
  const format = (v: number) => fmt === 'currency' ? `$${v.toLocaleString()}` : fmt === 'percent' ? `${v}%` : v.toLocaleString()
  return (
    <div className="space-y-2.5">
      {items.map((item, i) => {
        const pct = (item.value / max) * 100
        const color = RAMP[item.color ?? 'gray'] ?? RAMP.gray
        return (
          <div key={i}>
            <div className="flex justify-between text-sm mb-1">
              <span style={{ color: 'rgba(255,255,255,0.7)' }}>{item.label}</span>
              <span className="font-medium" style={{ color: '#e5e7eb' }}>{format(item.value)}</span>
            </div>
            <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div className="h-full rounded-full"
                style={{ width: show ? `${pct}%` : '0%', background: color, transition: `width 700ms cubic-bezier(0.4,0,0.2,1) ${i * 60}ms` }} />
            </div>
          </div>
        )
      })}
      <div className="flex justify-between text-sm font-medium pt-2 mt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb' }}>
        <span>Total</span><span>{format(total)}</span>
      </div>
    </div>
  )
}

function ActionCardView({ data }: { data: Record<string, unknown> }) {
  const action = data.action as { label: string; prompt: string }
  return (
    <div className="space-y-2">
      <p className="font-medium" style={{ color: '#e5e7eb' }}>{data.title as string}</p>
      <p className="text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>{data.description as string}</p>
      {action && (
        <button
          onClick={() => { if (typeof window !== 'undefined') { const fn = (window as unknown as Record<string, unknown>).ariaSendPrompt; if (typeof fn === 'function') fn(action.prompt) } }}
          className="mt-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ background: '#2D5240', color: '#7FB897', border: '1px solid rgba(127,184,151,0.3)' }}>
          {action.label} →
        </button>
      )}
    </div>
  )
}

function ListWithStatusView({ data }: { data: Record<string, unknown> }) {
  const items = data.items as Array<{ label: string; value: string; status: string }>
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => {
        const s = STATUS_STYLES[item.status] ?? STATUS_STYLES.neutral
        return (
          <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: s.bg }}>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold" style={{ color: s.text }}>{s.icon}</span>
              <span className="text-sm" style={{ color: s.text }}>{item.label}</span>
            </div>
            <span className="text-sm font-medium" style={{ color: s.text }}>{item.value}</span>
          </div>
        )
      })}
    </div>
  )
}
