'use client'
import { useState, useCallback, useRef } from 'react'
import {
  DndContext, closestCenter,
  DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors,
  useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import type { NavItem } from './sidebar-nav'

export interface NavGroup { label: string; keys: string[] }

interface Props {
  allItems: NavItem[]
  initialOrder: string[] | null
  initialGroups: NavGroup[] | null
  collapsed: boolean
  onDone: () => void
  onUpdate: (order: string[], groups: NavGroup[]) => void
  onReset: () => void
}

function txCss(t: { x: number; y: number; scaleX: number; scaleY: number } | null): string | undefined {
  if (!t) return undefined
  return 'translate3d(' + t.x + 'px,' + t.y + 'px,0)'
}

function reconcile(all: NavItem[], order: string[] | null, gs: NavGroup[] | null) {
  const valid = new Set(all.map(i => i.href))
  const base = order ?? all.map(i => i.href)
  const baseGs = gs ?? []
  const accounted = new Set([...base, ...baseGs.flatMap(g => g.keys)])
  const extras = all.filter(i => !accounted.has(i.href)).map(i => i.href)
  return {
    flatOrder: [...base.filter(h => valid.has(h)), ...extras],
    groups: baseGs
      .map(g => ({ ...g, keys: g.keys.filter(k => valid.has(k)) }))
      .filter(g => g.keys.length > 0),
  }
}

async function patchLayout(order: string[], groups: NavGroup[]): Promise<boolean> {
  try {
    const r = await fetch('/api/pos/layout-preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nav_order: order, nav_groups: groups }),
    })
    return r.ok
  } catch { return false }
}

// ── SortableItem ──────────────────────────────────────────────────────
function SortableItem({ id, item, collapsed }: { id: string; item: NavItem | undefined; collapsed: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  if (!item) return null
  const Icon = item.icon
  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: collapsed ? '8px 2px' : '5px 6px',
        borderRadius: 6, opacity: isDragging ? 0.3 : 1,
        transform: txCss(transform), transition: transition ?? undefined,
        background: 'transparent',
      }}
    >
      <span
        {...attributes}
        {...listeners}
        style={{
          color: 'rgba(127,184,151,0.55)', cursor: 'grab', flexShrink: 0,
          fontSize: 11, userSelect: 'none', padding: '1px 2px', lineHeight: 1,
          touchAction: 'none',
        }}
      >⠿</span>
      <Icon size={13} style={{ flexShrink: 0, color: 'var(--text-tertiary)' }} />
      {!collapsed && (
        <span style={{
          flex: 1, fontSize: 12, color: 'var(--text-secondary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.label}
        </span>
      )}
    </div>
  )
}

// ── GroupDropZone (empty group drop target) ───────────────────────────
function GroupDropZone({ id }: { id: string }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{
        minHeight: 8, borderRadius: 4, transition: 'background 150ms',
        background: isOver ? 'rgba(127,184,151,0.15)' : 'transparent',
        border: isOver ? '1px dashed rgba(127,184,151,0.4)' : '1px dashed transparent',
        margin: '2px 0',
      }}
    />
  )
}

// ── Main component ────────────────────────────────────────────────────
export default function POSLayoutCustomiser({
  allItems, initialOrder, initialGroups, collapsed, onDone, onUpdate, onReset,
}: Props) {
  const init = reconcile(allItems, initialOrder, initialGroups)
  const [flatOrder, setFlatOrder] = useState<string[]>(init.flatOrder)
  const [groups, setGroups] = useState<NavGroup[]>(init.groups)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [openGroups, setOpenGroups] = useState<Record<number, boolean>>({})
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const committedRef = useRef({ order: init.flatOrder, groups: init.groups })

  const itemMap = new Map(allItems.map(i => [i.href, i]))

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  const save = useCallback(async (order: string[], gs: NavGroup[]) => {
    onUpdate(order, gs)
    const ok = await patchLayout(order, gs)
    if (ok) {
      committedRef.current = { order, groups: gs }
    } else {
      setFlatOrder(committedRef.current.order)
      setGroups(committedRef.current.groups)
      onUpdate(committedRef.current.order, committedRef.current.groups)
      showToast("Couldn’t save layout — try again.")
    }
  }, [onUpdate, showToast])

  function handleDragStart(e: DragStartEvent) {
    setActiveId(e.active.id as string)
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    setActiveId(null)
    if (!over || active.id === over.id) return

    const aid = active.id as string
    const oid = over.id as string

    const aSortable = active.data.current?.sortable as { containerId?: string } | undefined
    const oSortable = over.data.current?.sortable as { containerId?: string } | undefined
    const aCon = aSortable?.containerId ?? 'flat'
    // If over is a droppable group drop zone, oCon = oid; otherwise sortable containerId
    const oCon = oSortable?.containerId ?? oid

    if (aCon === oCon) {
      if (aCon === 'flat') {
        const newOrder = arrayMove(flatOrder, flatOrder.indexOf(aid), flatOrder.indexOf(oid))
        setFlatOrder(newOrder)
        void save(newOrder, groups)
      } else {
        const gIdx = parseInt(aCon.slice(1))
        if (!isNaN(gIdx)) {
          const newKeys = arrayMove(
            groups[gIdx].keys,
            groups[gIdx].keys.indexOf(aid),
            groups[gIdx].keys.indexOf(oid),
          )
          const newGroups = groups.map((g, i) => i === gIdx ? { ...g, keys: newKeys } : g)
          setGroups(newGroups)
          void save(flatOrder, newGroups)
        }
      }
      return
    }

    // Cross-container move
    let newFlat = [...flatOrder]
    let newGs = groups.map(g => ({ ...g, keys: [...g.keys] }))

    // Remove from source
    if (aCon === 'flat') {
      newFlat = newFlat.filter(h => h !== aid)
    } else {
      const srcIdx = parseInt(aCon.slice(1))
      if (!isNaN(srcIdx)) newGs[srcIdx].keys = newGs[srcIdx].keys.filter(k => k !== aid)
    }

    // Add to destination
    if (oCon === 'flat') {
      const pos = newFlat.indexOf(oid)
      if (pos >= 0) newFlat.splice(pos, 0, aid)
      else newFlat.push(aid)
    } else if (/^g\d+$/.test(oCon)) {
      const dstIdx = parseInt(oCon.slice(1))
      if (!isNaN(dstIdx)) {
        const pos = newGs[dstIdx].keys.indexOf(oid)
        if (pos >= 0) newGs[dstIdx].keys.splice(pos, 0, aid)
        else newGs[dstIdx].keys.push(aid)
      }
    } else if (/^__g\d+$/.test(oCon)) {
      const dstIdx = parseInt(oCon.replace('__g', ''))
      if (!isNaN(dstIdx)) newGs[dstIdx].keys.push(aid)
      else newFlat.push(aid)
    } else {
      newFlat.push(aid)
    }

    newGs = newGs.filter(g => g.keys.length > 0)
    setFlatOrder(newFlat)
    setGroups(newGs)
    void save(newFlat, newGs)
  }

  function addGroup() {
    const name = newGroupName.trim()
    if (!name) return
    const newGs = [...groups, { label: name, keys: [] }]
    setGroups(newGs)
    setNewGroupName('')
    setShowNewGroup(false)
    void save(flatOrder, newGs)
  }

  function deleteGroup(idx: number) {
    const returning = groups[idx].keys
    const newFlat = [...flatOrder, ...returning]
    const newGs = groups.filter((_, i) => i !== idx)
    setFlatOrder(newFlat)
    setGroups(newGs)
    void save(newFlat, newGs)
  }

  async function handleReset() {
    try {
      const r = await fetch('/api/pos/layout-preferences', { method: 'DELETE' })
      if (!r.ok) { showToast("Couldn’t reset — try again."); return }
      const defaultOrder = allItems.map(i => i.href)
      setFlatOrder(defaultOrder)
      setGroups([])
      committedRef.current = { order: defaultOrder, groups: [] }
      onReset()
    } catch { showToast("Couldn’t reset — try again.") }
  }

  const toggleGroup = (idx: number) =>
    setOpenGroups(s => ({ ...s, [idx]: s[idx] === false ? true : false }))

  return (
    <div style={{ position: 'relative', paddingBottom: 8 }}>
      {/* Editing header */}
      {!collapsed && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 8px', marginBottom: 2 }}>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: '#f59e0b', background: 'rgba(245,158,11,0.1)',
            padding: '2px 7px', borderRadius: 99,
          }}>
            Editing layout
          </span>
          <button
            onClick={onDone}
            style={{
              background: 'rgba(45,82,64,0.5)', border: 'none', borderRadius: 6,
              padding: '3px 10px', fontSize: 11, fontWeight: 600,
              color: '#7FB897', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Done
          </button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* Flat list */}
        <SortableContext id="flat" items={flatOrder} strategy={verticalListSortingStrategy}>
          {flatOrder.map(href => (
            <SortableItem key={href} id={href} item={itemMap.get(href)} collapsed={collapsed} />
          ))}
        </SortableContext>

        {/* Groups */}
        {groups.map((group, gIdx) => {
          const isOpen = openGroups[gIdx] !== false
          return (
            <div key={gIdx} style={{ marginTop: 4 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: collapsed ? '6px 2px' : '5px 8px', borderRadius: 6,
                background: 'rgba(45,82,64,0.15)',
                border: '1px solid rgba(127,184,151,0.15)', marginBottom: 2,
              }}>
                <button
                  onClick={() => toggleGroup(gIdx)}
                  style={{
                    flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-secondary)', fontSize: 12, padding: 0,
                    lineHeight: 1, display: 'flex', alignItems: 'center', gap: 4,
                    textAlign: 'left', fontFamily: 'inherit',
                  }}
                >
                  <span style={{ display: 'inline-block', transition: 'transform 150ms', transform: isOpen ? 'rotate(90deg)' : 'rotate(0)' }}>▶</span>
                  {!collapsed && <span style={{ fontWeight: 500, fontSize: 12 }}>{group.label}</span>}
                </button>
                {!collapsed && (
                  <button
                    onClick={() => deleteGroup(gIdx)}
                    title="Remove group"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(248,113,113,0.5)', fontSize: 12, lineHeight: 1, padding: '1px 3px' }}
                  >✕</button>
                )}
              </div>

              {isOpen && (
                <div style={{ paddingLeft: collapsed ? 0 : 8 }}>
                  <SortableContext id={'g' + gIdx} items={group.keys} strategy={verticalListSortingStrategy}>
                    {group.keys.map(href => (
                      <SortableItem key={href} id={href} item={itemMap.get(href)} collapsed={collapsed} />
                    ))}
                  </SortableContext>
                  {group.keys.length === 0 && <GroupDropZone id={'__g' + gIdx} />}
                </div>
              )}
            </div>
          )
        })}

        {/* DragOverlay */}
        <DragOverlay>
          {activeId ? (() => {
            const item = itemMap.get(activeId)
            if (!item) return null
            const Icon = item.icon
            return (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 8px', borderRadius: 6,
                background: 'var(--bg-elevated)',
                border: '1px solid rgba(127,184,151,0.3)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              }}>
                <span style={{ color: '#7FB897', fontSize: 11 }}>⠿</span>
                <Icon size={13} style={{ color: 'var(--text-secondary)' }} />
                {!collapsed && (
                  <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>
                    {item.label}
                  </span>
                )}
              </div>
            )
          })() : null}
        </DragOverlay>
      </DndContext>

      {/* Create group */}
      {!collapsed && (
        <div style={{ marginTop: 10, paddingLeft: 4 }}>
          {showNewGroup ? (
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                autoFocus
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') addGroup()
                  if (e.key === 'Escape') setShowNewGroup(false)
                }}
                placeholder="Group name"
                style={{
                  flex: 1, background: 'var(--bg-input)',
                  border: '1px solid rgba(127,184,151,0.3)',
                  borderRadius: 6, padding: '5px 8px', fontSize: 12,
                  color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit',
                }}
              />
              <button
                onClick={addGroup}
                style={{ background: 'rgba(45,82,64,0.5)', border: 'none', borderRadius: 6, padding: '5px 8px', fontSize: 12, color: '#7FB897', cursor: 'pointer' }}
              >✓</button>
              <button
                onClick={() => setShowNewGroup(false)}
                style={{ background: 'none', border: 'none', borderRadius: 6, padding: '5px 6px', fontSize: 12, color: 'var(--text-tertiary)', cursor: 'pointer' }}
              >✕</button>
            </div>
          ) : (
            <button
              onClick={() => setShowNewGroup(true)}
              style={{
                background: 'none',
                border: '1px dashed rgba(127,184,151,0.25)',
                borderRadius: 6, padding: '5px 10px', fontSize: 11,
                color: 'rgba(127,184,151,0.7)', cursor: 'pointer',
                width: '100%', fontFamily: 'inherit',
              }}
            >
              + Create group
            </button>
          )}
        </div>
      )}

      {/* Reset + Done (collapsed state shows minimal UI) */}
      {!collapsed && (
        <div style={{ marginTop: 6, paddingLeft: 4 }}>
          <button
            onClick={handleReset}
            style={{
              background: 'none', border: 'none', padding: '4px 8px',
              fontSize: 11, color: 'rgba(248,113,113,0.55)', cursor: 'pointer',
              textAlign: 'left', fontFamily: 'inherit',
            }}
          >
            Reset nav to default
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'absolute', bottom: -4, left: 0, right: 0,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 6, padding: '5px 10px', fontSize: 11, color: '#ef4444', textAlign: 'center',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
