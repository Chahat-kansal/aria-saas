'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

const C = { bg:'var(--bg-base)',card:'var(--bg-surface)',border:'rgba(127,184,151,0.15)',green:'#7FB897',sage:'#2D5240',text:'var(--text-primary)',muted:'var(--text-secondary)',dim:'var(--text-tertiary)',red:'#ef4444',amber:'#f59e0b',blue:'#60a5fa' }
const STATUS_CFG: Record<string,{label:string;color:string;icon:string}> = {
  pending:{label:'Registered',color:'var(--text-tertiary)',icon:'⏳'},
  in_transit:{label:'In Transit',color:'#60a5fa',icon:'🚚'},
  out_for_delivery:{label:'Out for Delivery',color:'#f59e0b',icon:'📦'},
  delivered:{label:'Delivered',color:'#7FB897',icon:'✅'},
  exception:{label:'Exception',color:'#ef4444',icon:'⚠️'},
  on_hold:{label:'On Hold',color:'#f59e0b',icon:'⏸️'},
  awaiting_collection:{label:'Awaiting Collection',color:'#a78bfa',icon:'🏪'},
  cancelled:{label:'Cancelled',color:'#ef4444',icon:'✕'},
  failed:{label:'Failed',color:'#ef4444',icon:'✗'},
  unknown:{label:'Unknown',color:'var(--text-tertiary)',icon:'❓'},
}
const CARRIERS=[{value:'other',label:'Auto-detect'},{value:'auspost',label:'Australia Post'},{value:'aramex',label:'Aramex'},{value:'startrack',label:'StarTrack'},{value:'dhl',label:'DHL Express'},{value:'fedex',label:'FedEx'},{value:'couriersplease',label:'Couriers Please'},{value:'tnt',label:'TNT'}]
const MANUAL_STATUSES=[{value:'delivered',label:'✅ Delivered'},{value:'on_hold',label:'⏸️ On Hold'},{value:'awaiting_collection',label:'🏪 Awaiting Collection'},{value:'cancelled',label:'✕ Cancelled'},{value:'failed',label:'✗ Failed'}]

interface Parcel { id:string;tracking_number:string;carrier:string;carrier_name:string;label:string|null;direction:'inbound'|'outbound';status:string;status_detail:string|null;manual_status:string|null;events:Array<{time:string;location:string;description:string}>;estimated_delivery:string|null;delivered_at:string|null;last_checked_at:string|null;notes:string|null;created_at:string;recipient_name:string|null;recipient_phone:string|null;recipient_address:string|null;recipient_city:string|null;recipient_state:string|null;recipient_postcode:string|null;order_reference:string|null }

const fmt=(d:string|null)=>d?new Date(d).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}):'—'
const fmtDT=(d:string|null)=>d?new Date(d).toLocaleString('en-AU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'—'

function Badge({status}:{status:string}){
  const c=STATUS_CFG[status]??STATUS_CFG.unknown
  return <span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px',borderRadius:20,fontSize:11,fontWeight:700,background:c.color+'18',color:c.color,border:`1px solid ${c.color}30`}}>{c.icon} {c.label}</span>
}

const inp={height:34,borderRadius:7,border:`1px solid rgba(127,184,151,0.15)`,background:'transparent',color:'var(--text-primary)',padding:'0 10px',fontSize:12,fontFamily:'inherit',outline:'none',width:'100%'} as const

const emptyForm={tracking_number:'',carrier:'other',label:'',direction:'inbound',order_reference:'',recipient_name:'',recipient_phone:'',recipient_address:'',recipient_city:'',recipient_state:'',recipient_postcode:'',notes:''}

export default function ParcelTrackingPage(){
  const [parcels,setParcels]=useState<Parcel[]>([])
  const [loading,setLoading]=useState(true)
  const [selected,setSelected]=useState<Parcel|null>(null)
  const [filter,setFilter]=useState<'all'|'active'|'delivered'>('active')
  const [direction,setDirection]=useState<'all'|'inbound'|'outbound'>('all')
  const [search,setSearch]=useState('')
  const [showAdd,setShowAdd]=useState(false)
  const [refreshing,setRefreshing]=useState<string|null>(null)
  const [saving,setSaving]=useState(false)
  const [form,setForm]=useState(emptyForm)
  const [addErr,setAddErr]=useState('')
  const [adding,setAdding]=useState(false)
  const pollRef=useRef<ReturnType<typeof setInterval>|null>(null)

  const load=useCallback(async(silent=false)=>{
    if(!silent)setLoading(true)
    const p=new URLSearchParams()
    if(filter!=='all')p.set('status',filter)
    if(direction!=='all')p.set('direction',direction)
    if(search.trim())p.set('search',search.trim())
    const res=await fetch(`/api/pos/parcel-tracking?${p}`)
    if(res.ok){
      const d=await res.json() as {parcels:Parcel[]}
      const list=d.parcels??[]
      setParcels(list)
      if(selected){const u=list.find(p=>p.id===selected.id);if(u)setSelected(u)}
    }
    if(!silent)setLoading(false)
  },[filter,direction,search,selected])

  useEffect(()=>{load()},[filter,direction])
  useEffect(()=>{pollRef.current=setInterval(()=>load(true),60000);return()=>{if(pollRef.current)clearInterval(pollRef.current)}},[load])
  useEffect(()=>{const t=setTimeout(()=>load(),400);return()=>clearTimeout(t)},[search])

  async function addParcel(){
    if(!form.tracking_number.trim()){setAddErr('Enter a tracking number');return}
    setAdding(true);setAddErr('')
    const res=await fetch('/api/pos/parcel-tracking',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)})
    const d=await res.json() as {parcel?:Parcel;error?:string}
    if(d.error){setAddErr(d.error);setAdding(false);return}
    setShowAdd(false);setForm(emptyForm);setAdding(false)
    await load();if(d.parcel)setSelected(d.parcel)
  }

  async function refresh(id:string){
    setRefreshing(id)
    const res=await fetch('/api/pos/parcel-tracking',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,refresh:true})})
    const d=await res.json() as {parcel?:Parcel}
    if(d.parcel){setParcels(ps=>ps.map(p=>p.id===id?d.parcel!:p));if(selected?.id===id)setSelected(d.parcel)}
    setRefreshing(null)
  }

  async function setManualStatus(id:string,manual_status:string){
    setSaving(true)
    const res=await fetch('/api/pos/parcel-tracking',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,manual_status})})
    const d=await res.json() as {parcel?:Parcel}
    if(d.parcel){setParcels(ps=>ps.map(p=>p.id===id?d.parcel!:p));if(selected?.id===id)setSelected(d.parcel)}
    setSaving(false)
  }

  async function remove(id:string){
    if(!confirm('Remove this parcel from tracking?'))return
    await fetch('/api/pos/parcel-tracking',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})})
    setParcels(ps=>ps.filter(p=>p.id!==id));if(selected?.id===id)setSelected(null)
  }

  const activeCt=parcels.filter(p=>!['delivered','exception','cancelled','failed'].includes(p.status)).length

  const filterBtn=(label:string,active:boolean,onClick:()=>void)=>(
    <button onClick={onClick} style={{height:26,padding:'0 10px',borderRadius:6,border:`1px solid ${active?C.green:C.border}`,background:active?C.green+'18':'transparent',color:active?C.green:C.muted,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>{label}</button>
  )

  return (
    <div style={{display:'flex',height:'100vh',overflow:'hidden',background:C.bg,fontFamily:'var(--font-ui,Inter,system-ui,sans-serif)',color:C.text}}>
      
      {/* LEFT */}
      <div style={{width:420,flexShrink:0,display:'flex',flexDirection:'column',borderRight:`1px solid ${C.border}`}}>
        <div style={{padding:'14px 16px 10px',borderBottom:`1px solid ${C.border}`}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <div>
              <div style={{fontSize:15,fontWeight:700}}>Parcel Tracking</div>
              <div style={{fontSize:11,color:C.dim}}>{activeCt} active · live updates every 60s</div>
            </div>
            <button onClick={()=>setShowAdd(v=>!v)} style={{height:32,padding:'0 14px',borderRadius:8,border:'none',background:C.sage,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
              {showAdd?'✕ Cancel':'+ Add parcel'}
            </button>
          </div>
          <div style={{position:'relative',marginBottom:8}}>
            <span style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',fontSize:13,color:C.dim,pointerEvents:'none'}}>⌕</span>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search tracking number, name, order ref…" style={{...inp,paddingLeft:28,height:32,borderRadius:8}}/>
          </div>
          <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
            {filterBtn('Active',filter==='active',()=>setFilter('active'))}
            {filterBtn('All',filter==='all',()=>setFilter('all'))}
            {filterBtn('Delivered',filter==='delivered',()=>setFilter('delivered'))}
            <div style={{width:1,background:C.border}}/>
            {filterBtn('📥 In',direction==='inbound',()=>setDirection(v=>v==='inbound'?'all':'inbound'))}
            {filterBtn('📤 Out',direction==='outbound',()=>setDirection(v=>v==='outbound'?'all':'outbound'))}
          </div>
        </div>

        {showAdd&&(
          <div style={{padding:'12px 14px',borderBottom:`1px solid ${C.border}`,background:'rgba(127,184,151,0.02)',overflowY:'auto',maxHeight:400}}>
            <div style={{fontSize:12,fontWeight:700,color:C.green,marginBottom:10}}>New parcel</div>
            <div style={{display:'flex',flexDirection:'column',gap:7}}>
              <input value={form.tracking_number} onChange={e=>setForm(f=>({...f,tracking_number:e.target.value}))} placeholder="Tracking number *" style={{...inp,fontFamily:'monospace'}}/>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:7}}>
                <select value={form.carrier} onChange={e=>setForm(f=>({...f,carrier:e.target.value}))} style={{...inp,background:C.card}}>
                  {CARRIERS.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <select value={form.direction} onChange={e=>setForm(f=>({...f,direction:e.target.value}))} style={{...inp,background:C.card}}>
                  <option value="inbound">📥 Inbound (to me)</option>
                  <option value="outbound">📤 Outbound (to customer)</option>
                </select>
              </div>
              <input value={form.order_reference} onChange={e=>setForm(f=>({...f,order_reference:e.target.value}))} placeholder="Order reference (e.g. Order #1052)" style={inp}/>
              <input value={form.label} onChange={e=>setForm(f=>({...f,label:e.target.value}))} placeholder="Label (e.g. Stock from ALM)" style={inp}/>
              <div style={{fontSize:11,fontWeight:600,color:C.dim,marginTop:2}}>Recipient (optional)</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:7}}>
                <input value={form.recipient_name} onChange={e=>setForm(f=>({...f,recipient_name:e.target.value}))} placeholder="Name" style={inp}/>
                <input value={form.recipient_phone} onChange={e=>setForm(f=>({...f,recipient_phone:e.target.value}))} placeholder="Phone" style={inp}/>
              </div>
              <input value={form.recipient_address} onChange={e=>setForm(f=>({...f,recipient_address:e.target.value}))} placeholder="Address" style={inp}/>
              <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:7}}>
                <input value={form.recipient_city} onChange={e=>setForm(f=>({...f,recipient_city:e.target.value}))} placeholder="City" style={inp}/>
                <input value={form.recipient_state} onChange={e=>setForm(f=>({...f,recipient_state:e.target.value}))} placeholder="State" style={inp}/>
                <input value={form.recipient_postcode} onChange={e=>setForm(f=>({...f,recipient_postcode:e.target.value}))} placeholder="Postcode" style={inp}/>
              </div>
              <input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Notes" style={inp}/>
              {addErr&&<div style={{fontSize:11,color:C.red}}>{addErr}</div>}
              <button onClick={addParcel} disabled={adding} style={{height:34,borderRadius:7,border:'none',background:C.sage,color:'#fff',fontSize:12,fontWeight:700,cursor:adding?'not-allowed':'pointer',opacity:adding?0.6:1,fontFamily:'inherit'}}>
                {adding?'Adding…':'Add & Track'}
              </button>
            </div>
          </div>
        )}

        <div style={{flex:1,overflowY:'auto'}}>
          {loading?<div style={{padding:40,textAlign:'center',color:C.dim,fontSize:13}}>Loading…</div>
          :!parcels.length?<div style={{padding:40,textAlign:'center',color:C.dim}}><div style={{fontSize:40,marginBottom:10}}>📦</div><div style={{fontSize:13,fontWeight:600,marginBottom:6}}>No parcels tracked yet</div><div style={{fontSize:11}}>Click &quot;+ Add parcel&quot; to start tracking</div></div>
          :parcels.map(p=>{
            const isSelected=selected?.id===p.id
            return(
              <div key={p.id} onClick={()=>setSelected(p)} style={{padding:'11px 14px',borderBottom:`1px solid ${C.border}`,cursor:'pointer',background:isSelected?'rgba(127,184,151,0.06)':'transparent',borderLeft:`3px solid ${isSelected?C.green:'transparent'}`,transition:'all 0.12s'}}>
                <div style={{display:'flex',alignItems:'flex-start',gap:8}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:11,fontFamily:'monospace',fontWeight:600,marginBottom:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                      {p.direction==='inbound'?'📥':'📤'} {p.tracking_number}
                    </div>
                    {(p.order_reference||p.recipient_name)&&<div style={{fontSize:11,color:C.muted,marginBottom:3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.order_reference??''}{p.order_reference&&p.recipient_name?' · ':''}{p.recipient_name??''}</div>}
                    {p.label&&!p.order_reference&&<div style={{fontSize:11,color:C.dim,marginBottom:3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.label}</div>}
                    <Badge status={p.status}/>
                  </div>
                  <div style={{flexShrink:0,textAlign:'right'}}>
                    {p.estimated_delivery&&!['delivered','cancelled','failed'].includes(p.status)&&<div style={{fontSize:10,color:C.amber,fontWeight:600}}>ETA {fmt(p.estimated_delivery)}</div>}
                    {p.delivered_at&&<div style={{fontSize:10,color:C.green,fontWeight:600}}>✓ {fmt(p.delivered_at)}</div>}
                    <div style={{fontSize:10,color:C.dim,marginTop:1}}>{p.carrier_name}</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* RIGHT */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {!selected?<div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:12,color:C.dim}}><div style={{fontSize:52,opacity:0.2}}>🚚</div><div style={{fontSize:13}}>Select a parcel to view tracking details</div></div>:(
          <>
            <div style={{padding:'14px 20px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:17,fontWeight:700,fontFamily:'monospace',marginBottom:5}}>{selected.tracking_number}</div>
                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:4}}>
                  <Badge status={selected.status}/>
                  <span style={{fontSize:11,color:C.muted}}>{selected.carrier_name}</span>
                  <span style={{fontSize:11,color:C.dim}}>{selected.direction==='inbound'?'📥 Inbound':'📤 Outbound'}</span>
                  {selected.manual_status&&<span style={{fontSize:10,color:C.amber,background:'rgba(245,158,11,0.1)',padding:'1px 6px',borderRadius:4}}>manually set</span>}
                </div>
                {selected.order_reference&&<div style={{fontSize:12,color:C.muted}}>{selected.order_reference}</div>}
                {selected.recipient_name&&<div style={{fontSize:11,color:C.dim,marginTop:2}}>To: {selected.recipient_name}{selected.recipient_phone?` · ${selected.recipient_phone}`:''}{selected.recipient_city?` · ${selected.recipient_city} ${selected.recipient_state??''}`:''}</div>}
              </div>
              <div style={{display:'flex',gap:5,flexShrink:0}}>
                <button onClick={()=>refresh(selected.id)} disabled={refreshing===selected.id} style={{height:28,padding:'0 10px',borderRadius:6,border:`1px solid ${C.border}`,background:'transparent',color:C.green,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
                  {refreshing===selected.id?'…':'↻ Refresh'}
                </button>
                <button onClick={()=>remove(selected.id)} style={{height:28,padding:'0 10px',borderRadius:6,border:'1px solid rgba(239,68,68,0.3)',background:'transparent',color:C.red,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Remove</button>
              </div>
            </div>

            <div style={{display:'flex',gap:8,padding:'10px 20px',borderBottom:`1px solid ${C.border}`,flexWrap:'wrap'}}>
              {[{label:'Status',value:STATUS_CFG[selected.status]?.label??'Unknown'},{label:'Est. Delivery',value:fmt(selected.estimated_delivery)},{label:'Delivered',value:fmt(selected.delivered_at)},{label:'Last Updated',value:fmtDT(selected.last_checked_at)}].map(item=>(
                <div key={item.label} style={{flex:1,minWidth:100,background:C.card,borderRadius:8,padding:'8px 10px',border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:10,color:C.dim,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3}}>{item.label}</div>
                  <div style={{fontSize:12,fontWeight:600}}>{item.value}</div>
                </div>
              ))}
            </div>

            <div style={{padding:'8px 20px',borderBottom:`1px solid ${C.border}`}}>
              <div style={{fontSize:11,color:C.dim,marginBottom:6,fontWeight:600}}>Manual status override</div>
              <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                {MANUAL_STATUSES.map(ms=>(
                  <button key={ms.value} onClick={()=>setManualStatus(selected.id,ms.value)} disabled={saving} style={{height:26,padding:'0 10px',borderRadius:6,border:`1px solid ${selected.status===ms.value?C.green:C.border}`,background:selected.status===ms.value?C.green+'18':'transparent',color:selected.status===ms.value?C.green:C.muted,fontSize:11,cursor:'pointer',fontFamily:'inherit',fontWeight:500}}>
                    {ms.label}
                  </button>
                ))}
              </div>
            </div>

            {selected.status_detail&&<div style={{margin:'10px 20px 0',padding:'8px 12px',background:'rgba(127,184,151,0.04)',border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,color:C.muted}}>{selected.status_detail}</div>}

            <div style={{flex:1,overflowY:'auto',padding:'14px 20px'}}>
              {!selected.events?.length?(
                <div style={{textAlign:'center',color:C.dim,fontSize:12,padding:'30px 0'}}>
                  <div style={{marginBottom:8}}>No tracking events yet</div>
                  <div style={{fontSize:11}}>
                    Set <code style={{background:'rgba(127,184,151,0.1)',padding:'1px 5px',borderRadius:3}}>TRACKINGMORE_API_KEY</code> in Vercel env vars<br/>
                    Webhook: <code style={{background:'rgba(127,184,151,0.1)',padding:'1px 5px',borderRadius:3,fontSize:10}}>ariaos.site/api/pos/parcel-tracking/webhook</code><br/>
                    Sign up free at <a href="https://www.trackingmore.com" target="_blank" rel="noopener" style={{color:C.green}}>trackingmore.com</a>
                  </div>
                </div>
              ):(
                <>
                  <div style={{fontSize:11,fontWeight:700,color:C.dim,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:12}}>Tracking events</div>
                  {selected.events.map((ev,i)=>(
                    <div key={i} style={{display:'flex',gap:12,marginBottom:14}}>
                      <div style={{flexShrink:0,display:'flex',flexDirection:'column',alignItems:'center'}}>
                        <div style={{width:10,height:10,borderRadius:'50%',background:i===0?C.green:C.border,border:`2px solid ${i===0?C.green:C.dim}`,marginTop:2,flexShrink:0}}/>
                        {i<selected.events.length-1&&<div style={{width:1,flex:1,background:C.border,minHeight:16,marginTop:3}}/>}
                      </div>
                      <div style={{flex:1,paddingBottom:6}}>
                        <div style={{fontSize:12,fontWeight:600,color:i===0?C.text:C.muted,marginBottom:2}}>{ev.description}</div>
                        <div style={{display:'flex',gap:10,fontSize:11,color:C.dim}}>
                          {ev.location&&<span>📍 {ev.location}</span>}
                          <span>🕐 {fmtDT(ev.time)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
