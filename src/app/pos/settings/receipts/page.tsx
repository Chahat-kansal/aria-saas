'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Template {
  id: string; name: string; type: string; for_type: string
  is_default?: boolean; elements?: unknown[]
}

function TemplateThumbnail({ template, onEdit, onDefault, onClone, onDelete }: {
  template: Template
  onEdit: () => void
  onDefault: () => void
  onClone: () => void
  onDelete: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const els = (template.elements ?? []) as Array<{ type: string; y: number; height: number; color?: string; dividerStyle?: string; dividerThickness?: number; backgroundColor?: string; visible?: boolean }>

  return (
    <div
      style={{ position: 'relative', width: 140, flexShrink: 0, cursor: 'pointer' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onEdit}
    >
      {/* Thumbnail card */}
      <div style={{
        width: 140, height: 186, borderRadius: 10, overflow: 'hidden',
        background: '#fff', border: `2px solid ${template.is_default ? '#8B5CF6' : hovered ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.08)'}`,
        boxShadow: hovered ? '0 8px 32px rgba(0,0,0,0.5)' : '0 2px 12px rgba(0,0,0,0.4)',
        transition: 'all 200ms', position: 'relative',
      }}>
        {/* Miniature receipt preview */}
        <div style={{ transform: 'scale(0.46)', transformOrigin: 'top left', width: 302, height: 400, position: 'relative', overflow: 'hidden' }}>
          {els.slice(0, 20).filter((e: { visible?: boolean }) => e.visible !== false).map((el, i: number) => (
            <div key={i} style={{
              position: 'absolute',
              left: 0, top: el.y * 0.5,
              width: '100%', height: Math.max(2, (el.height || 10) * 0.5),
              background: el.type === 'divider'
                ? (el.color || '#000')
                : el.backgroundColor || (el.type === 'items_table' || el.type === 'totals_block' ? '#f5f5f5' : 'transparent'),
              opacity: el.type === 'divider' ? 0.5 : 0.15,
            }} />
          ))}
          {els.length === 0 && (
            <div style={{ padding: 16, fontSize: 10, color: '#aaa', textAlign: 'center', marginTop: 40 }}>Empty template</div>
          )}
        </div>

        {/* Default badge */}
        {template.is_default && (
          <div style={{ position: 'absolute', top: 6, right: 6, fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 99, background: '#8B5CF6', color: '#fff' }}>
            DEFAULT
          </div>
        )}

        {/* Hover overlay with actions */}
        {hovered && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(7,13,28,0.88)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 8 }}>
            <button onClick={e => { e.stopPropagation(); onEdit() }} style={actionBtn('#8B5CF6')}>✎ Edit</button>
            {!template.is_default && <button onClick={e => { e.stopPropagation(); onDefault() }} style={actionBtn('#22C55E')}>✓ Set Default</button>}
            <button onClick={e => { e.stopPropagation(); onClone() }} style={actionBtn('rgba(255,255,255,0.15)')}>⎘ Duplicate</button>
            <button onClick={e => { e.stopPropagation(); onDelete() }} style={actionBtn('rgba(239,68,68,0.3)')}>🗑 Delete</button>
          </div>
        )}
      </div>

      {/* Name */}
      <p style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: 'rgba(220,240,255,0.9)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {template.name}
      </p>
      <p style={{ fontSize: 10, color: 'rgba(130,160,200,0.5)', textAlign: 'center', textTransform: 'capitalize' }}>
        {template.type} · {template.for_type}
      </p>
    </div>
  )
}

function actionBtn(bg: string): React.CSSProperties {
  return { width: 110, padding: '6px 12px', borderRadius: 7, border: 'none', background: bg, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
}

export default function ReceiptsListPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetch('/api/pos/receipt-templates').then(r => r.json()).then(d => {
      setTemplates(d.templates || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  async function createNew() {
    setCreating(true)
    const res = await fetch('/api/pos/receipt-templates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Receipt', type: 'normal', for_type: 'sale', elements: [] }),
    })
    const d = await res.json()
    if (d.template?.id) router.push(`/pos/settings/receipts/${d.template.id}`)
    else setCreating(false)
  }

  async function setDefault(id: string) {
    await fetch('/api/pos/receipt-templates', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_default: true }),
    })
    setTemplates(prev => prev.map(t => ({ ...t, is_default: t.id === id })))
  }

  async function cloneTemplate(t: Template) {
    const res = await fetch('/api/pos/receipt-templates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `${t.name} (Copy)`, type: t.type, for_type: t.for_type, elements: t.elements || [] }),
    })
    const d = await res.json()
    if (d.template) setTemplates(prev => [...prev, d.template])
  }

  async function deleteTemplate(id: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return
    await fetch(`/api/pos/receipt-templates?id=${id}`, { method: 'DELETE' })
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  return (
    <div style={{ minHeight: '100%', background: 'rgba(17,15,26,0.95)', color: '#EDE8FF', fontFamily: "'Manrope',sans-serif", padding: '28px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Receipt Templates</h1>
          <p style={{ fontSize: 13, color: '#8B85A8' }}>Design the receipts printed at checkout. The template marked <strong style={{ color: '#8B5CF6' }}>Default</strong> is used automatically.</p>
        </div>
        <button onClick={createNew} disabled={creating}
          style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: '#8B5CF6', color: '#fff', fontSize: 14, fontWeight: 700, cursor: creating ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: creating ? 0.6 : 1 }}>
          {creating ? 'Creating…' : '+ New Template'}
        </button>
      </div>

      {loading ? (
        <div style={{ color: '#8B85A8', textAlign: 'center', padding: '60px 0' }}>Loading templates…</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
          {/* New template card */}
          <div onClick={createNew} style={{ width: 140, cursor: 'pointer' }}>
            <div style={{ width: 140, height: 186, borderRadius: 10, border: '2px dashed rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.04)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, transition: 'all 200ms' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#8B5CF6'; e.currentTarget.style.background = 'rgba(139,92,246,0.1)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)'; e.currentTarget.style.background = 'rgba(139,92,246,0.04)' }}>
              <span style={{ fontSize: 32, opacity: 0.5 }}>+</span>
              <span style={{ fontSize: 12, color: 'rgba(139,92,246,0.8)', fontWeight: 600 }}>Create new</span>
            </div>
            <p style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: 'rgba(220,240,255,0.5)', textAlign: 'center' }}>New template</p>
          </div>

          {templates.map(t => (
            <TemplateThumbnail
              key={t.id}
              template={t}
              onEdit={() => router.push(`/pos/settings/receipts/${t.id}`)}
              onDefault={() => setDefault(t.id)}
              onClone={() => cloneTemplate(t)}
              onDelete={() => deleteTemplate(t.id, t.name)}
            />
          ))}

          {templates.length === 0 && (
            <div style={{ color: '#8B85A8', fontSize: 13, marginTop: 20 }}>No templates yet. Click &quot;+ New Template&quot; to get started.</div>
          )}
        </div>
      )}
    </div>
  )
}
