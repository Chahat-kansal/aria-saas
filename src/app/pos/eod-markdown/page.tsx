'use client'
import { useState, useEffect, useCallback } from 'react'

interface Rule {
  id: string; name: string; trigger_time: string; discount_pct: number
  is_active: boolean; days_of_week: number[]; category_id: string | null
}
interface Category { id: string; name: string }

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const C = {
  bg: 'var(--bg-base)', card: 'var(--bg-surface)', text: 'var(--text-primary)',
  muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)',
  violet: '#8B5CF6', green: '#22C55E', red: '#EF4444', amber: '#F59E0B',
  border: 'rgba(255,255,255,0.07)',
}
const iS: React.CSSProperties = {
  background:'var(--bg-base)', border:`1px solid ${C.border}`, borderRadius:8,
  padding:'9px 12px', fontSize:13, color:C.text, outline:'none',
  fontFamily:'inherit', width:'100%', boxSizing:'border-box',
}

export default function EodMarkdownPage() {
  const [rules, setRules] = useState<Rule[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name:'End of day discount', trigger_time:'16:00', discount_pct:'50', category_id:'', days_of_week:[0,1,2,3,4,5,6] as number[] })

  const load = useCallback(async () => {
    setLoading(true)
    const [rRes, cRes] = await Promise.all([
      fetch('/api/pos/eod-markdown'),
      fetch('/api/pos/categories'),
    ])
    const rd = await rRes.json() as { rules?: Rule[] }
    const cd = await cRes.json() as { categories?: Category[] }
    setRules(rd.rules ?? []); setCats(cd.categories ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function add() {
    setSaving(true)
    const res = await fetch('/api/pos/eod-markdown', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ ...form, discount_pct: parseFloat(form.discount_pct), category_id: form.category_id || null }),
    })
    if (res.ok) { setShowAdd(false); load() }
    setSaving(false)
  }

  async function toggle(id: string, is_active: boolean) {
    await fetch('/api/pos/eod-markdown', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id, is_active:!is_active }) })
    setRules(r => r.map(x => x.id===id ? {...x, is_active:!is_active} : x))
  }

  async function remove(id: string) {
    if (!confirm('Delete this rule?')) return
    await fetch('/api/pos/eod-markdown', { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id }) })
    setRules(r => r.filter(x => x.id !== id))
  }

  function toggleDay(d: number) {
    setForm(f => ({ ...f, days_of_week: f.days_of_week.includes(d) ? f.days_of_week.filter(x=>x!==d) : [...f.days_of_week, d].sort() }))
  }

  return (
    <div style={{minHeight:'100%', background:C.bg, color:C.text, fontFamily:"'Manrope',sans-serif", padding:'24px 28px', maxWidth:800, margin:'0 auto'}}>
      <div style={{marginBottom:24}}>
        <h1 style={{fontSize:22, fontWeight:800, marginBottom:4}}>End-of-Day Markdown</h1>
        <p style={{fontSize:13, color:C.muted}}>Automatically discount products after a set time — perfect for bakeries, delis, and fresh produce. Staff see a banner in the terminal when markdowns are active.</p>
      </div>

      <div style={{background:'rgba(245,158,11,0.07)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:10, padding:'10px 16px', marginBottom:24, fontSize:12, color:C.muted}}>
        ⏰ When a rule is active, the terminal shows a yellow banner "EOD markdown active — X% off [category]". Cashiers can apply it with one tap or override per item.
      </div>

      {loading ? <div style={{color:C.muted, textAlign:'center', padding:'40px 0'}}>Loading…</div> : (
        <>
          <div style={{display:'flex', flexDirection:'column', gap:12, marginBottom:20}}>
            {rules.map(r => (
              <div key={r.id} style={{background:C.card, border:`1px solid ${r.is_active ? 'rgba(245,158,11,0.25)' : C.border}`, borderRadius:12, padding:'16px 20px', display:'flex', alignItems:'center', gap:16}}>
                <div style={{flex:1}}>
                  <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:6}}>
                    <span style={{fontSize:14, fontWeight:700}}>⏰ {r.name}</span>
                    <span style={{fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:99, background:r.is_active?'rgba(245,158,11,0.12)':'rgba(255,255,255,0.05)', color:r.is_active?C.amber:C.dim}}>{r.is_active?'Active':'Inactive'}</span>
                  </div>
                  <div style={{fontSize:12, color:C.muted, display:'flex', gap:16}}>
                    <span>🕐 After {r.trigger_time}</span>
                    <span>💸 {r.discount_pct}% off</span>
                    <span>📅 {(r.days_of_week ?? [0,1,2,3,4,5,6]).map(d => DAYS[d]).join(', ')}</span>
                    {r.category_id && <span>📁 {cats.find(c=>c.id===r.category_id)?.name ?? 'Category'}</span>}
                  </div>
                </div>
                <div style={{display:'flex', gap:8}}>
                  <button onClick={() => toggle(r.id, r.is_active)} style={{padding:'7px 14px', borderRadius:8, border:`1px solid ${C.border}`, background:'transparent', color:r.is_active?C.red:C.green, fontSize:12, cursor:'pointer', fontFamily:'inherit'}}>
                    {r.is_active?'Pause':'Enable'}
                  </button>
                  <button onClick={() => remove(r.id)} style={{padding:'7px 10px', borderRadius:8, border:`1px solid rgba(239,68,68,0.2)`, background:'transparent', color:C.red, fontSize:12, cursor:'pointer', fontFamily:'inherit'}}>🗑</button>
                </div>
              </div>
            ))}
            {rules.length === 0 && <div style={{textAlign:'center', padding:'30px 0', color:C.muted}}>No markdown rules yet.</div>}
          </div>

          {showAdd ? (
            <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:20}}>
              <div style={{fontSize:15, fontWeight:700, marginBottom:16}}>New markdown rule</div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12}}>
                <div>
                  <label style={{display:'block', fontSize:11, fontWeight:700, color:C.dim, marginBottom:5, textTransform:'uppercase', letterSpacing:'0.06em'}}>Rule name</label>
                  <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={iS} />
                </div>
                <div>
                  <label style={{display:'block', fontSize:11, fontWeight:700, color:C.dim, marginBottom:5, textTransform:'uppercase', letterSpacing:'0.06em'}}>Activate after (time)</label>
                  <input type="time" value={form.trigger_time} onChange={e=>setForm(f=>({...f,trigger_time:e.target.value}))} style={iS} />
                </div>
                <div>
                  <label style={{display:'block', fontSize:11, fontWeight:700, color:C.dim, marginBottom:5, textTransform:'uppercase', letterSpacing:'0.06em'}}>Discount %</label>
                  <input type="number" min="1" max="100" step="5" value={form.discount_pct} onChange={e=>setForm(f=>({...f,discount_pct:e.target.value}))} style={iS} />
                </div>
                <div>
                  <label style={{display:'block', fontSize:11, fontWeight:700, color:C.dim, marginBottom:5, textTransform:'uppercase', letterSpacing:'0.06em'}}>Category (optional)</label>
                  <select value={form.category_id} onChange={e=>setForm(f=>({...f,category_id:e.target.value}))} style={iS}>
                    <option value="">All products</option>
                    {cats.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{marginBottom:14}}>
                <label style={{display:'block', fontSize:11, fontWeight:700, color:C.dim, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.06em'}}>Active days</label>
                <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                  {DAYS.map((d,i) => (
                    <button key={i} onClick={()=>toggleDay(i)}
                      style={{padding:'6px 12px', borderRadius:8, border:`1px solid ${form.days_of_week.includes(i)?C.amber:C.border}`, background:form.days_of_week.includes(i)?'rgba(245,158,11,0.12)':'transparent', color:form.days_of_week.includes(i)?C.amber:C.muted, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{display:'flex', gap:10}}>
                <button onClick={()=>setShowAdd(false)} style={{padding:'9px 20px', borderRadius:9, border:`1px solid ${C.border}`, background:'transparent', color:C.muted, fontSize:13, cursor:'pointer', fontFamily:'inherit'}}>Cancel</button>
                <button onClick={add} disabled={saving} style={{padding:'9px 24px', borderRadius:9, border:'none', background:C.amber, color:'#000', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', opacity:saving?0.6:1}}>
                  {saving?'Creating…':'Create rule'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={()=>setShowAdd(true)} style={{width:'100%', padding:'14px 0', borderRadius:12, border:'2px dashed rgba(245,158,11,0.3)', background:'rgba(245,158,11,0.04)', color:C.amber, fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}>
              + Add markdown rule
            </button>
          )}
        </>
      )}
    </div>
  )
}
