'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Sparkles, ChevronLeft, Check, X, Edit3, Trash2, Send, Loader2,
  Calendar, Megaphone, Package, PartyPopper, Clock, AlertCircle,
  type LucideIcon,
} from 'lucide-react'

const C = {
  bg: 'var(--bg-base)', card: 'var(--bg-surface)',
  surfaceHi: 'rgba(127,184,151,0.06)',
  border: 'rgba(127,184,151,0.15)',
  borderSoft: 'rgba(255,255,255,0.06)',
  text: 'var(--text-primary)', muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)',
  green: '#7FB897', sage: '#2D5240', amber: '#F59E0B', red: '#EF4444', violet: '#A78BFA', blue: '#60A5FA',
  fb: '#1877F2', ig: '#E1306C', gb: '#4285F4',
}
const FONT = 'var(--font-ui, Inter, system-ui, sans-serif)'

type Channel = 'community' | 'instagram' | 'facebook' | 'google_business'
type DraftStatus = 'proposed' | 'approved' | 'rejected' | 'posted'
type PostType = 'update' | 'offer' | 'new_stock' | 'event' | 'story'

interface Draft {
  id: string
  plan_run_id: string
  post_type: PostType
  draft_title: string | null
  draft_body: string
  draft_hashtags: string[]
  channels: Channel[]
  suggested_for_at: string | null
  aria_reasoning: string | null
  status: DraftStatus
  community_post_id: string | null
  social_post_ids: Array<{ channel: string; id: string | null }>
  posted_at: string | null
  created_at: string
}

interface Rules {
  enabled: boolean
  channels: Channel[]
  max_per_week: number
  allowed_post_types: PostType[]
  earliest_hour: number
  latest_hour: number
}

const TYPE_META: Record<PostType, { label: string; Icon: LucideIcon; color: string }> = {
  update:    { label: 'Update',    Icon: Megaphone, color: C.green },
  offer:     { label: 'Offer',     Icon: Sparkles,  color: C.amber },
  new_stock: { label: 'New stock', Icon: Package,   color: C.green },
  event:     { label: 'Event',     Icon: PartyPopper, color: C.violet },
  story:     { label: 'Story',     Icon: Clock,     color: C.amber },
}
const CHANNEL_META: Record<Channel, { label: string; color: string }> = {
  community: { label: 'Aria Community', color: C.green },
  instagram: { label: 'Instagram', color: C.ig },
  facebook:  { label: 'Facebook',  color: C.fb },
  google_business: { label: 'Google',   color: C.gb },
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

export default function MarketerPage() {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [rules, setRules] = useState<Rules | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ draft_title: '', draft_body: '', channels: ['community'] as Channel[] })
  const [posting, setPosting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [pRes, rRes] = await Promise.all([
        fetch('/api/community/owner/marketer/plan').then(r => r.json()),
        fetch('/api/community/owner/marketer/rules').then(r => r.json()),
      ])
      setDrafts(pRes.drafts ?? [])
      setRules(rRes.rules ?? null)
    } catch (e: unknown) {
      setError((e as Error).message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function generatePlan() {
    setGenerating(true)
    setError('')
    try {
      const res = await fetch('/api/community/owner/marketer/plan', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not generate plan')
      load()
    } catch (e: unknown) {
      setError((e as Error).message)
    }
    setGenerating(false)
  }

  async function setStatus(id: string, status: DraftStatus) {
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, status } : d))
    await fetch('/api/community/owner/marketer/drafts', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
  }

  async function bulkApproveAll() {
    const proposed = drafts.filter(d => d.status === 'proposed').map(d => d.id)
    setDrafts(prev => prev.map(d => proposed.includes(d.id) ? { ...d, status: 'approved' as const } : d))
    await Promise.all(proposed.map(id => fetch('/api/community/owner/marketer/drafts', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'approved' }),
    })))
  }

  async function toggleChannel(id: string, channel: Channel) {
    const draft = drafts.find(d => d.id === id)
    if (!draft) return
    const has = draft.channels.includes(channel)
    const next = has ? draft.channels.filter(c => c !== channel) : [...draft.channels, channel]
    if (next.length === 0) return // never leave a draft with zero channels
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, channels: next } : d))
    await fetch('/api/community/owner/marketer/drafts', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, channels: next }),
    })
  }

  async function remove(id: string) {
    if (!confirm('Delete this draft?')) return
    setDrafts(prev => prev.filter(d => d.id !== id))
    await fetch('/api/community/owner/marketer/drafts?id=' + id, { method: 'DELETE' })
  }

  function startEdit(d: Draft) {
    setEditId(d.id)
    setEditForm({ draft_title: d.draft_title ?? '', draft_body: d.draft_body, channels: d.channels })
  }

  async function saveEdit() {
    if (!editId) return
    await fetch('/api/community/owner/marketer/drafts', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editId, ...editForm }),
    })
    setDrafts(prev => prev.map(d => d.id === editId ? { ...d, draft_title: editForm.draft_title || null, draft_body: editForm.draft_body, channels: editForm.channels } : d))
    setEditId(null)
  }

  async function postAll() {
    if (!confirm('Publish all approved drafts to their selected channels now?')) return
    setPosting(true)
    setError('')
    try {
      const res = await fetch('/api/community/owner/marketer/post-all', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Post-all failed')
      load()
    } catch (e: unknown) {
      setError((e as Error).message)
    }
    setPosting(false)
  }

  async function updateRules(patch: Partial<Rules>) {
    if (!rules) return
    const next = { ...rules, ...patch }
    setRules(next)
    await fetch('/api/community/owner/marketer/rules', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    })
  }

  // Group drafts by day-of-week for the week view
  const byDay: Record<number, Draft[]> = {}
  for (let i = 0; i < 7; i++) byDay[i] = []
  for (const d of drafts) {
    if (!d.suggested_for_at) { byDay[0].push(d); continue }
    const date = new Date(d.suggested_for_at)
    const dow = (date.getDay() + 6) % 7 // Sun→6, Mon→0
    byDay[dow].push(d)
  }

  const proposedCt = drafts.filter(d => d.status === 'proposed').length
  const approvedCt = drafts.filter(d => d.status === 'approved').length
  const postedCt = drafts.filter(d => d.status === 'posted').length

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto', color: C.text, fontFamily: FONT }}>
      <style jsx global>{`
        .marketer-card { transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease; }
        .marketer-card:hover { border-color: ${C.green}40; box-shadow: 0 8px 24px rgba(0,0,0,0.18); }
        @keyframes marketer-spin { to { transform: rotate(360deg); } }
        .marketer-spin { animation: marketer-spin 1s linear infinite; }
      `}</style>

      <Link href="/dashboard/community" prefetch={false}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.muted, marginBottom: 14, textDecoration: 'none' }}>
        <ChevronLeft size={14} /> Aria Community
      </Link>

      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.violet, margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={12} /> Aria Marketer
          </p>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '6px 0 0', letterSpacing: '-0.01em', fontFamily: "'Fraunces', serif", fontStyle: 'italic' }}>
            A week of posts, drafted for you
          </h1>
          <p style={{ fontSize: 13, color: C.dim, margin: '4px 0 0' }}>
            Grounded in your real stock + best engagement times. Approve in bulk, edit anything, push to any combination of channels.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {approvedCt > 0 && (
            <button onClick={postAll} disabled={posting}
              style={primaryBtn(C.green)}>
              {posting ? <Loader2 size={14} className="marketer-spin" /> : <Send size={14} />}
              Publish {approvedCt} {approvedCt === 1 ? 'approved' : 'approved'}
            </button>
          )}
          <button onClick={generatePlan} disabled={generating}
            style={primaryBtn(C.sage, true)}>
            {generating ? <Loader2 size={14} className="marketer-spin" /> : <Sparkles size={14} />}
            {generating ? 'Drafting…' : (drafts.length === 0 ? 'Draft this week' : 'Regenerate')}
          </button>
        </div>
      </header>

      {/* Stat strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'To review', value: proposedCt, color: C.violet, Icon: Sparkles },
          { label: 'Approved', value: approvedCt, color: C.green, Icon: Check },
          { label: 'Posted', value: postedCt, color: C.text, Icon: Send },
        ].map(s => (
          <div key={s.label} style={{ padding: '14px 16px', borderRadius: 12, background: C.card, border: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, color: s.color }}>
              <s.Icon size={15} />
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.dim }}>{s.label}</span>
            </div>
            <p style={{ fontSize: 22, fontWeight: 700, color: s.color, margin: 0, letterSpacing: '-0.02em' }}>{s.value}</p>
          </div>
        ))}
        {proposedCt > 0 && (
          <div style={{ padding: 14, borderRadius: 12, background: 'rgba(167,139,250,0.06)', border: `1px solid rgba(167,139,250,0.25)`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={bulkApproveAll} style={{ width: '100%', height: 40, padding: '0 14px', borderRadius: 8, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Check size={14} /> Approve all {proposedCt}
            </button>
          </div>
        )}
      </div>

      {/* Auto-post rules card */}
      {rules && (
        <details style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 0, marginBottom: 20 }}>
          <summary style={{ padding: '14px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: C.text, display: 'flex', alignItems: 'center', gap: 8, listStyle: 'none' }}>
            <Sparkles size={14} style={{ color: C.violet }} />
            Auto-post rules {rules.enabled && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(127,184,151,0.15)', color: C.green, textTransform: 'uppercase', letterSpacing: '0.05em' }}>ON</span>}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: C.muted, fontWeight: 500 }}>{rules.enabled ? 'Aria can post within these rules' : 'Drafts only — you approve each one'}</span>
          </summary>
          <div style={{ padding: '0 18px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, borderTop: `1px solid ${C.borderSoft}` }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
              <input type="checkbox" checked={rules.enabled} onChange={e => updateRules({ enabled: e.target.checked })} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Let Aria auto-post within these rules</span>
            </label>
            <label style={{ marginTop: 14, fontSize: 12, color: C.muted }}>
              Max per week
              <input type="number" min={0} max={14} value={rules.max_per_week} onChange={e => updateRules({ max_per_week: Number(e.target.value) || 0 })}
                style={{ display: 'block', marginTop: 4, width: 80, padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.text, fontSize: 13 }} />
            </label>
            <div style={{ marginTop: 14, fontSize: 12, color: C.muted, gridColumn: '1 / -1' }}>
              Channels Aria can auto-post to
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {(['community','instagram','facebook','google_business'] as Channel[]).map(c => (
                  <ChannelChip key={c} channel={c} active={rules.channels.includes(c)}
                    onClick={() => {
                      const has = rules.channels.includes(c)
                      const next = has ? rules.channels.filter(x => x !== c) : [...rules.channels, c]
                      updateRules({ channels: next.length > 0 ? next : ['community'] })
                    }} />
                ))}
              </div>
            </div>
          </div>
        </details>
      )}

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: C.red, fontSize: 12, marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
        </div>
      )}

      {/* Week view */}
      {loading ? (
        <p style={{ color: C.dim, padding: 32, textAlign: 'center' }}>Loading…</p>
      ) : drafts.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', background: C.card, borderRadius: 14, border: `1px dashed ${C.border}` }}>
          <Sparkles size={32} style={{ color: C.violet, opacity: 0.6, marginBottom: 12 }} />
          <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>No drafts yet</p>
          <p style={{ fontSize: 13, color: C.dim, margin: '8px 0 0', maxWidth: 460, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
            Tap &quot;Draft this week&quot; — Aria reads your real stock + recent sellers and writes 7 posts pre-scheduled at your best engagement times.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {DAYS.map((label, idx) => (
            byDay[idx].length === 0 ? null : (
              <section key={idx}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: C.surfaceHi, color: C.text, fontSize: 11, fontWeight: 700, border: `1px solid ${C.border}` }}>{label}</span>
                  <span style={{ fontSize: 11, color: C.dim }}>{byDay[idx].length} {byDay[idx].length === 1 ? 'post' : 'posts'}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {byDay[idx].map(d => (
                    <DraftCard
                      key={d.id}
                      draft={d}
                      isEditing={editId === d.id}
                      editForm={editForm}
                      onEditChange={setEditForm}
                      onStartEdit={() => startEdit(d)}
                      onCancelEdit={() => setEditId(null)}
                      onSaveEdit={saveEdit}
                      onStatus={setStatus}
                      onToggleChannel={(c) => toggleChannel(d.id, c)}
                      onDelete={() => remove(d.id)}
                    />
                  ))}
                </div>
              </section>
            )
          ))}
        </div>
      )}
    </div>
  )
}

function ChannelChip({ channel, active, onClick }: { channel: Channel; active: boolean; onClick: () => void }) {
  const m = CHANNEL_META[channel]
  return (
    <button onClick={onClick} type="button" style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      height: 30, padding: '0 12px', borderRadius: 999,
      background: active ? m.color + '22' : 'transparent',
      border: `1px solid ${active ? m.color : C.border}`,
      color: active ? m.color : C.muted,
      fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: FONT,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color }} />
      {m.label}
    </button>
  )
}

function DraftCard({
  draft, isEditing, editForm, onEditChange,
  onStartEdit, onCancelEdit, onSaveEdit, onStatus, onToggleChannel, onDelete,
}: {
  draft: Draft
  isEditing: boolean
  editForm: { draft_title: string; draft_body: string; channels: Channel[] }
  onEditChange: (f: { draft_title: string; draft_body: string; channels: Channel[] }) => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onStatus: (id: string, status: DraftStatus) => void
  onToggleChannel: (c: Channel) => void
  onDelete: () => void
}) {
  const tm = TYPE_META[draft.post_type] ?? TYPE_META.update
  const statusColor: Record<DraftStatus, string> = {
    proposed: C.violet, approved: C.green, rejected: C.dim, posted: C.text,
  }
  const statusLabel: Record<DraftStatus, string> = {
    proposed: 'To review', approved: 'Approved', rejected: 'Rejected', posted: 'Posted',
  }
  return (
    <div className="marketer-card" style={{
      padding: 16, borderRadius: 12, background: C.card,
      border: `1px solid ${draft.status === 'approved' ? C.green + '55' : draft.status === 'posted' ? C.borderSoft : C.border}`,
      opacity: draft.status === 'rejected' ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: tm.color, padding: '3px 9px', borderRadius: 999, background: tm.color + '18', border: `1px solid ${tm.color}30` }}>
          <tm.Icon size={11} /> {tm.label}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: statusColor[draft.status], padding: '3px 9px', borderRadius: 999, background: statusColor[draft.status] + '18', border: `1px solid ${statusColor[draft.status]}30` }}>
          {statusLabel[draft.status]}
        </span>
        {draft.suggested_for_at && (
          <span style={{ fontSize: 11, color: C.dim, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Calendar size={11} /> {fmtDate(draft.suggested_for_at)}
          </span>
        )}
      </div>

      {isEditing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input value={editForm.draft_title} onChange={e => onEditChange({ ...editForm, draft_title: e.target.value })}
            placeholder="Title (optional)" maxLength={200}
            style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.text, fontSize: 13, outline: 'none', fontFamily: FONT, minHeight: 40 }} />
          <textarea value={editForm.draft_body} onChange={e => onEditChange({ ...editForm, draft_body: e.target.value })}
            rows={5} maxLength={4000}
            style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.text, fontSize: 13, outline: 'none', fontFamily: FONT, resize: 'vertical', lineHeight: 1.55, minHeight: 120 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onSaveEdit} style={smallBtn('green')}><Check size={12} /> Save</button>
            <button onClick={onCancelEdit} style={smallBtn('ghost')}><X size={12} /> Cancel</button>
          </div>
        </div>
      ) : (
        <>
          {draft.draft_title && <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px', color: C.text, lineHeight: 1.3 }}>{draft.draft_title}</p>}
          <p style={{ fontSize: 13, color: C.muted, margin: 0, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{draft.draft_body}</p>
          {draft.draft_hashtags.length > 0 && (
            <p style={{ fontSize: 12, color: C.dim, margin: '8px 0 0' }}>
              {draft.draft_hashtags.map(h => '#' + h.replace(/^#/, '')).join(' ')}
            </p>
          )}
          {draft.aria_reasoning && (
            <p style={{ fontSize: 11, color: C.violet, margin: '10px 0 0', fontStyle: 'italic', lineHeight: 1.4, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <Sparkles size={11} style={{ flexShrink: 0, marginTop: 2 }} />
              {draft.aria_reasoning}
            </p>
          )}
        </>
      )}

      {/* Channel chips */}
      <div style={{ marginTop: 14, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(['community','instagram','facebook','google_business'] as Channel[]).map(c => (
          <ChannelChip key={c} channel={c} active={draft.channels.includes(c)} onClick={() => onToggleChannel(c)} />
        ))}
      </div>

      {/* Actions */}
      {draft.status !== 'posted' && (
        <div style={{ marginTop: 14, display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: `1px solid ${C.borderSoft}`, paddingTop: 12 }}>
          {draft.status === 'proposed' && (
            <>
              <button onClick={() => onStatus(draft.id, 'approved')} style={smallBtn('green')}><Check size={12} /> Approve</button>
              <button onClick={() => onStatus(draft.id, 'rejected')} style={smallBtn('ghost')}><X size={12} /> Reject</button>
            </>
          )}
          {draft.status === 'approved' && (
            <button onClick={() => onStatus(draft.id, 'proposed')} style={smallBtn('ghost')}>Move back</button>
          )}
          {draft.status === 'rejected' && (
            <button onClick={() => onStatus(draft.id, 'proposed')} style={smallBtn('ghost')}>Restore</button>
          )}
          {!isEditing && <button onClick={onStartEdit} style={smallBtn('ghost')}><Edit3 size={12} /> Edit</button>}
          <button onClick={onDelete} style={smallBtn('danger')}><Trash2 size={12} /></button>
        </div>
      )}
    </div>
  )
}

function primaryBtn(color: string, alt = false): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    height: 42, padding: '0 18px', borderRadius: 10,
    border: 'none', background: color,
    color: alt ? '#fff' : '#fff',
    fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT,
  }
}

function smallBtn(variant: 'green' | 'ghost' | 'danger'): React.CSSProperties {
  const styles = {
    green:  { bg: 'rgba(127,184,151,0.1)', border: `1px solid ${C.green}55`, color: C.green },
    ghost:  { bg: 'transparent',           border: `1px solid ${C.border}`,   color: C.muted },
    danger: { bg: 'transparent',           border: '1px solid rgba(239,68,68,0.3)', color: C.red },
  } as const
  const s = styles[variant]
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    height: 32, padding: '0 12px', borderRadius: 7,
    border: s.border, background: s.bg, color: s.color,
    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
  }
}
