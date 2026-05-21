'use client'
import { useState, useEffect, useCallback } from 'react'

interface FRItem { product_id: string; name: string; size: string; colour: string; outcome: 'pending'|'purchased'|'returned' }
interface Session { id: string; room_number: string; customer_name: string|null; items: FRItem[]; status: string; opened_at: string }

const C = {
  bg:'var(--bg-base)', card:'var(--bg-surface)', text:'var(--text-primary)',
  muted:'var(--text-secondary)', dim:'var(--text-tertiary)',
  violet:'#8B5CF6', green:'#22C55E', red:'#EF4444', amber:'#F59E0B',
  border:'rgba(255,255,255,0.07)',
}
const iS: React.CSSProperties = { background:'var(--bg-base)', border:`1px solid ${C.border}`, borderRadius:8, padding:'8px 12px', fontSize:13, color:C.text, outline:'none', fontFamily:'inherit', width:'100%', boxSizing:'border-box' }

const OUTCOME_COLOR = { pending: C.amber, purchased: C.green, returned: C.red }
const OUTCOME_LABEL = { pending: '⏳ Trying', purchased: '✅ Buying', returned: '↩️ Returned' }

export default function FittingRoomPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newRoom, setNewRoom] = useState('')
  const [newCustomer, setNewCustomer] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/pos/fitting-room')
    const d = await res.json() as { sessions?: Session[] }
    setSessions(d.sessions ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function openRoom() {
    if (!newRoom.trim()) return
    await fetch('/api/pos/fitting-room', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ room_number: newRoom, customer_name: newCustomer || null }),
    })
    setNewRoom(''); setNewCustomer(''); setShowNew(false); load()
  }

  async function setOutcome(sessionId: string, itemIdx: number, outcome: FRItem['outcome']) {
    const session = sessions.find(s => s.id === sessionId)!
    const items = session.items.map((it, i) => i === itemIdx ? { ...it, outcome } : it)
    await fetch('/api/pos/fitting-room', {
      method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id: sessionId, items }),
    })
    setSessions(ss => ss.map(s => s.id === sessionId ? { ...s, items } : s))
  }

  async function closeRoom(id: string, status: 'completed'|'abandoned') {
    await fetch('/api/pos/fitting-room', {
      method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id, status }),
    })
    setSessions(ss => ss.filter(s => s.id !== id))
  }

  const elapsed = (d: string) => {
    const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
    return mins < 60 ? `${mins}m` : `${Math.floor(mins/60)}h ${mins%60}m`
  }

  return (
    <div style={{minHeight:'100%', background:C.bg, color:C.text, fontFamily:"'Manrope',sans-serif", padding:'24px 28px', maxWidth:1000, margin:'0 auto'}}>
      <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24}}>
        <div>
          <h1 style={{fontSize:22, fontWeight:800, marginBottom:4}}>Fitting Rooms</h1>
          <p style={{fontSize:13, color:C.muted}}>Track items in each fitting room. See what customers are trying and what they're buying.</p>
        </div>
        <button onClick={()=>setShowNew(true)} style={{padding:'9px 18px', borderRadius:9, border:'none', background:C.violet, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit'}}>
          + Open room
        </button>
      </div>

      {showNew && (
        <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:20, marginBottom:20}}>
          <div style={{fontSize:15, fontWeight:700, marginBottom:14}}>Open fitting room</div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14}}>
            <div>
              <label style={{display:'block', fontSize:11, fontWeight:700, color:C.dim, marginBottom:5, textTransform:'uppercase', letterSpacing:'0.06em'}}>Room number *</label>
              <input value={newRoom} onChange={e=>setNewRoom(e.target.value)} placeholder="e.g. 1, 2, A" style={iS} />
            </div>
            <div>
              <label style={{display:'block', fontSize:11, fontWeight:700, color:C.dim, marginBottom:5, textTransform:'uppercase', letterSpacing:'0.06em'}}>Customer name (optional)</label>
              <input value={newCustomer} onChange={e=>setNewCustomer(e.target.value)} placeholder="e.g. Sarah" style={iS} />
            </div>
          </div>
          <div style={{display:'flex', gap:10}}>
            <button onClick={()=>setShowNew(false)} style={{padding:'9px 20px', borderRadius:9, border:`1px solid ${C.border}`, background:'transparent', color:C.muted, fontSize:13, cursor:'pointer', fontFamily:'inherit'}}>Cancel</button>
            <button onClick={openRoom} disabled={!newRoom.trim()} style={{padding:'9px 24px', borderRadius:9, border:'none', background:C.violet, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', opacity:!newRoom.trim()?0.5:1}}>Open room</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{color:C.muted, textAlign:'center', padding:'40px 0'}}>Loading…</div>
      ) : sessions.length === 0 ? (
        <div style={{textAlign:'center', padding:'60px 0'}}>
          <div style={{fontSize:40, marginBottom:12}}>👗</div>
          <div style={{fontSize:15, fontWeight:700, marginBottom:6}}>No active fitting rooms</div>
          <div style={{fontSize:13, color:C.muted}}>Open a room when a customer is trying on items</div>
        </div>
      ) : (
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px,1fr))', gap:16}}>
          {sessions.map(s => (
            <div key={s.id} style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, overflow:'hidden'}}>
              <div style={{padding:'14px 16px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                <div>
                  <div style={{fontSize:15, fontWeight:800}}>Room {s.room_number}</div>
                  <div style={{fontSize:12, color:C.muted}}>{s.customer_name ?? 'Unknown customer'} · {elapsed(s.opened_at)} ago</div>
                </div>
                <div style={{display:'flex', gap:6}}>
                  <button onClick={()=>closeRoom(s.id,'completed')} style={{padding:'5px 10px', borderRadius:7, border:'none', background:'rgba(34,197,94,0.1)', color:C.green, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit'}}>Done</button>
                  <button onClick={()=>closeRoom(s.id,'abandoned')} style={{padding:'5px 10px', borderRadius:7, border:`1px solid ${C.border}`, background:'transparent', color:C.dim, fontSize:11, cursor:'pointer', fontFamily:'inherit'}}>✕</button>
                </div>
              </div>
              <div style={{padding:'12px 16px'}}>
                {s.items.length === 0 ? (
                  <div style={{fontSize:12, color:C.dim, textAlign:'center', padding:'12px 0'}}>No items added yet</div>
                ) : s.items.map((item, i) => (
                  <div key={i} style={{display:'flex', alignItems:'center', gap:8, padding:'8px 0', borderBottom:i<s.items.length-1?`1px solid ${C.border}`:'none'}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13, fontWeight:600}}>{item.name}</div>
                      <div style={{fontSize:11, color:C.dim}}>{item.size} · {item.colour}</div>
                    </div>
                    <div style={{display:'flex', gap:4}}>
                      {(['pending','purchased','returned'] as const).map(o => (
                        <button key={o} onClick={()=>setOutcome(s.id, i, o)}
                          style={{padding:'3px 7px', borderRadius:6, border:'none', background:item.outcome===o?`${OUTCOME_COLOR[o]}20`:'transparent', color:item.outcome===o?OUTCOME_COLOR[o]:C.dim, fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:'inherit'}}>
                          {o==='pending'?'⏳':o==='purchased'?'✅':'↩️'}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{padding:'8px 16px', borderTop:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', fontSize:11, color:C.dim}}>
                <span>💚 {s.items.filter(i=>i.outcome==='purchased').length} buying</span>
                <span>↩️ {s.items.filter(i=>i.outcome==='returned').length} returned</span>
                <span>⏳ {s.items.filter(i=>i.outcome==='pending').length} pending</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
