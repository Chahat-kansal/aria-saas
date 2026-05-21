'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Register { id: string; name: string; is_active: boolean }
interface Outlet {
  id: string; name: string; address: string | null; phone: string | null
  is_active: boolean; is_default: boolean; timezone: string | null
  pos_registers?: Register[]
}

const C = {
  bg: 'var(--bg-base)', card: 'var(--bg-surface)', text: 'var(--text-primary)',
  muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)',
  violet: '#006AFF', green: '#00B140', red: '#EF4444',
  border: 'rgba(255,255,255,0.07)',
}
const iS: React.CSSProperties = {
  background: 'var(--bg-base)', border: `1px solid ${C.border}`, borderRadius: 8,
  padding: '9px 12px', fontSize: 13, color: C.text, outline: 'none',
  fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
}
const TIMEZONES = ['Australia/Sydney','Australia/Melbourne','Australia/Brisbane','Australia/Perth','Australia/Adelaide','Australia/Darwin','Australia/Hobart']

export default function OutletsPage() {
  const router = useRouter()
  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name:'', address:'', phone:'', timezone:'Australia/Melbourne', is_default:false })
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState<string|null>(null)
  const [newReg, setNewReg] = useState('')
  const [addingReg, setAddingReg] = useState<string|null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/pos/outlets')
    const d = await res.json() as { outlets?: Outlet[] }
    setOutlets(d.outlets ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function addOutlet() {
    if (!form.name.trim()) return
    setSaving(true)
    const res = await fetch('/api/pos/outlets', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(form) })
    if (res.ok) { setShowAdd(false); setForm({name:'',address:'',phone:'',timezone:'Australia/Melbourne',is_default:false}); load() }
    else { const d = await res.json() as {error?:string}; alert(d.error ?? 'Failed') }
    setSaving(false)
  }

  async function toggleOutlet(id: string, is_active: boolean) {
    await fetch(`/api/pos/outlets/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({is_active:!is_active}) })
    setOutlets(o => o.map(x => x.id===id ? {...x,is_active:!is_active} : x))
  }

  async function setDefault(id: string) {
    await fetch(`/api/pos/outlets/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({is_default:true}) })
    setOutlets(o => o.map(x => ({...x,is_default:x.id===id})))
  }

  async function deleteOutlet(id: string, name: string) {
    if (!confirm(`Delete outlet "${name}"? This cannot be undone.`)) return
    await fetch(`/api/pos/outlets/${id}`, {method:'DELETE'})
    setOutlets(o => o.filter(x => x.id!==id))
  }

  async function addRegister(outletId: string) {
    if (!newReg.trim()) return
    setAddingReg(outletId)
    await fetch('/api/pos/registers', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({outlet_id:outletId,name:newReg}) })
    setNewReg(''); setAddingReg(null); load()
  }

  async function toggleRegister(id: string, is_active: boolean) {
    await fetch(`/api/pos/registers/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({is_active:!is_active}) })
    setOutlets(o => o.map(outlet => ({...outlet, pos_registers: outlet.pos_registers?.map(r => r.id===id ? {...r,is_active:!is_active} : r)})))
  }

  return (
    <div style={{minHeight:'100%',background:C.bg,color:C.text,fontFamily:"'Manrope',sans-serif",padding:'24px 28px',maxWidth:900,margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:8}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:800,marginBottom:4}}>Outlets & Registers</h1>
          <p style={{fontSize:13,color:C.muted}}>Manage multiple store locations. Each outlet can have multiple registers. Staff select their outlet at POS login.</p>
        </div>
        <button onClick={() => router.push('/pos/select')} style={{padding:'9px 18px',borderRadius:9,border:`1px solid ${C.border}`,background:'transparent',color:C.muted,fontSize:13,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',marginTop:4}}>
          ← Switch outlet
        </button>
      </div>

      <div style={{background:'rgba(139,92,246,0.07)',border:'1px solid rgba(139,92,246,0.18)',borderRadius:10,padding:'10px 16px',marginBottom:24,fontSize:12,color:C.muted}}>
        💡 Each device remembers its outlet. Staff pick their outlet once at login via <strong style={{color:C.text}}>/pos/select</strong>.
      </div>

      {loading ? <div style={{color:C.muted,textAlign:'center',padding:'60px 0'}}>Loading…</div> : (
        <>
          <div style={{display:'flex',flexDirection:'column',gap:14,marginBottom:20}}>
            {outlets.map(outlet => (
              <div key={outlet.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,overflow:'hidden'}}>
                <div style={{display:'flex',alignItems:'center',gap:16,padding:'16px 20px'}}>
                  <div style={{flex:1}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
                      <span style={{fontSize:15,fontWeight:700}}>🏪 {outlet.name}</span>
                      {outlet.is_default && <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:99,background:'rgba(34,197,94,0.12)',color:C.green}}>DEFAULT</span>}
                      <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:99,background:outlet.is_active?'rgba(34,197,94,0.08)':'rgba(239,68,68,0.08)',color:outlet.is_active?C.green:C.red}}>
                        {outlet.is_active?'Active':'Inactive'}
                      </span>
                    </div>
                    {outlet.address && <div style={{fontSize:12,color:C.muted}}>{outlet.address}</div>}
                    <div style={{fontSize:11,color:C.dim,marginTop:4}}>
                      {outlet.pos_registers?.filter(r=>r.is_active).length??0} register(s) · {outlet.timezone??'AEST'}
                    </div>
                  </div>
                  <div style={{display:'flex',gap:8,flexShrink:0}}>
                    <button onClick={() => setExpanded(expanded===outlet.id?null:outlet.id)} style={{padding:'7px 14px',borderRadius:8,border:`1px solid ${C.border}`,background:'transparent',color:C.muted,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>
                      {expanded===outlet.id?'Hide':'Registers'}
                    </button>
                    {!outlet.is_default && <button onClick={() => setDefault(outlet.id)} style={{padding:'7px 14px',borderRadius:8,border:`1px solid ${C.border}`,background:'transparent',color:C.muted,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>Set default</button>}
                    <button onClick={() => toggleOutlet(outlet.id,outlet.is_active)} style={{padding:'7px 14px',borderRadius:8,border:`1px solid ${C.border}`,background:'transparent',color:outlet.is_active?C.red:C.green,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>
                      {outlet.is_active?'Deactivate':'Activate'}
                    </button>
                    {!outlet.is_default && <button onClick={() => deleteOutlet(outlet.id,outlet.name)} style={{padding:'7px 10px',borderRadius:8,border:'1px solid rgba(239,68,68,0.2)',background:'transparent',color:C.red,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>🗑</button>}
                  </div>
                </div>

                {expanded===outlet.id && (
                  <div style={{borderTop:`1px solid ${C.border}`,padding:'14px 20px'}}>
                    <div style={{fontSize:11,fontWeight:700,color:C.dim,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>Registers (tills)</div>
                    <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:12}}>
                      {(outlet.pos_registers??[]).map(reg => (
                        <div key={reg.id} style={{display:'flex',alignItems:'center',gap:12,padding:'8px 12px',background:'#FAFAFA',borderRadius:8}}>
                          <span style={{fontSize:13,fontWeight:600,flex:1}}>🖥 {reg.name}</span>
                          <span style={{fontSize:11,color:reg.is_active?C.green:C.dim}}>{reg.is_active?'Active':'Inactive'}</span>
                          <button onClick={() => toggleRegister(reg.id,reg.is_active)} style={{padding:'4px 10px',borderRadius:6,border:`1px solid ${C.border}`,background:'transparent',color:reg.is_active?C.red:C.green,fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>
                            {reg.is_active?'Disable':'Enable'}
                          </button>
                        </div>
                      ))}
                      {(outlet.pos_registers??[]).length===0 && <div style={{fontSize:12,color:C.dim}}>No registers yet.</div>}
                    </div>
                    <div style={{display:'flex',gap:8}}>
                      <input value={newReg} onChange={e=>setNewReg(e.target.value)} placeholder="Register name (e.g. Register 2, Drive-Through)" onKeyDown={e=>{if(e.key==='Enter')addRegister(outlet.id)}} style={{...iS,flex:1}} />
                      <button onClick={()=>addRegister(outlet.id)} disabled={addingReg===outlet.id||!newReg.trim()} style={{padding:'9px 18px',borderRadius:8,border:'none',background:C.violet,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',opacity:!newReg.trim()?0.5:1}}>
                        {addingReg===outlet.id?'Adding…':'+ Register'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {outlets.length===0 && <div style={{textAlign:'center',padding:'40px 0',color:C.muted}}>No outlets set up. Add your first outlet below.</div>}
          </div>

          {showAdd ? (
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:20}}>
              <div style={{fontSize:15,fontWeight:700,marginBottom:16}}>New outlet</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                {[
                  {label:'Location name *',key:'name',placeholder:'e.g. CBD Store, Westfield'},
                  {label:'Address',key:'address',placeholder:'123 Collins St, Melbourne'},
                  {label:'Phone',key:'phone',placeholder:'+61 3 XXXX XXXX'},
                ].map(f => (
                  <div key={f.key}>
                    <label style={{display:'block',fontSize:11,fontWeight:700,color:C.dim,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.06em'}}>{f.label}</label>
                    <input value={(form as any)[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.placeholder} style={iS} />
                  </div>
                ))}
                <div>
                  <label style={{display:'block',fontSize:11,fontWeight:700,color:C.dim,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.06em'}}>Timezone</label>
                  <select value={form.timezone} onChange={e=>setForm(p=>({...p,timezone:e.target.value}))} style={iS}>
                    {TIMEZONES.map(tz=><option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
              </div>
              <label style={{display:'flex',alignItems:'center',gap:8,fontSize:13,color:C.muted,cursor:'pointer',marginBottom:16}}>
                <input type="checkbox" checked={form.is_default} onChange={e=>setForm(p=>({...p,is_default:e.target.checked}))} />
                Set as default outlet
              </label>
              <div style={{display:'flex',gap:10}}>
                <button onClick={()=>{setShowAdd(false)}} style={{padding:'9px 20px',borderRadius:9,border:`1px solid ${C.border}`,background:'transparent',color:C.muted,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
                <button onClick={addOutlet} disabled={saving||!form.name.trim()} style={{padding:'9px 24px',borderRadius:9,border:'none',background:C.violet,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',opacity:!form.name.trim()?0.5:1}}>
                  {saving?'Creating…':'Create outlet'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={()=>setShowAdd(true)} style={{width:'100%',padding:'14px 0',borderRadius:12,border:'2px dashed rgba(139,92,246,0.3)',background:'rgba(139,92,246,0.04)',color:C.violet,fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
              + Add outlet / location
            </button>
          )}
        </>
      )}
    </div>
  )
}
