'use client'
import { useState, useEffect, useCallback } from 'react'

interface Plan {
  id: string; product_id: string; product_name: string
  planned_qty: number; actual_qty: number | null; notes: string | null; plan_date: string
}

const C = {
  bg:'var(--bg-base)', card:'var(--bg-surface)', text:'var(--text-primary)',
  muted:'var(--text-secondary)', dim:'var(--text-tertiary)',
  violet:'#8B5CF6', green:'#22C55E', red:'#EF4444', amber:'#F59E0B',
  border:'rgba(255,255,255,0.07)',
}
const iS: React.CSSProperties = {
  background:'var(--bg-base)', border:`1px solid ${C.border}`, borderRadius:8,
  padding:'8px 12px', fontSize:13, color:C.text, outline:'none',
  fontFamily:'inherit', width:'100%', boxSizing:'border-box',
}

function fmt(d: string) {
  return new Date(d+'T00:00:00').toLocaleDateString('en-AU', { weekday:'long', day:'numeric', month:'short' })
}

export default function ProductionPlanPage() {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/pos/production-plan?date=${date}`)
    const d = await res.json() as { plans?: Plan[] }
    setPlans(d.plans ?? [])
    setLoading(false)
  }, [date])

  useEffect(() => { load() }, [load])

  async function aiGenerate() {
    setGenerating(true)
    const res = await fetch('/api/pos/production-plan', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ ai_generate: true, date }),
    })
    const d = await res.json() as { plans?: Plan[]; day?: string; message?: string }
    setPlans(d.plans ?? [])
    setMessage(d.message ?? null)
    setGenerating(false)
  }

  async function saveActual(id: string) {
    await fetch('/api/pos/production-plan', {
      method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id, actual_qty: parseInt(editVal) || 0 }),
    })
    setPlans(p => p.map(x => x.id===id ? {...x, actual_qty: parseInt(editVal)||0} : x))
    setEditing(null)
  }

  const total = plans.reduce((s,p) => s + p.planned_qty, 0)
  const done  = plans.filter(p => p.actual_qty != null).length

  return (
    <div style={{minHeight:'100%', background:C.bg, color:C.text, fontFamily:"'Manrope',sans-serif", padding:'24px 28px', maxWidth:900, margin:'0 auto'}}>
      <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24}}>
        <div>
          <h1 style={{fontSize:22, fontWeight:800, marginBottom:4}}>Production Planning</h1>
          <p style={{fontSize:13, color:C.muted}}>Plan how much to bake each day based on sales history. Track actual vs planned production.</p>
        </div>
        <div style={{display:'flex', gap:10, alignItems:'center'}}>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)}
            style={{...iS, width:160}} />
          <button onClick={aiGenerate} disabled={generating}
            style={{padding:'9px 18px', borderRadius:9, border:'none', background:'linear-gradient(135deg,#8B5CF6,#6D28D9)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap', opacity:generating?0.6:1}}>
            {generating ? '✨ Generating…' : '✨ AI plan'}
          </button>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:24}}>
        {[
          { label:'Products to produce', value:plans.length, color:C.violet },
          { label:'Total units planned', value:total, color:C.amber },
          { label:'Completed', value:`${done}/${plans.length}`, color:C.green },
        ].map(s => (
          <div key={s.label} style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:'16px 20px'}}>
            <div style={{fontSize:28, fontWeight:800, color:s.color, lineHeight:1}}>{s.value}</div>
            <div style={{fontSize:12, color:C.muted, marginTop:4}}>{s.label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{color:C.muted, textAlign:'center', padding:'40px 0'}}>Loading…</div>
      ) : message && plans.length === 0 ? (
        <div style={{background:'rgba(245,158,11,0.07)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:12, padding:'20px 24px', color:'#F59E0B', fontSize:13, lineHeight:1.6}}>
          ⚠️ {message}
        </div>
      ) : plans.length === 0 ? (
        <div style={{textAlign:'center', padding:'40px 0'}}>
          <div style={{fontSize:40, marginBottom:12}}>🥐</div>
          <div style={{fontSize:15, fontWeight:700, marginBottom:8}}>No plan for {fmt(date)}</div>
          <div style={{fontSize:13, color:C.muted, marginBottom:20}}>Click "AI plan" to auto-generate based on your sales history</div>
          <button onClick={aiGenerate} disabled={generating}
            style={{padding:'10px 24px', borderRadius:9, border:'none', background:C.violet, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit'}}>
            {generating ? 'Generating…' : '✨ Generate AI plan'}
          </button>
        </div>
      ) : (
        <>
          <div style={{display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr', gap:0, padding:'8px 16px', fontSize:11, fontWeight:700, color:C.dim, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4}}>
            <span>Product</span><span style={{textAlign:'center'}}>Planned</span><span style={{textAlign:'center'}}>Actual</span><span style={{textAlign:'center'}}>Status</span>
          </div>
          {plans.map(p => {
            const pct = p.actual_qty != null ? (p.actual_qty / p.planned_qty) * 100 : null
            const statusColor = pct == null ? C.dim : pct >= 100 ? C.green : pct >= 80 ? C.amber : C.red
            const statusLabel = pct == null ? 'Pending' : pct >= 100 ? '✅ Done' : `${Math.round(pct)}%`
            return (
              <div key={p.id} style={{display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr', gap:0, padding:'12px 16px', background:C.card, border:`1px solid ${C.border}`, borderRadius:10, marginBottom:4, alignItems:'center'}}>
                <div>
                  <div style={{fontSize:14, fontWeight:600}}>{p.product_name}</div>
                  {p.notes && <div style={{fontSize:11, color:C.dim, marginTop:2}}>{p.notes}</div>}
                </div>
                <div style={{textAlign:'center', fontSize:16, fontWeight:700}}>{p.planned_qty}</div>
                <div style={{textAlign:'center'}}>
                  {editing === p.id ? (
                    <div style={{display:'flex', gap:4, justifyContent:'center'}}>
                      <input autoFocus type="number" value={editVal} onChange={e=>setEditVal(e.target.value)}
                        onKeyDown={e=>{ if(e.key==='Enter') saveActual(p.id); if(e.key==='Escape') setEditing(null) }}
                        style={{...iS, width:60, padding:'4px 8px', textAlign:'center'}} />
                      <button onClick={()=>saveActual(p.id)} style={{padding:'4px 8px', borderRadius:6, border:'none', background:C.green, color:'#000', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit'}}>✓</button>
                    </div>
                  ) : (
                    <button onClick={()=>{ setEditing(p.id); setEditVal(String(p.actual_qty ?? '')) }}
                      style={{fontSize:16, fontWeight:700, color:p.actual_qty!=null?C.text:C.dim, background:'transparent', border:'none', cursor:'pointer', fontFamily:'inherit'}}>
                      {p.actual_qty ?? '—'}
                    </button>
                  )}
                </div>
                <div style={{textAlign:'center', fontSize:12, fontWeight:700, color:statusColor}}>{statusLabel}</div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
