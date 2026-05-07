'use client'
import React from 'react'

interface MetricCard {
  type: 'metric'
  label: string
  value: string
  prefix?: string
  suffix?: string
  change_pct?: number
  change_dir?: 'up' | 'down' | 'flat'
  color?: string
}

interface AlertCard {
  type: 'alert'
  severity: 'urgent' | 'warning' | 'info'
  title: string
  description: string
  icon?: string
}

type Card = MetricCard | AlertCard

interface DataTable {
  title: string
  columns: string[]
  rows: string[][]
  highlight_row?: number
}

interface ChartData {
  type: 'line' | 'bar'
  labels: string[]
  values: number[]
  label: string
  color: string
}

interface AriaAction {
  label: string
  action: string
  data: Record<string, unknown>
  color?: string
  icon?: string
}

export interface AriaResponse {
  message: string
  cards?: Card[]
  data_tables?: DataTable[]
  chart?: ChartData | null
  actions?: AriaAction[]
  action_results?: { type: string; message: string }[]
  context_type?: string
}

interface Props {
  response: AriaResponse
  onAction?: (action: string, data: Record<string, unknown>) => void
  isLoading?: boolean
}

function MiniBarChart({ data }: { data: ChartData }) {
  const max = Math.max(...data.values, 1)
  const barWidth = Math.max(12, Math.floor(240 / data.values.length) - 4)
  return (
    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '12px 14px', marginTop: 8 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(130,160,200,0.6)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 10 }}>{data.label}</p>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 60, overflowX: 'auto' as const }}>
        {data.values.map((v, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 3, flexShrink: 0 }}>
            <div style={{ width: barWidth, height: Math.max(3, (v / max) * 56), background: data.color || '#00E5FF', borderRadius: '3px 3px 0 0', opacity: 0.85 }} />
            <span style={{ fontSize: 8, color: 'rgba(130,160,200,0.5)', whiteSpace: 'nowrap' as const }}>{data.labels[i]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MetricCardComp({ card }: { card: MetricCard }) {
  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
    green:  { bg: 'rgba(34,197,94,0.08)',  text: '#22C55E', border: 'rgba(34,197,94,0.2)' },
    red:    { bg: 'rgba(239,68,68,0.08)',  text: '#EF4444', border: 'rgba(239,68,68,0.2)' },
    amber:  { bg: 'rgba(245,158,11,0.08)', text: '#F59E0B', border: 'rgba(245,158,11,0.2)' },
    violet: { bg: 'rgba(139,92,246,0.08)', text: '#8B5CF6', border: 'rgba(139,92,246,0.2)' },
    cyan:   { bg: 'rgba(0,229,255,0.06)',  text: '#00E5FF', border: 'rgba(0,229,255,0.15)' },
    blue:   { bg: 'rgba(59,130,246,0.08)', text: '#3B82F6', border: 'rgba(59,130,246,0.2)' },
  }
  const colors = colorMap[card.color || 'cyan'] || colorMap.cyan
  const trendColor = card.change_dir === 'up' ? '#22C55E' : card.change_dir === 'down' ? '#EF4444' : 'rgba(130,160,200,0.6)'
  const trendIcon = card.change_dir === 'up' ? '↑' : card.change_dir === 'down' ? '↓' : '—'
  return (
    <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 12, padding: '12px 14px', minWidth: 110, flex: 1 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(130,160,200,0.6)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }}>{card.label}</p>
      <p style={{ fontSize: 20, fontWeight: 800, color: colors.text, lineHeight: 1, fontFamily: "'JetBrains Mono',monospace" }}>
        {card.prefix || ''}{card.value}{card.suffix || ''}
      </p>
      {card.change_pct !== undefined && (
        <p style={{ fontSize: 11, color: trendColor, fontWeight: 600, marginTop: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
          <span>{trendIcon}</span>
          <span>{Math.abs(card.change_pct).toFixed(1)}% vs yesterday</span>
        </p>
      )}
    </div>
  )
}

function DataTableComp({ table }: { table: DataTable }) {
  return (
    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, overflow: 'hidden', marginTop: 8 }}>
      {table.title && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(130,160,200,0.7)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{table.title}</p>
        </div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
        <thead>
          <tr>
            {table.columns.map((col, i) => (
              <th key={i} style={{ textAlign: 'left' as const, padding: '7px 12px', fontSize: 10, fontWeight: 700, color: 'rgba(80,110,150,0.8)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i} style={{ background: i === table.highlight_row ? 'rgba(0,229,255,0.05)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)', borderBottom: i < table.rows.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '7px 12px', fontSize: 12, color: i === table.highlight_row ? 'rgba(220,240,255,0.95)' : 'rgba(180,210,255,0.75)', fontWeight: i === table.highlight_row ? 600 : 400, fontFamily: j > 0 ? "'JetBrains Mono',monospace" : 'inherit' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AlertCardComp({ card }: { card: AlertCard }) {
  const colors = {
    urgent:  { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.25)',  icon: '🚨', text: '#EF4444' },
    warning: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', icon: '⚠️', text: '#F59E0B' },
    info:    { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)',  icon: 'ℹ️', text: '#3B82F6' },
  }
  const c = colors[card.severity] || colors.info
  return (
    <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>{card.icon || c.icon}</span>
      <div>
        <p style={{ fontSize: 12, fontWeight: 700, color: c.text, marginBottom: 2 }}>{card.title}</p>
        <p style={{ fontSize: 11, color: 'rgba(180,210,255,0.7)', lineHeight: 1.5 }}>{card.description}</p>
      </div>
    </div>
  )
}

function ActionButton({ action, onAction }: { action: AriaAction; onAction?: (action: string, data: Record<string, unknown>) => void }) {
  const colorMap: Record<string, { bg: string; text: string; hover: string }> = {
    violet: { bg: 'rgba(139,92,246,0.15)', text: '#8B5CF6', hover: 'rgba(139,92,246,0.25)' },
    green:  { bg: 'rgba(34,197,94,0.12)',  text: '#22C55E', hover: 'rgba(34,197,94,0.2)' },
    red:    { bg: 'rgba(239,68,68,0.1)',   text: '#EF4444', hover: 'rgba(239,68,68,0.18)' },
    amber:  { bg: 'rgba(245,158,11,0.1)',  text: '#F59E0B', hover: 'rgba(245,158,11,0.18)' },
    cyan:   { bg: 'rgba(0,229,255,0.08)',  text: '#00E5FF', hover: 'rgba(0,229,255,0.14)' },
    blue:   { bg: 'rgba(59,130,246,0.1)',  text: '#3B82F6', hover: 'rgba(59,130,246,0.18)' },
  }
  const [hovered, setHovered] = React.useState(false)
  const c = colorMap[action.color || 'violet'] || colorMap.violet
  return (
    <button
      onClick={() => onAction?.(action.action, action.data)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${c.text}30`, background: hovered ? c.hover : c.bg, color: c.text, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, transition: 'background 150ms', whiteSpace: 'nowrap' as const }}>
      {action.icon && <span style={{ fontSize: 14 }}>{action.icon}</span>}
      {action.label}
    </button>
  )
}

export function AriaChatMessage({ response, onAction, isLoading }: Props) {
  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', color: 'rgba(130,160,200,0.6)', fontSize: 13 }}>
        <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(0,229,255,0.2)', borderTopColor: '#00E5FF', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
        <span>Aria is analysing your data...</span>
      </div>
    )
  }

  const metricCards = (response.cards || []).filter(c => c.type === 'metric') as MetricCard[]
  const alertCards  = (response.cards || []).filter(c => c.type === 'alert') as AlertCard[]

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10, fontFamily: "'Manrope',system-ui,sans-serif" }}>
      <p style={{ fontSize: 13, color: 'rgba(220,240,255,0.9)', lineHeight: 1.65, fontWeight: 400, margin: 0 }}>
        {response.message}
      </p>
      {metricCards.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
          {metricCards.map((card, i) => <MetricCardComp key={i} card={card} />)}
        </div>
      )}
      {alertCards.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
          {alertCards.map((card, i) => <AlertCardComp key={i} card={card as AlertCard} />)}
        </div>
      )}
      {(response.data_tables || []).map((table, i) => <DataTableComp key={i} table={table} />)}
      {response.chart && <MiniBarChart data={response.chart} />}
      {(response.action_results || []).map((result, i) => (
        <div key={i} style={{ padding: '8px 12px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, fontSize: 12, color: '#22C55E', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>✓</span><span>{result.message}</span>
        </div>
      ))}
      {(response.actions || []).length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, paddingTop: 4 }}>
          {(response.actions || []).map((action, i) => <ActionButton key={i} action={action} onAction={onAction} />)}
        </div>
      )}
    </div>
  )
}

export default AriaChatMessage
