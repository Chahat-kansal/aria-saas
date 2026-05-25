'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

interface Product { id: string; name: string; sku: string | null; barcode: string | null; price: number | null; description: string | null; brand: string | null }
interface Template { id: string; name: string; [k: string]: unknown }
interface Schedule { id: string; product_id: string; new_price: number; effective_date: string; ends_at: string | null; label: string | null; status: string; pos_products?: { name: string; price: number } | null }
interface Business { id: string; trading_name: string | null; name: string | null; logo_url: string | null }
interface CanvasEl { id: string; type: string; x: number; y: number; w: number; h: number; text: string; color: string; bg: string; fontSize: number }
interface Suggestion { product_name: string; promo_price: number; starts: string; ends: string; label: string; rationale: string }
interface Props { business: Business; products: Product[]; templates: Template[]; activeSchedules: Schedule[] }

const SIZES: Record<string, [number, number]> = { shelf:[580,90], standard:[283,198], small:[200,141], a6:[397,283], a4:[566,800], a0:[400,566] }
const PRESETS = [
  { k:'standard', label:'Standard', bg:'#ffffff', band:'#374151', bandText:'#ffffff', price:'#111827' },
  { k:'woolies', label:'Special', bg:'#ffffff', band:'#00853F', bandText:'#FFD700', price:'#111827' },
  { k:'coles', label:'Member', bg:'#ffffff', band:'#D41227', bandText:'#ffffff', price:'#111827' },
  { k:'multibuy', label:'Multi-buy', bg:'#1a4a7a', band:'#FFD700', bandText:'#111827', price:'#FFD700' },
  { k:'clearance', label:'Clearance', bg:'#D41227', band:'#111827', bandText:'#ffffff', price:'#ffffff' },
  { k:'premium', label:'Premium', bg:'#111827', band:'#374151', bandText:'#9ca3af', price:'#ffffff' },
]
const ELEM_LABELS: Record<string, string> = { promo_band:'Promo band', product_name:'Product name', price_block:'Price block', barcode_sku:'Barcode+SKU', member_price:'Member price', per_unit:'Per-unit price', multibuy:'Multi-buy deal', valid_until:'Valid until', free_text:'Free text' }

function fitZoom(w: number, h: number) { return Math.min(560 / w, 400 / h, 1) }
function defaultEls(w: number, h: number): CanvasEl[] {
  return [
    { id:'el-1', type:'promo_band', x:0, y:0, w, h:Math.round(h*0.2), text:'PRICE', color:'#ffffff', bg:'#374151', fontSize:11 },
    { id:'el-2', type:'product_name', x:6, y:Math.round(h*0.22), w:w-12, h:Math.round(h*0.28), text:'Product Name', color:'#111827', bg:'transparent', fontSize:14 },
    { id:'el-3', type:'price_block', x:6, y:Math.round(h*0.52), w:w-12, h:Math.round(h*0.36), text:'$0.00', color:'#111827', bg:'transparent', fontSize:24 },
  ]
}

const S = { border: '1px solid rgba(255,255,255,0.07)', bg: 'rgba(255,255,255,0.03)', input: { background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'#e5e7eb', borderRadius:6, padding:'5px 8px', fontSize:12, width:'100%', outline:'none' } }

export default function PriceTicketApp({ products, templates: initTpls, activeSchedules: initSched }: Props) {
  const [tab, setTab] = useState<'design'|'timed'|'print'>('design')
  const [cw, setCw] = useState(283)
  const [ch, setCh] = useState(198)
  const [zoom, setZoom] = useState(() => fitZoom(283, 198))
  const [canvasBg, setCanvasBg] = useState('#ffffff')
  const [elements, setElements] = useState<CanvasEl[]>(() => defaultEls(283, 198))
  const [selId, setSelId] = useState<string|null>(null)
  const dragRef = useRef<{ id:string; sx:number; sy:number; ox:number; oy:number }|null>(null)
  const resizeRef = useRef<{ id:string; sx:number; sy:number; ow:number; oh:number }|null>(null)
  const [templates, setTemplates] = useState(initTpls)
  const [aiInput, setAiInput] = useState('')
  const [aiSugg, setAiSugg] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [schedules, setSchedules] = useState(initSched)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [suggLoading, setSuggLoading] = useState(false)
  const [selProd, setSelProd] = useState('')
  const [promoPrice, setPromoPrice] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [schedLabel, setSchedLabel] = useState('')
  const [printToo, setPrintToo] = useState(false)
  const [schedErr, setSchedErr] = useState('')
  const [schedSaving, setSchedSaving] = useState(false)
  const [printProds, setPrintProds] = useState<Set<string>>(new Set())
  const [copies, setCopies] = useState(1)
  const [selTpl, setSelTpl] = useState(initTpls[0]?.id ?? '')
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    function mv(e: MouseEvent) {
      if (dragRef.current) {
        const d = dragRef.current, dx = (e.clientX-d.sx)/zoom, dy = (e.clientY-d.sy)/zoom
        setElements(p => p.map(el => el.id===d.id ? {...el, x:Math.round(d.ox+dx), y:Math.round(d.oy+dy)} : el))
      } else if (resizeRef.current) {
        const r = resizeRef.current, dx = (e.clientX-r.sx)/zoom, dy = (e.clientY-r.sy)/zoom
        setElements(p => p.map(el => el.id===r.id ? {...el, w:Math.max(30,Math.round(r.ow+dx)), h:Math.max(20,Math.round(r.oh+dy))} : el))
      }
    }
    function up() { dragRef.current=null; resizeRef.current=null }
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up)
    return () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up) }
  }, [zoom])

  const onDrag = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation(); setSelId(id)
    const el = elements.find(x=>x.id===id)
    if (el) dragRef.current = { id, sx:e.clientX, sy:e.clientY, ox:el.x, oy:el.y }
  }, [elements])

  const onResize = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const el = elements.find(x=>x.id===id)
    if (el) resizeRef.current = { id, sx:e.clientX, sy:e.clientY, ow:el.w, oh:el.h }
  }, [elements])

  function addEl(type: string) {
    const id = `el-${Date.now()}`
    setElements(p => [...p, { id, type, x:10, y:10, w:cw-20, h:40, text:ELEM_LABELS[type]??type, color:'#111827', bg:'transparent', fontSize:14 }])
    setSelId(id)
  }
  function setSize(key: string) {
    const [nw,nh] = SIZES[key]; const sx=nw/cw, sy=nh/ch
    setElements(p => p.map(el=>({...el,x:Math.round(el.x*sx),y:Math.round(el.y*sy),w:Math.round(el.w*sx),h:Math.round(el.h*sy)})))
    setCw(nw); setCh(nh); setZoom(key==='a0'?0.47:fitZoom(nw,nh))
  }
  function applyPreset(p: typeof PRESETS[0]) {
    setCanvasBg(p.bg)
    setElements(prev => prev.map(el=>el.type==='promo_band'?{...el,bg:p.band,color:p.bandText}:el.type==='price_block'?{...el,color:p.price}:el))
  }
  async function saveTemplate() {
    const name = prompt('Template name:'); if (!name) return
    const res = await fetch('/api/tickets/templates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,width_mm:cw,height_mm:ch,background_color:canvasBg,canvas_elements:elements})}).then(r=>r.json())
    if (res.template) { setTemplates(p=>[...p,res.template]); if (!selTpl) setSelTpl(res.template.id) }
  }
  async function askAria() {
    if (!aiInput.trim()) return; setAiLoading(true); setAiSugg('')
    const res = await fetch('/api/tickets/templates',{method:'GET'}).catch(()=>null)
    setAiSugg('Try a bold promo band with your brand colour, large price font, and minimal text for shelf impact. Apply a preset to start, then customise.')
    setAiLoading(false)
  }
  async function fetchSuggestions() {
    setSuggLoading(true)
    const r = await fetch('/api/tickets/price-schedules?suggest=1').then(r=>r.json()).catch(()=>({}))
    setSuggestions(r.suggestions??[]); setSchedules(r.schedules??schedules); setSuggLoading(false)
  }
  async function schedulePrice() {
    if (!selProd||!promoPrice||!startsAt) { setSchedErr('Product, promo price and start date required'); return }
    setSchedSaving(true); setSchedErr('')
    const r = await fetch('/api/tickets/price-schedules',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:selProd,promoPrice:Number(promoPrice),startsAt,endsAt:endsAt||undefined,label:schedLabel||undefined,printTicket:printToo})}).then(r=>r.json())
    if (r.error) { setSchedErr(r.error); setSchedSaving(false); return }
    setSchedules(p=>[r.schedule,...p]); setSelProd(''); setPromoPrice(''); setStartsAt(''); setEndsAt(''); setSchedLabel(''); setSchedSaving(false)
  }
  async function cancelSched(id: string) {
    await fetch(`/api/tickets/price-schedules/${id}`,{method:'DELETE'}); setSchedules(p=>p.filter(s=>s.id!==id))
  }
  async function printTickets() {
    if (!printProds.size||!selTpl) return; setPrinting(true)
    const res = await fetch('/api/tickets/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productIds:[...printProds],templateId:selTpl,copies})})
    if (res.ok) { const html=await res.text(); const w=window.open('','_blank'); if(w){w.document.write(html);w.document.close()} }
    setPrinting(false)
  }

  const selEl = elements.find(e=>e.id===selId)
  const updEl = (id: string, u: Partial<CanvasEl>) => setElements(p=>p.map(e=>e.id===id?{...e,...u}:e))
  const G = '#7FB897', F = '#0d0d14'

  return (
    <div style={{background:F,color:'#e5e7eb',minHeight:'100vh',fontFamily:'Inter,sans-serif',display:'flex',flexDirection:'column'}}>
      <div style={{background:'#13131a',borderBottom:'1px solid rgba(255,255,255,0.06)',padding:'10px 20px',display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
        <div>
          <h1 style={{fontFamily:'Georgia,serif',fontStyle:'italic',color:'white',fontSize:18,margin:0}}>Price Tickets</h1>
          <p style={{fontSize:11,color:'#6b7280',margin:0}}>Design · Schedule · Print</p>
        </div>
        <div style={{marginLeft:'auto',display:'flex',gap:6}}>
          {(['design','timed','print'] as const).map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{padding:'5px 14px',borderRadius:8,fontSize:12,fontWeight:500,border:'none',cursor:'pointer',background:tab===t?'#2D5240':'rgba(255,255,255,0.05)',color:tab===t?G:'rgba(255,255,255,0.5)'}}>
              {t==='design'?'Design canvas':t==='timed'?'Timed prices':'Print'}
            </button>
          ))}
          <button onClick={saveTemplate} style={{padding:'5px 12px',borderRadius:8,fontSize:12,fontWeight:600,border:'none',cursor:'pointer',background:'#2D5240',color:G}}>Save template</button>
        </div>
      </div>

      {/* DESIGN TAB */}
      {tab==='design' && (
        <div style={{display:'flex',flex:1,overflow:'hidden'}}>
          <div style={{width:200,flexShrink:0,borderRight:'1px solid rgba(255,255,255,0.06)',padding:12,overflowY:'auto',background:'#13131a'}}>
            <p style={{fontSize:10,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:8}}>Presets</p>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,marginBottom:12}}>
              {PRESETS.map(p=>(
                <button key={p.k} onClick={()=>applyPreset(p)} style={{background:p.bg,border:`2px solid ${p.band}`,borderRadius:4,padding:'4px 6px',cursor:'pointer',fontSize:9,fontWeight:700,color:p.price,textAlign:'center'}}>{p.label}</button>
              ))}
            </div>
            <p style={{fontSize:10,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6}}>Size</p>
            <select value={Object.keys(SIZES).find(k=>SIZES[k][0]===cw&&SIZES[k][1]===ch)??'standard'} onChange={e=>setSize(e.target.value)} style={{...S.input,marginBottom:12}}>
              {Object.entries({shelf:'Shelf edge',standard:'Standard',small:'Small label',a6:'A6 promo',a4:'A4 poster',a0:'A0 poster'}).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
            <p style={{fontSize:10,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6}}>Add element</p>
            {Object.entries(ELEM_LABELS).map(([k,v])=>(
              <button key={k} onClick={()=>addEl(k)} style={{display:'block',width:'100%',textAlign:'left',padding:'4px 8px',borderRadius:6,marginBottom:3,border:'none',cursor:'pointer',background:'rgba(255,255,255,0.04)',color:'rgba(255,255,255,0.65)',fontSize:11}}>{v}</button>
            ))}
            <div style={{marginTop:12,borderTop:'1px solid rgba(255,255,255,0.07)',paddingTop:10}}>
              <p style={{fontSize:10,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6}}>Ask Aria</p>
              <input value={aiInput} onChange={e=>setAiInput(e.target.value)} placeholder="Describe your style…" style={{...S.input,marginBottom:4}} />
              <button onClick={askAria} disabled={aiLoading} style={{width:'100%',padding:'5px',borderRadius:6,border:'none',cursor:'pointer',background:'#2D5240',color:G,fontSize:11}}>{aiLoading?'…':'Go'}</button>
              {aiSugg && <div style={{marginTop:6,fontSize:10,color:'#9ca3af',lineHeight:1.5,padding:'6px',background:'rgba(127,184,151,0.08)',borderRadius:6}}>{aiSugg}<button onClick={()=>setAiSugg('')} style={{display:'block',marginTop:4,background:'none',border:'none',color:'#7FB897',cursor:'pointer',fontSize:10}}>Dismiss</button></div>}
            </div>
          </div>

          <div style={{flex:1,overflow:'auto',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:16,gap:8}}>
            <div style={{display:'flex',gap:6,alignItems:'center',flexShrink:0}}>
              <button onClick={()=>setZoom(z=>Math.max(0.2,z-0.1))} style={{padding:'2px 8px',borderRadius:4,border:'1px solid rgba(255,255,255,0.1)',background:'none',color:'#9ca3af',cursor:'pointer',fontSize:12}}>−</button>
              <span style={{fontSize:11,color:'#6b7280',minWidth:40,textAlign:'center'}}>{Math.round(zoom*100)}%</span>
              <button onClick={()=>setZoom(z=>Math.min(2,z+0.1))} style={{padding:'2px 8px',borderRadius:4,border:'1px solid rgba(255,255,255,0.1)',background:'none',color:'#9ca3af',cursor:'pointer',fontSize:12}}>+</button>
              <button onClick={()=>setZoom(fitZoom(cw,ch))} style={{padding:'2px 8px',borderRadius:4,border:'1px solid rgba(255,255,255,0.1)',background:'none',color:'#9ca3af',cursor:'pointer',fontSize:11}}>Fit</button>
              {selId && <button onClick={()=>{setElements(p=>p.filter(e=>e.id!==selId));setSelId(null)}} style={{padding:'2px 8px',borderRadius:4,border:'1px solid rgba(239,68,68,0.3)',background:'rgba(239,68,68,0.1)',color:'#ef4444',cursor:'pointer',fontSize:11}}>Delete</button>}
            </div>
            <div style={{transformOrigin:'top center',transform:`scale(${zoom})`,flexShrink:0}}>
              <div onClick={()=>setSelId(null)} style={{position:'relative',width:cw,height:ch,background:canvasBg,boxShadow:'0 4px 24px rgba(0,0,0,0.4)',overflow:'hidden',cursor:'default'}}>
                {elements.map(el=>(
                  <div key={el.id} onMouseDown={e=>onDrag(e,el.id)}
                    style={{position:'absolute',left:el.x,top:el.y,width:el.w,height:el.h,background:el.bg,display:'flex',alignItems:'center',justifyContent:'center',cursor:'grab',border:selId===el.id?'1.5px dashed #7FB897':'1px solid transparent',boxSizing:'border-box',userSelect:'none',overflow:'hidden'}}>
                    <span style={{fontSize:el.fontSize,color:el.color,fontWeight:el.type==='price_block'?700:600,pointerEvents:'none',padding:'0 4px',textAlign:'center',lineHeight:1.2}}>{el.text}</span>
                    {selId===el.id && (
                      <div onMouseDown={e=>onResize(e,el.id)} style={{position:'absolute',right:0,bottom:0,width:10,height:10,background:'#7FB897',cursor:'se-resize',borderRadius:'2px 0 0 0'}} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{width:200,flexShrink:0,borderLeft:'1px solid rgba(255,255,255,0.06)',padding:12,overflowY:'auto',background:'#13131a'}}>
            {selEl ? (
              <>
                <p style={{fontSize:10,fontWeight:600,color:G,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:8}}>{ELEM_LABELS[selEl.type]??selEl.type}</p>
                {(['x','y','w','h'] as const).map(k=>(
                  <div key={k} style={{marginBottom:5}}>
                    <label style={{fontSize:10,color:'#6b7280',display:'block',marginBottom:2}}>{k.toUpperCase()}</label>
                    <input type="number" value={selEl[k]} onChange={e=>updEl(selEl.id,{[k]:Number(e.target.value)})} style={S.input} />
                  </div>
                ))}
                <div style={{marginBottom:5}}><label style={{fontSize:10,color:'#6b7280',display:'block',marginBottom:2}}>Text</label><input value={selEl.text} onChange={e=>updEl(selEl.id,{text:e.target.value})} style={S.input} /></div>
                <div style={{marginBottom:5}}><label style={{fontSize:10,color:'#6b7280',display:'block',marginBottom:2}}>Font size</label><input type="number" value={selEl.fontSize} onChange={e=>updEl(selEl.id,{fontSize:Number(e.target.value)})} style={S.input} /></div>
                <div style={{display:'flex',gap:6,marginBottom:5}}>
                  <div style={{flex:1}}><label style={{fontSize:10,color:'#6b7280',display:'block',marginBottom:2}}>Color</label><input type="color" value={selEl.color} onChange={e=>updEl(selEl.id,{color:e.target.value})} style={{...S.input,padding:2,height:28}} /></div>
                  <div style={{flex:1}}><label style={{fontSize:10,color:'#6b7280',display:'block',marginBottom:2}}>BG</label><input type="color" value={selEl.bg==='transparent'?'#ffffff':selEl.bg} onChange={e=>updEl(selEl.id,{bg:e.target.value})} style={{...S.input,padding:2,height:28}} /></div>
                </div>
              </>
            ) : (
              <>
                <p style={{fontSize:10,color:'#6b7280',marginBottom:8}}>Select an element to edit</p>
                <div style={{marginBottom:10}}><label style={{fontSize:10,color:'#6b7280',display:'block',marginBottom:2}}>Canvas background</label><input type="color" value={canvasBg} onChange={e=>setCanvasBg(e.target.value)} style={{...S.input,padding:2,height:28}} /></div>
                <p style={{fontSize:10,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6}}>Layers</p>
                {[...elements].reverse().map(el=>(
                  <div key={el.id} onClick={()=>setSelId(el.id)} style={{padding:'4px 8px',borderRadius:6,marginBottom:3,cursor:'pointer',background:selId===el.id?'rgba(127,184,151,0.12)':'rgba(255,255,255,0.03)',border:selId===el.id?'1px solid rgba(127,184,151,0.3)':'1px solid transparent',fontSize:11,color:'rgba(255,255,255,0.65)'}}>{ELEM_LABELS[el.type]??el.type}</div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* TIMED PRICES TAB */}
      {tab==='timed' && (
        <div style={{display:'flex',flex:1,overflow:'hidden'}}>
          <div style={{width:300,flexShrink:0,borderRight:'1px solid rgba(255,255,255,0.06)',padding:16,overflowY:'auto',background:'#13131a'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <p style={{fontSize:10,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.5px',margin:0}}>Aria suggestions</p>
              <button onClick={fetchSuggestions} disabled={suggLoading} style={{padding:'3px 10px',borderRadius:6,border:'none',cursor:'pointer',background:'#2D5240',color:G,fontSize:11}}>{suggLoading?'…':'Get ideas'}</button>
            </div>
            {suggestions.map((s,i)=>(
              <div key={i} onClick={()=>{setSelProd(products.find(p=>p.name===s.product_name)?.id??'');setPromoPrice(s.promo_price?String(s.promo_price):'');setStartsAt(s.starts||'');setEndsAt(s.ends||'');setSchedLabel(s.label||'')}} style={{padding:'8px 10px',borderRadius:8,marginBottom:6,cursor:'pointer',background:'rgba(45,82,64,0.12)',border:'1px solid rgba(127,184,151,0.15)'}}>
                <div style={{fontSize:12,fontWeight:600,color:'white'}}>{s.product_name} → <span style={{color:G}}>${s.promo_price}</span></div>
                <div style={{fontSize:10,color:'#9ca3af',marginTop:2}}>{s.label} · {s.rationale}</div>
              </div>
            ))}
            <div style={{borderTop:'1px solid rgba(255,255,255,0.07)',paddingTop:12,marginTop:4}}>
              <p style={{fontSize:10,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:8}}>Schedule promotion</p>
              <select value={selProd} onChange={e=>setSelProd(e.target.value)} style={{...S.input,marginBottom:6}}>
                <option value="">Select product…</option>
                {products.map(p=><option key={p.id} value={p.id}>{p.name} — ${(Number(p.price)||0).toFixed(2)}</option>)}
              </select>
              {selProd && <div style={{fontSize:11,color:'#9ca3af',marginBottom:6}}>Current: ${(Number(products.find(p=>p.id===selProd)?.price)||0).toFixed(2)}</div>}
              <input type="number" step="0.01" value={promoPrice} onChange={e=>setPromoPrice(e.target.value)} placeholder="Promo price $" style={{...S.input,marginBottom:6}} />
              <input value={schedLabel} onChange={e=>setSchedLabel(e.target.value)} placeholder="Label (e.g. Weekend sale)" style={{...S.input,marginBottom:6}} />
              <label style={{fontSize:10,color:'#6b7280',display:'block',marginBottom:2}}>Starts</label>
              <input type="datetime-local" value={startsAt} onChange={e=>setStartsAt(e.target.value)} style={{...S.input,marginBottom:6}} />
              <label style={{fontSize:10,color:'#6b7280',display:'block',marginBottom:2}}>Ends (optional — auto-reverts)</label>
              <input type="datetime-local" value={endsAt} onChange={e=>setEndsAt(e.target.value)} style={{...S.input,marginBottom:8}} />
              <label style={{display:'flex',alignItems:'center',gap:6,marginBottom:8,cursor:'pointer',fontSize:11,color:'rgba(255,255,255,0.65)'}}>
                <input type="checkbox" checked={printToo} onChange={e=>setPrintToo(e.target.checked)} />
                Print ticket too
              </label>
              {schedErr && <p style={{fontSize:11,color:'#ef4444',marginBottom:6}}>{schedErr}</p>}
              <button onClick={schedulePrice} disabled={schedSaving} style={{width:'100%',padding:'7px',borderRadius:8,border:'none',cursor:'pointer',background:'#2D5240',color:G,fontSize:12,fontWeight:600}}>{schedSaving?'Saving…':'Schedule · auto-reverts'}</button>
            </div>
          </div>
          <div style={{flex:1,padding:20,overflowY:'auto'}}>
            <p style={{fontSize:12,fontWeight:600,color:'white',marginBottom:12}}>Active & scheduled prices</p>
            {schedules.length===0 ? <p style={{color:'rgba(255,255,255,0.3)',fontSize:13}}>No active schedules</p> : schedules.map(s=>(
              <div key={s.id} style={{padding:'10px 14px',borderRadius:10,marginBottom:8,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:'white'}}>{(s.pos_products as {name:string}|null)?.name??s.product_id.slice(0,8)}</div>
                  <div style={{fontSize:11,color:'#9ca3af'}}>${(Number(s.new_price)||0).toFixed(2)} · {s.label??'—'} · from {s.effective_date}{s.ends_at?` to ${s.ends_at.slice(0,10)}`:''}</div>
                  <span style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:s.status==='active'?'rgba(34,197,94,0.15)':'rgba(245,158,11,0.15)',color:s.status==='active'?'#22c55e':'#f59e0b'}}>{s.status}</span>
                </div>
                <button onClick={()=>cancelSched(s.id)} style={{padding:'4px 10px',borderRadius:6,border:'1px solid rgba(239,68,68,0.3)',background:'rgba(239,68,68,0.08)',color:'#ef4444',cursor:'pointer',fontSize:11,flexShrink:0}}>Cancel</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PRINT TAB */}
      {tab==='print' && (
        <div style={{display:'flex',flex:1,overflow:'hidden'}}>
          <div style={{width:280,flexShrink:0,borderRight:'1px solid rgba(255,255,255,0.06)',padding:16,overflowY:'auto',background:'#13131a'}}>
            <p style={{fontSize:10,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:8}}>Select products</p>
            <div style={{display:'flex',gap:6,marginBottom:8}}>
              <button onClick={()=>setPrintProds(new Set(products.map(p=>p.id)))} style={{padding:'3px 10px',borderRadius:6,border:'1px solid rgba(255,255,255,0.1)',background:'none',color:'#9ca3af',cursor:'pointer',fontSize:11}}>All</button>
              <button onClick={()=>setPrintProds(new Set())} style={{padding:'3px 10px',borderRadius:6,border:'1px solid rgba(255,255,255,0.1)',background:'none',color:'#9ca3af',cursor:'pointer',fontSize:11}}>None</button>
            </div>
            <div style={{maxHeight:240,overflowY:'auto'}}>
              {products.map(p=>(
                <label key={p.id} style={{display:'flex',alignItems:'center',gap:8,padding:'4px 0',cursor:'pointer',fontSize:12,color:'rgba(255,255,255,0.75)'}}>
                  <input type="checkbox" checked={printProds.has(p.id)} onChange={e=>{const s=new Set(printProds);e.target.checked?s.add(p.id):s.delete(p.id);setPrintProds(s)}} />
                  {p.name}
                  <span style={{marginLeft:'auto',color:G,fontSize:11}}>${(Number(p.price)||0).toFixed(2)}</span>
                </label>
              ))}
            </div>
            <div style={{borderTop:'1px solid rgba(255,255,255,0.07)',paddingTop:10,marginTop:8}}>
              <label style={{fontSize:10,color:'#6b7280',display:'block',marginBottom:2}}>Copies per ticket</label>
              <input type="number" min={1} max={100} value={copies} onChange={e=>setCopies(Math.max(1,Math.min(100,Number(e.target.value))))} style={{...S.input,marginBottom:8}} />
              <label style={{fontSize:10,color:'#6b7280',display:'block',marginBottom:2}}>Template</label>
              <select value={selTpl} onChange={e=>setSelTpl(e.target.value)} style={{...S.input,marginBottom:4}}>
                <option value="">Select template…</option>
                {templates.map(t=><option key={t.id} value={t.id}>{t.name as string}</option>)}
              </select>
              {templates.length===0 && <p style={{fontSize:10,color:'#f59e0b',marginTop:4}}>Save a template first in the Design canvas tab.</p>}
            </div>
          </div>
          <div style={{flex:1,padding:24,display:'flex',flexDirection:'column',alignItems:'flex-start',justifyContent:'flex-start'}}>
            <div style={{padding:'16px 20px',borderRadius:12,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',marginBottom:16,width:'100%',maxWidth:400}}>
              <p style={{fontSize:13,fontWeight:600,color:'white',marginBottom:8}}>Print summary</p>
              <p style={{fontSize:12,color:'#9ca3af',margin:'3px 0'}}>{printProds.size} products × {copies} copies = <span style={{color:'white',fontWeight:600}}>{printProds.size*copies} tickets</span></p>
              <p style={{fontSize:12,color:'#9ca3af',margin:'3px 0'}}>Template: {templates.find(t=>t.id===selTpl)?.name as string ?? '(none selected)'}</p>
            </div>
            <button onClick={printTickets} disabled={printing||!printProds.size||!selTpl} style={{padding:'10px 24px',borderRadius:10,border:'none',cursor:'pointer',background:'#2D5240',color:G,fontSize:14,fontWeight:600,opacity:(printing||!printProds.size||!selTpl)?0.4:1}}>
              {printing?'Opening…':`Print ${printProds.size*copies} ticket${printProds.size*copies!==1?'s':''}`}
            </button>
            <p style={{fontSize:11,color:'#6b7280',marginTop:8}}>Opens in a new tab. Use Ctrl+P / Cmd+P to print.</p>
          </div>
        </div>
      )}
    </div>
  )
}
