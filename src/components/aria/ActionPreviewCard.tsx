'use client'
import type { PlannedAction } from '@/lib/aria/ask/action-planner'

interface Props {
  action: PlannedAction
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}

const RISK_COLOR = { low: '#22c55e', medium: '#f59e0b', high: '#ef4444' } as const
const RISK_BORDER = { low: 'rgba(34,197,94,0.25)', medium: 'rgba(245,158,11,0.25)', high: 'rgba(239,68,68,0.25)' } as const
const RISK_BG = { low: 'rgba(34,197,94,0.05)', medium: 'rgba(245,158,11,0.05)', high: 'rgba(239,68,68,0.05)' } as const

export default function ActionPreviewCard({ action, onConfirm, onCancel, loading }: Props) {
  return (
    <div className="mt-2 rounded-xl p-4 space-y-3"
      style={{ border: `1px solid ${RISK_BORDER[action.risk]}`, background: RISK_BG[action.risk] }}>
      <div className="flex justify-between items-start gap-3">
        <div>
          <p className="font-medium text-white text-sm">{action.title}</p>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>{action.description}</p>
        </div>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 capitalize"
          style={{ color: RISK_COLOR[action.risk], background: `${RISK_COLOR[action.risk]}22` }}>
          {action.risk} risk
        </span>
      </div>

      <div className="space-y-1">
        <p className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>What will happen</p>
        {action.preview.map((line, i) => (
          <div key={i} className="flex gap-2 text-sm">
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>•</span>
            <span className="text-white">{line}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
        <span>{action.affected_count} item{action.affected_count !== 1 ? 's' : ''} affected</span>
        {action.estimated_impact && <span>{action.estimated_impact}</span>}
        {action.reversible && <span style={{ color: '#22c55e' }}>Reversible within 1 hour</span>}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={onConfirm}
          disabled={loading}
          className="flex-1 py-2 rounded-xl text-sm font-medium transition-opacity disabled:opacity-50"
          style={{ background: '#2D5240', color: '#fff' }}
        >
          {loading ? 'Executing…' : 'Confirm — Do it'}
        </button>
        <button
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-50"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
        >
          Cancel
        </button>
      </div>

      <p className="text-[10px] text-center" style={{ color: 'rgba(255,255,255,0.25)' }}>
        Or type "yes" / "confirm" to proceed · "no" / "cancel" to abort
      </p>
    </div>
  )
}
