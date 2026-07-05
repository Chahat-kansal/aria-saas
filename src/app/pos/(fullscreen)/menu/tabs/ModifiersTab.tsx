'use client'

import { useEffect, useState } from 'react'

type ModifierOption = {
  id: string
  name: string
  price_adjustment: number
  is_active: boolean
  is_default: boolean
  allow_quantity: boolean
  max_quantity: number
  sort_order: number
}

type ModifierGroup = {
  id: string
  name: string
  selection_type: string
  is_required: boolean
  allow_quantity: boolean
  min_selections: number
  max_selections: number
  color: string | null
  archetype_slot: string | null
  modifiers: ModifierOption[]
}

type NewGroupForm = {
  name: string
  selection_type: string
  is_required: boolean
  allow_quantity: boolean
  min_selections: number
  max_selections: number
  archetype_slot: string
}

type AddOptionForm = {
  name: string
  price_adjustment: string
  allow_quantity: boolean
  max_quantity: number
  is_default: boolean
}

const EMPTY_GROUP_FORM: NewGroupForm = {
  name: '',
  selection_type: 'single',
  is_required: false,
  allow_quantity: false,
  min_selections: 0,
  max_selections: 1,
  archetype_slot: '',
}

const EMPTY_OPTION_FORM: AddOptionForm = {
  name: '',
  price_adjustment: '0',
  allow_quantity: false,
  max_quantity: 1,
  is_default: false,
}

function renderHint(group: ModifierGroup): string {
  if (group.selection_type === 'single' && group.max_selections === 1) {
    return 'pills (single select)'
  }
  if (group.selection_type === 'single' && group.max_selections > 1) {
    return 'pills (pick up to ' + group.max_selections + ')'
  }
  if (group.selection_type === 'multi' && group.allow_quantity) {
    return 'drag-tray (with qty stepper)'
  }
  return 'checkboxes (add many)'
}

function formatPrice(adj: number): string {
  if (adj === 0) return '$0.00'
  const sign = adj > 0 ? '+' : '-'
  return sign + '$' + Math.abs(adj).toFixed(2)
}

export default function ModifiersTab({ businessId }: { businessId: string }) {
  const [groups, setGroups] = useState<ModifierGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showNewGroupForm, setShowNewGroupForm] = useState(false)
  const [editingGroup, setEditingGroup] = useState<ModifierGroup | null>(null)
  const [groupForm, setGroupForm] = useState<NewGroupForm>(EMPTY_GROUP_FORM)
  const [optionForms, setOptionForms] = useState<Record<string, AddOptionForm>>({})
  const [saving, setSaving] = useState(false)
  const [savingOption, setSavingOption] = useState<string | null>(null)

  async function loadGroups() {
    setLoading(true)
    try {
      const res = await fetch('/api/pos/menu/modifier-groups')
      const data = await res.json()
      const sorted = (data.groups as ModifierGroup[]).sort((a, b) => {
        return a.name.localeCompare(b.name)
      })
      setGroups(sorted)
    } catch {
      // silent — groups stays empty
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadGroups()
  }, [])

  function openNewGroup() {
    setEditingGroup(null)
    setGroupForm(EMPTY_GROUP_FORM)
    setShowNewGroupForm(true)
  }

  function openEditGroup(group: ModifierGroup) {
    setEditingGroup(group)
    setGroupForm({
      name: group.name,
      selection_type: group.selection_type,
      is_required: group.is_required,
      allow_quantity: group.allow_quantity,
      min_selections: group.min_selections,
      max_selections: group.max_selections,
      archetype_slot: group.archetype_slot ?? '',
    })
    setShowNewGroupForm(true)
  }

  function closeGroupForm() {
    setShowNewGroupForm(false)
    setEditingGroup(null)
    setGroupForm(EMPTY_GROUP_FORM)
  }

  async function submitGroupForm() {
    if (!groupForm.name.trim()) return
    setSaving(true)
    try {
      if (editingGroup) {
        await fetch('/api/pos/menu/modifier-groups/' + editingGroup.id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...groupForm,
            archetype_slot: groupForm.archetype_slot || null,
            business_id: businessId,
          }),
        })
      } else {
        await fetch('/api/pos/menu/modifier-groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...groupForm,
            archetype_slot: groupForm.archetype_slot || null,
            business_id: businessId,
          }),
        })
      }
      closeGroupForm()
      await loadGroups()
    } finally {
      setSaving(false)
    }
  }

  async function deleteGroup(group: ModifierGroup) {
    if (!confirm('Delete group "' + group.name + '" and all its options?')) return
    await fetch('/api/pos/menu/modifier-groups/' + group.id, { method: 'DELETE' })
    await loadGroups()
  }

  async function toggleOption(opt: ModifierOption) {
    await fetch('/api/pos/modifiers/' + opt.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !opt.is_active }),
    })
    await loadGroups()
  }

  async function deleteOption(optId: string) {
    await fetch('/api/pos/modifiers/' + optId, { method: 'DELETE' })
    await loadGroups()
  }

  function getOptionForm(groupId: string): AddOptionForm {
    return optionForms[groupId] ?? EMPTY_OPTION_FORM
  }

  function setOptionForm(groupId: string, patch: Partial<AddOptionForm>) {
    setOptionForms(prev => ({
      ...prev,
      [groupId]: { ...(prev[groupId] ?? EMPTY_OPTION_FORM), ...patch },
    }))
  }

  async function submitOption(group: ModifierGroup) {
    const form = getOptionForm(group.id)
    if (!form.name.trim()) return
    setSavingOption(group.id)
    try {
      await fetch('/api/pos/menu/modifier-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_id: group.id,
          business_id: businessId,
          name: form.name,
          price_adjustment: parseFloat(form.price_adjustment) || 0,
          allow_quantity: form.allow_quantity,
          max_quantity: form.max_quantity,
          is_default: form.is_default,
        }),
      })
      setOptionForms(prev => ({ ...prev, [group.id]: EMPTY_OPTION_FORM }))
      await loadGroups()
    } finally {
      setSavingOption(null)
    }
  }

  // ─── Styles ──────────────────────────────────────────────────────────────

  const S = {
    root: {
      fontFamily: "'Outfit', system-ui, sans-serif",
      background: '#fafafa',
      minHeight: '100%',
      padding: '24px',
      color: '#0a0a0a',
    } as React.CSSProperties,

    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '24px',
    } as React.CSSProperties,

    heading: {
      fontFamily: "'Cormorant', Georgia, serif",
      fontStyle: 'italic',
      fontWeight: 700,
      fontSize: '24px',
      lineHeight: 1,
      color: '#0a0a0a',
      margin: 0,
    } as React.CSSProperties,

    btnPrimary: {
      background: '#d9f54e',
      color: '#0a0a0a',
      border: 'none',
      padding: '8px 16px',
      fontSize: '13px',
      fontFamily: "'Outfit', system-ui, sans-serif",
      fontWeight: 600,
      cursor: 'pointer',
      borderRadius: '6px',
      letterSpacing: '0.01em',
    } as React.CSSProperties,

    btnGhost: {
      background: 'transparent',
      color: '#6b7280',
      border: '1px solid #e5e7eb',
      padding: '6px 12px',
      fontSize: '12px',
      fontFamily: "'Outfit', system-ui, sans-serif",
      cursor: 'pointer',
      borderRadius: '4px',
    } as React.CSSProperties,

    btnDanger: {
      background: 'transparent',
      color: '#ef4444',
      border: 'none',
      padding: '4px 8px',
      fontSize: '14px',
      cursor: 'pointer',
      fontFamily: "'Outfit', system-ui, sans-serif",
      borderRadius: '4px',
    } as React.CSSProperties,

    card: {
      background: '#fff',
      borderRadius: '12px',
      border: '1px solid #e5e7eb',
      padding: '16px',
      marginBottom: '12px',
    } as React.CSSProperties,

    cardHeader: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      cursor: 'pointer',
      userSelect: 'none' as const,
    } as React.CSSProperties,

    groupName: {
      fontWeight: 600,
      fontSize: '15px',
      flex: 1,
      color: '#0a0a0a',
    } as React.CSSProperties,

    badge: (color: string, bg: string) => ({
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: 600,
      letterSpacing: '0.04em',
      textTransform: 'uppercase' as const,
      color,
      background: bg,
    }),

    hint: {
      fontSize: '11px',
      color: '#9ca3af',
      marginTop: '4px',
      fontStyle: 'italic',
    } as React.CSSProperties,

    divider: {
      border: 'none',
      borderTop: '1px solid #f3f4f6',
      margin: '14px 0',
    } as React.CSSProperties,

    optionRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 0',
      borderBottom: '1px solid #f9fafb',
    } as React.CSSProperties,

    optionName: {
      flex: 1,
      fontSize: '13px',
      color: '#0a0a0a',
    } as React.CSSProperties,

    optionPrice: {
      fontSize: '13px',
      fontVariantNumeric: 'tabular-nums',
      color: '#374151',
      minWidth: '52px',
      textAlign: 'right' as const,
    } as React.CSSProperties,

    toggle86Active: {
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: 600,
      cursor: 'pointer',
      border: 'none',
      background: '#dcfce7',
      color: '#16a34a',
      fontFamily: "'Outfit', system-ui, sans-serif",
    } as React.CSSProperties,

    toggle86Inactive: {
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: 600,
      cursor: 'pointer',
      border: 'none',
      background: '#fee2e2',
      color: '#dc2626',
      fontFamily: "'Outfit', system-ui, sans-serif",
    } as React.CSSProperties,

    addOptionWrap: {
      marginTop: '12px',
      padding: '12px',
      background: '#f9fafb',
      borderRadius: '8px',
      border: '1px dashed #e5e7eb',
    } as React.CSSProperties,

    addOptionTitle: {
      fontSize: '11px',
      fontWeight: 700,
      letterSpacing: '0.06em',
      textTransform: 'uppercase' as const,
      color: '#6b7280',
      marginBottom: '10px',
    } as React.CSSProperties,

    addOptionGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr 100px auto',
      gap: '8px',
      alignItems: 'center',
      marginBottom: '8px',
    } as React.CSSProperties,

    input: {
      width: '100%',
      boxSizing: 'border-box' as const,
      border: '1px solid #e5e7eb',
      borderRadius: '6px',
      padding: '7px 10px',
      fontSize: '13px',
      fontFamily: "'Outfit', system-ui, sans-serif",
      background: '#fff',
      color: '#0a0a0a',
      outline: 'none',
    } as React.CSSProperties,

    inputSmall: {
      width: '100%',
      boxSizing: 'border-box' as const,
      border: '1px solid #e5e7eb',
      borderRadius: '6px',
      padding: '7px 8px',
      fontSize: '13px',
      fontFamily: "'Outfit', system-ui, sans-serif",
      background: '#fff',
      color: '#0a0a0a',
      outline: 'none',
    } as React.CSSProperties,

    checkRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      flexWrap: 'wrap' as const,
      fontSize: '12px',
      color: '#374151',
    } as React.CSSProperties,

    checkLabel: {
      display: 'flex',
      alignItems: 'center',
      gap: '5px',
      cursor: 'pointer',
      fontSize: '12px',
    } as React.CSSProperties,

    overlay: {
      position: 'fixed' as const,
      inset: 0,
      background: 'rgba(10,10,10,0.4)',
      backdropFilter: 'blur(2px)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    } as React.CSSProperties,

    modal: {
      background: '#fff',
      borderRadius: '14px',
      border: '1px solid #e5e7eb',
      padding: '28px',
      width: '440px',
      maxWidth: '90vw',
      boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
    } as React.CSSProperties,

    modalHeading: {
      fontFamily: "'Cormorant', Georgia, serif",
      fontStyle: 'italic',
      fontWeight: 700,
      fontSize: '20px',
      marginBottom: '20px',
      color: '#0a0a0a',
    } as React.CSSProperties,

    formRow: {
      marginBottom: '14px',
    } as React.CSSProperties,

    label: {
      display: 'block',
      fontSize: '11px',
      fontWeight: 700,
      letterSpacing: '0.05em',
      textTransform: 'uppercase' as const,
      color: '#6b7280',
      marginBottom: '5px',
    } as React.CSSProperties,

    select: {
      width: '100%',
      border: '1px solid #e5e7eb',
      borderRadius: '6px',
      padding: '8px 10px',
      fontSize: '13px',
      fontFamily: "'Outfit', system-ui, sans-serif",
      background: '#fff',
      color: '#0a0a0a',
      outline: 'none',
    } as React.CSSProperties,

    numRow: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '12px',
    } as React.CSSProperties,

    modalFooter: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '10px',
      marginTop: '20px',
    } as React.CSSProperties,

    empty: {
      textAlign: 'center' as const,
      padding: '60px 0',
      color: '#9ca3af',
      fontSize: '14px',
    } as React.CSSProperties,
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={S.root}>

      {/* Header */}
      <div style={S.header}>
        <h2 style={S.heading}>Modifier Groups</h2>
        <button style={S.btnPrimary} onClick={openNewGroup}>+ New Group</button>
      </div>

      {/* Group form modal */}
      {showNewGroupForm && (
        <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) closeGroupForm() }}>
          <div style={S.modal}>
            <div style={S.modalHeading}>
              {editingGroup ? 'Edit Group' : 'New Modifier Group'}
            </div>

            <div style={S.formRow}>
              <label style={S.label}>Group name</label>
              <input
                style={S.input}
                value={groupForm.name}
                onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Size, Protein, Add-ons"
                autoFocus
              />
            </div>

            <div style={S.formRow}>
              <label style={S.label}>Selection type</label>
              <select
                style={S.select}
                value={groupForm.selection_type}
                onChange={e => setGroupForm(f => ({ ...f, selection_type: e.target.value }))}
              >
                <option value="single">Single — radio / pills</option>
                <option value="multi">Multi — checkboxes</option>
              </select>
            </div>

            <div style={S.numRow}>
              <div style={S.formRow}>
                <label style={S.label}>Min selections</label>
                <input
                  style={S.input}
                  type="number"
                  min={0}
                  value={groupForm.min_selections}
                  onChange={e => setGroupForm(f => ({ ...f, min_selections: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div style={S.formRow}>
                <label style={S.label}>Max selections</label>
                <input
                  style={S.input}
                  type="number"
                  min={1}
                  value={groupForm.max_selections}
                  onChange={e => setGroupForm(f => ({ ...f, max_selections: parseInt(e.target.value) || 1 }))}
                />
              </div>
            </div>

            <div style={S.formRow}>
              <label style={S.label}>Archetype slot (optional)</label>
              <input
                style={S.input}
                value={groupForm.archetype_slot}
                onChange={e => setGroupForm(f => ({ ...f, archetype_slot: e.target.value }))}
                placeholder="e.g. size, protein, base"
              />
            </div>

            <div style={S.checkRow}>
              <label style={S.checkLabel}>
                <input
                  type="checkbox"
                  checked={groupForm.is_required}
                  onChange={e => setGroupForm(f => ({ ...f, is_required: e.target.checked }))}
                />
                Required
              </label>
              <label style={S.checkLabel}>
                <input
                  type="checkbox"
                  checked={groupForm.allow_quantity}
                  onChange={e => setGroupForm(f => ({ ...f, allow_quantity: e.target.checked }))}
                />
                Allow quantity per option
              </label>
            </div>

            <div style={S.modalFooter}>
              <button style={S.btnGhost} onClick={closeGroupForm}>Cancel</button>
              <button
                style={S.btnPrimary}
                onClick={submitGroupForm}
                disabled={saving || !groupForm.name.trim()}
              >
                {saving ? 'Saving…' : editingGroup ? 'Save changes' : 'Create group'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={S.empty}>Loading modifier groups…</div>
      )}

      {/* Empty state */}
      {!loading && groups.length === 0 && (
        <div style={S.empty}>
          No modifier groups yet. Create one to start building customisable products.
        </div>
      )}

      {/* Group cards */}
      {!loading && groups.map(group => {
        const isExpanded = expandedId === group.id
        const optForm = getOptionForm(group.id)

        return (
          <div key={group.id} style={S.card}>

            {/* Card header row */}
            <div style={S.cardHeader} onClick={() => setExpandedId(isExpanded ? null : group.id)}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={S.groupName}>{group.name}</span>

                  <span style={S.badge('#374151', '#f3f4f6')}>
                    {group.selection_type}
                  </span>

                  {group.is_required && (
                    <span style={S.badge('#92400e', '#fef3c7')}>
                      required
                    </span>
                  )}

                  {group.archetype_slot && (
                    <span style={S.badge('#1e40af', '#eff6ff')}>
                      {group.archetype_slot}
                    </span>
                  )}
                </div>
                <div style={S.hint}>
                  {'Renders as: ' + renderHint(group)}
                </div>
              </div>

              {/* Action buttons — stop propagation so they don't toggle expand */}
              <button
                style={S.btnGhost}
                onClick={e => { e.stopPropagation(); openEditGroup(group) }}
                title="Edit group"
              >
                ✎
              </button>
              <button
                style={S.btnDanger}
                onClick={e => { e.stopPropagation(); deleteGroup(group) }}
                title="Delete group"
              >
                ×
              </button>

              <span style={{ fontSize: '12px', color: '#9ca3af', marginLeft: '4px' }}>
                {isExpanded ? '▲' : '▼'}
              </span>
            </div>

            {/* Expanded content */}
            {isExpanded && (
              <div>
                <hr style={S.divider} />

                {/* Modifier options list */}
                {group.modifiers.length === 0 && (
                  <div style={{ fontSize: '13px', color: '#9ca3af', padding: '8px 0' }}>
                    No options yet — add one below.
                  </div>
                )}

                {group.modifiers
                  .slice()
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map(opt => (
                    <div key={opt.id} style={S.optionRow}>
                      <span style={{
                        ...S.optionName,
                        color: opt.is_active ? '#0a0a0a' : '#9ca3af',
                        textDecoration: opt.is_active ? 'none' : 'line-through',
                      }}>
                        {opt.name}
                      </span>

                      <span style={S.optionPrice}>{formatPrice(opt.price_adjustment)}</span>

                      {opt.is_default && (
                        <span style={S.badge('#1e40af', '#eff6ff')}>default</span>
                      )}

                      {/* 86 toggle */}
                      <button
                        style={opt.is_active ? S.toggle86Active : S.toggle86Inactive}
                        onClick={() => toggleOption(opt)}
                        title={opt.is_active ? 'Mark 86\'d (unavailable)' : 'Mark available'}
                      >
                        {opt.is_active ? 'ON' : '86\'d'}
                      </button>

                      <button
                        style={S.btnDanger}
                        onClick={() => deleteOption(opt.id)}
                        title="Delete option"
                      >
                        ×
                      </button>
                    </div>
                  ))
                }

                {/* Add option inline form */}
                <div style={S.addOptionWrap}>
                  <div style={S.addOptionTitle}>Add option</div>

                  <div style={S.addOptionGrid}>
                    <input
                      style={S.input}
                      placeholder="Option name"
                      value={optForm.name}
                      onChange={e => setOptionForm(group.id, { name: e.target.value })}
                    />
                    <input
                      style={S.inputSmall}
                      placeholder="±$ price"
                      value={optForm.price_adjustment}
                      onChange={e => setOptionForm(group.id, { price_adjustment: e.target.value })}
                      type="number"
                      step="0.01"
                    />
                    <button
                      style={S.btnPrimary}
                      onClick={() => submitOption(group)}
                      disabled={savingOption === group.id || !optForm.name.trim()}
                    >
                      {savingOption === group.id ? '…' : 'Save'}
                    </button>
                  </div>

                  <div style={S.checkRow}>
                    <label style={S.checkLabel}>
                      <input
                        type="checkbox"
                        checked={optForm.allow_quantity}
                        onChange={e => setOptionForm(group.id, { allow_quantity: e.target.checked })}
                      />
                      Allow qty
                    </label>

                    {optForm.allow_quantity && (
                      <label style={S.checkLabel}>
                        Max qty:
                        <input
                          style={{ ...S.inputSmall, width: '52px', marginLeft: '4px' }}
                          type="number"
                          min={1}
                          value={optForm.max_quantity}
                          onChange={e => setOptionForm(group.id, { max_quantity: parseInt(e.target.value) || 1 })}
                        />
                      </label>
                    )}

                    <label style={S.checkLabel}>
                      <input
                        type="checkbox"
                        checked={optForm.is_default}
                        onChange={e => setOptionForm(group.id, { is_default: e.target.checked })}
                      />
                      Default
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}