'use client'

interface Props {
  weekStart: string
  onPrevWeek: () => void
  onNextWeek: () => void
  onCopyLastWeek: () => void
  onAIDraft: () => void
  onSave: () => void
  onPublish: () => void
  isDirty: boolean
  isGenerating: boolean
  isSaving: boolean
  isPublishing: boolean
  shiftCount: number
}

function weekLabel(weekStart: string): string {
  const start = new Date(weekStart + 'T12:00:00')
  const end = new Date(start); end.setDate(end.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  return `${fmt(start)} – ${fmt(end)}`
}

const BTN = "px-3 py-1.5 rounded-lg text-sm transition-colors"
const BTN_SECONDARY = `${BTN} border`

export default function RosterToolbar(props: Props) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-2">
        <button onClick={props.onPrevWeek}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
          ‹
        </button>
        <span className="text-sm font-medium text-white min-w-[170px] text-center">
          {weekLabel(props.weekStart)}
        </span>
        <button onClick={props.onNextWeek}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
          ›
        </button>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <button onClick={props.onCopyLastWeek}
          className={BTN_SECONDARY}
          style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
          Copy last week
        </button>
        <button onClick={props.onAIDraft} disabled={props.isGenerating}
          className={BTN_SECONDARY + ' disabled:opacity-50'}
          style={{ background: 'rgba(147,51,234,0.1)', borderColor: 'rgba(147,51,234,0.3)', color: '#c084fc' }}>
          {props.isGenerating ? '✨ Drafting…' : '✨ Draft with Aria'}
        </button>
        <button onClick={props.onSave} disabled={!props.isDirty || props.isSaving}
          className={BTN + ' disabled:opacity-40'}
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)' }}>
          {props.isSaving ? 'Saving…' : 'Save draft'}
        </button>
        <button onClick={props.onPublish} disabled={props.shiftCount === 0 || props.isPublishing}
          className={BTN + ' disabled:opacity-40 font-medium'}
          style={{ background: '#2D5240', color: '#7FB897' }}>
          {props.isPublishing ? 'Publishing…' : `Publish (${props.shiftCount} shifts)`}
        </button>
      </div>
    </div>
  )
}
