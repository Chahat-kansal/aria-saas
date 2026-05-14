'use client'
import { useState, useEffect, useRef } from 'react'

interface PosTable {
  id: string
  name: string
  section: string | null
  seats: number
  status: 'available' | 'seated' | 'ordering' | 'eating' | 'check' | 'dirty'
  pos_x: number
  pos_y: number
  shape: 'square' | 'round' | 'rectangle'
  current_sale_id: string | null
}

const STATUS_COLORS: Record<string, string> = {
  available: '#7FB897',
  seated:    '#F59E0B',
  ordering:  '#60A5FA',
  eating:    '#3B82F6',
  check:     '#EF4444',
  dirty:     '#6B7280',
}

interface Props {
  businessId: string
  onTableSelect: (table: PosTable) => void
  editMode?: boolean
}

export function FloorPlan({ businessId, onTableSelect, editMode = false }: Props) {
  const [tables, setTables]       = useState<PosTable[]>([])
  const [loading, setLoading]     = useState(true)
  const [dragging, setDragging]   = useState<string | null>(null)
  const [newName, setNewName]     = useState('')
  const [newSection, setNewSection] = useState('')
  const containerRef              = useRef<HTMLDivElement>(null)

  const load = async () => {
    setLoading(true)
    const res = await fetch(`/api/pos/tables?business_id=${businessId}`)
    const d   = await res.json()
    setTables(d.tables ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [businessId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDragStart = (e: React.DragEvent, id: string) => {
    if (!editMode) return
    setDragging(id)
    e.dataTransfer.setData('text/plain', id)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    if (!editMode || !dragging || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const pos_x = Math.round((e.clientX - rect.left) / 80) * 80
    const pos_y = Math.round((e.clientY - rect.top)  / 80) * 80
    await fetch(`/api/pos/tables/${dragging}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pos_x, pos_y }),
    })
    setDragging(null)
    load()
  }

  const handleAddTable = async () => {
    if (!newName.trim()) return
    await fetch('/api/pos/tables', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId, name: newName.trim(), section: newSection.trim() || null }),
    })
    setNewName(''); setNewSection('')
    load()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this table?')) return
    await fetch(`/api/pos/tables/${id}`, { method: 'DELETE' })
    load()
  }

  const markClean = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await fetch(`/api/pos/tables/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'available' }),
    })
    load()
  }

  if (loading) return <div style={{ padding: 24, color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading floor plan…</div>

  const sections = [...new Set(tables.map(t => t.section ?? 'Main'))].sort()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#090e0b' }}>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 10, padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
        {Object.entries(STATUS_COLORS).map(([s, c]) => (
          <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, display: 'inline-block' }} />
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </span>
        ))}
        {editMode && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
            <input value={newSection} onChange={e => setNewSection(e.target.value)} placeholder="Section"
              style={{ width: 80, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, padding: '3px 6px', color: '#fff', fontSize: 11, outline: 'none' }} />
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Table name *"
              style={{ width: 100, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, padding: '3px 6px', color: '#fff', fontSize: 11, outline: 'none' }}
              onKeyDown={e => e.key === 'Enter' && handleAddTable()} />
            <button onClick={handleAddTable}
              style={{ padding: '3px 10px', borderRadius: 5, border: 'none', background: '#7FB897', color: '#fff', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>
              + Add
            </button>
          </div>
        )}
      </div>

      {/* Floor plan canvas */}
      <div ref={containerRef} onDragOver={e => e.preventDefault()} onDrop={handleDrop}
        style={{ flex: 1, position: 'relative', overflow: 'auto', minHeight: 320 }}>

        {sections.map(section => (
          <div key={section}>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '10px 14px 4px' }}>{section}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '4px 12px 12px' }}>
              {tables.filter(t => (t.section ?? 'Main') === section).map(table => {
                const color = STATUS_COLORS[table.status] ?? '#6B7280'
                return (
                  <div key={table.id}
                    draggable={editMode}
                    onDragStart={e => handleDragStart(e, table.id)}
                    onClick={() => table.status !== 'dirty' && onTableSelect(table)}
                    style={{
                      width: table.shape === 'rectangle' ? 110 : 72,
                      height: 72,
                      borderRadius: table.shape === 'round' ? '50%' : 10,
                      border: `2px solid ${color}`,
                      background: `${color}18`,
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      cursor: editMode ? 'grab' : table.status === 'dirty' ? 'default' : 'pointer',
                      transition: 'all 0.15s', position: 'relative',
                      userSelect: 'none',
                    }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color }}>
                      {table.name}
                    </span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                      {table.seats} seats
                    </span>
                    {table.status !== 'available' && (
                      <span style={{ fontSize: 9, color, marginTop: 1 }}>{table.status}</span>
                    )}
                    {table.status === 'dirty' && (
                      <button onClick={e => markClean(table.id, e)}
                        style={{ position: 'absolute', bottom: -8, fontSize: 9, padding: '1px 6px', borderRadius: 10, border: 'none', background: '#7FB897', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                        ✓ Clean
                      </button>
                    )}
                    {editMode && (
                      <button onClick={e => { e.stopPropagation(); handleDelete(table.id) }}
                        style={{ position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: '50%', border: 'none', background: '#EF4444', color: '#fff', cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        ×
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {tables.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.2)' }}>
            <p style={{ fontSize: 32, margin: '0 0 8px' }}>🪑</p>
            <p style={{ fontSize: 13 }}>No tables configured.{editMode ? ' Use + Add above.' : ' Enable edit mode to add tables.'}</p>
          </div>
        )}
      </div>
    </div>
  )
}