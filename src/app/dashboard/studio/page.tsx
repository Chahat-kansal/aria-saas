'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

interface StudioAsset {
  id: string; name: string | null; prompt: string | null; enhanced_prompt: string | null
  style: string; format: string; provider: string | null; image_url: string
  folder: string; tags: string[]; favourite: boolean; status: string; created_at: string
}

const QUALITY_MODES = [
  { id: 'fast', label: 'Fast',  sub: 'Quick generation · great quality', badge: 'Fast', desc: 'Best for daily social posts, rapid iteration and high-volume creation.' },
  { id: 'pro',  label: 'Pro',   sub: 'Highest quality · complex scenes',  badge: 'Pro',  desc: 'Maximum detail and accuracy. Best for hero banners, signage, and campaigns that need to impress.' },
]
const RATIOS = [
  { id: 'square',   label: '1:1',  hint: 'Instagram',    w: 1,  h: 1  },
  { id: 'portrait', label: '9:16', hint: 'Story / Reel', w: 9,  h: 16 },
  { id: 'landscape',label: '16:9', hint: 'Banner',       w: 16, h: 9  },
  { id: '4:3',      label: '4:3',  hint: 'Presentation', w: 4,  h: 3  },
  { id: '3:4',      label: '3:4',  hint: 'Portrait',     w: 3,  h: 4  },
]
const STYLES = [
  { id: 'photorealistic', label: 'Photorealistic', e: '📷' },
  { id: 'illustration',   label: 'Illustration',   e: '🎨' },
  { id: 'minimalist',     label: 'Minimalist',     e: '◻'  },
  { id: 'bold',           label: 'Bold',           e: '⚡'  },
  { id: 'vintage',        label: 'Vintage',        e: '🎞'  },
  { id: 'neon',           label: 'Neon',           e: '💜'  },
]
const TEMPLATES = [
  { label: 'Weekend Special', prompt: 'Weekend special promotion with warm festive atmosphere, golden lighting, inviting mood, Australian summer' },
  { label: 'New Arrival',     prompt: 'New product launch announcement, clean studio lighting, exciting product reveal on dark background' },
  { label: 'Happy Hour',      prompt: 'Happy hour drinks promotion, vibrant atmosphere, premium cocktails, warm ambient bar lighting' },
  { label: 'Seasonal Sale',   prompt: 'Seasonal sale event, colourful festive decorations, shopping excitement, bright energetic mood' },
  { label: 'Loyalty Reward',  prompt: 'Customer loyalty appreciation, gold stars, premium feel, warm personalised thank you moment' },
  { label: 'Grand Opening',   prompt: 'Grand opening celebration, ribbon cutting, balloons, community excitement, bright welcoming scene' },
  { label: 'Product Hero',    prompt: 'Hero product showcase, professional studio lighting, white background, premium commercial photography' },
  { label: 'Local Promo',     prompt: 'Local Australian small business community promotion, authentic warm colours, neighbourhood feel' },
]
const HOW_STEPS = [
  { n: '01', title: 'Choose your quality', body: 'Pick Fast for quick social content, or Pro for your highest-impact campaigns and banners.', delay: 'fadeUp 0.55s 0s ease both' },
  { n: '02', title: 'Describe your image', body: 'Write a prompt in plain English or tap a template. Use ✦ Aria refine to turn your rough idea into a detailed creative brief.', delay: 'fadeUp 0.55s 0.1s ease both' },
  { n: '03', title: 'Set format & style', body: 'Choose the aspect ratio that fits your channel — square, portrait Story, or landscape banner — and pick a visual style.', delay: 'fadeUp 0.55s 0.2s ease both' },
  { n: '04', title: 'Generate & use', body: 'Hit Generate. In 15–60 seconds your professional marketing image is ready to download or save to your library.', delay: 'fadeUp 0.55s 0.3s ease both' },
]
const EXAMPLES = [
  { label: 'Virtual try-on',   desc: 'Dress your products on models with a single text command.' },
  { label: 'Background swap',  desc: 'Place any product in a new scene or setting instantly.' },
  { label: 'Style transfer',   desc: 'Transform photos into illustrations, paintings, or any aesthetic.' },
  { label: 'Text removal',     desc: 'Clean packaging shots by removing unwanted text or logos.' },
  { label: 'Scene creation',   desc: 'Build entire promotional scenes from a text description.' },
  { label: 'Seasonal refresh', desc: 'Update existing images with seasonal themes and colours.' },
]
const FOLDERS = ['generated','uploads','banners','social','promotions','products','events']

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Inter:wght@300;400;500;600&display=swap');
.ars{font-family:'Inter',sans-serif;background:#080808;color:#ede8e3;min-height:100vh;position:relative;}
.ars *,.ars *::before,.ars *::after{box-sizing:border-box;}
.ars::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;opacity:.04;
background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23g)'/%3E%3C/svg%3E");background-size:300px;}
.ars .orb{position:fixed;top:-300px;right:-300px;width:700px;height:700px;border-radius:50%;pointer-events:none;z-index:0;background:radial-gradient(ellipse,rgba(127,184,151,.055) 0%,transparent 68%);}
.ars .gbg{position:fixed;inset:0;pointer-events:none;z-index:0;background-image:linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.018) 1px,transparent 1px);background-size:64px 64px;}
@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{opacity:.5}50%{opacity:1}}
@keyframes slideIn{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:translateX(0)}}
@keyframes progress{from{width:4%}to{width:96%}}
.fu1{animation:fadeUp .55s ease both}.fu2{animation:fadeUp .55s .08s ease both}.fu3{animation:fadeUp .55s .16s ease both}
.btn{display:inline-flex;align-items:center;gap:8px;padding:11px 22px;border-radius:100px;font-family:'Inter',sans-serif;font-size:13px;font-weight:500;cursor:pointer;border:none;transition:all .2s;letter-spacing:.01em;white-space:nowrap;}
.btn-w{background:#ede8e3;color:#080808;}.btn-w:hover{background:#fff;transform:translateY(-1px);box-shadow:0 8px 32px rgba(237,232,227,.18);}
.btn-g{background:rgba(255,255,255,.06);color:#ede8e3;border:1px solid rgba(255,255,255,.1);}.btn-g:hover{background:rgba(255,255,255,.1);}
.btn-dg{background:rgba(45,82,64,.8);color:#7FB897;border:1px solid rgba(127,184,151,.25);}.btn-dg:hover{background:#2D5240;}
.btn:disabled{opacity:.38;cursor:not-allowed;transform:none!important;box-shadow:none!important;}
.inp{width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:12px;color:#ede8e3;font-family:'Inter',sans-serif;font-size:13.5px;padding:12px 16px;outline:none;resize:vertical;transition:border-color .2s;}
.inp:focus{border-color:rgba(127,184,151,.4);}.inp::placeholder{color:rgba(237,232,227,.22);}select.inp{cursor:pointer;}
.lbl{font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:rgba(237,232,227,.32);margin:0 0 10px;display:block;}
.mc{padding:16px;border-radius:14px;cursor:pointer;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.025);transition:all .2s;}
.mc.on{border-color:rgba(127,184,151,.45);background:rgba(127,184,151,.055);}
.mc:hover:not(.on){border-color:rgba(255,255,255,.15);background:rgba(255,255,255,.04);}
.rb{display:flex;flex-direction:column;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;cursor:pointer;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.025);transition:all .2s;min-width:58px;}
.rb.on{border-color:rgba(127,184,151,.45);background:rgba(127,184,151,.055);}
.rb:hover:not(.on){border-color:rgba(255,255,255,.18);}
.rv{background:rgba(255,255,255,.14);border-radius:2px;border:1px solid rgba(255,255,255,.28);transition:all .2s;}
.rb.on .rv{background:rgba(127,184,151,.38);border-color:rgba(127,184,151,.6);}
.chip{padding:7px 14px;border-radius:100px;font-size:12px;font-weight:500;cursor:pointer;border:1px solid rgba(255,255,255,.09);background:transparent;color:rgba(237,232,227,.5);transition:all .2s;font-family:'Inter',sans-serif;white-space:nowrap;}
.chip.on{border-color:rgba(127,184,151,.45);background:rgba(127,184,151,.09);color:#7FB897;}
.chip:hover:not(.on){border-color:rgba(255,255,255,.2);color:#ede8e3;background:rgba(255,255,255,.04);}
.tmpl{padding:7px 14px;border-radius:100px;font-size:12px;cursor:pointer;border:1px solid rgba(255,255,255,.07);background:transparent;color:rgba(237,232,227,.42);transition:all .2s;font-family:'Inter',sans-serif;white-space:nowrap;}
.tmpl.on{border-color:rgba(127,184,151,.38);background:rgba(127,184,151,.07);color:#7FB897;}
.tmpl:hover:not(.on){border-color:rgba(255,255,255,.18);color:#ede8e3;background:rgba(255,255,255,.04);}
.ii{border-radius:12px;overflow:hidden;position:relative;cursor:pointer;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);transition:all .22s;}
.ii:hover{border-color:rgba(255,255,255,.18);transform:translateY(-2px);box-shadow:0 12px 40px rgba(0,0,0,.4);}
.ii.sel{border-color:rgba(127,184,151,.5);}
.ii .ov{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.72) 0%,transparent 55%);opacity:0;transition:opacity .2s;pointer-events:none;}
.ii:hover .ov{opacity:1;}
.drop{border:1.5px dashed rgba(255,255,255,.13);border-radius:14px;cursor:pointer;transition:all .2s;}
.drop.over{border-color:rgba(127,184,151,.5);background:rgba(127,184,151,.04);}
.drop:hover{border-color:rgba(255,255,255,.24);}
.pw{height:2px;background:rgba(255,255,255,.07);border-radius:1px;overflow:hidden;margin-top:12px;}
.pf{height:100%;width:4%;background:linear-gradient(90deg,#2D5240,#7FB897);border-radius:1px;animation:progress 48s ease-in-out forwards;}
.tab{padding:11px 20px;font-size:13px;font-weight:500;cursor:pointer;border:none;background:transparent;color:rgba(237,232,227,.38);border-bottom:2px solid transparent;transition:all .2s;font-family:'Inter',sans-serif;}
.tab.on{color:#ede8e3;border-bottom-color:#7FB897;}.tab:hover:not(.on){color:rgba(237,232,227,.72);}
.fbtn{position:absolute;top:8px;right:8px;width:30px;height:30px;border-radius:50%;border:none;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;transition:all .2s;color:rgba(255,255,255,.55);padding:0;}
.fbtn:hover{background:rgba(0,0,0,.82);color:#ede8e3;}.fbtn.on{color:#F59E0B;}
.dp{width:308px;flex-shrink:0;border-left:1px solid rgba(255,255,255,.07);background:rgba(6,6,6,.7);backdrop-filter:blur(12px);overflow-y:auto;animation:slideIn .22s ease;}
.scr::-webkit-scrollbar{width:3px;}.scr::-webkit-scrollbar-track{background:transparent;}.scr::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:2px;}
.hs{padding:32px 0;border-bottom:1px solid rgba(255,255,255,.055);}.hs:last-child{border-bottom:none;}
.xc{padding:20px;border-radius:14px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.025);transition:all .2s;}.xc:hover{border-color:rgba(255,255,255,.14);background:rgba(255,255,255,.045);}
.toast{position:fixed;top:20px;right:20px;z-index:9999;padding:12px 20px;border-radius:12px;font-size:13px;font-weight:500;backdrop-filter:blur(14px);animation:slideIn .2s ease;box-shadow:0 8px 32px rgba(0,0,0,.45);pointer-events:none;font-family:'Inter',sans-serif;}
`

export default function AriaStudioPage() {
  const [assets, setAssets]     = useState<StudioAsset[]>([])
  const [loading, setLoading]   = useState(true)
  const [generating, setGen]    = useState(false)
  const [refining, setRefining] = useState(false)
  const [uploading, setUp]       = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const [prompt, setPrompt] = useState('')
  const [mode, setMode]     = useState('fast')
  const [ratio, setRatio]   = useState('square')
  const [style, setStyle]   = useState('photorealistic')
  const [selT, setSelT]     = useState('')

  const [tab, setTab]           = useState<'console'|'library'|'how'|'editor'>('console')
  const [editingAsset, setEditingAsset] = useState<StudioAsset|null>(null)
  const [ff, setFF]             = useState<string|null>(null)
  const [fav, setFav]           = useState(false)
  const [selected, setSel]      = useState<StudioAsset|null>(null)
  const [toast, setToast]       = useState<{msg:string;ok:boolean}|null>(null)
  const [lastGen, setLastGen]   = useState<StudioAsset|null>(null)
  const [genKey, setGenKey]     = useState(0)

  const fileRef = useRef<HTMLInputElement>(null)
  const cssRef  = useRef(false)

  useEffect(() => {
    if (cssRef.current) return; cssRef.current = true
    const el = document.createElement('style'); el.textContent = CSS
    document.head.appendChild(el)
    return () => { document.head.removeChild(el) }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try { const d = await fetch('/api/aria/studio?limit=80').then(r=>r.json()) as {assets?:StudioAsset[]}; setAssets(d.assets??[]) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const showToast = (msg:string, ok=true) => { setToast({msg,ok}); setTimeout(()=>setToast(null),3200) }

  const refine = async () => {
    if (!prompt.trim()) return; setRefining(true)
    try {
      const d = await fetch('/api/aria/studio',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'refine_prompt',prompt})}).then(r=>r.json()) as {refined_prompt?:string}
      if (d.refined_prompt) setPrompt(d.refined_prompt)
    } finally { setRefining(false) }
  }

  const generate = async () => {
    if (!prompt.trim()) { showToast('Enter a prompt first',false); return }
    setGen(true); setGenKey(k=>k+1)
    try {
      const d = await fetch('/api/aria/studio',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({prompt:prompt.trim(),style,format:ratio,prefer_pro:mode==='pro',folder:'generated',tags:[]}),
      }).then(r=>r.json()) as {asset?:StudioAsset;provider?:string;error?:string}
      if (d.error) { showToast(d.error,false); return }
      if (d.asset) { setLastGen(d.asset); setAssets(p=>[d.asset!,...p]); showToast('Image created — ready to download'); setTab('console') }
    } catch { showToast('Generation failed',false) } finally { setGen(false) }
  }

  const doDrop = async (e:React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files?.[0]; if (f?.type.startsWith('image/')) await upload(f)
  }
  const upload = async (file:File) => {
    setUp(true)
    try {
      const fd = new FormData(); fd.append('file',file); fd.append('folder','uploads')
      const d = await fetch('/api/aria/studio/upload',{method:'POST',body:fd}).then(r=>r.json()) as {asset?:StudioAsset;error?:string}
      if (d.error) { showToast(d.error,false); return }
      if (d.asset) { setAssets(p=>[d.asset!,...p]); showToast('Uploaded!') }
    } finally { setUp(false) }
  }

  const toggleFav = async (a:StudioAsset, e?:React.MouseEvent) => {
    e?.stopPropagation()
    await fetch('/api/aria/studio',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:a.id,favourite:!a.favourite})})
    setAssets(p=>p.map(x=>x.id===a.id?{...x,favourite:!x.favourite}:x))
    if (selected?.id===a.id) setSel(p=>p?{...p,favourite:!p.favourite}:null)
  }
  const del = async (id:string) => {
    await fetch('/api/aria/studio?id='+id,{method:'DELETE'})
    setAssets(p=>p.filter(x=>x.id!==id)); if(selected?.id===id) setSel(null); showToast('Deleted')
  }

  const filtered = assets.filter(a=>{
    if (fav && !a.favourite) return false
    if (ff && a.folder!==ff) return false
    return true
  })

  const ratioVis = (r:typeof RATIOS[0]) => {
    const sc = Math.min(26/r.w, 26/r.h)
    return {width: r.w*sc, height: r.h*sc}
  }

  return (
    <div className="ars">
      <div className="orb"/><div className="gbg"/>

      {toast && (
        <div className="toast" style={{background:toast.ok?'rgba(30,50,38,0.96)':'rgba(60,15,15,0.96)',border:'1px solid '+(toast.ok?'rgba(127,184,151,0.35)':'rgba(239,68,68,0.25)'),color:toast.ok?'#7FB897':'#fca5a5'}}>
          {toast.ok?'✓ ':'✗ '}{toast.msg}
        </div>
      )}

      {/* HERO */}
      <div style={{borderBottom:'1px solid rgba(255,255,255,0.07)',padding:'52px 40px 44px',position:'relative',overflow:'hidden'}}>
        <div style={{position:'relative',maxWidth:740}}>
          <div className="fu1" style={{display:'inline-flex',alignItems:'center',gap:8,padding:'5px 14px',borderRadius:100,border:'1px solid rgba(127,184,151,0.22)',background:'rgba(127,184,151,0.055)',marginBottom:22}}>
            <span style={{width:6,height:6,borderRadius:'50%',background:'#7FB897',animation:'pulse 2s infinite',display:'inline-block'}}/>
            <span style={{fontSize:11,fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',color:'#7FB897'}}>✦ Aria Studio · AI Image Generator</span>
          </div>
          <h1 className="fu2" style={{fontFamily:"'Playfair Display',serif",fontSize:50,fontWeight:400,lineHeight:1.1,margin:'0 0 18px',color:'#ede8e3',letterSpacing:'-0.02em'}}>
            Create marketing images<br/>
            <em style={{color:'rgba(237,232,227,0.38)',fontStyle:'italic'}}>that actually sell</em>
          </h1>
          <p className="fu3" style={{fontSize:15,color:'rgba(237,232,227,0.42)',lineHeight:1.75,margin:'0 0 30px',maxWidth:530}}>
            Generate professional promo banners, posters and social content in seconds.
            Describe your vision in plain English — Aria handles the rest.
          </p>
          <div className="fu3" style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
            <button className="btn btn-w" onClick={()=>setTab('console')}>✨ Start creating</button>
            <button className="btn btn-g" onClick={()=>setTab('how')}>How it works</button>
            <button className="btn btn-g" onClick={()=>fileRef.current?.click()} disabled={uploading}>↑ {uploading?'Uploading…':'Upload image'}</button>
            <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)upload(f);e.target.value=''}}/>
          </div>
        </div>
        <div style={{marginTop:44,display:'flex',gap:44,flexWrap:'wrap'}}>
          {[['Fast mode','Quick generation · great quality'],['Pro mode','Maximum quality · complex scenes'],['6 Visual styles','Photo, illustration, neon & more'],[assets.length+' Images','In your library']].map(([k,v])=>(
            <div key={k}><div style={{fontSize:13,fontWeight:600,color:'#ede8e3',marginBottom:2}}>{k}</div><div style={{fontSize:11,color:'rgba(237,232,227,0.32)'}}>{v}</div></div>
          ))}
        </div>
      </div>

      {/* TABS */}
      <div style={{borderBottom:'1px solid rgba(255,255,255,0.07)',paddingLeft:40,display:'flex',gap:2,position:'relative',zIndex:1}}>
        <button className={'tab'+(tab==='console'?' on':'')} onClick={()=>setTab('console')}>✨ Generate</button>
        <button className={'tab'+(tab==='library'?' on':'')} onClick={()=>setTab('library')}>
          Library{assets.length>0&&<span style={{marginLeft:7,fontSize:10,padding:'1px 7px',borderRadius:10,background:'rgba(127,184,151,0.13)',color:'#7FB897'}}>{assets.length}</span>}
        </button>
        <button className={'tab'+(tab==='how'?' on':'')} onClick={()=>setTab('how')}>How it works</button>
        {editingAsset && <button className={'tab'+(tab==='editor'?' on':'')} onClick={()=>setTab('editor')} style={{color:tab==='editor'?'#7FB897':'rgba(237,232,227,0.38)',borderBottomColor:tab==='editor'?'#7FB897':'transparent'}}>✏ Image editor</button>}
      </div>

      {/* HOW IT WORKS */}
      {tab==='how'&&(
        <div style={{maxWidth:700,padding:'64px 40px',margin:'0 auto',position:'relative',zIndex:1}}>
          <div style={{marginBottom:52}}>
            <p style={{fontSize:10,fontWeight:600,letterSpacing:'0.12em',textTransform:'uppercase',color:'rgba(237,232,227,0.28)',marginBottom:14}}>HOW IT WORKS</p>
            <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:38,fontWeight:400,margin:0,color:'#ede8e3',lineHeight:1.2}}>
              Four steps to a professional<br/><em style={{color:'rgba(237,232,227,0.38)'}}>marketing image</em>
            </h2>
          </div>
          {HOW_STEPS.map(s=>(
            <div key={s.n} className="hs" style={{display:'grid',gridTemplateColumns:'90px 1fr',gap:24,animation:s.delay}}>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:52,color:'rgba(127,184,151,0.18)',lineHeight:1,paddingTop:4}}>{s.n}</div>
              <div style={{paddingTop:6}}>
                <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:400,margin:'0 0 10px',color:'#ede8e3'}}>{s.title}</h3>
                <p style={{fontSize:14,color:'rgba(237,232,227,0.42)',lineHeight:1.75,margin:0}}>{s.body}</p>
              </div>
            </div>
          ))}
          <div style={{marginTop:64}}>
            <p style={{fontSize:10,fontWeight:600,letterSpacing:'0.12em',textTransform:'uppercase',color:'rgba(237,232,227,0.28)',marginBottom:20}}>WHAT YOU CAN CREATE</p>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              {EXAMPLES.map(ex=><div key={ex.label} className="xc"><div style={{fontSize:13,fontWeight:600,color:'#ede8e3',marginBottom:5}}>{ex.label}</div><div style={{fontSize:12,color:'rgba(237,232,227,0.4)',lineHeight:1.6}}>{ex.desc}</div></div>)}
            </div>
          </div>
          <div style={{marginTop:56}}>
            <p style={{fontSize:10,fontWeight:600,letterSpacing:'0.12em',textTransform:'uppercase',color:'rgba(237,232,227,0.28)',marginBottom:20}}>QUALITY MODES</p>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead><tr style={{borderBottom:'1px solid rgba(255,255,255,0.07)'}}>
                {['Mode','Speed','Quality','Best for'].map(h=><th key={h} style={{textAlign:'left',padding:'8px 0',color:'rgba(237,232,227,0.35)',fontWeight:500,paddingRight:24}}>{h}</th>)}
              </tr></thead>
              <tbody>
                <tr style={{borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
                  <td style={{padding:'14px 0',paddingRight:24,color:'#ede8e3',fontWeight:500}}>Fast</td>
                  <td style={{padding:'14px 0',paddingRight:24,color:'#7FB897'}}>Quick</td>
                  <td style={{padding:'14px 0',paddingRight:24,color:'rgba(237,232,227,0.5)'}}>High</td>
                  <td style={{padding:'14px 0',color:'rgba(237,232,227,0.5)'}}>Social posts, rapid iteration</td>
                </tr>
                <tr>
                  <td style={{padding:'14px 0',paddingRight:24,color:'#ede8e3',fontWeight:500}}>Pro</td>
                  <td style={{padding:'14px 0',paddingRight:24,color:'#F59E0B'}}>Slower</td>
                  <td style={{padding:'14px 0',paddingRight:24,color:'#7FB897'}}>Best</td>
                  <td style={{padding:'14px 0',color:'rgba(237,232,227,0.5)'}}>Hero banners, campaigns, print</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{marginTop:48,textAlign:'center'}}>
            <button className="btn btn-w" onClick={()=>setTab('console')} style={{fontSize:15}}>✨ Start creating</button>
          </div>
        </div>
      )}

      {/* CONSOLE */}
      {tab==='console'&&(
        <div style={{display:'grid',gridTemplateColumns:'390px 1fr',minHeight:'calc(100vh - 226px)',position:'relative',zIndex:1}}>
          {/* controls */}
          <div className="scr" style={{borderRight:'1px solid rgba(255,255,255,0.07)',padding:'26px 22px',overflowY:'auto'}}>
            <span className="lbl">Quality</span>
            <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:24}}>
              {QUALITY_MODES.map(m=>(
                <div key={m.id} className={'mc'+(mode===m.id?' on':'')} onClick={()=>setMode(m.id)}>
                  <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
                    <div style={{width:34,height:34,borderRadius:10,background:mode===m.id?'rgba(127,184,151,0.14)':'rgba(255,255,255,0.055)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,flexShrink:0}}>✦</div>
                    <div style={{flex:1}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:2}}>
                        <span style={{fontSize:13,fontWeight:600,color:mode===m.id?'#ede8e3':'rgba(237,232,227,0.65)'}}>{m.label}</span>
                        <span style={{fontSize:9,padding:'1px 7px',borderRadius:6,background:m.id==='pro'?'rgba(245,158,11,0.13)':'rgba(127,184,151,0.13)',color:m.id==='pro'?'#F59E0B':'#7FB897',fontWeight:700,letterSpacing:'0.05em'}}>{m.badge}</span>
                      </div>
                      <div style={{fontSize:11,color:'rgba(237,232,227,0.33)'}}>{m.sub}</div>
                    </div>
                    <div style={{width:17,height:17,borderRadius:'50%',border:'2px solid '+(mode===m.id?'#7FB897':'rgba(255,255,255,0.18)'),background:mode===m.id?'#7FB897':'transparent',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                      {mode===m.id&&<div style={{width:6,height:6,borderRadius:'50%',background:'#080808'}}/>}
                    </div>
                  </div>
                  {mode===m.id&&<p style={{fontSize:11,color:'rgba(237,232,227,0.38)',margin:'10px 0 0',lineHeight:1.55}}>{m.desc}</p>}
                </div>
              ))}
            </div>

            <span className="lbl">Quick templates</span>
            <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:24}}>
              {TEMPLATES.map(t=><button key={t.label} className={'tmpl'+(selT===t.label?' on':'')} onClick={()=>{setPrompt(t.prompt);setSelT(t.label)}}>{t.label}</button>)}
            </div>

            <span className="lbl">Describe your image</span>
            <div style={{position:'relative',marginBottom:6}}>
              <textarea className="inp" rows={5} value={prompt} onChange={e=>setPrompt(e.target.value)}
                placeholder="e.g. Weekend BBQ special — sizzling prawns, golden sunset, Australian summer, premium menu feel, warm atmosphere…"/>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
              <span style={{fontSize:11,color:'rgba(237,232,227,0.2)'}}>{prompt.length}/5000</span>
              <button onClick={refine} disabled={refining||!prompt.trim()}
                style={{fontSize:11,padding:'5px 13px',borderRadius:100,cursor:'pointer',fontFamily:'inherit',border:'1px solid rgba(127,184,151,0.28)',background:'transparent',color:'#7FB897',opacity:refining||!prompt.trim()?0.38:1,transition:'all 0.2s'}}>
                {refining?'⏳ Refining…':'✦ Aria refine'}
              </button>
            </div>

            <span className="lbl">Aspect ratio</span>
            <div style={{display:'flex',gap:7,marginBottom:24,flexWrap:'wrap'}}>
              {RATIOS.map(r=>{
                const vs=ratioVis(r)
                return (
                  <div key={r.id} className={'rb'+(ratio===r.id?' on':'')} onClick={()=>setRatio(r.id)}>
                    <div className="rv" style={vs}/>
                    <div style={{textAlign:'center'}}>
                      <div style={{fontSize:11,fontWeight:600,color:ratio===r.id?'#7FB897':'rgba(237,232,227,0.65)'}}>{r.label}</div>
                      <div style={{fontSize:9,color:'rgba(237,232,227,0.28)',marginTop:1}}>{r.hint}</div>
                    </div>
                  </div>
                )
              })}
            </div>

            <span className="lbl">Visual style</span>
            <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:26}}>
              {STYLES.map(s=><button key={s.id} className={'chip'+(style===s.id?' on':'')} onClick={()=>setStyle(s.id)}>{s.e} {s.label}</button>)}
            </div>

            <span className="lbl">Image reference <span style={{textTransform:'none',letterSpacing:0,color:'rgba(237,232,227,0.2)',fontWeight:400,marginLeft:6}}>(optional)</span></span>
            <div className={'drop'+(dragOver?' over':'')} style={{padding:'22px',textAlign:'center',marginBottom:24}}
              onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)} onDrop={doDrop} onClick={()=>fileRef.current?.click()}>
              <div style={{fontSize:22,marginBottom:8,opacity:0.35}}>{uploading?'⏳':'↑'}</div>
              <div style={{fontSize:12,color:'rgba(237,232,227,0.32)'}}>{uploading?'Uploading…':'Click or drag & drop · PNG, JPG, WEBP'}</div>
            </div>

            <button onClick={generate} disabled={generating||!prompt.trim()} className="btn btn-w" style={{width:'100%',justifyContent:'center',fontSize:15,padding:'14px 24px',borderRadius:14}}>
              {generating
                ? <><span style={{width:13,height:13,border:'2px solid rgba(0,0,0,0.25)',borderTopColor:'#080808',borderRadius:'50%',animation:'spin 0.75s linear infinite',display:'inline-block'}}/> Generating…</>
                : <>✨ Generate Image</>}
            </button>
            {generating&&(
              <div style={{marginTop:14}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'rgba(237,232,227,0.35)',marginBottom:5}}><span>Generating your image</span><span>15–60 sec</span></div>
                <div className="pw" key={genKey}><div className="pf"/></div>
                <p style={{fontSize:11,color:'rgba(237,232,227,0.26)',marginTop:8,lineHeight:1.55}}>Aria is working on your image. Keep this tab open.</p>
              </div>
            )}
          </div>

          {/* preview */}
          <div className="scr" style={{overflowY:'auto'}}>
            {lastGen ? (
              <div style={{padding:28}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
                  <div>
                    <p style={{fontSize:11,fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',color:'rgba(237,232,227,0.3)',margin:0}}>Generated image</p>
                    <p style={{fontSize:11,color:'rgba(237,232,227,0.22)',margin:'4px 0 0'}}>{lastGen.style} · {lastGen.format}</p>
                  </div>
                  <div style={{display:'flex',gap:8}}>
                    <button onClick={()=>toggleFav(lastGen)} style={{padding:'7px 14px',borderRadius:100,fontSize:12,cursor:'pointer',fontFamily:'inherit',border:'1px solid rgba(255,255,255,0.1)',background:'transparent',color:lastGen.favourite?'#F59E0B':'rgba(237,232,227,0.45)',transition:'all 0.2s'}}>
                      {lastGen.favourite?'★ Saved':'☆ Save'}
                    </button>
                    <a href={lastGen.image_url} download target="_blank" rel="noreferrer" className="btn btn-dg" style={{padding:'7px 18px',borderRadius:100,fontSize:12,textDecoration:'none'}}>↓ Download</a>
                  </div>
                </div>
                <div style={{borderRadius:20,overflow:'hidden',background:'rgba(255,255,255,0.025)',border:'1px solid rgba(255,255,255,0.07)',marginBottom:16}}>
                  <img src={lastGen.image_url} alt={lastGen.prompt??''} style={{width:'100%',display:'block',aspectRatio:lastGen.format==='landscape'?'16/9':lastGen.format==='portrait'?'4/5':'1',objectFit:'cover',maxHeight:520}}/>
                </div>
                <div style={{padding:'12px 16px',background:'rgba(255,255,255,0.025)',borderRadius:12,border:'1px solid rgba(255,255,255,0.06)',marginBottom:12}}>
                  <p style={{fontSize:9,color:'rgba(237,232,227,0.28)',margin:'0 0 5px',textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:600}}>Prompt used</p>
                  <p style={{fontSize:12,color:'rgba(237,232,227,0.42)',margin:0,lineHeight:1.65}}>{lastGen.enhanced_prompt??lastGen.prompt}</p>
                </div>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  <button onClick={()=>{setPrompt(lastGen.prompt??'');setStyle(lastGen.style);setRatio(lastGen.format)}} style={{fontSize:12,padding:'8px 16px',borderRadius:100,cursor:'pointer',fontFamily:'inherit',border:'1px solid rgba(255,255,255,0.09)',background:'transparent',color:'rgba(237,232,227,0.38)',transition:'all 0.2s'}}>↺ Regenerate with changes</button>
                  <button onClick={()=>{setEditingAsset(lastGen);setTab('editor')}} style={{fontSize:12,padding:'8px 16px',borderRadius:100,cursor:'pointer',fontFamily:'inherit',border:'1px solid rgba(127,184,151,0.3)',background:'rgba(127,184,151,0.07)',color:'#7FB897',transition:'all 0.2s'}}>✏ Edit image</button>
                </div>
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',minHeight:420,padding:40,textAlign:'center'}}>
                <div style={{width:80,height:80,borderRadius:24,background:'rgba(127,184,151,0.07)',border:'1px solid rgba(127,184,151,0.14)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:30,marginBottom:22}}>✦</div>
                <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:24,fontWeight:400,margin:'0 0 10px',color:'#ede8e3'}}>Ready to create</h3>
                <p style={{fontSize:14,color:'rgba(237,232,227,0.33)',margin:'0 0 26px',lineHeight:1.7,maxWidth:360}}>Pick a template on the left, write your prompt, and hit Generate.</p>
                <div style={{display:'flex',gap:10,flexWrap:'wrap',justifyContent:'center'}}>
                  {TEMPLATES.slice(0,4).map(t=>(
                    <button key={t.label} onClick={()=>{setPrompt(t.prompt);setSelT(t.label)}} style={{padding:'8px 16px',borderRadius:100,fontSize:12,cursor:'pointer',fontFamily:'inherit',border:'1px solid rgba(255,255,255,0.09)',background:'rgba(255,255,255,0.03)',color:'rgba(237,232,227,0.45)',transition:'all 0.2s'}}>{t.label}</button>
                  ))}
                </div>
              </div>
            )}
            {assets.length>0&&(
              <div style={{padding:'0 28px 28px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                  <p style={{fontSize:10,fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',color:'rgba(237,232,227,0.28)',margin:0}}>Recent</p>
                  <button onClick={()=>setTab('library')} style={{fontSize:11,color:'#7FB897',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit'}}>View all →</button>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:8}}>
                  {assets.slice(0,12).map(a=>(
                    <div key={a.id} className="ii" onClick={()=>{setTab('library');setSel(a)}} style={{aspectRatio:'1'}}>
                      <img src={a.image_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* LIBRARY */}
      {tab==='library'&&(
        <div style={{display:'flex',minHeight:'calc(100vh - 226px)',position:'relative',zIndex:1}}>
          <div style={{width:192,borderRight:'1px solid rgba(255,255,255,0.07)',padding:'18px 10px',flexShrink:0}}>
            <span className="lbl" style={{padding:'0 8px',display:'block'}}>Filter</span>
            {[{l:'All images',a:!ff&&!fav,fn:()=>{setFF(null);setFav(false)}},{l:'★ Saved',a:fav,fn:()=>{setFav(true);setFF(null)}}].map(b=>(
              <button key={b.l} onClick={b.fn} style={{width:'100%',padding:'8px 10px',borderRadius:8,fontSize:12,fontWeight:b.a?600:400,cursor:'pointer',fontFamily:'inherit',border:'none',background:b.a?'rgba(127,184,151,0.09)':'transparent',color:b.a?'#7FB897':'rgba(237,232,227,0.38)',textAlign:'left',marginBottom:2,transition:'all 0.2s'}}>{b.l}</button>
            ))}
            <span className="lbl" style={{padding:'14px 8px 6px',display:'block'}}>Folders</span>
            {FOLDERS.map(f=>{
              const c=assets.filter(a=>a.folder===f).length; if(!c) return null
              const on=ff===f
              return <button key={f} onClick={()=>{setFF(f);setFav(false)}} style={{width:'100%',padding:'7px 10px',borderRadius:8,fontSize:12,cursor:'pointer',fontFamily:'inherit',border:'none',background:on?'rgba(127,184,151,0.09)':'transparent',color:on?'#7FB897':'rgba(237,232,227,0.38)',textAlign:'left',display:'flex',justifyContent:'space-between',marginBottom:2,transition:'all 0.2s'}}><span>{f}</span><span style={{fontSize:10,color:'rgba(237,232,227,0.2)'}}>{c}</span></button>
            })}
          </div>
          <div className="scr" style={{flex:1,overflowY:'auto',padding:20}}>
            {loading ? <div style={{textAlign:'center',padding:60,color:'rgba(237,232,227,0.3)',fontSize:13}}>Loading…</div>
            : filtered.length===0 ? (
              <div style={{textAlign:'center',padding:60}}>
                <div style={{fontSize:44,marginBottom:16,opacity:0.15}}>🖼</div>
                <p style={{fontSize:15,margin:'0 0 8px',color:'rgba(237,232,227,0.45)'}}>No images yet</p>
                <button onClick={()=>setTab('console')} className="btn btn-w" style={{marginTop:16}}>✨ Start generating</button>
              </div>
            ) : (
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(210px,1fr))',gap:12}}>
                {filtered.map(a=>(
                  <div key={a.id} className={'ii'+(selected?.id===a.id?' sel':'')} onClick={()=>setSel(a)}>
                    <div className="ov"/>
                    <img src={a.image_url} alt={a.prompt??''} style={{width:'100%',aspectRatio:a.format==='landscape'?'16/9':a.format==='portrait'?'4/5':'1',objectFit:'cover',display:'block'}}/>
                    <button className={'fbtn'+(a.favourite?' on':'')} onClick={e=>toggleFav(a,e)}>{a.favourite?'★':'☆'}</button>
                    <div style={{padding:'10px 12px'}}>
                      <p style={{fontSize:11,fontWeight:600,margin:'0 0 2px',color:'#ede8e3',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.name??a.prompt?.slice(0,40)??'Untitled'}</p>
                      <p style={{fontSize:10,color:'rgba(237,232,227,0.3)',margin:0}}>{a.style} · {a.format}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {selected&&(
            <div className="dp scr">
              <div style={{padding:'16px 20px',borderBottom:'1px solid rgba(255,255,255,0.07)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:12,fontWeight:600,color:'rgba(237,232,227,0.5)'}}>Details</span>
                <button onClick={()=>setSel(null)} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(237,232,227,0.3)',fontSize:18,lineHeight:1,padding:0}}>×</button>
              </div>
              <div style={{padding:20}}>
                <div style={{borderRadius:14,overflow:'hidden',marginBottom:16,border:'1px solid rgba(255,255,255,0.07)'}}>
                  <img src={selected.image_url} alt={selected.prompt??''} style={{width:'100%',display:'block',aspectRatio:selected.format==='landscape'?'16/9':selected.format==='portrait'?'4/5':'1',objectFit:'cover'}}/>
                </div>
                <div style={{marginBottom:16,display:'flex',flexDirection:'column',gap:8}}>
                  {[['Style',selected.style],['Format',selected.format],['Folder',selected.folder],['Created',new Date(selected.created_at).toLocaleDateString('en-AU',{day:'numeric',month:'short'})]].map(([k,v])=>(
                    <div key={k} style={{display:'flex',justifyContent:'space-between',fontSize:12}}>
                      <span style={{color:'rgba(237,232,227,0.33)'}}>{k}</span>
                      <span style={{color:'#ede8e3',fontWeight:500}}>{v}</span>
                    </div>
                  ))}
                </div>
                {selected.prompt&&<div style={{marginBottom:16,padding:'10px 12px',background:'rgba(255,255,255,0.025)',borderRadius:10,border:'1px solid rgba(255,255,255,0.06)'}}><p style={{fontSize:9,color:'rgba(237,232,227,0.28)',margin:'0 0 5px',textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:600}}>Prompt</p><p style={{fontSize:11,color:'rgba(237,232,227,0.42)',margin:0,lineHeight:1.6}}>{selected.prompt}</p></div>}
                {selected.tags.length>0&&<div style={{marginBottom:16,display:'flex',flexWrap:'wrap',gap:5}}>{selected.tags.map(t=><span key={t} style={{fontSize:10,padding:'2px 9px',borderRadius:100,background:'rgba(127,184,151,0.09)',color:'#7FB897'}}>{t}</span>)}</div>}
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  <a href={selected.image_url} download target="_blank" rel="noreferrer" className="btn btn-w" style={{justifyContent:'center',textDecoration:'none',borderRadius:10,padding:'10px',fontSize:13}}>↓ Download</a>
                  <button onClick={()=>toggleFav(selected)} style={{padding:'10px',borderRadius:10,fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit',border:'1px solid rgba(255,255,255,0.09)',background:'transparent',color:selected.favourite?'#F59E0B':'rgba(237,232,227,0.38)',transition:'all 0.2s'}}>{selected.favourite?'★ Remove from saved':'☆ Save to library'}</button>
                  <button onClick={()=>{setEditingAsset(selected);setTab('editor')}} style={{padding:'10px',borderRadius:10,fontSize:12,cursor:'pointer',fontFamily:'inherit',border:'1px solid rgba(127,184,151,0.3)',background:'rgba(127,184,151,0.07)',color:'#7FB897',transition:'all 0.2s'}}>✏ Edit image</button>
                  <button onClick={()=>{setPrompt(selected.prompt??'');setStyle(selected.style);setRatio(selected.format);setTab('console')}} style={{padding:'10px',borderRadius:10,fontSize:12,cursor:'pointer',fontFamily:'inherit',border:'1px solid rgba(255,255,255,0.09)',background:'transparent',color:'rgba(237,232,227,0.38)',transition:'all 0.2s'}}>↺ Use as template</button>
                  <button onClick={()=>del(selected.id)} style={{padding:'10px',borderRadius:10,fontSize:12,cursor:'pointer',fontFamily:'inherit',border:'1px solid rgba(239,68,68,0.18)',background:'transparent',color:'rgba(239,68,68,0.55)',transition:'all 0.2s'}}>Delete</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── IMAGE EDITOR (Fabric.js canvas) ─────────────────── */}
      {tab==='editor' && editingAsset && (
        <ImageEditor asset={editingAsset} onClose={()=>setTab('console')} onSave={(url)=>{showToast('Saved to library');setAssets(p=>p.map(a=>a.id===editingAsset.id?{...a,image_url:url}:a));setTab('library')}} />
      )}
    </div>
  )
}


/* ─── Image Editor Component ─────────────────────────────── */
function ImageEditor({ asset, onClose, onSave }: { asset: StudioAsset; onClose: () => void; onSave: (url: string) => void }) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const fabricRef  = useRef<any>(null)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [textInput, setTextInput] = useState('')
  const [textColor, setTextColor] = useState('#ffffff')
  const [textSize, setTextSize]   = useState(32)
  const [textFont, setTextFont]   = useState('Inter')
  const [selObj, setSelObj]       = useState<any>(null)
  const [brightness, setBrightness] = useState(0)
  const [contrast, setContrast]     = useState(0)
  const [opacity, setOpacity]       = useState(100)
  const cssRef2 = useRef(false)

  const EDITOR_CSS = `
.fed{display:flex;height:calc(100vh - 226px);background:#060606;}
.fed-toolbar{width:260px;flex-shrink:0;border-right:1px solid rgba(255,255,255,0.07);padding:16px;overflow-y:auto;display:flex;flex-direction:column;gap:16px;}
.fed-canvas-wrap{flex:1;display:flex;align-items:center;justify-content:center;background:repeating-conic-gradient(rgba(255,255,255,0.04) 0% 25%,transparent 0% 50%) 0 0/32px 32px;}
.fed-section{display:flex;flex-direction:column;gap:8px;}
.fed-label{font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(237,232,227,0.28);}
.fed-inp{width:100%;padding:8px 10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#ede8e3;font-family:'Inter',sans-serif;font-size:12px;outline:none;}
.fed-inp:focus{border-color:rgba(127,184,151,0.4);}
.fed-row{display:flex;gap:6px;}
.fed-btn{flex:1;padding:8px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:rgba(237,232,227,0.7);font-family:'Inter',sans-serif;transition:all 0.2s;text-align:center;}
.fed-btn:hover{border-color:rgba(255,255,255,0.22);color:#ede8e3;background:rgba(255,255,255,0.09);}
.fed-btn-g{background:rgba(45,82,64,0.8);color:#7FB897;border-color:rgba(127,184,151,0.25);}.fed-btn-g:hover{background:#2D5240;}
.fed-btn-r{background:rgba(239,68,68,0.1);color:rgba(239,68,68,0.7);border-color:rgba(239,68,68,0.2);}
.fed-slider{width:100%;accent-color:#7FB897;cursor:pointer;}
.fed-clr-row{display:flex;gap:6px;flex-wrap:wrap;}
.fed-clr{width:22px;height:22px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:all 0.15s;flex-shrink:0;}
.fed-clr.on{border-color:#ede8e3;transform:scale(1.15);}
.fed-font-chip{padding:5px 10px;border-radius:100px;font-size:11px;cursor:pointer;border:1px solid rgba(255,255,255,0.09);background:transparent;color:rgba(237,232,227,0.45);font-family:'Inter',sans-serif;transition:all 0.15s;white-space:nowrap;}
.fed-font-chip.on{border-color:rgba(127,184,151,0.4);background:rgba(127,184,151,0.08);color:#7FB897;}
`
  useEffect(() => {
    if (cssRef2.current) return; cssRef2.current = true
    const el = document.createElement('style'); el.textContent = EDITOR_CSS
    document.head.appendChild(el)
    return () => { document.head.removeChild(el) }
  }, [])

  // Load Fabric.js from CDN and initialise canvas
  useEffect(() => {
    if (!canvasRef.current) return
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js'
    script.onload = () => initCanvas()
    document.head.appendChild(script)
    return () => { fabricRef.current?.dispose() }
  }, [])

  const initCanvas = () => {
    const fabric = (window as any).fabric
    if (!fabric || !canvasRef.current) return
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (!canvasRef.current) return
      // Size the canvas to fit the visible wrapper, preserving the image's
      // aspect ratio. Do NOT pre-set canvasRef width/height — Fabric must
      // own dimension setup or the bitmap and CSS sizes desync (stretched canvas).
      const wrap = canvasRef.current.parentElement
      const availW = Math.max(280, (wrap?.clientWidth ?? 760) - 48)
      const availH = Math.max(280, (wrap?.clientHeight ?? 620) - 48)
      const scale = Math.min(availW / img.width, availH / img.height, 1)
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const fc = new fabric.Canvas(canvasRef.current, { preserveObjectStacking: true })
      fc.setDimensions({ width: w, height: h })
      fabricRef.current = fc
      fabric.Image.fromURL(img.src, (fImg: any) => {
        // Scale the background image to exactly fill the canvas, centred.
        fImg.set({ selectable: false, evented: false, originX: 'left', originY: 'top' })
        fImg.scaleX = w / (fImg.width || w)
        fImg.scaleY = h / (fImg.height || h)
        fImg.left = 0
        fImg.top = 0
        fc.add(fImg)
        fc.sendToBack(fImg)
        fc.renderAll()
        setLoading(false)
      }, { crossOrigin: 'anonymous' })
      fc.on('selection:created', (e: any) => setSelObj(e.selected?.[0] ?? null))
      fc.on('selection:updated', (e: any) => setSelObj(e.selected?.[0] ?? null))
      fc.on('selection:cleared', () => setSelObj(null))
    }
    img.src = asset.image_url
  }

  const addText = () => {
    const fabric = (window as any).fabric
    if (!fabric || !fabricRef.current || !textInput.trim()) return
    const t = new fabric.Text(textInput.trim(), {
      left: 60, top: 60,
      fontSize: textSize,
      fill: textColor,
      fontFamily: textFont,
      fontWeight: '600',
      shadow: 'rgba(0,0,0,0.6) 2px 2px 6px',
    })
    fabricRef.current.add(t)
    fabricRef.current.setActiveObject(t)
    fabricRef.current.renderAll()
    setTextInput('')
  }

  const addShape = (type: 'rect'|'circle') => {
    const fabric = (window as any).fabric
    if (!fabric || !fabricRef.current) return
    const obj = type === 'rect'
      ? new fabric.Rect({ width: 160, height: 60, fill: 'rgba(45,82,64,0.7)', rx: 8, ry: 8, left: 80, top: 80 })
      : new fabric.Circle({ radius: 50, fill: 'rgba(45,82,64,0.7)', left: 80, top: 80 })
    fabricRef.current.add(obj)
    fabricRef.current.setActiveObject(obj)
    fabricRef.current.renderAll()
  }

  const deleteSelected = () => {
    const fc = fabricRef.current
    if (!fc) return
    const obj = fc.getActiveObject()
    if (obj) { fc.remove(obj); fc.discardActiveObject(); fc.renderAll(); setSelObj(null) }
  }

  const applyFilter = (bright: number, cont: number) => {
    const fc = fabricRef.current
    if (!fc) return
    const bg = fc.getObjects().find((o: any) => !o.selectable)
    if (!bg) return
    const fabric = (window as any).fabric
    bg.filters = [
      new fabric.Image.filters.Brightness({ brightness: bright / 100 }),
      new fabric.Image.filters.Contrast({ contrast: cont / 100 }),
    ]
    bg.applyFilters()
    fc.renderAll()
  }

  const updateSelectedOpacity = (val: number) => {
    const fc = fabricRef.current
    const obj = fc?.getActiveObject()
    if (obj) { obj.set({ opacity: val / 100 }); fc.renderAll() }
  }

  const exportImage = async () => {
    const fc = fabricRef.current
    if (!fc) return
    setSaving(true)
    try {
      const dataUrl = fc.toDataURL({ format: 'png', multiplier: 2 })
      const blob = await (await fetch(dataUrl)).blob()
      const fd = new FormData()
      fd.append('file', new File([blob], 'edited-' + Date.now() + '.png', { type: 'image/png' }))
      fd.append('folder', 'edited')
      const d = await fetch('/api/aria/studio/upload', { method: 'POST', body: fd }).then(r => r.json()) as { asset?: StudioAsset; url?: string }
      if (d.asset?.image_url) onSave(d.asset.image_url)
    } finally { setSaving(false) }
  }

  const downloadExport = () => {
    const fc = fabricRef.current
    if (!fc) return
    const dataUrl = fc.toDataURL({ format: 'png', multiplier: 2 })
    const a = document.createElement('a')
    a.href = dataUrl; a.download = 'aria-studio-' + Date.now() + '.png'; a.click()
  }

  const COLORS = ['#ffffff','#000000','#7FB897','#F59E0B','#EF4444','#3B82F6','#EC4899','#f0ede8']
  const FONTS  = ['Inter','Georgia','Arial','Courier New','Impact']

  return (
    <div className="fed" style={{position:'relative',zIndex:1}}>
      {/* Toolbar */}
      <div className="fed-toolbar scr">
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <span style={{fontSize:13,fontWeight:600,color:'#ede8e3'}}>Image Editor</span>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(237,232,227,0.4)',fontSize:16,lineHeight:1,padding:0}}>×</button>
        </div>

        {/* Add text */}
        <div className="fed-section">
          <span className="fed-label">Add text</span>
          <input className="fed-inp" value={textInput} onChange={e=>setTextInput(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&addText()}
            placeholder="Type and press Enter or Add"/>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            <span style={{fontSize:11,color:'rgba(237,232,227,0.35)',flexShrink:0}}>Size</span>
            <input type="range" className="fed-slider" min={12} max={120} value={textSize} onChange={e=>setTextSize(+e.target.value)} style={{flex:1}}/>
            <span style={{fontSize:11,color:'rgba(237,232,227,0.5)',width:24,textAlign:'right'}}>{textSize}</span>
          </div>
          <div className="fed-clr-row">
            {COLORS.map(c=><div key={c} className={'fed-clr'+(textColor===c?' on':'')} style={{background:c,boxShadow:textColor===c?'0 0 0 1px rgba(255,255,255,0.5) inset':undefined}} onClick={()=>setTextColor(c)}/>)}
            <input type="color" value={textColor} onChange={e=>setTextColor(e.target.value)} style={{width:22,height:22,borderRadius:'50%',border:'none',cursor:'pointer',background:'none',padding:0}}/>
          </div>
          <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
            {FONTS.map(f=><button key={f} className={'fed-font-chip'+(textFont===f?' on':'')} style={{fontFamily:f}} onClick={()=>setTextFont(f)}>{f}</button>)}
          </div>
          <button className="fed-btn fed-btn-g" onClick={addText} disabled={!textInput.trim()}>+ Add text</button>
        </div>

        {/* Shapes */}
        <div className="fed-section">
          <span className="fed-label">Add shape</span>
          <div className="fed-row">
            <button className="fed-btn" onClick={()=>addShape('rect')}>▭ Rectangle</button>
            <button className="fed-btn" onClick={()=>addShape('circle')}>● Circle</button>
          </div>
        </div>

        {/* Adjustments */}
        <div className="fed-section">
          <span className="fed-label">Adjustments</span>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {[['Brightness', brightness, setBrightness],['Contrast', contrast, setContrast]].map(([label, val, setter])=>(
              <div key={String(label)} style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{fontSize:11,color:'rgba(237,232,227,0.35)',width:68,flexShrink:0}}>{String(label)}</span>
                <input type="range" className="fed-slider" min={-100} max={100} value={Number(val)}
                  onChange={e=>{ (setter as Function)(+e.target.value); applyFilter(label==='Brightness'?+e.target.value:brightness, label==='Contrast'?+e.target.value:contrast) }}
                  style={{flex:1}}/>
                <span style={{fontSize:10,color:'rgba(237,232,227,0.4)',width:30,textAlign:'right'}}>{Number(val)>0?'+':''}{Number(val)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Selected object controls */}
        {selObj && (
          <div className="fed-section" style={{padding:'10px 12px',background:'rgba(127,184,151,0.06)',border:'1px solid rgba(127,184,151,0.15)',borderRadius:10}}>
            <span className="fed-label" style={{color:'#7FB897'}}>Selected object</span>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:11,color:'rgba(237,232,227,0.35)',width:52,flexShrink:0}}>Opacity</span>
              <input type="range" className="fed-slider" min={10} max={100} value={opacity}
                onChange={e=>{setOpacity(+e.target.value);updateSelectedOpacity(+e.target.value)}} style={{flex:1}}/>
              <span style={{fontSize:10,color:'rgba(237,232,227,0.4)',width:30,textAlign:'right'}}>{opacity}%</span>
            </div>
            <button className="fed-btn fed-btn-r" onClick={deleteSelected}>Delete selected</button>
          </div>
        )}

        {/* Export */}
        <div className="fed-section" style={{marginTop:'auto',paddingTop:8,borderTop:'1px solid rgba(255,255,255,0.07)'}}>
          <button className="fed-btn fed-btn-g" onClick={exportImage} disabled={saving}>
            {saving?'Saving…':'Save to library'}
          </button>
          <button className="fed-btn" onClick={downloadExport}>↓ Download PNG</button>
        </div>
      </div>

      {/* Canvas area */}
      <div className="fed-canvas-wrap">
        {loading && (
          <div style={{position:'absolute',display:'flex',flexDirection:'column',alignItems:'center',gap:12,color:'rgba(237,232,227,0.4)'}}>
            <div style={{width:28,height:28,border:'2px solid rgba(127,184,151,0.3)',borderTopColor:'#7FB897',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
            <span style={{fontSize:12}}>Loading canvas…</span>
          </div>
        )}
        <canvas ref={canvasRef} style={{boxShadow:'0 24px 80px rgba(0,0,0,0.6)',borderRadius:4,display:loading?'none':'block'}}/>
      </div>
    </div>
  )
}

