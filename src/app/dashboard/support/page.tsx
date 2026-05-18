'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface Ticket {
  id: string
  subject: string
  message: string
  status: string
  priority: string
  category: string | null
  source: string
  aria_attempted: boolean
  aria_diagnosis: string | null
  admin_reply: string | null
  user_email: string
  created_at: string
  resolved_at: string | null
}

const STATUS_COLORS: Record<string, string> = {
  open: '#ef4444',
  in_progress: '#f59e0b',
  resolved: '#22c55e',
  closed: 'rgba(255,255,255,0.3)',
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  normal: '#6b7280',
  low: 'rgba(255,255,255,0.3)',
}

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Ticket | null>(null)
  const [reply, setReply] = useState('')
  const [saving, setSaving] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('open')

  const load = useCallback(async () => {
    setLoading(true)
    const q = supabase
      .from('support_tickets')
      .select('id,subject,message,status,priority,category,source,aria_attempted,aria_diagnosis,admin_reply,user_email,created_at,resolved_at')
      .order('created_at', { ascending: false })
      .limit(100)

    if (filterStatus !== 'all') q.eq('status', filterStatus)
    const { data } = await q
    setTickets((data ?? []) as Ticket[])
    setLoading(false)
  }, [supabase, filterStatus])

  useEffect(() => { load() }, [load])

  async function updateTicket(id: string, updates: Partial<Ticket>) {
    setSaving(true)
    await supabase.from('support_tickets').update(updates).eq('id', id)
    setSaving(false)
    load()
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, ...updates } : null)
  }

  async function sendReply() {
    if (!selected || !reply.trim()) return
    await updateTicket(selected.id, {
      admin_reply: reply.trim(),
      status: 'in_progress',
    })
    setReply('')
  }

  const statusOptions = ['all', 'open', 'in_progress', 'resolved', 'closed']

  return (
    <div className="flex h-full" style={{ background: '#0d0d14', color: '#e5e7eb' }}>
      {/* Sidebar */}
      <div className="w-80 flex-shrink-0 flex flex-col border-r" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <h1 className="font-semibold text-white text-base">Support Inbox</h1>
          <div className="flex gap-1 mt-3 flex-wrap">
            {statusOptions.map(s => (
              <button
                key={s}
                onClick={() => { setFilterStatus(s); setSelected(null) }}
                className="px-2.5 py-1 rounded-lg text-xs capitalize transition-colors"
                style={{
                  background: filterStatus === s ? 'rgba(127,184,151,0.2)' : 'rgba(255,255,255,0.05)',
                  color: filterStatus === s ? '#7FB897' : 'rgba(255,255,255,0.5)',
                  border: `1px solid ${filterStatus === s ? 'rgba(127,184,151,0.3)' : 'rgba(255,255,255,0.08)'}`,
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-5 space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.05)' }} />
              ))}
            </div>
          ) : tickets.length === 0 ? (
            <p className="p-5 text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No tickets</p>
          ) : tickets.map(t => (
            <button
              key={t.id}
              onClick={() => { setSelected(t); setReply(t.admin_reply ?? '') }}
              className="w-full text-left px-5 py-3.5 border-b transition-colors"
              style={{
                borderColor: 'rgba(255,255,255,0.04)',
                background: selected?.id === t.id ? 'rgba(127,184,151,0.08)' : 'transparent',
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-white truncate">{t.subject}</p>
                <span className="text-[10px] rounded-full px-2 py-0.5 flex-shrink-0 capitalize" style={{ background: `${STATUS_COLORS[t.status] ?? '#6b7280'}22`, color: STATUS_COLORS[t.status] ?? '#6b7280' }}>
                  {t.status.replace('_',' ')}
                </span>
              </div>
              <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{t.user_email}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>{new Date(t.created_at).toLocaleDateString()}</span>
                {t.aria_attempted && <span className="text-[10px] text-[#7FB897]">Aria attempted</span>}
                {t.source === 'aria' && <span className="text-[10px]" style={{ color: 'rgba(127,184,151,0.6)' }}>via Aria</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail pane */}
      {selected ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b flex items-start justify-between flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <div>
              <h2 className="font-semibold text-white">{selected.subject}</h2>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {selected.user_email} · {new Date(selected.created_at).toLocaleString()}
                {selected.category && ` · ${selected.category}`}
              </p>
            </div>
            <div className="flex gap-2">
              {(['open','in_progress','resolved','closed'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => updateTicket(selected.id, { status: s, resolved_at: s === 'resolved' ? new Date().toISOString() : undefined })}
                  disabled={saving || selected.status === s}
                  className="px-3 py-1.5 rounded-lg text-xs capitalize transition-opacity disabled:opacity-40"
                  style={{
                    background: selected.status === s ? `${STATUS_COLORS[s]}22` : 'rgba(255,255,255,0.05)',
                    color: selected.status === s ? STATUS_COLORS[s] : 'rgba(255,255,255,0.5)',
                    border: `1px solid ${selected.status === s ? `${STATUS_COLORS[s]}44` : 'rgba(255,255,255,0.08)'}`,
                  }}
                >
                  {s.replace('_',' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {/* User message */}
            <div>
              <p className="text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Customer message</p>
              <div className="rounded-xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                {selected.message}
              </div>
            </div>

            {/* Aria diagnosis */}
            {selected.aria_diagnosis && (
              <div>
                <p className="text-xs font-medium mb-1.5 text-[#7FB897]">Aria diagnosis</p>
                <div className="rounded-xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed" style={{ background: 'rgba(127,184,151,0.06)', border: '1px solid rgba(127,184,151,0.2)' }}>
                  {selected.aria_diagnosis}
                </div>
              </div>
            )}

            {/* Priority */}
            <div className="flex gap-3 items-center">
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Priority:</p>
              {(['urgent','high','normal','low'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => updateTicket(selected.id, { priority: p })}
                  disabled={saving}
                  className="px-3 py-1 rounded-lg text-xs capitalize transition-opacity disabled:opacity-40"
                  style={{
                    background: selected.priority === p ? `${PRIORITY_COLORS[p]}22` : 'rgba(255,255,255,0.04)',
                    color: selected.priority === p ? PRIORITY_COLORS[p] : 'rgba(255,255,255,0.4)',
                    border: `1px solid ${selected.priority === p ? `${PRIORITY_COLORS[p]}44` : 'rgba(255,255,255,0.08)'}`,
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Reply box */}
          <div className="px-6 py-4 border-t flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>Admin reply (internal note)</p>
            <textarea
              value={reply}
              onChange={e => setReply(e.target.value)}
              rows={3}
              placeholder="Write a note or reply…"
              className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={sendReply}
                disabled={saving || !reply.trim()}
                className="px-5 py-2 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40"
                style={{ background: '#2D5240', color: '#fff' }}
              >
                {saving ? 'Saving…' : 'Save note'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.25)' }}>Select a ticket</p>
        </div>
      )}
    </div>
  )
}
