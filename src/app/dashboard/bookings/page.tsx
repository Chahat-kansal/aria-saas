'use client'
import { useState, useEffect, useCallback } from 'react'

const C = { bg: 'var(--bg-base)', card: 'var(--bg-surface)', text: '#F0F4F0', muted: 'var(--text-secondary,#A8B5A8)', green: '#7FB897', darkGreen: '#2D5240', red: '#ef4444', amber: '#f59e0b', blue: '#60a5fa', border: 'rgba(127,184,151,0.15)' }
const STATUS_COLOR: Record<string, string> = { confirmed: C.green, pending: C.amber, cancelled: C.red, no_show: '#6b7280', completed: C.muted }
const STATUS_LABELS = ['confirmed','pending','cancelled','no_show','completed']

interface Service { id: string; name: string; duration_minutes: number; price: number | null; max_party_size: number; color: string; description: string | null }
interface Booking { id: string; customer_name: string; customer_phone: string | null; customer_email: string | null; booking_date: string; booking_time: string | null; party_size: number; duration_minutes: number; status: string; notes: string | null; aria_notes: string | null; reminder_sent_at: string | null; service_id: string | null; booking_services: { name: string; color: string; duration_minutes: number } | null }

function dateStr(d: Date) { return d.toISOString().slice(0,10) }
function fmtDate(s: string) { return new Date(s+'T12:00:00').toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'}) }
function fmtTime(t: string|null) { if (!t) return '—'; const [h,m]=t.split(':'); const hr=parseInt(h); return `${hr>12?hr-12:hr||12}:${m}${hr>=12?'pm':'am'}` }
function addDays(d: Date, n: number) { const r=new Date(d); r.setDate(r.getDate()+n); return r }
function weekStart(d: Date) { const r=new Date(d); r.setDate(r.getDate()-r.getDay()+1); return r }

export default function BookingsPage() {
  const [bid, setBid]           = useState('')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [tab, setTab]           = useState<'calendar'|'list'|'services'>('calendar')
  const [loading, setLoading]   = useState(true)
  const [showAdd, setShowAdd]   = useState(false)
  const [selectedDate, setSelectedDate] = useState(dateStr(new Date()))
  const [weekOf, setWeekOf]     = useState(() => weekStart(new Date()))
  const [statusFilter, setStatusFilter] = useState('all')
  const [sending, setSending]   = useState<Record<string,boolean>>({})
  const [saving, setSaving]     = useState(false)
  const [form, setForm]         = useState({ customer_name:'', customer_email:'', customer_phone:'', booking_date: dateStr(new Date()), booking_time:'12:00', party_size:2, service_id:'', notes:'' })
  const [svcForm, setSvcForm]   = useState({ name:'', duration_minutes:60, price:'', max_party_size:20, description:'', color:'#7FB897' })

  const load = useCallback(async (businessId: string) => {
    const [bkRes, svcRes] = await Promise.all([
      fetch(`/api/bookings?business_id=${businessId}`),
      fetch('/api/bookings/services'),
    ])
    const bk = await bkRes.json().catch(()=>({}))
    const sv = await svcRes.json().catch(()=>({}))
    // Normalize booking_date to YYYY-MM-DD (DB stores as timestamptz '2026-05-23 00:00:00+00')
    const normalized = (bk.bookings ?? []).map((b: Booking) => ({
      ...b,
      booking_date: b.booking_date ? b.booking_date.slice(0, 10) : b.booking_date
    }))
    setBookings(normalized)
    setServices(sv.services ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetch('/api/pos/products').then(r=>r.json()).then((d:Record<string,unknown>)=>{
      if (d.business_id) { setBid(d.business_id as string); load(d.business_id as string) }
      else setLoading(false)
    }).catch(()=>setLoading(false))
  }, [load])

  async function addBooking() {
    if (!form.customer_name || !form.booking_date) return
    setSaving(true)
    const res = await fetch('/api/bookings', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ ...form, business_id: bid, party_size: Number(form.party_size), service_id: form.service_id || null }) })
    const d = await res.json()
    if (d.booking) { const nb = {...d.booking, booking_date: d.booking.booking_date?.slice(0,10)}; setBookings(p=>[nb,...p]); setShowAdd(false); setForm({ customer_name:'', customer_email:'', customer_phone:'', booking_date: dateStr(new Date()), booking_time:'12:00', party_size:2, service_id:'', notes:'' }) }
    setSaving(false)
  }

  async function updateStatus(id: string, status: string) {
    await fetch('/api/bookings', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, business_id: bid, status }) })
    setBookings(p=>p.map(b=>b.id===id?{...b,status}:b))
  }

  async function sendReminder(booking: Booking) {
    if (!booking.customer_phone) return alert('No phone number for this customer.')
    setSending(p=>({...p,[booking.id]:true}))
    const res = await fetch('/api/bookings/remind', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ booking_id: booking.id, business_id: bid }) })
    const d = await res.json()
    if (d.ok) {
      setBookings(p=>p.map(b=>b.id===booking.id?{...b,reminder_sent_at:new Date().toISOString()}:b))
    } else alert(d.error || 'Could not send reminder.')
    setSending(p=>({...p,[booking.id]:false}))
  }

  async function addService() {
    const res = await fetch('/api/bookings/services', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ ...svcForm, price: parseFloat(svcForm.price)||null, business_id: bid }) })
    const d = await res.json()
    if (d.service) { setServices(p=>[...p,d.service]); setSvcForm({ name:'', duration_minutes:60, price:'', max_party_size:20, description:'', color:'#7FB897' }) }
  }

  // Calendar helpers
  const weekDays = Array.from({length:7},(_,i)=>addDays(weekOf,i))
  const filteredBookings = bookings.filter(b => statusFilter==='all' || b.status===statusFilter)

  const iStyle = { background:'rgba(255,255,255,0.05)', border:`1px solid ${C.border}`, borderRadius:8, padding:'8px 12px', color:C.text, fontSize:13, width:'100%' }
  const btnPrimary = { background:C.darkGreen, color:C.green, border:'none', borderRadius:8, padding:'8px 18px', cursor:'pointer', fontSize:13, fontWeight:600 as const }

  // Stats
  const today = dateStr(new Date())
  const todayBookings = bookings.filter(b=>b.booking_date===today && b.status!=='cancelled')
  const upcomingCount = bookings.filter(b=>b.booking_date>=today && b.status==='confirmed').length
  const needReminder = bookings.filter(b=>b.status==='confirmed' && !b.reminder_sent_at && b.booking_date===dateStr(addDays(new Date(),1)))

  return (
    <div style={{padding:24,maxWidth:1100,color:C.text,fontFamily:'Inter,sans-serif'}}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20,flexWrap:'wrap',gap:10}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:700}}>Bookings</h1>
          <p style={{fontSize:13,color:C.muted,marginTop:2}}>Manage reservations, services, and reminders</p>
        </div>
        <button onClick={()=>setShowAdd(p=>!p)} style={btnPrimary}>+ New booking</button>
      </div>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:20}}>
        {[
          {label:"Today's bookings", value: todayBookings.length, color: C.green},
          {label:'Upcoming confirmed', value: upcomingCount, color: C.blue},
          {label:'Need reminder (tomorrow)', value: needReminder.length, color: needReminder.length>0 ? C.amber : C.muted},
          {label:'Services offered', value: services.length, color: C.muted},
        ].map(({label,value,color})=>(
          <div key={label} style={{background:'var(--bg-surface)',borderRadius:12,padding:'14px 16px'}}>
            <p style={{fontSize:22,fontWeight:700,fontFamily:'Fraunces,serif',fontStyle:'italic',color}}>{value}</p>
            <p style={{fontSize:11,color:C.muted,marginTop:3}}>{label}</p>
          </div>
        ))}
      </div>

      {/* Reminder alert */}
      {needReminder.length > 0 && (
        <div style={{marginBottom:16,padding:'12px 16px',background:'rgba(245,158,11,0.08)',borderRadius:10,border:`1px solid rgba(245,158,11,0.25)`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <p style={{fontSize:13,fontWeight:600,color:C.amber}}>⏰ {needReminder.length} booking{needReminder.length>1?'s':''} tomorrow without a reminder</p>
            <p style={{fontSize:12,color:C.muted,marginTop:2}}>{needReminder.map(b=>b.customer_name).join(', ')}</p>
          </div>
          <button onClick={()=>needReminder.forEach(b=>sendReminder(b))} style={{...btnPrimary,background:'rgba(245,158,11,0.15)',color:C.amber,border:`1px solid rgba(245,158,11,0.3)`}}>
            Send all reminders
          </button>
        </div>
      )}

      {/* Add booking form */}
      {showAdd && (
        <div style={{background:'var(--bg-surface)',borderRadius:14,padding:20,marginBottom:20,border:`1px solid ${C.border}`}}>
          <p style={{fontWeight:700,marginBottom:14}}>New booking</p>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <div><label style={{fontSize:11,color:C.muted,display:'block',marginBottom:4}}>Customer name *</label>
              <input value={form.customer_name} onChange={e=>setForm(p=>({...p,customer_name:e.target.value}))} style={iStyle} placeholder="Jane Smith"/></div>
            <div><label style={{fontSize:11,color:C.muted,display:'block',marginBottom:4}}>Phone (for SMS reminders)</label>
              <input value={form.customer_phone} onChange={e=>setForm(p=>({...p,customer_phone:e.target.value}))} style={iStyle} placeholder="0412 345 678"/></div>
            <div><label style={{fontSize:11,color:C.muted,display:'block',marginBottom:4}}>Email</label>
              <input value={form.customer_email} onChange={e=>setForm(p=>({...p,customer_email:e.target.value}))} style={iStyle} placeholder="jane@email.com"/></div>
            <div><label style={{fontSize:11,color:C.muted,display:'block',marginBottom:4}}>Service</label>
              <select value={form.service_id} onChange={e=>setForm(p=>({...p,service_id:e.target.value}))} style={iStyle}>
                <option value="">No specific service</option>
                {services.map(s=><option key={s.id} value={s.id}>{s.name} ({s.duration_minutes}min{s.price?` · $${s.price}`:''})</option>)}
              </select></div>
            <div><label style={{fontSize:11,color:C.muted,display:'block',marginBottom:4}}>Date *</label>
              <input type="date" value={form.booking_date} onChange={e=>setForm(p=>({...p,booking_date:e.target.value}))} style={iStyle}/></div>
            <div><label style={{fontSize:11,color:C.muted,display:'block',marginBottom:4}}>Time</label>
              <input type="time" value={form.booking_time} onChange={e=>setForm(p=>({...p,booking_time:e.target.value}))} style={iStyle}/></div>
            <div><label style={{fontSize:11,color:C.muted,display:'block',marginBottom:4}}>Party size</label>
              <input type="number" min={1} max={50} value={form.party_size} onChange={e=>setForm(p=>({...p,party_size:parseInt(e.target.value)||1}))} style={iStyle}/></div>
            <div><label style={{fontSize:11,color:C.muted,display:'block',marginBottom:4}}>Notes</label>
              <input value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} style={iStyle} placeholder="Special requests…"/></div>
          </div>
          <div style={{display:'flex',gap:10,marginTop:14}}>
            <button onClick={addBooking} disabled={saving} style={btnPrimary}>{saving?'Saving…':'Save booking'}</button>
            <button onClick={()=>setShowAdd(false)} style={{...btnPrimary,background:'transparent',color:C.muted,border:`1px solid ${C.border}`}}>Cancel</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{display:'flex',gap:4,marginBottom:16,borderBottom:`1px solid ${C.border}`,paddingBottom:0}}>
        {([['calendar','📅 Calendar'],['list','📋 List'],['services','🛎 Services']] as const).map(([t,label])=>(
          <button key={t} onClick={()=>setTab(t)}
            {...(t === 'services' ? { 'data-tour': 'add_service' } : {})}
            style={{padding:'8px 16px',background:'none',border:'none',cursor:'pointer',fontSize:13,fontWeight:tab===t?700:400,color:tab===t?C.green:C.muted,borderBottom:`2px solid ${tab===t?C.green:'transparent'}`,marginBottom:-1}}>
            {label}
          </button>
        ))}
      </div>

      {/* CALENDAR TAB */}
      {tab==='calendar' && (
        <div>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
            <button onClick={()=>setWeekOf(p=>addDays(p,-7))} style={{...btnPrimary,padding:'6px 12px'}}>‹</button>
            <span style={{fontSize:14,fontWeight:600}}>{fmtDate(dateStr(weekDays[0]))} – {fmtDate(dateStr(weekDays[6]))}</span>
            <button onClick={()=>setWeekOf(p=>addDays(p,7))} style={{...btnPrimary,padding:'6px 12px'}}>›</button>
            <button onClick={()=>setWeekOf(weekStart(new Date()))} style={{...btnPrimary,background:'transparent',color:C.muted,border:`1px solid ${C.border}`,fontSize:12}}>Today</button>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:6}}>
            {weekDays.map(day=>{
              const ds = dateStr(day)
              const dayBookings = bookings.filter(b=>b.booking_date===ds && b.status!=='cancelled')
              const isToday = ds===today
              return (
                <div key={ds} onClick={()=>setSelectedDate(ds)}
                  style={{background: selectedDate===ds ? 'rgba(45,82,64,0.2)' : 'var(--bg-surface)', borderRadius:10, padding:10, cursor:'pointer', border:`1px solid ${isToday?C.green:selectedDate===ds?C.darkGreen:C.border}`, minHeight:120}}>
                  <p style={{fontSize:11,color:isToday?C.green:C.muted,fontWeight:isToday?700:400,marginBottom:6}}>
                    {day.toLocaleDateString('en-AU',{weekday:'short'})} {day.getDate()}
                  </p>
                  {dayBookings.length===0 ? <p style={{fontSize:10,color:C.border}}>—</p> :
                    dayBookings.slice(0,3).map(b=>(
                      <div key={b.id} style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:`${STATUS_COLOR[b.status]}20`,color:STATUS_COLOR[b.status],marginBottom:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {fmtTime(b.booking_time)} {b.customer_name}
                      </div>
                    ))
                  }
                  {dayBookings.length>3 && <p style={{fontSize:10,color:C.muted}}>+{dayBookings.length-3} more</p>}
                </div>
              )
            })}
          </div>

          {/* Selected day detail */}
          {selectedDate && (
            <div style={{marginTop:16}}>
              <p style={{fontSize:14,fontWeight:600,marginBottom:10}}>{fmtDate(selectedDate)}</p>
              {bookings.filter(b=>b.booking_date===selectedDate && b.status!=='cancelled').length===0 ?
                <p style={{color:C.muted,fontSize:13}}>No bookings this day.</p> :
                bookings.filter(b=>b.booking_date===selectedDate && b.status!=='cancelled').map(b=>(
                  <BookingCard key={b.id} b={b} onStatus={updateStatus} onRemind={sendReminder} sending={!!sending[b.id]}/>
                ))
              }
            </div>
          )}
        </div>
      )}

      {/* LIST TAB */}
      {tab==='list' && (
        <div>
          <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
            {['all',...STATUS_LABELS].map(s=>(
              <button key={s} onClick={()=>setStatusFilter(s)} style={{padding:'4px 12px',borderRadius:20,border:`1px solid ${statusFilter===s?C.green:C.border}`,background:statusFilter===s?'rgba(127,184,151,0.1)':'transparent',color:statusFilter===s?C.green:C.muted,fontSize:12,cursor:'pointer',textTransform:'capitalize'}}>
                {s}
              </button>
            ))}
          </div>
          {loading ? <p style={{color:C.muted}}>Loading…</p> :
            filteredBookings.length===0 ? <p style={{color:C.muted,fontSize:13}}>No bookings found.</p> :
            filteredBookings.sort((a,b)=>a.booking_date.localeCompare(b.booking_date)).map(b=>(
              <BookingCard key={b.id} b={b} onStatus={updateStatus} onRemind={sendReminder} sending={!!sending[b.id]}/>
            ))
          }
        </div>
      )}

      {/* SERVICES TAB */}
      {tab==='services' && (
        <div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:10,marginBottom:20}}>
            {services.map(s=>(
              <div key={s.id} style={{background:'var(--bg-surface)',borderRadius:12,padding:'14px 16px',borderLeft:`3px solid ${s.color}`}}>
                <p style={{fontWeight:600,fontSize:14}}>{s.name}</p>
                <p style={{fontSize:12,color:C.muted,marginTop:3}}>{s.duration_minutes} min{s.price?` · $${s.price}`:''}</p>
                {s.description && <p style={{fontSize:11,color:C.muted,marginTop:4}}>{s.description}</p>}
                <p style={{fontSize:11,color:C.muted,marginTop:4}}>Max party: {s.max_party_size}</p>
              </div>
            ))}
          </div>
          <div style={{background:'var(--bg-surface)',borderRadius:14,padding:20,border:`1px solid ${C.border}`}}>
            <p style={{fontWeight:700,marginBottom:14}}>Add service</p>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <div><label style={{fontSize:11,color:C.muted,display:'block',marginBottom:4}}>Service name *</label>
                <input value={svcForm.name} onChange={e=>setSvcForm(p=>({...p,name:e.target.value}))} style={iStyle} placeholder="e.g. Table reservation"/></div>
              <div><label style={{fontSize:11,color:C.muted,display:'block',marginBottom:4}}>Duration (minutes)</label>
                <input type="number" value={svcForm.duration_minutes} onChange={e=>setSvcForm(p=>({...p,duration_minutes:parseInt(e.target.value)||60}))} style={iStyle}/></div>
              <div><label style={{fontSize:11,color:C.muted,display:'block',marginBottom:4}}>Price ($)</label>
                <input value={svcForm.price} onChange={e=>setSvcForm(p=>({...p,price:e.target.value}))} style={iStyle} placeholder="Leave blank if free"/></div>
              <div><label style={{fontSize:11,color:C.muted,display:'block',marginBottom:4}}>Max party size</label>
                <input type="number" value={svcForm.max_party_size} onChange={e=>setSvcForm(p=>({...p,max_party_size:parseInt(e.target.value)||20}))} style={iStyle}/></div>
              <div><label style={{fontSize:11,color:C.muted,display:'block',marginBottom:4}}>Description</label>
                <input value={svcForm.description} onChange={e=>setSvcForm(p=>({...p,description:e.target.value}))} style={iStyle} placeholder="Optional"/></div>
              <div><label style={{fontSize:11,color:C.muted,display:'block',marginBottom:4}}>Colour</label>
                <input type="color" value={svcForm.color} onChange={e=>setSvcForm(p=>({...p,color:e.target.value}))} style={{...iStyle,padding:4,height:38}}/></div>
            </div>
            <button onClick={addService} style={{...btnPrimary,marginTop:14}}>Add service</button>
          </div>
        </div>
      )}
    </div>
  )
}

function BookingCard({ b, onStatus, onRemind, sending }: { b: Booking; onStatus:(id:string,s:string)=>void; onRemind:(b:Booking)=>void; sending:boolean }) {
  const C2 = { green:'#7FB897', darkGreen:'#2D5240', amber:'#f59e0b', red:'#ef4444', muted:'var(--text-secondary,#A8B5A8)', text:'#F0F4F0', border:'rgba(127,184,151,0.15)', card:'var(--bg-surface)' }
  const sc = STATUS_COLOR[b.status] || '#888'
  return (
    <div style={{background:C2.card,borderRadius:12,padding:'14px 18px',marginBottom:8,borderLeft:`3px solid ${sc}`,display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,flexWrap:'wrap'}}>
      <div style={{flex:1}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
          <p style={{fontWeight:700,fontSize:14,color:C2.text}}>{b.customer_name}</p>
          <span style={{fontSize:10,padding:'2px 8px',borderRadius:10,background:`${sc}20`,color:sc,fontWeight:600,textTransform:'capitalize'}}>{b.status}</span>
          {b.booking_services && <span style={{fontSize:10,padding:'2px 8px',borderRadius:10,background:`${b.booking_services.color}20`,color:b.booking_services.color}}>📋 {b.booking_services.name}</span>}
          {b.reminder_sent_at && <span style={{fontSize:10,color:C2.muted}}>✉️ reminder sent</span>}
        </div>
        <div style={{display:'flex',gap:12,flexWrap:'wrap',fontSize:12,color:C2.muted}}>
          <span>📅 {new Date(b.booking_date+'T12:00:00').toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'})}</span>
          {b.booking_time && <span>🕐 {(() => { const [h,m]=b.booking_time.split(':'); const hr=parseInt(h); return `${hr>12?hr-12:hr||12}:${m}${hr>=12?'pm':'am'}` })()}</span>}
          <span>👥 {b.party_size} {b.party_size===1?'person':'people'}</span>
          {b.customer_phone && <span>📱 {b.customer_phone}</span>}
        </div>
        {b.notes && <p style={{fontSize:12,color:C2.muted,marginTop:4,fontStyle:'italic'}}>"{b.notes}"</p>}
      </div>
      <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
        {b.status==='confirmed' && !b.reminder_sent_at && b.customer_phone && (
          <button onClick={()=>onRemind(b)} disabled={sending}
            style={{fontSize:11,padding:'4px 10px',borderRadius:6,background:'rgba(96,165,250,0.1)',color:'#60a5fa',border:'1px solid rgba(96,165,250,0.25)',cursor:'pointer'}}>
            {sending?'Sending…':'📱 Send reminder'}
          </button>
        )}
        {b.status==='confirmed' && (
          <button onClick={()=>onStatus(b.id,'completed')}
            style={{fontSize:11,padding:'4px 10px',borderRadius:6,background:'rgba(127,184,151,0.1)',color:C2.green,border:`1px solid rgba(127,184,151,0.25)`,cursor:'pointer'}}>
            ✓ Complete
          </button>
        )}
        {b.status!=='cancelled' && b.status!=='completed' && (
          <button onClick={()=>onStatus(b.id,'cancelled')}
            style={{fontSize:11,padding:'4px 10px',borderRadius:6,background:'rgba(239,68,68,0.08)',color:C2.red,border:'1px solid rgba(239,68,68,0.2)',cursor:'pointer'}}>
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
