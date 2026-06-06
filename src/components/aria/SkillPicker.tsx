'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, X, Trash2 } from 'lucide-react'

export interface Skill {
  id: string
  name: string
  icon: string | null
  description: string | null
  system_prompt_addition: string
  built_in: boolean
  enabled: boolean
  created_at: string
}

const C = {
  card: 'var(--bg-surface, #13131a)',
  surfaceHi: 'rgba(127,184,151,0.06)',
  border: 'rgba(127,184,151,0.18)',
  borderSoft: 'rgba(255,255,255,0.06)',
  text: 'var(--text-primary, #e8ede7)',
  muted: 'var(--text-secondary, rgba(255,255,255,0.55))',
  dim: 'var(--text-tertiary, rgba(255,255,255,0.35))',
  green: '#7FB897',
  sage: '#2D5240',
  red: '#EF4444',
}

const FONT = 'var(--font-ui, Inter, system-ui, sans-serif)'

export function SkillPicker() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', icon: '✨', description: '', system_prompt_addition: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/aria/skills').then(r => r.ok ? r.json() : { skills: [] })
      setSkills(r.skills ?? [])
    } catch (e) { console.error('[non-fatal]', e) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function toggle(id: string, enabled: boolean) {
    setSkills(s => s.map(x => x.id === id ? { ...x, enabled } : x))
    try {
      await fetch('/api/aria/skills', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled }),
      })
    } catch {
      // Revert on failure
      setSkills(s => s.map(x => x.id === id ? { ...x, enabled: !enabled } : x))
    }
  }

  async function create() {
    if (!form.name.trim() || !form.system_prompt_addition.trim()) {
      setError('Name and instructions are required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/aria/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed')
      setForm({ name: '', icon: '✨', description: '', system_prompt_addition: '' })
      setShowCreate(false)
      load()
    } catch (e: unknown) {
      setError((e as Error).message)
    }
    setSaving(false)
  }

  async function remove(id: string) {
    if (!confirm('Delete this custom skill?')) return
    await fetch('/api/aria/skills?id=' + id, { method: 'DELETE' })
    load()
  }

  const active = skills.filter(s => s.enabled).slice(0, 8)

  return (
    <>
      {/* Chip strip — sits above the chat input */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 0', alignItems: 'center' }}>
        {loading && skills.length === 0 ? (
          <span style={{ fontSize: 11, color: C.dim, padding: '4px 8px' }}>Loading skills…</span>
        ) : active.length === 0 ? (
          <span style={{ fontSize: 11, color: C.dim, padding: '4px 8px', fontStyle: 'italic' }}>No skills active — Aria answers as itself.</span>
        ) : (
          active.map(s => (
            <button
              key={s.id}
              onClick={() => toggle(s.id, false)}
              title={s.description ?? s.name}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                height: 26, padding: '0 10px', borderRadius: 999,
                background: 'rgba(127,184,151,0.12)',
                border: `1px solid ${C.green}55`,
                color: C.green, fontSize: 11, fontWeight: 600,
                cursor: 'pointer', fontFamily: FONT,
              }}>
              {s.icon && <span style={{ fontSize: 13 }}>{s.icon}</span>}
              {s.name}
              <X size={10} style={{ opacity: 0.6 }} />
            </button>
          ))
        )}
        <button
          onClick={() => setShowModal(true)}
          title="Manage skills"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            height: 26, padding: '0 10px', borderRadius: 999,
            background: 'transparent',
            border: `1px dashed ${C.border}`,
            color: C.muted, fontSize: 11, fontWeight: 600,
            cursor: 'pointer', fontFamily: FONT,
          }}>
          <Plus size={11} /> Skills
        </button>
      </div>

      {/* Modal */}
      {showModal && (
        <div onClick={() => { setShowModal(false); setShowCreate(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, width: '100%', maxWidth: 540, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: FONT, color: C.text }}>
            {/* Header */}
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.borderSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: C.green, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Aria skills</p>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: '4px 0 0' }}>What hat should Aria wear?</h2>
              </div>
              <button onClick={() => { setShowModal(false); setShowCreate(false) }}
                style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', padding: 6, display: 'flex' }}>
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 22px' }}>
              {showCreate ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 10 }}>
                    <input value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value.slice(0, 4) })} placeholder="✨" maxLength={4}
                      style={inp({ textAlign: 'center', fontSize: 18 })} />
                    <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Skill name (e.g. Wine specialist)" maxLength={80}
                      style={inp()} />
                  </div>
                  <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Short description (optional)" maxLength={200}
                    style={inp()} />
                  <div>
                    <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 6 }}>
                      Instructions — what should Aria do when this skill is on? <span style={{ color: C.dim }}>({form.system_prompt_addition.length}/1000)</span>
                    </label>
                    <textarea value={form.system_prompt_addition} onChange={e => setForm({ ...form, system_prompt_addition: e.target.value.slice(0, 1000) })}
                      rows={5}
                      placeholder="e.g. Act as a wine specialist. Recommend pairings, suggest stock additions from current trends. Stay Australian-focused."
                      style={{ ...inp({}), height: 'auto', padding: '10px 12px', resize: 'vertical', fontFamily: FONT, lineHeight: 1.55 }} />
                  </div>
                  {error && <div style={{ fontSize: 12, color: C.red }}>{error}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button onClick={create} disabled={saving || !form.name.trim() || !form.system_prompt_addition.trim()}
                      style={{ flex: 1, height: 40, borderRadius: 8, border: 'none', background: C.sage, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1, fontFamily: FONT }}>
                      {saving ? 'Saving…' : 'Create skill'}
                    </button>
                    <button onClick={() => { setShowCreate(false); setError('') }}
                      style={{ height: 40, padding: '0 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Built-in section */}
                  <p style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Built-in</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
                    {skills.filter(s => s.built_in).map(s => (
                      <SkillRow key={s.id} skill={s} onToggle={() => toggle(s.id, !s.enabled)} />
                    ))}
                  </div>

                  {/* Custom section */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Custom</p>
                    <button onClick={() => setShowCreate(true)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.green, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: FONT, fontWeight: 600, padding: 4 }}>
                      <Plus size={12} /> Create custom skill
                    </button>
                  </div>
                  {skills.filter(s => !s.built_in).length === 0 ? (
                    <p style={{ fontSize: 12, color: C.dim, padding: '14px 0', textAlign: 'center', fontStyle: 'italic' }}>No custom skills yet — create one to teach Aria a specific role.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {skills.filter(s => !s.built_in).map(s => (
                        <SkillRow key={s.id} skill={s} onToggle={() => toggle(s.id, !s.enabled)} onDelete={() => remove(s.id)} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function SkillRow({ skill, onToggle, onDelete }: { skill: Skill; onToggle: () => void; onDelete?: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 12px', borderRadius: 10,
      background: skill.enabled ? 'rgba(127,184,151,0.06)' : C.surfaceHi,
      border: `1px solid ${skill.enabled ? C.green + '55' : C.borderSoft}`,
    }}>
      <div style={{ fontSize: 20, width: 28, textAlign: 'center', flexShrink: 0 }}>{skill.icon ?? '✨'}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{skill.name}</div>
        {skill.description && <div style={{ fontSize: 11, color: C.dim, marginTop: 2, lineHeight: 1.4 }}>{skill.description}</div>}
      </div>
      {onDelete && (
        <button onClick={onDelete} title="Delete"
          style={{ background: 'transparent', border: 'none', color: C.dim, cursor: 'pointer', padding: 4, display: 'flex' }}>
          <Trash2 size={13} />
        </button>
      )}
      <Toggle value={skill.enabled} onChange={onToggle} ariaLabel={skill.name} />
    </div>
  )
}

function Toggle({ value, onChange, ariaLabel }: { value: boolean; onChange: () => void; ariaLabel: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={ariaLabel}
      onClick={onChange}
      style={{
        position: 'relative', width: 38, height: 22, borderRadius: 22,
        background: value ? C.green : 'rgba(255,255,255,0.12)',
        border: 'none', cursor: 'pointer', transition: 'background 180ms',
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: value ? 18 : 2,
        width: 18, height: 18, borderRadius: '50%',
        background: '#fff', transition: 'left 180ms',
      }} />
    </button>
  )
}

function inp(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    height: 38, borderRadius: 8, border: `1px solid ${C.border}`,
    background: 'rgba(255,255,255,0.04)', color: C.text, padding: '0 12px',
    fontSize: 13, fontFamily: FONT, outline: 'none', width: '100%',
    boxSizing: 'border-box',
    ...extra,
  }
}
