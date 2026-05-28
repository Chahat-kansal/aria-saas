'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { AriaSays } from '@/components/dashboard/AriaSays'
import {
  Plus, Store, MessageCircle, Loader2, Trash2, Edit3, X,
  Image as ImageIcon, Send, AlertCircle, Eye, EyeOff, PackageOpen, Shield,
} from 'lucide-react'

const C = {
  bg: 'var(--bg-base)', card: 'var(--bg-surface)',
  surfaceHi: 'rgba(127,184,151,0.06)',
  border: 'rgba(127,184,151,0.15)',
  borderSoft: 'rgba(255,255,255,0.06)',
  text: 'var(--text-primary)', muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)',
  green: '#7FB897', sage: '#2D5240', amber: '#F59E0B', red: '#EF4444', violet: '#A78BFA',
}
const FONT = 'var(--font-ui, Inter, system-ui, sans-serif)'

interface Listing {
  id: string
  product_id: string | null
  title: string
  description: string | null
  price: number | null
  media_urls: string[]
  category: string | null
  status: 'active' | 'sold' | 'hidden'
  created_at: string
  updated_at: string
}

interface ChatMessage { from: 'member' | 'owner'; text: string; ts: string }

interface ChatRow {
  id: string
  listing_id: string
  messages: ChatMessage[]
  last_message_at: string
  unread_for_owner: boolean
  marketplace_listings: { title: string; price: number | null; media_urls: string[]; status: string } | null
  community_members: { nickname: string | null } | null
}

interface ChatDetail {
  id: string
  listing_id: string
  member_id: string
  messages: ChatMessage[]
  marketplace_listings: { title: string; price: number | null; media_urls: string[]; status: string } | null
  community_members: { nickname: string | null } | null
}

const STATUS_META = {
  active: { label: 'Active', color: C.green },
  sold:   { label: 'Sold',   color: C.dim },
  hidden: { label: 'Hidden', color: C.dim },
} as const

const blankForm = {
  title: '',
  description: '',
  price: '' as string | number,
  category: '',
  media_urls: [] as string[],
}

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
  color: C.text, fontSize: 13, outline: 'none', fontFamily: FONT, boxSizing: 'border-box',
  minHeight: 40,
}

export default function MarketplaceOwnerPage() {
  const [tab, setTab] = useState<'listings' | 'enquiries'>('listings')
  const [listings, setListings] = useState<Listing[]>([])
  const [chats, setChats] = useState<ChatRow[]>([])
  const [loading, setLoading] = useState(true)
  const [composing, setComposing] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...blankForm })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Reply drawer state
  const [openChat, setOpenChat] = useState<ChatDetail | null>(null)
  const [reply, setReply] = useState('')
  const [replyBusy, setReplyBusy] = useState(false)
  const [replyBlocked, setReplyBlocked] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [lRes, cRes] = await Promise.all([
        fetch('/api/community/owner/listings').then(r => r.json()),
        fetch('/api/community/owner/chats').then(r => r.json()),
      ])
      setListings(lRes.listings ?? [])
      setChats(cRes.chats ?? [])
    } catch (e: unknown) {
      setError((e as Error).message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function resetForm() {
    setForm({ ...blankForm })
    setEditId(null)
    setError('')
  }

  function startEdit(l: Listing) {
    setEditId(l.id)
    setForm({
      title: l.title,
      description: l.description ?? '',
      price: l.price ?? '',
      category: l.category ?? '',
      media_urls: l.media_urls ?? [],
    })
    setComposing(true)
  }

  async function uploadImage(file: File) {
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('kind', 'image')
      const res = await fetch('/api/community/owner/media', { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Upload failed')
      setForm(f => ({ ...f, media_urls: [...f.media_urls, d.url] }))
    } catch (e: unknown) {
      setError((e as Error).message)
    }
    setUploading(false)
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      if (!form.title.trim()) throw new Error('Title required.')
      const payload = {
        ...(editId ? { id: editId } : {}),
        title: form.title,
        description: form.description,
        price: form.price === '' ? null : Number(form.price),
        category: form.category || null,
        media_urls: form.media_urls,
      }
      const res = await fetch('/api/community/owner/listings', {
        method: editId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Save failed')
      setComposing(false)
      resetForm()
      load()
    } catch (e: unknown) {
      setError((e as Error).message)
    }
    setSaving(false)
  }

  async function changeStatus(id: string, status: Listing['status']) {
    await fetch('/api/community/owner/listings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    load()
  }

  async function remove(id: string) {
    if (!confirm('Delete this listing permanently?')) return
    await fetch('/api/community/owner/listings?id=' + id, { method: 'DELETE' })
    load()
  }

  async function openChatById(chatId: string) {
    try {
      const d = await fetch('/api/community/owner/chats?id=' + chatId).then(r => r.json())
      if (d.chat) {
        setOpenChat(d.chat)
        load()
      }
    } catch (e) { console.error(e) }
  }

  async function sendReply() {
    if (!openChat || !reply.trim() || replyBusy) return
    setReplyBusy(true)
    setReplyBlocked(null)
    const text = reply
    try {
      const res = await fetch('/api/community/owner/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: openChat.id, text }),
      })
      const d = await res.json()
      if (res.ok) {
        setOpenChat({ ...openChat, messages: [...openChat.messages, { from: 'owner', text, ts: new Date().toISOString() }] })
        setReply('')
      } else if (d.blocked) {
        setReplyBlocked(d.reason ?? 'Message blocked for safety.')
      } else {
        setReplyBlocked(d.error ?? 'Could not send.')
      }
    } catch (e) { console.error(e); setReplyBlocked('Network error.') }
    setReplyBusy(false)
  }

  const unreadEnquiries = chats.filter(c => c.unread_for_owner).length

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto', color: C.text, fontFamily: FONT }}>
      <style jsx global>{`
        .market-card { transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease; }
        .market-card:hover { transform: translateY(-1px); border-color: ${C.green}40; box-shadow: 0 8px 24px rgba(0,0,0,0.18); }
        .market-spin { animation: market-spin 1s linear infinite; }
        @keyframes market-spin { to { transform: rotate(360deg); } }
      `}</style>

      <AriaSays businessId={null} page="marketplace" />

      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.01em', fontFamily: "'Fraunces', serif", fontStyle: 'italic' }}>Marketplace</h1>
          <p style={{ fontSize: 13, color: C.dim, margin: '4px 0 0' }}>List products on Aria Community. Customers message you to buy — no online payments, pay in person.</p>
        </div>
        <button onClick={() => { setComposing(true); resetForm() }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40, padding: '0 18px', borderRadius: 10, border: 'none', background: C.sage, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
          <Plus size={15} /> New listing
        </button>
      </header>

      {/* Tab strip */}
      <nav style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, marginBottom: 20, gap: 4 }}>
        {(['listings', 'enquiries'] as const).map(t => {
          const active = tab === t
          const count = t === 'enquiries' ? unreadEnquiries : 0
          return (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '12px 22px', background: 'transparent', border: 'none', cursor: 'pointer',
              color: active ? C.green : C.muted, fontSize: 13, fontWeight: 700,
              borderBottom: `2px solid ${active ? C.green : 'transparent'}`,
              marginBottom: -1, textTransform: 'capitalize', fontFamily: FONT,
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}>
              {t}
              {count > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, padding: '0 6px', borderRadius: 9, background: C.amber, color: '#0a0a0f', fontSize: 10, fontWeight: 800 }}>{count}</span>}
            </button>
          )
        })}
      </nav>

      {/* Compose */}
      {composing && tab === 'listings' && (
        <section style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{editId ? 'Edit listing' : 'New listing'}</h2>
            <button onClick={() => { setComposing(false); resetForm() }}
              style={{ background: 'transparent', border: 'none', color: C.dim, cursor: 'pointer', display: 'flex', padding: 6 }}>
              <X size={16} />
            </button>
          </div>

          <label style={{ display: 'block', marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: C.dim, display: 'block', marginBottom: 6, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Title *</span>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} maxLength={200} style={inp} placeholder="e.g. Penfolds Koonunga Hill 2021" />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <label>
              <span style={{ fontSize: 11, color: C.dim, display: 'block', marginBottom: 6, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Price (A$)</span>
              <input type="number" min="0" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} style={inp} placeholder="0.00" />
            </label>
            <label>
              <span style={{ fontSize: 11, color: C.dim, display: 'block', marginBottom: 6, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Category</span>
              <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} maxLength={60} style={inp} placeholder="e.g. Wine, Bakery, Gifts" />
            </label>
          </div>

          <label style={{ display: 'block', marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: C.dim, display: 'block', marginBottom: 6, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Description</span>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={4} maxLength={2000}
              style={{ ...inp, height: 'auto', resize: 'vertical', minHeight: 100, lineHeight: 1.55 }}
              placeholder="Honest, specific. What it is, why someone would want it, condition." />
          </label>

          <div style={{ marginBottom: 14 }}>
            <span style={{ fontSize: 11, color: C.dim, display: 'block', marginBottom: 8, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Photos</span>
            {form.media_urls.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8, marginBottom: 10 }}>
                {form.media_urls.map((url, i) => (
                  <div key={url} style={{ position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', background: '#000', border: `1px solid ${C.border}` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button onClick={() => setForm(f => ({ ...f, media_urls: f.media_urls.filter((_, j) => j !== i) }))}
                      style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); if (e.target) e.target.value = '' }}
            />
            <button onClick={() => fileRef.current?.click()} disabled={uploading || form.media_urls.length >= 8}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40, padding: '0 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
              {uploading ? <Loader2 size={14} className="market-spin" /> : <ImageIcon size={14} />}
              {uploading ? 'Uploading…' : (form.media_urls.length === 0 ? 'Upload first photo' : `Add another (${form.media_urls.length}/8)`)}
            </button>
          </div>

          {error && (
            <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, color: C.red, fontSize: 12, marginBottom: 12, display: 'flex', gap: 8 }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={saving || !form.title.trim()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 42, padding: '0 18px', borderRadius: 10, border: 'none', background: C.sage, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, opacity: saving ? 0.6 : 1 }}>
              <Store size={14} /> {editId ? 'Save changes' : 'Publish listing'}
            </button>
            <button onClick={() => { setComposing(false); resetForm() }}
              style={{ height: 42, padding: '0 16px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
              Cancel
            </button>
          </div>
        </section>
      )}

      {/* Listings */}
      {tab === 'listings' && (
        loading ? (
          <p style={{ color: C.dim, padding: 32, textAlign: 'center' }}>Loading…</p>
        ) : listings.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', background: C.card, borderRadius: 12, border: `1px dashed ${C.border}` }}>
            <Store size={28} style={{ color: C.green, opacity: 0.6, marginBottom: 10 }} />
            <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>No listings yet</p>
            <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>Click &quot;New listing&quot; to put something on the marketplace.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
            {listings.map(l => {
              const sm = STATUS_META[l.status]
              const cover = l.media_urls?.[0]
              return (
                <div key={l.id} className="market-card" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', opacity: l.status === 'hidden' ? 0.55 : 1 }}>
                  <div style={{ width: '100%', aspectRatio: '4/3', background: '#000', position: 'relative' }}>
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover} alt={l.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.dim }}>
                        <PackageOpen size={32} />
                      </div>
                    )}
                    <span style={{ position: 'absolute', top: 10, left: 10, fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: sm.color + '28', color: sm.color, border: `1px solid ${sm.color}55`, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{sm.label}</span>
                  </div>
                  <div style={{ padding: '12px 14px' }}>
                    <p style={{ fontSize: 14, fontWeight: 700, margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.35 }}>{l.title}</p>
                    {l.price !== null && <p style={{ fontSize: 16, fontWeight: 700, color: C.green, margin: '6px 0 0' }}>A${Number(l.price).toFixed(2)}</p>}
                    {l.category && <p style={{ fontSize: 11, color: C.dim, margin: '6px 0 0' }}>{l.category}</p>}
                    <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                      {l.status === 'active' && (
                        <>
                          <button onClick={() => changeStatus(l.id, 'sold')} style={smallBtn('amber')}><span>Mark sold</span></button>
                          <button onClick={() => changeStatus(l.id, 'hidden')} style={smallBtn('ghost')}><EyeOff size={11} /> Hide</button>
                        </>
                      )}
                      {l.status === 'sold' && (
                        <button onClick={() => changeStatus(l.id, 'active')} style={smallBtn('green')}><Eye size={11} /> Relist</button>
                      )}
                      {l.status === 'hidden' && (
                        <button onClick={() => changeStatus(l.id, 'active')} style={smallBtn('green')}><Eye size={11} /> Unhide</button>
                      )}
                      <button onClick={() => startEdit(l)} style={smallBtn('ghost')}><Edit3 size={11} /> Edit</button>
                      <button onClick={() => remove(l.id)} style={smallBtn('danger')}><Trash2 size={11} /></button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* Enquiries */}
      {tab === 'enquiries' && (
        loading ? (
          <p style={{ color: C.dim, padding: 32, textAlign: 'center' }}>Loading…</p>
        ) : chats.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', background: C.card, borderRadius: 12, border: `1px dashed ${C.border}` }}>
            <MessageCircle size={28} style={{ color: C.green, opacity: 0.5, marginBottom: 10 }} />
            <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>No enquiries yet</p>
            <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>When a customer messages about a listing, it lands here.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {chats.map(c => {
              const last = c.messages?.[c.messages.length - 1]
              const lst = c.marketplace_listings
              return (
                <button key={c.id} onClick={() => openChatById(c.id)} className="market-card" style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: 14,
                  background: C.card, border: `1px solid ${c.unread_for_owner ? C.green + '55' : C.border}`,
                  borderRadius: 12, cursor: 'pointer', fontFamily: FONT, color: C.text, textAlign: 'left',
                }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: 10, flexShrink: 0,
                    background: lst?.media_urls?.[0] ? `url(${lst.media_urls[0]}) center/cover` : C.sage,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lst?.title}</p>
                    <p style={{ fontSize: 12, color: C.muted, margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ color: C.dim }}>From </span>
                      <strong style={{ color: C.text }}>{c.community_members?.nickname ?? 'Anonymous'}</strong>
                    </p>
                    {last && (
                      <p style={{ fontSize: 12, color: c.unread_for_owner ? C.text : C.dim, fontWeight: c.unread_for_owner ? 600 : 400, margin: '4px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {last.from === 'owner' ? 'You: ' : ''}{last.text}
                      </p>
                    )}
                  </div>
                  <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    {c.unread_for_owner && <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.amber }} />}
                    <span style={{ fontSize: 10, color: C.dim }}>{new Date(c.last_message_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )
      )}

      {/* Reply drawer */}
      {openChat && (
        <div onClick={() => setOpenChat(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: C.bg, width: '100%', maxWidth: 540,
            borderTopLeftRadius: 18, borderTopRightRadius: 18,
            display: 'flex', flexDirection: 'column',
            height: '80vh',
          }}>
            <header style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: openChat.marketplace_listings?.media_urls?.[0] ? `url(${openChat.marketplace_listings.media_urls[0]}) center/cover` : C.sage }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{openChat.marketplace_listings?.title}</p>
                <p style={{ fontSize: 11, color: C.dim, margin: '2px 0 0' }}>From {openChat.community_members?.nickname ?? 'Anonymous'}</p>
              </div>
              <button onClick={() => setOpenChat(null)} style={{ background: 'transparent', border: 'none', color: C.dim, padding: 6, cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </header>

            <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 8, background: C.bg }}>
              {openChat.messages.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.from === 'owner' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '78%', padding: '10px 14px',
                    borderRadius: m.from === 'owner' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    background: m.from === 'owner' ? C.sage : C.card,
                    color: '#fff',
                    fontSize: 13, lineHeight: 1.4,
                    border: m.from === 'owner' ? 'none' : `1px solid ${C.border}`,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {m.text}
                  </div>
                </div>
              ))}
            </div>

            {replyBlocked && (
              <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.08)', borderTop: '1px solid rgba(245,158,11,0.25)', color: C.amber, fontSize: 12, display: 'flex', gap: 8 }}>
                <Shield size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{replyBlocked}</span>
              </div>
            )}

            <div style={{ padding: '10px 12px 14px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8 }}>
              <input
                value={reply}
                onChange={e => { setReply(e.target.value); setReplyBlocked(null) }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
                placeholder="Reply…"
                maxLength={1000}
                style={{ flex: 1, padding: '11px 14px', borderRadius: 999, background: C.surfaceHi, border: `1px solid ${C.border}`, color: C.text, fontSize: 13, outline: 'none', fontFamily: FONT, minHeight: 40 }}
              />
              <button onClick={sendReply} disabled={replyBusy || !reply.trim()}
                style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', background: C.sage, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: replyBusy || !reply.trim() ? 0.5 : 1, flexShrink: 0 }}>
                {replyBusy ? <Loader2 size={16} className="market-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function smallBtn(variant: 'green' | 'amber' | 'ghost' | 'danger'): React.CSSProperties {
  const styles: Record<string, { bg: string; border: string; color: string }> = {
    green:  { bg: 'rgba(127,184,151,0.1)', border: `1px solid ${C.green}55`, color: C.green },
    amber:  { bg: 'rgba(245,158,11,0.1)',  border: `1px solid ${C.amber}55`, color: C.amber },
    ghost:  { bg: 'transparent',           border: `1px solid ${C.border}`,   color: C.muted },
    danger: { bg: 'transparent',           border: '1px solid rgba(239,68,68,0.3)', color: C.red },
  }
  const s = styles[variant]
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    height: 28, padding: '0 10px', borderRadius: 7,
    border: s.border, background: s.bg, color: s.color,
    fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
  }
}
