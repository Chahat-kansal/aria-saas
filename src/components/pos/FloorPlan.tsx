'use client'
import { useState, useEffect, useRef } from 'react'
import { FloorCanvas, type FloorElement } from '@/components/booking/FloorCanvas'

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
  // FLOOR-1 — owner-editable booking properties, optional since older rows predate them
  is_guest_selectable?: boolean
  seating_area?: string | null
  display_name?: string | null
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
  // FLOOR-1 — when true, clicking a table opens the booking-properties editor (guest-selectable /
  // seating_area / display_name) instead of firing onTableSelect's seating flow. Same canvas,
  // same data, a different click action — the terminal's own usage is untouched (defaults false).
  configMode?: boolean
  // BOOKINGS-MOCKUP-MATCH — 'grouped' (default) is the terminal's existing flex-wrap-by-section
  // view, byte-unchanged. 'canvas' is the new full layout editor: real x/y/width/height/rotation,
  // drag/resize/rotate, decorative elements, duplicate/archive — used only by the owner's new
  // Tables & Seating panel.
  layoutMode?: 'grouped' | 'canvas'
}

// ── OLD grouped-by-section view (terminal's dine-in seating flow) — unchanged ──────────────────
function GroupedFloorPlan({ businessId, onTableSelect, editMode = false, configMode = false }: {
  businessId: string
  onTableSelect: (table: PosTable) => void
  editMode?: boolean
  configMode?: boolean
}) {
  const [tables, setTables]       = useState<PosTable[]>([])
  const [loading, setLoading]     = useState(true)
  const [dragging, setDragging]   = useState<string | null>(null)
  const [newName, setNewName]     = useState('')
  const [newSection, setNewSection] = useState('')
  const [configTable, setConfigTable] = useState<PosTable | null>(null)
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
                    onClick={() => {
                      if (configMode) { setConfigTable(table); return }
                      if (table.status !== 'dirty') onTableSelect(table)
                    }}
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
                      {table.display_name || table.name}
                    </span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                      {table.seats} seats
                    </span>
                    {table.status !== 'available' && !configMode && (
                      <span style={{ fontSize: 9, color, marginTop: 1 }}>{table.status}</span>
                    )}
                    {configMode && (
                      <span style={{ fontSize: 9, color: table.is_guest_selectable ? '#d9f54e' : 'rgba(255,255,255,0.3)', marginTop: 1 }}>
                        {table.is_guest_selectable ? '● guest-selectable' : '○ owner-only'}
                      </span>
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

      {configTable && (
        <TableConfigPanel
          table={configTable}
          onClose={() => setConfigTable(null)}
          onSaved={updated => {
            setTables(p => p.map(t => t.id === updated.id ? { ...t, ...updated } : t))
            setConfigTable(null)
          }}
        />
      )}
    </div>
  )
}

function TableConfigPanel({ table, onClose, onSaved }: {
  table: PosTable
  onClose: () => void
  onSaved: (updated: PosTable) => void
}) {
  const [selectable, setSelectable] = useState(!!table.is_guest_selectable)
  const [area, setArea] = useState(table.seating_area ?? '')
  const [displayName, setDisplayName] = useState(table.display_name ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const res = await fetch(`/api/pos/tables/${table.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        is_guest_selectable: selectable,
        seating_area: area.trim() || null,
        display_name: displayName.trim() || null,
      }),
    })
    const d = await res.json()
    setSaving(false)
    if (d.table) onSaved(d.table)
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#141a16', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 20, width: '100%', maxWidth: 340 }}>
        <p style={{ color: '#fff', fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Table {table.name} — booking properties</p>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={selectable} onChange={e => setSelectable(e.target.checked)} style={{ accentColor: '#7FB897' }} />
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>Guests can pick this table (Table mode)</span>
        </label>

        <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Seating area (e.g. "Window", "Patio")</label>
        <input value={area} onChange={e => setArea(e.target.value)} placeholder="Main Floor"
          style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '8px 10px', color: '#fff', fontSize: 13, outline: 'none', marginBottom: 12, boxSizing: 'border-box' }} />

        <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Guest-facing name (optional — "Window 2" reads better than "T7")</label>
        <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder={table.name}
          style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '8px 10px', color: '#fff', fontSize: 13, outline: 'none', marginBottom: 16, boxSizing: 'border-box' }} />

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={save} disabled={saving} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', background: '#7FB897', color: '#0a1510', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.7)', fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── NEW: full canvas layout editor ───────────────────────────────────────────────────────────
interface CanvasRow extends FloorElement {
  status: string
  is_guest_selectable?: boolean
}

const ADDABLE_ELEMENTS: Array<{ type: FloorElement['element_type']; label: string }> = [
  { type: 'bar', label: 'Bar' },
  { type: 'counter', label: 'Counter' },
  { type: 'kitchen', label: 'Kitchen' },
  { type: 'entrance', label: 'Entrance' },
  { type: 'wall', label: 'Wall' },
  { type: 'plant', label: 'Plant' },
]

function CanvasFloorPlan({ businessId }: { businessId: string }) {
  const [rows, setRows] = useState<CanvasRow[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'edit' | 'preview'>('edit')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [error, setError] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ id: string; kind: 'move' | 'resize'; startX: number; startY: number; orig: { pos_x: number; pos_y: number; width: number; height: number } } | null>(null)

  const load = async () => {
    setLoading(true)
    const res = await fetch(`/api/pos/tables?business_id=${businessId}`)
    const d = await res.json()
    setRows(((d.tables ?? []) as Array<Record<string, unknown>>).map(t => ({
      id: t.id as string,
      element_type: (t.element_type as FloorElement['element_type']) ?? 'table',
      name: t.name as string,
      display_name: t.display_name as string | null,
      seats: (t.seats as number) ?? 0,
      shape: (t.shape as FloorElement['shape']) ?? 'square',
      pos_x: (t.pos_x as number) ?? 0,
      pos_y: (t.pos_y as number) ?? 0,
      width: (t.width as number) ?? 72,
      height: (t.height as number) ?? 72,
      rotation: (t.rotation as number) ?? 0,
      seating_area: t.seating_area as string | null,
      status: (t.status as string) ?? 'available',
      is_guest_selectable: (t.is_guest_selectable as boolean) ?? false,
    })))
    setLoading(false)
  }

  useEffect(() => { load() }, [businessId]) // eslint-disable-line react-hooks/exhaustive-deps

  const selected = rows.find(r => r.id === selectedId) ?? null

  async function patchRow(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/pos/tables/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await res.json()
    if (d.table) setRows(p => p.map(r => r.id === id ? { ...r, ...body } : r))
    return d
  }

  async function addRow(kind: 'table' | FloorElement['element_type']) {
    const isTable = kind === 'table'
    const res = await fetch('/api/pos/tables', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: businessId,
        name: isTable ? 'New table' : kind.charAt(0).toUpperCase() + kind.slice(1),
        seats: isTable ? 2 : 0,
        shape: isTable ? 'square' : 'rectangle',
        pos_x: 40, pos_y: 40, width: isTable ? 64 : 120, height: isTable ? 64 : 60,
        element_type: kind,
        is_guest_selectable: false,
      }),
    })
    const d = await res.json()
    if (d.table) { await load(); setSelectedId(d.table.id) }
    setAddMenuOpen(false)
  }

  async function duplicate(row: CanvasRow) {
    const res = await fetch('/api/pos/tables', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: businessId,
        name: row.name + ' copy',
        seats: row.seats, shape: row.shape,
        pos_x: row.pos_x + 24, pos_y: row.pos_y + 24, width: row.width, height: row.height,
        rotation: row.rotation, element_type: row.element_type, seating_area: row.seating_area,
      }),
    })
    const d = await res.json()
    if (d.table) { await load(); setSelectedId(d.table.id) }
  }

  async function archiveOrDelete(row: CanvasRow) {
    setError('')
    const res = await fetch(`/api/pos/tables/${row.id}`, { method: 'DELETE' })
    if (res.ok) { setSelectedId(null); await load(); return }
    const d = await res.json().catch(() => ({}))
    if (res.status === 409) {
      // Has booking history — archive instead, per RULE0 (never lose data).
      await patchRow(row.id, { archived_at: new Date().toISOString() })
      setSelectedId(null)
      await load()
      return
    }
    setError(d.error || 'Could not remove this element.')
  }

  function onPointerDownMove(e: React.PointerEvent, row: CanvasRow) {
    if (view !== 'edit') return
    e.stopPropagation()
    setSelectedId(row.id)
    dragState.current = { id: row.id, kind: 'move', startX: e.clientX, startY: e.clientY, orig: { pos_x: row.pos_x, pos_y: row.pos_y, width: row.width, height: row.height } }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  function onPointerDownResize(e: React.PointerEvent, row: CanvasRow) {
    if (view !== 'edit') return
    e.stopPropagation()
    setSelectedId(row.id)
    dragState.current = { id: row.id, kind: 'resize', startX: e.clientX, startY: e.clientY, orig: { pos_x: row.pos_x, pos_y: row.pos_y, width: row.width, height: row.height } }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  function onPointerMove(e: PointerEvent) {
    const d = dragState.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    setRows(p => p.map(r => {
      if (r.id !== d.id) return r
      if (d.kind === 'move') return { ...r, pos_x: Math.max(0, d.orig.pos_x + dx), pos_y: Math.max(0, d.orig.pos_y + dy) }
      return { ...r, width: Math.max(32, d.orig.width + dx), height: Math.max(32, d.orig.height + dy) }
    }))
  }

  function onPointerUp() {
    const d = dragState.current
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    dragState.current = null
    if (!d) return
    const row = rows.find(r => r.id === d.id)
    if (!row) return
    if (d.kind === 'move') patchRow(row.id, { pos_x: row.pos_x, pos_y: row.pos_y })
    else patchRow(row.id, { width: row.width, height: row.height })
  }

  function rotateBy(delta: number) {
    if (!selected) return
    const rotation = (selected.rotation + delta + 360) % 360
    setRows(p => p.map(r => r.id === selected.id ? { ...r, rotation } : r))
    patchRow(selected.id, { rotation })
  }

  if (loading) return <div style={{ padding: 24, color: 'var(--text-secondary,#A8B5A8)', fontSize: 13 }}>Loading floor plan…</div>

  if (view === 'preview') {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <button onClick={() => setView('edit')} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(127,184,151,0.3)', background: 'transparent', color: '#7FB897', cursor: 'pointer', fontSize: 12 }}>← Back to editing</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary,#A8B5A8)', marginBottom: 10 }}>Exactly what a customer sees in Table mode (owner-only elements are hidden).</p>
        <FloorCanvas elements={rows.filter(r => r.element_type !== 'table' || r.is_guest_selectable !== false)} interactive={false} />
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => addRow('table')} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#7FB897', color: '#0a1510', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>+ Table</button>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setAddMenuOpen(o => !o)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(127,184,151,0.3)', background: 'transparent', color: '#7FB897', cursor: 'pointer', fontSize: 12 }}>+ Element ▾</button>
          {addMenuOpen && (
            <div style={{ position: 'absolute', top: '110%', left: 0, background: '#141a16', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 6, zIndex: 20, minWidth: 130 }}>
              {ADDABLE_ELEMENTS.map(el => (
                <button key={el.type} onClick={() => addRow(el.type)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', borderRadius: 6, border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 12 }}>
                  {el.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => setView('preview')} style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 12 }}>Preview customer view →</button>
      </div>

      {error && <p style={{ color: '#EF4444', fontSize: 12, marginBottom: 10 }}>{error}</p>}

      <div ref={containerRef} style={{ position: 'relative', width: '100%', height: 460, overflow: 'auto', background: '#0d1310', borderRadius: 10 }}>
        <div style={{ position: 'relative', width: 900, height: 560 }}>
          {rows.map(row => {
            const isSel = row.id === selectedId
            const color = row.element_type === 'table' ? (STATUS_COLORS[row.status] ?? '#6B7280') : 'rgba(255,255,255,0.5)'
            return (
              <div key={row.id}
                onPointerDown={e => onPointerDownMove(e, row)}
                style={{
                  position: 'absolute', left: row.pos_x, top: row.pos_y, width: row.width, height: row.height,
                  transform: `rotate(${row.rotation}deg)`,
                  borderRadius: row.shape === 'round' ? '50%' : row.shape === 'booth' ? 20 : 10,
                  border: `2px solid ${isSel ? '#d9f54e' : color}`,
                  background: row.element_type === 'table' ? `${color}18` : 'rgba(255,255,255,0.06)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  cursor: 'grab', touchAction: 'none', userSelect: 'none',
                }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: isSel ? '#d9f54e' : color, transform: `rotate(${-row.rotation}deg)` }}>
                  {row.display_name || row.name}
                </span>
                {row.element_type === 'table' && (
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', transform: `rotate(${-row.rotation}deg)` }}>{row.seats} seats</span>
                )}
                {isSel && (
                  <div
                    onPointerDown={e => onPointerDownResize(e, row)}
                    style={{ position: 'absolute', right: -6, bottom: -6, width: 14, height: 14, borderRadius: 4, background: '#d9f54e', cursor: 'nwse-resize', touchAction: 'none' }}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {selected && (
        <div style={{ marginTop: 12, background: '#141a16', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 16 }}>
          <p style={{ color: '#fff', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{selected.element_type === 'table' ? 'Table' : 'Element'} properties</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Display name</label>
              <input value={selected.display_name ?? ''} onChange={e => setRows(p => p.map(r => r.id === selected.id ? { ...r, display_name: e.target.value } : r))}
                onBlur={e => patchRow(selected.id, { display_name: e.target.value || null })}
                placeholder={selected.name}
                style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '7px 9px', color: '#fff', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            {selected.element_type === 'table' && (
              <>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Capacity</label>
                  <input type="number" value={selected.seats} onChange={e => setRows(p => p.map(r => r.id === selected.id ? { ...r, seats: parseInt(e.target.value) || 0 } : r))}
                    onBlur={e => patchRow(selected.id, { seats: parseInt(e.target.value) || 0 })}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '7px 9px', color: '#fff', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Shape</label>
                  <select value={selected.shape} onChange={e => { const shape = e.target.value as CanvasRow['shape']; setRows(p => p.map(r => r.id === selected.id ? { ...r, shape } : r)); patchRow(selected.id, { shape }) }}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '7px 9px', color: '#fff', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}>
                    <option value="square">Square</option>
                    <option value="round">Round</option>
                    <option value="rectangle">Rectangle</option>
                    <option value="booth">Booth</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Seating area</label>
                  <input value={selected.seating_area ?? ''} onChange={e => setRows(p => p.map(r => r.id === selected.id ? { ...r, seating_area: e.target.value } : r))}
                    onBlur={e => patchRow(selected.id, { seating_area: e.target.value || null })}
                    placeholder="e.g. Window"
                    style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '7px 9px', color: '#fff', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </>
            )}
          </div>
          {selected.element_type === 'table' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={selected.is_guest_selectable !== false}
                onChange={e => { const v = e.target.checked; setRows(p => p.map(r => r.id === selected.id ? { ...r, is_guest_selectable: v } as CanvasRow : r)); patchRow(selected.id, { is_guest_selectable: v }) }}
                style={{ accentColor: '#7FB897' }} />
              <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>Guests can pick this table (Table mode)</span>
            </label>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => rotateBy(-15)} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 12 }}>⟲ Rotate</button>
            <button onClick={() => rotateBy(15)} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 12 }}>⟳ Rotate</button>
            <button onClick={() => duplicate(selected)} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 12 }}>⧉ Duplicate</button>
            <button onClick={() => archiveOrDelete(selected)} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#EF4444', cursor: 'pointer', fontSize: 12 }}>Remove</button>
            <button onClick={() => setSelectedId(null)} style={{ marginLeft: 'auto', padding: '7px 12px', borderRadius: 8, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 12 }}>Done</button>
          </div>
        </div>
      )}

      {rows.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.2)' }}>
          <p style={{ fontSize: 32, margin: '0 0 8px' }}>🪑</p>
          <p style={{ fontSize: 13 }}>No tables yet. Use + Table above to start building your floor plan.</p>
        </div>
      )}
    </div>
  )
}

export function FloorPlan({ businessId, onTableSelect, editMode = false, configMode = false, layoutMode = 'grouped' }: Props) {
  if (layoutMode === 'canvas') return <CanvasFloorPlan businessId={businessId} />
  return <GroupedFloorPlan businessId={businessId} onTableSelect={onTableSelect} editMode={editMode} configMode={configMode} />
}
