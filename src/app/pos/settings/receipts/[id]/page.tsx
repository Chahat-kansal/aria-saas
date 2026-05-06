'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'

/* ─── Types ─────────────────────────────────────────────────────── */
type EType = 'text'|'dynamic_text'|'image'|'divider'|'spacer'|'barcode'|'qr_code'|'items_table'|'totals_block'|'payment_info'|'loyalty_block'
interface El {
  id:string; type:EType; x:number; y:number; width:number; height:number
  zIndex:number; locked:boolean; visible:boolean
  content?:string; fontSize?:number; fontFamily?:string
  fontWeight?:'normal'|'bold'; fontStyle?:'normal'|'italic'
  textAlign?:'left'|'center'|'right'; color?:string; lineHeight?:number
  backgroundColor?:string; borderColor?:string; borderWidth?:number
  borderStyle?:'solid'|'dashed'|'dotted'|'none'; borderRadius?:number; padding?:number
  imageUrl?:string; objectFit?:'contain'|'cover'|'fill'
  dividerStyle?:'solid'|'dashed'|'dotted'; dividerThickness?:number
  dataBinding?:string
}

const CW = 302 // 80mm canvas width
const SNAP = 4
const HANDLES = ['nw','n','ne','e','se','s','sw','w'] as const
type Handle = typeof HANDLES[number]
const HANDLE_CURSOR: Record<Handle,string> = { nw:'nwse-resize',n:'ns-resize',ne:'nesw-resize',e:'ew-resize',se:'nwse-resize',s:'ns-resize',sw:'nesw-resize',w:'ew-resize' }

/* ─── Default template elements — all colors use 6-digit hex ────── */
const DEFAULT_ELS: El[] = [
  { id:'logo',    type:'image',        x:101,y:16,  width:100,height:60, zIndex:1, locked:false,visible:true, objectFit:'contain', imageUrl:'' },
  { id:'biz',     type:'dynamic_text', x:0,  y:84,  width:CW, height:24, zIndex:2, locked:false,visible:true, content:'{{business_name}}',   fontSize:16,fontWeight:'bold',  textAlign:'center',color:'#000000',fontFamily:'sans-serif', dataBinding:'{{business_name}}' },
  { id:'addr',    type:'dynamic_text', x:0,  y:112, width:CW, height:14, zIndex:3, locked:false,visible:true, content:'{{business_address}}', fontSize:9, textAlign:'center',color:'#555555',fontFamily:'monospace', dataBinding:'{{business_address}}' },
  { id:'phone',   type:'dynamic_text', x:0,  y:128, width:CW, height:14, zIndex:4, locked:false,visible:true, content:'{{business_phone}}',   fontSize:9, textAlign:'center',color:'#555555',fontFamily:'monospace', dataBinding:'{{business_phone}}' },
  { id:'div1',    type:'divider',      x:10, y:148, width:CW-20,height:8, zIndex:5, locked:false,visible:true, dividerStyle:'dashed',dividerThickness:1,color:'#cccccc' },
  { id:'info',    type:'dynamic_text', x:0,  y:158, width:CW, height:14, zIndex:6, locked:false,visible:true, content:'Receipt #{{receipt_number}} | {{date}}', fontSize:9,textAlign:'center',color:'#666666',fontFamily:'monospace' },
  { id:'cashier', type:'dynamic_text', x:8,  y:174, width:CW, height:14, zIndex:7, locked:false,visible:true, content:'Served by: {{cashier_name}}', fontSize:9,textAlign:'left',color:'#666666',fontFamily:'monospace' },
  { id:'div2',    type:'divider',      x:10, y:194, width:CW-20,height:8, zIndex:8, locked:false,visible:true, dividerStyle:'solid',dividerThickness:1,color:'#000000' },
  { id:'items',   type:'items_table',  x:0,  y:202, width:CW, height:180,zIndex:9, locked:false,visible:true, fontSize:10,fontFamily:'monospace',color:'#000000' },
  { id:'div3',    type:'divider',      x:10, y:390, width:CW-20,height:8, zIndex:10,locked:false,visible:true, dividerStyle:'solid',dividerThickness:1,color:'#000000' },
  { id:'totals',  type:'totals_block', x:0,  y:398, width:CW, height:80, zIndex:11,locked:false,visible:true, fontSize:10,fontFamily:'monospace',color:'#000000' },
  { id:'div4',    type:'divider',      x:10, y:484, width:CW-20,height:8, zIndex:12,locked:false,visible:true, dividerStyle:'dashed',dividerThickness:1,color:'#cccccc' },
  { id:'pay',     type:'payment_info', x:0,  y:492, width:CW, height:30, zIndex:13,locked:false,visible:true, fontSize:10,fontFamily:'monospace',color:'#000000' },
  { id:'loyal',   type:'loyalty_block',x:0,  y:528, width:CW, height:20, zIndex:14,locked:false,visible:true, fontSize:10,textAlign:'center',color:'#000000',fontFamily:'monospace' },
  { id:'div5',    type:'divider',      x:10, y:554, width:CW-20,height:8, zIndex:15,locked:false,visible:true, dividerStyle:'dashed',dividerThickness:1,color:'#cccccc' },
  { id:'footer',  type:'text',         x:0,  y:562, width:CW, height:36, zIndex:16,locked:false,visible:true, content:'Thank you for your business!\nPlease come again.', fontSize:9,textAlign:'center',color:'#555555',fontFamily:'monospace',lineHeight:1.6 },
  { id:'abn',     type:'dynamic_text', x:0,  y:602, width:CW, height:12, zIndex:17,locked:false,visible:true, content:'ABN: {{business_abn}}', fontSize:8,textAlign:'center',color:'#888888',fontFamily:'monospace', dataBinding:'{{business_abn}}' },
  { id:'barcode', type:'barcode',      x:76, y:618, width:150,height:50, zIndex:18,locked:false,visible:true },
  { id:'pwrd',    type:'text',         x:0,  y:674, width:CW, height:12, zIndex:19,locked:false,visible:true, content:'Powered by Aria', fontSize:7,textAlign:'center',color:'#bbbbbb',fontFamily:'monospace' },
]

/* ─── Variable substitution ─────────────────────────────────────── */
const VARS: Record<string,string> = {
  '{{business_name}}':'The Bottle Shop Co.','{{business_address}}':'123 Main St, Melbourne VIC 3000',
  '{{business_phone}}':'(03) 9123 4567','{{business_abn}}':'12 345 678 901',
  '{{receipt_number}}':'R71535','{{date}}':new Date().toLocaleDateString('en-AU'),
  '{{cashier_name}}':'Jamie H.','{{customer_name}}':'Sarah K.','{{receipt_barcode}}':'9300120024896',
}
function resolve(s:string):string { return Object.entries(VARS).reduce((t,[k,v])=>t.replaceAll(k,v),s) }

/* ─── ColorPicker ───────────────────────────────────────────────── */
const PRESETS = ['#000000','#333333','#555555','#888888','#cccccc','#ffffff','#8B5CF6','#22C55E']

// Expand 3-digit hex (#abc) to 6-digit (#aabbcc) so <input type="color"> accepts it
function expand6(hex: string): string {
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    return '#' + hex[1]+hex[1]+hex[2]+hex[2]+hex[3]+hex[3]
  }
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#000000'
}

function ColorPicker({ value, onChange }:{ value:string; onChange:(v:string)=>void }) {
  const safe = expand6(value || '#000000')
  return (
    <div>
      <div style={{ display:'flex',gap:4,flexWrap:'wrap',marginBottom:6 }}>
        {PRESETS.map(c=>(
          <div key={c} onClick={()=>onChange(c)} style={{ width:18,height:18,borderRadius:3,background:c,cursor:'pointer',border:safe===c?'2px solid #8B5CF6':'1px solid rgba(255,255,255,0.15)',boxSizing:'border-box' }} />
        ))}
      </div>
      <div style={{ display:'flex',gap:6,alignItems:'center' }}>
        <input type="color" value={safe} onChange={e=>onChange(e.target.value)} style={{ width:28,height:22,border:'none',background:'none',cursor:'pointer',padding:0 }} />
        <input type="text" value={value||''} onChange={e=>{ if(/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) onChange(e.target.value) }}
          style={{ background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:5,padding:'2px 7px',color:'#fff',fontSize:11,fontFamily:'monospace',width:76,outline:'none' }} />
      </div>
    </div>
  )
}

/* ─── Element renderer (canvas preview) ─────────────────────────── */
function RenderEl({ el }:{ el:El }) {
  const ff = el.fontFamily==='monospace'?"'Courier New',monospace":el.fontFamily==='serif'?'Georgia,serif':'Arial,sans-serif'
  const base:React.CSSProperties = { fontFamily:ff,fontSize:el.fontSize,fontWeight:el.fontWeight,fontStyle:el.fontStyle,textAlign:el.textAlign as React.CSSProperties['textAlign'],color:el.color,lineHeight:el.lineHeight||1.4,padding:el.padding||0,backgroundColor:el.backgroundColor||'transparent',whiteSpace:'pre-wrap',overflow:'hidden',width:'100%',height:'100%',boxSizing:'border-box' }
  switch(el.type){
    case 'text': return <div style={base}>{el.content||''}</div>
    case 'dynamic_text': return <div style={base}>{resolve(el.content||'')}</div>
    case 'divider': return <div style={{ display:'flex',alignItems:'center',width:'100%',height:'100%' }}><div style={{ width:'100%',borderTopWidth:el.dividerThickness||1,borderTopStyle:el.dividerStyle||'solid',borderTopColor:el.color||'#000' }}/></div>
    case 'image': return el.imageUrl
      ? <img src={el.imageUrl} alt="" style={{ width:'100%',height:'100%',objectFit:el.objectFit||'contain' }} />
      : <div style={{ width:'100%',height:'100%',background:'#f5f5f5',border:'1px dashed #ccc',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,color:'#999' }}>Logo</div>
    case 'barcode': return (
      <div style={{ width:'100%',height:'100%',background:'#f9f9f9',border:'1px dashed #ddd',display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,color:'#aaa',flexDirection:'column',gap:2 }}>
        <div style={{ fontSize:16,letterSpacing:2 }}>▌▌▌▐▌▌▐▌▐▌▌</div><div>{VARS['{{receipt_barcode}}']}</div>
      </div>
    )
    case 'qr_code': return <div style={{ width:'100%',height:'100%',background:'#f9f9f9',border:'1px dashed #ddd',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,color:'#aaa' }}>QR Code</div>
    case 'spacer': return <div style={{ width:'100%',height:'100%' }}/>
    case 'items_table': return (
      <div style={{ ...base,padding:'0 8px' }}>
        <div style={{ display:'flex',justifyContent:'space-between',fontWeight:'bold',borderBottom:'1px solid #eee',paddingBottom:2,marginBottom:3 }}><span>Item</span><span>Qty</span><span>Price</span></div>
        {[['Coopers Pale Ale','2','$11.00'],['Penfolds Bin 28','1','$28.00'],['Flat White','1','$5.50']].map(([n,q,p])=>(
          <div key={n} style={{ display:'flex',justifyContent:'space-between',marginBottom:2 }}><span style={{ flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'55%' }}>{n}</span><span>{q}</span><span>{p}</span></div>
        ))}
      </div>
    )
    case 'totals_block': return (
      <div style={{ ...base,padding:'0 8px' }}>
        {[['Subtotal','$44.50'],['GST (10%)','$4.05'],['TOTAL','$44.50']].map(([l,v],i)=>(
          <div key={l} style={{ display:'flex',justifyContent:'space-between',fontWeight:l==='TOTAL'?'bold':'normal',fontSize:l==='TOTAL'?(el.fontSize||10)+2:el.fontSize||10,borderTop:l==='TOTAL'?'1px solid #000':'none',paddingTop:l==='TOTAL'?3:0,marginTop:l==='TOTAL'?2:0 }}>
            <span>{l}</span><span>{v}</span>
          </div>
        ))}
      </div>
    )
    case 'payment_info': return (
      <div style={{ ...base,padding:'0 8px' }}>
        <div style={{ display:'flex',justifyContent:'space-between' }}><span>Card (Visa)</span><span>$44.50</span></div>
        <div style={{ display:'flex',justifyContent:'space-between',color:'#666',fontSize:8 }}><span>Auth: 123456</span><span>Approved ✓</span></div>
      </div>
    )
    case 'loyalty_block': return <div style={{ ...base,padding:'0 8px' }}>★ You earned 44 loyalty points</div>
    default: return <div style={{ ...base,background:'#f0f0f0' }}/>
  }
}

/* ─── Main editor ───────────────────────────────────────────────── */
export default function ReceiptBuilderPage() {
  const { id } = useParams() as { id:string }
  const router = useRouter()

  const [els, setEls]           = useState<El[]>(DEFAULT_ELS)
  const [selId, setSelId]       = useState<string|null>(null)
  const [zoom, setZoom]         = useState(1)
  const [history, setHistory]   = useState<El[][]>([])
  const [future, setFuture]     = useState<El[][]>([])
  const [name, setName]         = useState('New Receipt')
  const [canvasH, setCanvasH]   = useState(800)
  const [bgColor, setBgColor]   = useState('#ffffff')
  const [saving, setSaving]     = useState<'idle'|'saving'|'saved'|'error'>('idle')
  const [loaded, setLoaded]     = useState(false)
  const [ctxMenu, setCtxMenu]   = useState<{x:number;y:number;id:string}|null>(null)
  const [showHelp, setShowHelp] = useState(false)

  const dragRef      = useRef<{id:string;startMX:number;startMY:number;startEX:number;startEY:number}|null>(null)
  const resizeRef    = useRef<{id:string;handle:Handle;startMX:number;startMY:number;startEX:number;startEY:number;startEW:number;startEH:number}|null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>|null>(null)
  const canvasRef    = useRef<HTMLDivElement>(null)

  // Refs for save — reading via ref means save() never needs els/name/etc in its deps
  // This breaks the els→save→debouncedSave→effect→els loop
  const elsRef      = useRef<El[]>(DEFAULT_ELS)
  const nameRef     = useRef('New Receipt')
  const canvasHRef  = useRef(800)
  const bgColorRef  = useRef('#ffffff')
  const isSavingRef = useRef(false)
  const lastSaveRef = useRef(0)

  // Keep refs in sync with state (these effects are one-way, no loop risk)
  useEffect(()=>{ elsRef.current = els },     [els])
  useEffect(()=>{ nameRef.current = name },   [name])
  useEffect(()=>{ canvasHRef.current = canvasH }, [canvasH])
  useEffect(()=>{ bgColorRef.current = bgColor }, [bgColor])

  const selEl = selId ? els.find(e=>e.id===selId)||null : null

  /* ── Load (runs once on mount) ── */
  const [initialLoad, setInitialLoad] = useState(true)

  useEffect(()=>{
    fetch(`/api/pos/receipt-templates/${id}`).then(r=>r.json()).then(d=>{
      if(d.template){
        setName(d.template.name||'New Receipt')
        setCanvasH(d.template.canvas_height||800)
        setBgColor(d.template.background_color||'#ffffff')
        const e = d.template.elements
        if(Array.isArray(e)&&e.length) setEls(e)
      }
      setLoaded(true)
      setInitialLoad(false)
    }).catch(()=>{ setLoaded(true); setInitialLoad(false) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]) // intentionally empty — id is stable for the lifetime of this page

  /* ── Save ── */
  const [migrationNeeded, setMigrationNeeded] = useState(false)

  // save() reads everything from refs → only depends on [id] → stable identity
  // A stable save means debouncedSave is stable, so the auto-save effect never
  // triggers itself in a loop
  const save = useCallback(async()=>{
    // Rate limit: never fire more than once per 2 seconds
    const now = Date.now()
    if(now - lastSaveRef.current < 2000) return
    if(isSavingRef.current) return
    lastSaveRef.current = now
    isSavingRef.current = true
    setSaving('saving')
    try {
      const r = await fetch(`/api/pos/receipt-templates/${id}`,{
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          name:     nameRef.current,
          elements: elsRef.current,
          canvas_height:    canvasHRef.current,
          background_color: bgColorRef.current,
        }),
      })
      const d = await r.json()
      if(d.migration_needed||d._migration_needed) setMigrationNeeded(true)
      setSaving(r.ok?'saved':'error')
    } catch {
      setSaving('error')
    } finally {
      isSavingRef.current = false
      setTimeout(()=>setSaving('idle'),2500)
    }
  },[id]) // ONLY id — never changes during page lifetime

  // debouncedSave is stable because save is stable
  const debouncedSave = useCallback(()=>{
    if(saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(save, 2000)
  },[save])

  // Auto-save: fires when content changes, but NOT during initial load
  // save and debouncedSave are stable → this effect never triggers a loop
  useEffect(()=>{
    if(initialLoad) return
    debouncedSave()
  // debouncedSave is stable; intentionally omitted to avoid needing it in deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[els,canvasH,bgColor,name])

  /* ── History ── */
  function saveHistory(){ setHistory(h=>[...h.slice(-49),[...els]]); setFuture([]) }

  function undo(){ setHistory(h=>{ if(!h.length) return h; const prev=h[h.length-1]; setFuture(f=>[els,...f]); setEls(prev); return h.slice(0,-1) }) }
  function redo(){ setFuture(f=>{ if(!f.length) return f; const next=f[0]; setHistory(h=>[...h,els]); setEls(next); return f.slice(1) }) }

  /* ── Keyboard ── */
  useEffect(()=>{
    const fn=(e:KeyboardEvent)=>{
      if((e.metaKey||e.ctrlKey)&&e.key==='z'&&!e.shiftKey){e.preventDefault();undo()}
      if((e.metaKey||e.ctrlKey)&&(e.key==='y'||(e.key==='z'&&e.shiftKey))){e.preventDefault();redo()}
      if(e.key==='Escape'){ setSelId(null); setCtxMenu(null) }
      if(selId&&(e.key==='Delete'||e.key==='Backspace')&&document.activeElement?.tagName!=='INPUT'&&document.activeElement?.tagName!=='TEXTAREA'){
        e.preventDefault(); saveHistory(); setEls(p=>p.filter(el=>el.id!==selId)); setSelId(null)
      }
      if(selId&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){
        e.preventDefault()
        const d=e.shiftKey?10:1
        saveHistory()
        setEls(p=>p.map(el=>el.id!==selId?el:{...el,x:el.x+(e.key==='ArrowRight'?d:e.key==='ArrowLeft'?-d:0),y:el.y+(e.key==='ArrowDown'?d:e.key==='ArrowUp'?-d:0)}))
      }
      if((e.metaKey||e.ctrlKey)&&e.key==='d'&&selId){
        e.preventDefault()
        const orig=els.find(el=>el.id===selId)
        if(orig){ saveHistory(); const clone={...orig,id:Math.random().toString(36).slice(2),x:orig.x+10,y:orig.y+10,zIndex:els.length+1}; setEls(p=>[...p,clone]); setSelId(clone.id) }
      }
    }
    window.addEventListener('keydown',fn)
    return ()=>window.removeEventListener('keydown',fn)
  },[selId,els])

  /* ── Global mouse ── */
  useEffect(()=>{
    const move=(e:MouseEvent)=>{
      if(dragRef.current){
        const{id:elId,startMX,startMY,startEX,startEY}=dragRef.current
        const dx=(e.clientX-startMX)/zoom, dy=(e.clientY-startMY)/zoom
        setEls(p=>p.map(el=>el.id!==elId?el:{...el,x:Math.max(0,Math.min(Math.round((startEX+dx)/SNAP)*SNAP,CW-el.width)),y:Math.max(0,Math.round((startEY+dy)/SNAP)*SNAP)}))
      }
      if(resizeRef.current){
        const{id:elId,handle,startMX,startMY,startEX,startEY,startEW,startEH}=resizeRef.current
        const dx=(e.clientX-startMX)/zoom, dy=(e.clientY-startMY)/zoom
        setEls(p=>p.map(el=>{
          if(el.id!==elId) return el
          let x=startEX,y=startEY,w=startEW,h=startEH
          if(handle.includes('e')) w=Math.max(40,startEW+dx)
          if(handle.includes('w')){ x=startEX+dx; w=Math.max(40,startEW-dx) }
          if(handle.includes('s')) h=Math.max(14,startEH+dy)
          if(handle.includes('n')){ y=startEY+dy; h=Math.max(14,startEH-dy) }
          return{...el,x:Math.round(x/SNAP)*SNAP,y:Math.round(y/SNAP)*SNAP,width:Math.round(w/SNAP)*SNAP,height:Math.round(h/SNAP)*SNAP}
        }))
      }
    }
    const up=()=>{ dragRef.current=null; resizeRef.current=null }
    window.addEventListener('mousemove',move)
    window.addEventListener('mouseup',up)
    return()=>{ window.removeEventListener('mousemove',move); window.removeEventListener('mouseup',up) }
  },[zoom])

  /* ── Element helpers ── */
  function updateEl(elId:string, patch:Partial<El>){ setEls(p=>p.map(el=>el.id===elId?{...el,...patch}:el)) }

  function addEl(type:EType){
    saveHistory()
    const last=[...els].sort((a,b)=>(b.y+b.height)-(a.y+a.height))[0]
    const y=last?last.y+last.height+8:16
    const typeDefaults: Record<string, Partial<El>> = {
      text:{width:CW,height:20,content:'Your text here',fontSize:10,fontFamily:'monospace',color:'#000',textAlign:'left'},
      dynamic_text:{width:CW,height:16,content:'{{business_name}}',fontSize:10,fontFamily:'monospace',color:'#000',textAlign:'center',dataBinding:'{{business_name}}'},
      divider:{x:10,width:CW-20,height:8,color:'#000',dividerStyle:'solid',dividerThickness:1},
      spacer:{width:CW,height:16},
      items_table:{width:CW,height:120,fontSize:10,fontFamily:'monospace',color:'#000'},
      totals_block:{width:CW,height:70,fontSize:10,fontFamily:'monospace',color:'#000'},
      payment_info:{width:CW,height:36,fontSize:10,fontFamily:'monospace',color:'#000'},
      loyalty_block:{width:CW,height:20,fontSize:10,textAlign:'center',color:'#000',fontFamily:'monospace'},
      image:{width:100,height:60,x:(CW-100)/2},
      barcode:{width:150,height:50,x:(CW-150)/2},
      qr_code:{width:80,height:80,x:(CW-80)/2},
    }
    const defaults = typeDefaults[type] ?? {}
    const newEl:El={id:Math.random().toString(36).slice(2),type,x:0,y,width:CW,height:20,zIndex:els.length+1,locked:false,visible:true,...defaults}
    setEls(p=>[...p,newEl]); setSelId(newEl.id)
    if(y+newEl.height>canvasH-20) setCanvasH(h=>h+100)
  }

  function startDrag(e:React.MouseEvent,elId:string){
    if(e.button!==0) return; e.preventDefault(); e.stopPropagation()
    const el=els.find(el=>el.id===elId)
    if(!el||el.locked) return
    saveHistory()
    dragRef.current={id:elId,startMX:e.clientX,startMY:e.clientY,startEX:el.x,startEY:el.y}
    setSelId(elId)
  }

  function startResize(e:React.MouseEvent,elId:string,handle:Handle){
    e.preventDefault(); e.stopPropagation()
    const el=els.find(el=>el.id===elId); if(!el) return
    saveHistory()
    resizeRef.current={id:elId,handle,startMX:e.clientX,startMY:e.clientY,startEX:el.x,startEY:el.y,startEW:el.width,startEH:el.height}
  }

  /* ── Print preview ── */
  function openPrint(){
    const sorted=[...els].filter(e=>e.visible).sort((a,b)=>a.zIndex-b.zIndex)
    const elHTML=sorted.map(el=>{
      const s=[`position:absolute`,`left:${el.x}px`,`top:${el.y}px`,`width:${el.width}px`,`height:${el.height}px`,`z-index:${el.zIndex}`,el.fontSize?`font-size:${el.fontSize}px`:'',el.fontFamily==='monospace'?`font-family:'Courier New',monospace`:el.fontFamily==='serif'?`font-family:Georgia,serif`:`font-family:Arial,sans-serif`,el.fontWeight?`font-weight:${el.fontWeight}`:'',el.fontStyle?`font-style:${el.fontStyle}`:'',el.textAlign?`text-align:${el.textAlign}`:'',el.color?`color:${el.color}`:'',el.lineHeight?`line-height:${el.lineHeight}`:'',el.backgroundColor?`background-color:${el.backgroundColor}`:'',el.padding?`padding:${el.padding}px`:'',`box-sizing:border-box`,`overflow:hidden`].filter(Boolean).join(';')
      if(el.type==='divider') return `<div style="${s}"><div style="width:100%;border-top:${el.dividerThickness||1}px ${el.dividerStyle||'solid'} ${el.color||'#000'}"></div></div>`
      if(el.type==='image'&&el.imageUrl) return `<div style="${s}"><img src="${el.imageUrl}" style="width:100%;height:100%;object-fit:${el.objectFit||'contain'}"/></div>`
      if(el.type==='barcode') return `<div style="${s};display:flex;flex-direction:column;align-items:center;font-size:8px;color:#666"><div style="font-size:16px;letter-spacing:2px">▌▌▌▐▌▌▐▌▐▌▌</div><div>${VARS['{{receipt_barcode}}']}</div></div>`
      if(el.type==='spacer') return `<div style="${s}"></div>`
      const c=el.type==='dynamic_text'?resolve(el.content||''):el.content||''
      return `<div style="${s};white-space:pre-wrap">${c}</div>`
    }).join('\n')
    const w=window.open('','_blank','width=420,height=900')
    if(!w) return
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}@media print{@page{margin:0;size:80mm auto}}</style></head><body><div style="position:relative;width:${CW}px;min-height:${canvasH}px;background:${bgColor}">${elHTML}</div></body></html>`)
    w.document.close(); setTimeout(()=>w.print(),500)
  }

  /* ── Sorted els for layers (highest zIndex first) ── */
  const layersSorted=[...els].sort((a,b)=>b.zIndex-a.zIndex)

  const Z = { panel:{background:'#0A0E1A',color:'rgba(220,240,255,0.9)',fontFamily:"'Manrope',system-ui"}, lbl:{fontSize:10,fontWeight:700,color:'rgba(130,160,200,0.6)',textTransform:'uppercase' as const,letterSpacing:'0.05em',display:'block',marginBottom:5}, inp:{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:6,padding:'4px 8px',color:'#fff',fontSize:12,outline:'none',fontFamily:'inherit',width:'100%',boxSizing:'border-box' as const}, btn:(active?:boolean):React.CSSProperties=>({flex:1,padding:'5px',borderRadius:6,fontSize:11,border:`1px solid ${active?'#8B5CF6':'rgba(255,255,255,0.1)'}`,background:active?'rgba(139,92,246,0.2)':'rgba(255,255,255,0.04)',color:active?'#8B5CF6':'rgba(200,220,255,0.7)',cursor:'pointer',fontFamily:'inherit',fontWeight:active?700:400}) }

  if(!loaded) return <div style={{ minHeight:'100vh',background:'#030510',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontFamily:'Manrope,system-ui' }}>Loading editor…</div>

  return (
    <div style={{ display:'flex',flexDirection:'column',height:'100vh',overflow:'hidden',fontFamily:"'Manrope',system-ui",background:'#0A0E1A',color:'rgba(220,240,255,0.9)' }} onClick={()=>setCtxMenu(null)}>

      {/* ── TOOLBAR ── */}
      <div style={{ display:'flex',alignItems:'center',gap:8,padding:'0 16px',height:48,borderBottom:'1px solid rgba(0,229,255,0.08)',background:'#070D1C',flexShrink:0 }}>
        <button onClick={()=>router.push('/pos/settings/receipts')} style={{ background:'none',border:'none',color:'rgba(130,160,200,0.7)',cursor:'pointer',fontSize:18,padding:'0 4px',lineHeight:1 }}>←</button>
        <input value={name} onChange={e=>setName(e.target.value)} style={{ background:'none',border:'none',outline:'none',color:'rgba(220,240,255,0.95)',fontSize:14,fontWeight:700,fontFamily:'inherit',minWidth:160,flex:1 }} />
        <div style={{ display:'flex',gap:4,alignItems:'center' }}>
          <button onClick={undo} disabled={!history.length} title="Undo (Ctrl+Z)" style={{ ...Z.btn(),padding:'5px 10px',opacity:history.length?1:0.3 }}>↺</button>
          <button onClick={redo} disabled={!future.length} title="Redo (Ctrl+Y)" style={{ ...Z.btn(),padding:'5px 10px',opacity:future.length?1:0.3 }}>↻</button>
          <div style={{ width:1,height:20,background:'rgba(255,255,255,0.1)',margin:'0 4px' }}/>
          <button onClick={()=>setZoom(z=>Math.max(0.5,+(z-0.25).toFixed(2)))} style={{ ...Z.btn(),padding:'4px 8px',width:28 }}>−</button>
          <span style={{ fontSize:11,color:'rgba(130,160,200,0.7)',minWidth:36,textAlign:'center' }}>{Math.round(zoom*100)}%</span>
          <button onClick={()=>setZoom(z=>Math.min(2,+(z+0.25).toFixed(2)))} style={{ ...Z.btn(),padding:'4px 8px',width:28 }}>+</button>
          <button onClick={()=>setZoom(1)} style={{ ...Z.btn(),padding:'4px 8px' }}>Fit</button>
          <div style={{ width:1,height:20,background:'rgba(255,255,255,0.1)',margin:'0 4px' }}/>
          <button onClick={()=>setShowHelp(h=>!h)} title="Keyboard shortcuts" style={{ ...Z.btn(),padding:'4px 8px' }}>?</button>
        </div>
        <button onClick={openPrint} style={{ padding:'6px 14px',borderRadius:7,border:'1px solid rgba(255,255,255,0.1)',background:'transparent',color:'rgba(200,220,255,0.8)',fontSize:12,cursor:'pointer',fontFamily:'inherit' }}>🖨 Preview</button>
        <button onClick={()=>{ lastSaveRef.current=0; save() }} style={{ padding:'6px 18px',borderRadius:7,border:'none',background:saving==='saved'?'#22C55E':saving==='error'?'#EF4444':'#8B5CF6',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',minWidth:80 }}>
          {saving==='saving'?'Saving…':saving==='saved'?'Saved ✓':saving==='error'?'Error':'💾 Save'}
        </button>
      </div>

      {migrationNeeded&&(
        <div style={{ padding:'8px 16px',background:'rgba(245,158,11,0.12)',borderBottom:'1px solid rgba(245,158,11,0.3)',fontSize:12,color:'#F59E0B',flexShrink:0 }}>
          ⚠️ Canvas columns not yet in database — run migration <code style={{ background:'rgba(0,0,0,0.3)',padding:'1px 5px',borderRadius:3 }}>20260510000003_receipt_builder_v2.sql</code> in Supabase SQL Editor to save element positions. Name &amp; type are saving correctly.
        </div>
      )}

      <div style={{ display:'flex',flex:1,overflow:'hidden' }}>

        {/* ── LAYERS PANEL ── */}
        <div style={{ width:200,flexShrink:0,borderRight:'1px solid rgba(0,229,255,0.06)',background:'#070D1C',display:'flex',flexDirection:'column',overflow:'hidden' }}>
          <div style={{ padding:'10px 12px',borderBottom:'1px solid rgba(255,255,255,0.05)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0 }}>
            <span style={{ fontSize:10,fontWeight:700,color:'rgba(130,160,200,0.6)',textTransform:'uppercase',letterSpacing:'0.05em' }}>Layers</span>
            <select onChange={e=>{ if(e.target.value){ addEl(e.target.value as EType); e.target.value='' }}} style={{ ...Z.inp,width:'auto',fontSize:11,padding:'3px 6px',cursor:'pointer' }} defaultValue="">
              <option value="" disabled>+ Add</option>
              <optgroup label="Text"><option value="text">Plain Text</option><option value="dynamic_text">Dynamic Text</option></optgroup>
              <optgroup label="Layout"><option value="divider">Divider</option><option value="spacer">Spacer</option></optgroup>
              <optgroup label="Data"><option value="items_table">Items Table</option><option value="totals_block">Totals Block</option><option value="payment_info">Payment Info</option><option value="loyalty_block">Loyalty</option></optgroup>
              <optgroup label="Media"><option value="image">Image / Logo</option><option value="barcode">Barcode</option><option value="qr_code">QR Code</option></optgroup>
            </select>
          </div>
          <div style={{ flex:1,overflowY:'auto' }}>
            {layersSorted.map(el=>(
              <div key={el.id} onClick={()=>setSelId(el.id)} onContextMenu={e=>{ e.preventDefault(); setCtxMenu({x:e.clientX,y:e.clientY,id:el.id}) }}
                style={{ display:'flex',alignItems:'center',gap:6,padding:'7px 10px',cursor:'pointer',borderLeft:`3px solid ${selId===el.id?'#8B5CF6':'transparent'}`,background:selId===el.id?'rgba(139,92,246,0.1)':'transparent',borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                <span onClick={e=>{ e.stopPropagation(); updateEl(el.id,{visible:!el.visible}) }} style={{ cursor:'pointer',fontSize:12,opacity:el.visible?1:0.3 }}>👁</span>
                <span style={{ flex:1,fontSize:11,color:selId===el.id?'rgba(220,240,255,0.95)':'rgba(150,180,220,0.7)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{el.type.replace(/_/g,' ')}</span>
                <span onClick={e=>{ e.stopPropagation(); updateEl(el.id,{locked:!el.locked}) }} style={{ cursor:'pointer',fontSize:10,opacity:el.locked?1:0.3 }}>🔒</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── CANVAS AREA ── */}
        <div style={{ flex:1,overflow:'auto',background:'#111827',display:'flex',alignItems:'flex-start',justifyContent:'center',padding:40 }} onClick={()=>setSelId(null)}>
          <div ref={canvasRef} style={{ position:'relative',width:CW,height:canvasH,background:bgColor,boxShadow:'0 4px 40px rgba(0,0,0,0.7)',transform:`scale(${zoom})`,transformOrigin:'top center',flexShrink:0 }} onClick={e=>e.stopPropagation()}>
            {[...els].sort((a,b)=>a.zIndex-b.zIndex).map(el=>!el.visible?null:(
              <div key={el.id}
                style={{ position:'absolute',left:el.x,top:el.y,width:el.width,height:el.height,zIndex:el.zIndex,cursor:el.locked?'default':'move',userSelect:'none',boxSizing:'border-box',outline:selId===el.id?'2px solid #8B5CF6':'none',outlineOffset:1 }}
                onMouseDown={e=>startDrag(e,el.id)}
                onClick={e=>{ e.stopPropagation(); setSelId(el.id) }}
                onContextMenu={e=>{ e.preventDefault(); e.stopPropagation(); setCtxMenu({x:e.clientX,y:e.clientY,id:el.id}) }}
              >
                <RenderEl el={el}/>
                {/* Resize handles */}
                {selId===el.id&&!el.locked&&HANDLES.map(h=>{
                  const hx=h.includes('e')?el.width:h.includes('w')?0:el.width/2
                  const hy=h.includes('s')?el.height:h.includes('n')?0:el.height/2
                  return(
                    <div key={h} onMouseDown={e=>startResize(e,el.id,h)}
                      style={{ position:'absolute',left:hx-4,top:hy-4,width:8,height:8,background:'#fff',border:'1.5px solid #8B5CF6',borderRadius:2,cursor:HANDLE_CURSOR[h],zIndex:9999,boxSizing:'border-box' }}/>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* ── PROPERTIES PANEL ── */}
        <div style={{ width:260,flexShrink:0,borderLeft:'1px solid rgba(0,229,255,0.06)',background:'#070D1C',overflowY:'auto',padding:12,display:'flex',flexDirection:'column',gap:14 }}>
          {!selEl ? (
            <>
              <p style={{ fontSize:12,color:'rgba(130,160,200,0.5)',textAlign:'center',marginTop:20,lineHeight:1.6 }}>Click an element on the canvas to edit its properties</p>
              <div style={{ borderTop:'1px solid rgba(255,255,255,0.06)',paddingTop:14,display:'flex',flexDirection:'column',gap:10 }}>
                <p style={{ ...Z.lbl }}>Canvas</p>
                <div><label style={Z.lbl}>Height (px)</label><input type="number" value={canvasH} onChange={e=>setCanvasH(+e.target.value)} style={Z.inp}/></div>
                <div><label style={Z.lbl}>Background</label><ColorPicker value={bgColor} onChange={setBgColor}/></div>
              </div>
            </>
          ) : (
            <>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
                <span style={{ fontSize:11,fontWeight:700,color:'#8B5CF6',textTransform:'uppercase',letterSpacing:'0.05em' }}>{selEl.type.replace(/_/g,' ')}</span>
                <button onClick={()=>{ saveHistory(); setEls(p=>p.filter(e=>e.id!==selId)); setSelId(null) }} style={{ background:'none',border:'none',color:'rgba(239,68,68,0.7)',cursor:'pointer',fontSize:16 }}>×</button>
              </div>

              {/* Position & Size */}
              <div><p style={Z.lbl}>Position &amp; Size</p>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:6 }}>
                  {([['X',selEl.x,'x'],['Y',selEl.y,'y'],['W',selEl.width,'width'],['H',selEl.height,'height']] as [string,number,keyof El][]).map(([l,v,k])=>(
                    <div key={l}><label style={{ ...Z.lbl,marginBottom:2 }}>{l}</label>
                      <input type="number" value={v} onChange={e=>updateEl(selId!,{[k]:+e.target.value})} style={{ ...Z.inp,width:'100%' }}/></div>
                  ))}
                </div>
              </div>

              {/* Typography */}
              {(selEl.type==='text'||selEl.type==='dynamic_text')&&(
                <div><p style={Z.lbl}>Typography</p>
                  <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                    <div><label style={{ ...Z.lbl,marginBottom:4 }}>Font</label>
                      <div style={{ display:'flex',gap:4 }}>
                        {(['monospace','sans-serif','serif'] as const).map(f=><button key={f} onClick={()=>updateEl(selId!,{fontFamily:f})} style={Z.btn(selEl.fontFamily===f)}>{f==='monospace'?'Mono':f==='sans-serif'?'Sans':'Serif'}</button>)}
                      </div>
                    </div>
                    <div><label style={Z.lbl}>Size: {selEl.fontSize||10}px</label>
                      <input type="range" min={6} max={32} value={selEl.fontSize||10} onChange={e=>updateEl(selId!,{fontSize:+e.target.value})} style={{ width:'100%',accentColor:'#8B5CF6' }}/>
                    </div>
                    <div><label style={{ ...Z.lbl,marginBottom:4 }}>Align</label>
                      <div style={{ display:'flex',gap:4 }}>
                        {(['left','center','right'] as const).map(a=><button key={a} onClick={()=>updateEl(selId!,{textAlign:a})} style={Z.btn(selEl.textAlign===a)}>{a==='left'?'←':a==='center'?'=':'→'}</button>)}
                      </div>
                    </div>
                    <div style={{ display:'flex',gap:6 }}>
                      <button onClick={()=>updateEl(selId!,{fontWeight:selEl.fontWeight==='bold'?'normal':'bold'})} style={Z.btn(selEl.fontWeight==='bold')}>B</button>
                      <button onClick={()=>updateEl(selId!,{fontStyle:selEl.fontStyle==='italic'?'normal':'italic'})} style={Z.btn(selEl.fontStyle==='italic')}>I</button>
                    </div>
                    <div><label style={Z.lbl}>Color</label><ColorPicker value={selEl.color||'#000000'} onChange={v=>updateEl(selId!,{color:v})}/></div>
                    {selEl.type==='text'&&<div><label style={Z.lbl}>Content</label><textarea rows={3} value={selEl.content||''} onChange={e=>updateEl(selId!,{content:e.target.value})} style={{ ...Z.inp,fontFamily:"'Courier New',monospace",resize:'vertical' }}/></div>}
                    {selEl.type==='dynamic_text'&&(
                      <div><label style={Z.lbl}>Data binding</label>
                        <select value={selEl.dataBinding||''} onChange={e=>updateEl(selId!,{dataBinding:e.target.value,content:e.target.value})} style={{ ...Z.inp,cursor:'pointer' }}>
                          <option value="">— none —</option>
                          {['{{business_name}}','{{business_address}}','{{business_phone}}','{{business_abn}}','{{receipt_number}}','{{date}}','{{cashier_name}}','{{customer_name}}','{{receipt_barcode}}'].map(v=><option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Image */}
              {selEl.type==='image'&&(
                <div><p style={Z.lbl}>Image</p>
                  <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                    <div><label style={Z.lbl}>URL</label><input value={selEl.imageUrl||''} onChange={e=>updateEl(selId!,{imageUrl:e.target.value})} placeholder="https://…" style={Z.inp}/></div>
                    <div><label style={{ ...Z.lbl,marginBottom:4 }}>Fit</label>
                      <div style={{ display:'flex',gap:4 }}>
                        {(['contain','cover','fill'] as const).map(f=><button key={f} onClick={()=>updateEl(selId!,{objectFit:f})} style={Z.btn(selEl.objectFit===f)}>{f}</button>)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Divider */}
              {selEl.type==='divider'&&(
                <div><p style={Z.lbl}>Divider</p>
                  <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                    <div><label style={{ ...Z.lbl,marginBottom:4 }}>Style</label>
                      <div style={{ display:'flex',gap:4 }}>
                        {(['solid','dashed','dotted'] as const).map(s=><button key={s} onClick={()=>updateEl(selId!,{dividerStyle:s})} style={Z.btn(selEl.dividerStyle===s)}>{s}</button>)}
                      </div>
                    </div>
                    <div><label style={Z.lbl}>Thickness: {selEl.dividerThickness||1}px</label><input type="range" min={1} max={4} value={selEl.dividerThickness||1} onChange={e=>updateEl(selId!,{dividerThickness:+e.target.value})} style={{ width:'100%',accentColor:'#8B5CF6' }}/></div>
                    <div><label style={Z.lbl}>Color</label><ColorPicker value={selEl.color||'#000000'} onChange={v=>updateEl(selId!,{color:v})}/></div>
                  </div>
                </div>
              )}

              {/* Spacer */}
              {selEl.type==='spacer'&&(
                <div><p style={Z.lbl}>Spacer height: {selEl.height}px</p>
                  <input type="range" min={4} max={80} value={selEl.height} onChange={e=>updateEl(selId!,{height:+e.target.value})} style={{ width:'100%',accentColor:'#8B5CF6' }}/>
                </div>
              )}

              {/* Visibility */}
              <div style={{ display:'flex',gap:6 }}>
                <button onClick={()=>updateEl(selId!,{visible:!selEl.visible})} style={Z.btn(!selEl.visible?false:true)}>{selEl.visible?'👁 Visible':'🚫 Hidden'}</button>
                <button onClick={()=>updateEl(selId!,{locked:!selEl.locked})} style={Z.btn(selEl.locked)}>{selEl.locked?'🔒 Locked':'🔓 Unlocked'}</button>
              </div>

              {/* Duplicate */}
              <button onClick={()=>{ saveHistory(); const cl={...selEl,id:Math.random().toString(36).slice(2),x:selEl.x+10,y:selEl.y+10,zIndex:els.length+1}; setEls(p=>[...p,cl]); setSelId(cl.id) }} style={{ ...Z.btn(),padding:'7px' }}>⎘ Duplicate</button>
            </>
          )}
        </div>
      </div>

      {/* ── CONTEXT MENU ── */}
      {ctxMenu&&(
        <div style={{ position:'fixed',left:ctxMenu.x,top:ctxMenu.y,background:'#0A0E1A',border:'1px solid rgba(0,229,255,0.15)',borderRadius:10,padding:4,zIndex:9999,minWidth:160,boxShadow:'0 8px 32px rgba(0,0,0,0.6)' }} onClick={e=>e.stopPropagation()}>
          {[['Duplicate','⎘'],['Move to Front','⤒'],['Move to Back','⤓'],['Delete','🗑']].map(([l,icon])=>(
            <div key={l} onClick={()=>{
              saveHistory()
              const el=els.find(e=>e.id===ctxMenu.id)
              if(!el){setCtxMenu(null);return}
              if(l==='Duplicate'){ const cl={...el,id:Math.random().toString(36).slice(2),x:el.x+10,y:el.y+10,zIndex:els.length+1}; setEls(p=>[...p,cl]); setSelId(cl.id) }
              if(l==='Move to Front'){ const max=Math.max(...els.map(e=>e.zIndex)); updateEl(ctxMenu.id,{zIndex:max+1}) }
              if(l==='Move to Back'){ const min=Math.min(...els.map(e=>e.zIndex)); updateEl(ctxMenu.id,{zIndex:Math.max(1,min-1)}) }
              if(l==='Delete'){ setEls(p=>p.filter(e=>e.id!==ctxMenu.id)); if(selId===ctxMenu.id) setSelId(null) }
              setCtxMenu(null)
            }} style={{ padding:'7px 12px',cursor:'pointer',display:'flex',gap:8,fontSize:12,color:'rgba(220,240,255,0.85)',borderRadius:7,transition:'background 100ms' }}
              onMouseEnter={e=>(e.currentTarget.style.background='rgba(139,92,246,0.15)')}
              onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
              <span>{icon}</span><span>{l}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── HELP OVERLAY ── */}
      {showHelp&&(
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999 }} onClick={()=>setShowHelp(false)}>
          <div style={{ background:'#0A0E1A',border:'1px solid rgba(0,229,255,0.15)',borderRadius:14,padding:24,minWidth:280 }} onClick={e=>e.stopPropagation()}>
            <p style={{ fontWeight:700,marginBottom:14,fontSize:14 }}>Keyboard Shortcuts</p>
            {[['Ctrl+Z','Undo'],['Ctrl+Y','Redo'],['Delete','Delete selected'],['↑↓←→','Nudge 1px'],['Shift+↑↓←→','Nudge 10px'],['Ctrl+D','Duplicate'],['Escape','Deselect'],['Right-click','Context menu']].map(([k,d])=>(
              <div key={k} style={{ display:'flex',justifyContent:'space-between',gap:24,marginBottom:8,fontSize:12 }}>
                <code style={{ background:'rgba(255,255,255,0.08)',padding:'2px 7px',borderRadius:4,color:'#00E5FF' }}>{k}</code>
                <span style={{ color:'rgba(180,200,240,0.7)' }}>{d}</span>
              </div>
            ))}
            <button onClick={()=>setShowHelp(false)} style={{ marginTop:12,width:'100%',padding:'8px',borderRadius:8,border:'none',background:'#8B5CF6',color:'#fff',cursor:'pointer',fontFamily:'inherit',fontWeight:700 }}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
