'use client'
import type { ModifierGroup } from '@/types/pos-modifiers'

interface Props {
  groups: ModifierGroup[]
  selectedId: string | null
  onSelect: (g: ModifierGroup) => void
  onDelete: (id: string) => void
  onReorder: (fromIdx: number, toIdx: number) => void
}

export function ModifierGroupList({ groups, selectedId, onSelect, onDelete, onReorder }: Props) {
  const handleDragStart = (e: React.DragEvent, idx: number) => {
    e.dataTransfer.setData('text/plain', String(idx))
  }
  const handleDrop = (e: React.DragEvent, toIdx: number) => {
    e.preventDefault()
    const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10)
    if (fromIdx !== toIdx) onReorder(fromIdx, toIdx)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {groups.map((g, idx) => (
        <div
          key={g.id}
          draggable
          onDragStart={e => handleDragStart(e, idx)}
          onDragOver={e => e.preventDefault()}
          onDrop={e => handleDrop(e, idx)}
          onClick={() => onSelect(g)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
            background: selectedId === g.id ? 'rgba(127,184,151,0.15)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${selectedId === g.id ? 'rgba(127,184,151,0.4)' : 'rgba(255,255,255,0.07)'}`,
            transition: 'all 0.12s',
          }}
        >
          <span style={{ fontSize: 14, cursor: 'grab' }}>⠿</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: '#fff', fontSize: 13, fontWeight: 600, margin: 0 }}>{g.name}</p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, margin: 0 }}>
              {g.selection_type === 'single' ? 'Single' : 'Multi'} · {g.modifiers?.length ?? 0} options
              {g.is_required ? ' · Required' : ''}
            </p>
          </div>
          <div
            style={{ width: 10, height: 10, borderRadius: '50%', background: g.color ?? '#7FB897', flexShrink: 0 }}
          />
          <button
            onClick={e => { e.stopPropagation(); onDelete(g.id) }}
            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}