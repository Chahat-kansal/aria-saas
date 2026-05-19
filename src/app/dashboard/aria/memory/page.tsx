'use client'
import { useEffect, useState } from 'react'

interface Memory {
  id: string
  kind: string
  content: string
  topic: string | null
  importance: number
  confidence: number
  source_type: string
  created_at: string
  last_referenced_at: string | null
  reference_count: number
}

const KIND_COLOURS: Record<string, { bg: string; text: string }> = {
  preference: { bg: 'rgba(127,119,221,0.12)', text: '#3C3489' },
  fact:       { bg: 'rgba(127,184,151,0.12)', text: '#2D5240' },
  tried:      { bg: 'rgba(239,159,39,0.12)',  text: '#854F0B' },
  decision:   { bg: 'rgba(55,138,221,0.12)',  text: '#0C447C' },
  concern:    { bg: 'rgba(226,75,74,0.12)',   text: '#791F1F' },
  goal:       { bg: 'rgba(99,153,34,0.12)',   text: '#385713' },
}

const KINDS = ['preference', 'fact', 'tried', 'decision', 'concern', 'goal'] as const

export default function AriaMemoryPage() {
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  const load = () => {
    setLoading(true)
    fetch('/api/aria/memory')
      .then(r => r.json())
      .then(d => { setMemories(d.memories ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this memory? Aria will no longer recall this in future conversations.')) return
    const res = await fetch(`/api/aria/memory?id=${id}&reason=owner_deleted`, { method: 'DELETE' })
    if (res.ok) load()
  }

  const filtered = filter ? memories.filter(m => m.kind === filter) : memories
  const counts: Record<string, number> = {}
  for (const m of memories) counts[m.kind] = (counts[m.kind] ?? 0) + 1

  return (
    <div className="p-6 max-w-5xl space-y-6" style={{ color: 'var(--text-primary, #E8EDE7)' }}>
      <header>
        <h1 className="text-2xl font-medium">What Aria remembers</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
          Aria builds memory from your conversations. These facts get injected into every chat so responses stay personal.
          Delete anything that's wrong — Aria won't recall it again.
        </p>
      </header>

      {/* Kind filter pills */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFilter('')}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filter === '' ? 'bg-[#2D5240] text-[#7FB897]' : 'bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.1)]'}`}
          style={{ border: filter === '' ? '1px solid rgba(127,184,151,0.4)' : '1px solid transparent', color: filter === '' ? '#7FB897' : 'var(--text-secondary, #A8B5A8)' }}>
          All ({memories.length})
        </button>
        {KINDS.map(k => {
          if (!counts[k]) return null
          const c = KIND_COLOURS[k]
          return (
            <button key={k} onClick={() => setFilter(filter === k ? '' : k)}
              className="px-3 py-1 rounded-full text-xs font-medium transition-colors capitalize"
              style={{ background: filter === k ? '#2D5240' : c.bg, color: filter === k ? '#7FB897' : c.text, border: `1px solid ${filter === k ? 'rgba(127,184,151,0.4)' : 'transparent'}` }}>
              {k} ({counts[k]})
            </button>
          )
        })}
      </div>

      {loading && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>}

      {!loading && filtered.length === 0 && (
        <div className="rounded-xl p-10 text-center" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
          <p className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
            {memories.length === 0
              ? "Aria hasn't built any memories yet. Have a few conversations and Aria will start remembering what matters."
              : 'No memories of this kind yet.'}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map(m => {
          const c = KIND_COLOURS[m.kind] ?? { bg: 'rgba(255,255,255,0.04)', text: 'var(--text-secondary)' }
          return (
            <div key={m.id} className="rounded-xl p-4" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium capitalize" style={{ background: c.bg, color: c.text }}>{m.kind}</span>
                  {m.topic && <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{m.topic}</span>}
                </div>
                <div className="flex-1">
                  <p className="text-sm leading-relaxed">{m.content}</p>
                  <div className="mt-1.5 flex gap-3 text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                    <span>importance {m.importance}/10</span>
                    <span>·</span>
                    <span>confidence {Math.round(m.confidence * 100)}%</span>
                    <span>·</span>
                    <span>recalled {m.reference_count}×</span>
                    <span>·</span>
                    <span>{new Date(m.created_at).toLocaleDateString('en-AU')}</span>
                  </div>
                </div>
                <button onClick={() => handleDelete(m.id)}
                  className="text-xs px-2 py-1 rounded-lg transition-colors"
                  style={{ color: 'var(--text-secondary)', border: '1px solid var(--divider)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}>
                  Forget
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
