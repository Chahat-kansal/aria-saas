'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Group {
  id: string; name: string; description: string | null
  total_visits: number; total_spend: number; last_visit_at: string | null; is_active: boolean
  split_group_members: Array<{ id: string; name: string; is_active: boolean }>
}

const inp: React.CSSProperties = { background: 'var(--bg-base)', border: '1px solid var(--divider)', borderRadius: 8, padding: '7px 10px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }

export default function SplitGroupsPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newMembers, setNewMembers] = useState<string>('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const d = await fetch('/api/pos/split-groups').then(r => r.json()).catch(() => ({ groups: [] }))
    setGroups(d.groups ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function create() {
    if (!newName.trim()) return
    setSaving(true)
    const members = newMembers.split(',').map(n => n.trim()).filter(Boolean).map(n => ({ name: n }))
    await fetch('/api/pos/split-groups', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), description: newDesc || null, members }),
    })
    setShowNew(false); setNewName(''); setNewDesc(''); setNewMembers('')
    load()
    setSaving(false)
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 760, color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Split Groups</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Long-lived groups for friends, regulars, and teams — track balances across visits.</p>
        </div>
        <button onClick={() => setShowNew(v => !v)} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          + New Group
        </button>
      </div>

      {showNew && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 14, padding: 20, marginBottom: 24 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 14px' }}>New Group</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Group name *</label>
              <input style={inp} value={newName} onChange={e => setNewName(e.target.value)} placeholder="Friday Crew" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Description</label>
              <input style={inp} value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Members (comma-separated names)</label>
            <input style={inp} value={newMembers} onChange={e => setNewMembers(e.target.value)} placeholder="Alice, Bob, Carol, Dave" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={create} disabled={saving || !newName.trim()} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Creating…' : 'Create Group'}
            </button>
            <button onClick={() => setShowNew(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
      ) : groups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
          No groups yet. Create one to start tracking splits across visits.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {groups.map(g => {
            const activeMembers = (g.split_group_members ?? []).filter(m => m.is_active)
            return (
              <Link key={g.id} href={`/pos/split-groups/${g.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 14, padding: '16px 18px', cursor: 'pointer', transition: 'border-color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--violet)'}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--divider)'}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{g.name}</h3>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{activeMembers.length} members</span>
                  </div>
                  <div style={{ display: 'flex', gap: -8, marginBottom: 10 }}>
                    {activeMembers.slice(0, 5).map((m, i) => (
                      <div key={m.id} style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--violet)', border: '2px solid var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700, marginLeft: i > 0 ? -8 : 0 }}>
                        {m.name[0]}
                      </div>
                    ))}
                    {activeMembers.length > 5 && <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-base)', border: '2px solid var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--text-tertiary)', marginLeft: -8 }}>+{activeMembers.length - 5}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                    <div><span style={{ color: 'var(--text-tertiary)' }}>Visits</span> <strong>{g.total_visits ?? 0}</strong></div>
                    <div><span style={{ color: 'var(--text-tertiary)' }}>Spent</span> <strong>A${(g.total_spend ?? 0).toFixed(0)}</strong></div>
                    {g.last_visit_at && <div style={{ marginLeft: 'auto', color: 'var(--text-tertiary)' }}>{new Date(g.last_visit_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</div>}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}