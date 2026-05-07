'use client'
import { useState, useEffect, useCallback } from 'react'

const C = { bg:'var(--bg-base)',card:'var(--bg-surface)',border:'transparent',text:'var(--text-primary)',muted:'var(--text-secondary)',dim:'var(--text-tertiary)',violet:'#8B5CF6',green:'#22C55E',red:'#EF4444',amber:'#F59E0B',cyan:'#00E5FF' }
const iS: React.CSSProperties = { background:'rgba(255,255,255,0.04)', border:`1px solid ${C.border}`, borderRadius:8, padding:'6px 10px', fontSize:12, color:C.text, outline:'none', fontFamily:'inherit' }
const btn = (active=false,col='#8B5CF6'): React.CSSProperties => ({ padding:'6px 14px', borderRadius:8, border:`1px solid ${active?col:C.border}`, background:active?col+'20':'transparent', color:active?col:C.muted, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' })

interface Sale { id:string; sale_number?:string; total_amount:number; tax_amount?:number; discount_amount?:number; payment_method?:string; status?:string; created_at:string; served_by?:string|null; customer_id?:string|null; outlet_id?:string|null; session_id?:string|null; }
interface SaleDetail { id:string; sale_number?:string; total_amount:number; tax_amount:number; discount_amount:number; payment_method:string; status:string; created_at:string; served_by?:string|null; notes?:string|null; pos_customers?:{name:string;email:string|null}|null; pos_sale_items?:{id:string;product_name:string;quantity:number;unit_price:number;line_total:number;discount_percent:number}[]|null; }
interface ReturnItem { id:string; product_name:string; quantity:number; line_total:number; return_qty:number; selected:boolean }

function fmtDate(d:string){return new Date(d).toLocaleDateString('en-AU',{day:'2-digit',month:'2-digit',year:'numeric'})+' '+new Date(d).toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}
function fmtAmt(v:number){const s=v.toFixed(2);const[d,c]=s.split('.');return{dollars:'A$'+d,cents:'.'+c}}

export default function SalesHistoryPage() {
  const [bid,setBid]=useState<string|null>(null)
  const [sales,setSales]=useState<Sale[]>([])
  const [loading,setLoading]=useState(true)
  const [selectedId,setSelectedId]=useState<string|null>(null)
  const [detail,setDetail]=useState<SaleDetail|null>(null)
  const [detailLoading,setDetailLoading]=useState(false)
  const [from,setFrom]=useState(()=>new Date(Date.now()-29*86400000).toISOString().split('T')[0])
  const [to,setTo]=useState(()=>new Date().toISOString().split('T')[0])
  const [amtFrom,setAmtFrom]=useState('')
  const [amtTo,setAmtTo]=useState('')
  const [advanced,setAdvanced]=useState(false)
  const [cashier,setCashier]=useState('')
  const [payMethod,setPayMethod]=useState('')
  const [ariaInsight,setAriaInsight]=useState<string|null>(null)
  const [showReturn,setShowReturn]=useState(false)
  const [returnItems,setReturnItems]=useState<ReturnItem[]>([])
  const [returnReason,setReturnReason]=useState('customer_changed_mind')
  const [processing,setProcessing]=useState(false)
  const [showEmail,setShowEmail]=useState(false)
  const [emailAddr,setEmailAddr]=useState('')
  const [emailSending,setEmailSending]=useState(false)
  const [toast,setToast]=useState<string|null>(null)

  const showToast=(msg:string)=>{setToast(msg);setTimeout(()=>setToast(null),2500)}

  useEffect(()=>{
    fetch('/api/pos/products').then(r=>r.json()).then(d=>{if(d.business_id)setBid(d.business_id)})
  },[])

  const load=useCallback(()=>{
    setLoading(true)
    fetch(`/api/pos/reports/sales?from=${from}&to=${to}`).then(r=>r.json()).then(d=>{
      setSales((d.sales??[]).filter((s:Sale)=>s.total_amount>0))
      // Aria daily summary
      const today=d.sales?.filter((s:Sale)=>s.created_at.startsWith(new Date().toISOString().split('T')[0]))??[]
      const todayTotal=today.reduce((s:number,x:Sale)=>s+(x.total_amount||0),0)
      if(today.length>0)setAriaInsight(`Today: ${today.length} sales totalling A$${todayTotal.toFixed(2)}. ${d.transaction_count??0} total transactions this period.`)
      setLoading(false)
    }).catch(()=>setLoading(false))
  },[from,to])

  useEffect(()=>{if(bid)load()},[bid,load])

  async function openDetail(id:string){
    setSelectedId(id);setDetailLoading(true);setShowReturn(false);setShowEmail(false)
    const res=await fetch(`/api/pos/sales/${id}`)
    const d=await res.json()
    const s=d.sale
    setDetail(s)
    setEmailAddr((s?.pos_customers as any)?.email??'')
    setDetailLoading(false)
  }

  function openReturn(){
    if(!detail?.pos_sale_items)return
    setReturnItems(detail.pos_sale_items.map(i=>({id:i.id,product_name:i.product_name,quantity:i.quantity,line_total:i.line_total,return_qty:i.quantity,selected:true})))
    setShowReturn(true)
  }

  async function processReturn(){
    if(!detail||!bid)return
    setProcessing(true)
    const items=returnItems.filter(i=>i.selected&&i.return_qty>0)
    await fetch('/api/pos/sales/return',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({original_sale_id:detail.id,business_id:bid,items:items.map(i=>({product_name:i.product_name,quantity:i.return_qty,line_total:-(i.line_total/i.quantity*i.return_qty)})),reason:returnReason})})
    setShowReturn(false);setProcessing(false);showToast('Return processed')
  }

  async function cancelSale(){
    if(!detail||!bid||!confirm('Cancel this sale? This cannot be undone.'))return
    setProcessing(true)
    await fetch(`/api/pos/sales/${detail.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'cancelled'})})
    setProcessing(false);showToast('Sale cancelled');load();setSelectedId(null)
  }

  async function sendEmail(){
    if(!emailAddr.trim()||!detail||!bid)return
    setEmailSending(true)
    const res=await fetch('/api/pos/email-receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sale_id:detail.id,email:emailAddr.trim(),business_id:bid})})
    setEmailSending(false);setShowEmail(false)
    if(res.ok)showToast('Receipt sent!')
    else showToast('Email failed')
  }

  const filtered=sales.filter(s=>{
    if(amtFrom&&s.total_amount<parseFloat(amtFrom))return false
    if(amtTo&&s.total_amount>parseFloat(amtTo))return false
    if(cashier&&!(s.served_by?.toLowerCase().includes(cashier.toLowerCase())))return false
    if(payMethod&&s.payment_method!==payMethod)return false
    return true
  })

  const PAY_COL:Record<string,string>={card:C.cyan,cash:C.green,eftpos:C.cyan,split:C.amber,gift_card:C.violet}

  return (
    <div style={{minHeight:'100%',background:C.bg,color:C.text,fontFamily:"'Manrope',sans-serif",display:'flex',flexDirection:'column'}}>
      {toast&&<div style={{position:'fixed',bottom:24,right:24,background:'#1a1a2e',border:`1px solid ${C.border}`,borderRadius:10,padding:'10px 18px',fontSize:13,color:C.text,zIndex:100,boxShadow:'0 4px 20px rgba(0,0,0,0.5)'}}>{toast}</div>}
      <div style={{padding:'20px 20px 0',flexShrink:0}}>
        <h1 style={{fontSize:18,fontWeight:700,marginBottom:16}}>Sales History</h1>
        {ariaInsight&&<div style={{background:'rgba(139,92,246,0.08)',border:`1px solid rgba(139,92,246,0.25)`,borderRadius:10,padding:'10px 14px',marginBottom:14,fontSize:12,color:C.muted}}>✨ {ariaInsight}</div>}
        {/* Filter bar */}
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:8}}>
          <input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={iS}/>
          <span style={{color:C.dim,fontSize:12}}>—</span>
          <input type="date" value={to} onChange={e=>setTo(e.target.value)} style={iS}/>
          <input value={amtFrom} onChange={e=>setAmtFrom(e.target.value)} placeholder="Amount from $" style={{...iS,width:110}}/>
          <input value={amtTo} onChange={e=>setAmtTo(e.target.value)} placeholder="Amount to $" style={{...iS,width:110}}/>
          <button onClick={()=>setAdvanced(a=>!a)} style={{...btn(advanced)}}>{advanced?'Hide Filters':'Show Advanced'}</button>
          <button onClick={load} style={{...btn(true,C.cyan),marginLeft:'auto'}}>Filter</button>
        </div>
        {advanced&&(
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:8}}>
            <input value={cashier} onChange={e=>setCashier(e.target.value)} placeholder="Cashier name" style={{...iS,width:150}}/>
            <select value={payMethod} onChange={e=>setPayMethod(e.target.value)} style={iS}>
              <option value="">All payment methods</option>
              {['cash','card','eftpos','split','gift_card'].map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        )}
        <p style={{fontSize:11,color:C.dim,marginBottom:12}}>{filtered.length} results</p>
      </div>

      {/* List + Detail panel */}
      <div style={{flex:1,display:'flex',overflow:'hidden',minHeight:0}}>
        {/* List */}
        <div style={{flex:selectedId?'0 0 50%':'1',overflowY:'auto',borderRight:selectedId?`1px solid ${C.border}`:'none'}}>
          {loading?<p style={{padding:24,color:C.dim,fontSize:13}}>Loading…</p>:filtered.length===0?<p style={{padding:24,color:C.dim,fontSize:13}}>No sales found</p>:(
            filtered.map((s,i)=>{
              const{dollars,cents}=fmtAmt(s.total_amount)
              const active=selectedId===s.id
              return(
                <div key={s.id} onClick={()=>active?setSelectedId(null):openDetail(s.id)}
                  style={{display:'flex',alignItems:'center',gap:10,padding:'10px 20px',cursor:'pointer',borderBottom:`1px solid ${C.border}`,background:active?'rgba(139,92,246,0.08)':i%2===0?'transparent':'rgba(255,255,255,0.01)'}}>
                  <span style={{fontSize:16,color:s.status==='cancelled'?C.red:C.green,flexShrink:0}}>{s.status==='cancelled'?'✗':'✓'}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:2}}>
                      <span style={{fontSize:11,color:C.dim}}>{fmtDate(s.created_at)}</span>
                      <span style={{fontSize:11,color:C.violet,fontFamily:'monospace'}}>#{s.sale_number??s.id.slice(-8).toUpperCase()}</span>
                    </div>
                    {s.served_by&&<p style={{fontSize:11,color:C.muted}}>{s.served_by}</p>}
                  </div>
                  <div style={{textAlign:'right',flexShrink:0}}>
                    <span style={{fontSize:16,fontWeight:700,color:C.text,fontFamily:'monospace'}}>{dollars}</span>
                    <span style={{fontSize:11,color:C.muted,fontFamily:'monospace'}}>{cents}</span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Detail panel */}
        {selectedId&&(
          <div style={{flex:'0 0 50%',overflowY:'auto',padding:'16px 18px',background:'var(--bg-surface)'}}>
            {detailLoading?<p style={{color:C.dim,fontSize:13}}>Loading…</p>:detail&&(
              <>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16}}>
                  <div>
                    <p style={{fontSize:11,color:C.dim}}>{fmtDate(detail.created_at)}</p>
                    <p style={{fontSize:24,fontWeight:800,color:C.text,fontFamily:'monospace',lineHeight:1.1}}>A${detail.total_amount.toFixed(2)}</p>
                    <p style={{fontSize:12,color:C.violet,fontFamily:'monospace',marginTop:2}}>#{detail.sale_number??detail.id.slice(-8).toUpperCase()}</p>
                    {(detail.pos_customers as any)?.name&&<p style={{fontSize:12,color:C.muted,marginTop:4}}>{(detail.pos_customers as any).name}</p>}
                  </div>
                  <span style={{fontSize:11,padding:'3px 10px',borderRadius:99,fontWeight:700,background:detail.status==='completed'?'rgba(34,197,94,0.15)':detail.status==='cancelled'?'rgba(239,68,68,0.15)':'rgba(139,92,246,0.15)',color:detail.status==='completed'?C.green:detail.status==='cancelled'?C.red:C.violet}}>
                    {detail.status==='completed'?'✓ Completed':detail.status==='cancelled'?'✗ Cancelled':'⏳ '+detail.status}
                  </span>
                </div>

                {/* Items */}
                {(detail.pos_sale_items||[]).length>0&&(
                  <div style={{background:C.card,borderRadius:10,overflow:'hidden',marginBottom:12}}>
                    {(detail.pos_sale_items||[]).map((item,i)=>(
                      <div key={item.id} style={{display:'flex',justifyContent:'space-between',padding:'8px 12px',borderBottom:i<(detail.pos_sale_items?.length??0)-1?`1px solid ${C.border}`:'none'}}>
                        <span style={{fontSize:13,color:C.text}}>{item.quantity}× {item.product_name}</span>
                        <span style={{fontSize:13,color:C.text,fontFamily:'monospace'}}>A${item.line_total.toFixed(2)}</span>
                      </div>
                    ))}
                    <div style={{display:'flex',justifyContent:'space-between',padding:'8px 12px',background:'rgba(139,92,246,0.06)',borderTop:`1px solid ${C.border}`}}>
                      <span style={{fontSize:12,color:C.muted,textTransform:'uppercase'}}>{(detail.payment_method??'card').toUpperCase()}</span>
                      <span style={{fontSize:13,fontWeight:700,color:C.text,fontFamily:'monospace'}}>A${detail.total_amount.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {/* Financial summary */}
                <div style={{background:C.card,borderRadius:10,padding:'10px 12px',marginBottom:12}}>
                  {[
                    ['Base Price',`A$${detail.total_amount.toFixed(2)}`],
                    ['Discount',`A$${(detail.discount_amount??0).toFixed(2)}`],
                    ['GST',`A$${(detail.tax_amount??0).toFixed(2)}`],
                  ].map(([k,v])=>(
                    <div key={k} style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                      <span style={{fontSize:12,color:C.muted}}>{k}</span>
                      <span style={{fontSize:12,color:C.text,fontFamily:'monospace'}}>{v}</span>
                    </div>
                  ))}
                </div>

                {/* Action buttons */}
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  <button onClick={()=>setSelectedId(null)} style={{padding:'8px',borderRadius:8,border:'none',background:C.cyan+'20',color:C.cyan,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>✕ Close</button>
                  <button onClick={()=>window.print()} style={{padding:'8px',borderRadius:8,border:`1px solid ${C.border}`,background:'transparent',color:C.text,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>🖨 Reprint Receipt</button>
                  <button onClick={()=>setShowEmail(true)} style={{padding:'8px',borderRadius:8,border:`1px solid ${C.border}`,background:'transparent',color:C.text,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>✉️ Email Receipt</button>
                  {detail.status!=='cancelled'&&(
                    <>
                      <button onClick={openReturn} style={{padding:'8px',borderRadius:8,border:`1px solid ${C.border}`,background:'transparent',color:C.text,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>↩ Return Items</button>
                      <button onClick={cancelSale} disabled={processing} style={{padding:'8px',borderRadius:8,border:`1px solid rgba(239,68,68,0.3)`,background:'rgba(239,68,68,0.05)',color:C.red,fontSize:12,cursor:'pointer',fontFamily:'inherit',opacity:processing?0.6:1}}>✗ Cancel Sale</button>
                    </>
                  )}
                </div>

                {/* Email modal */}
                {showEmail&&(
                  <div style={{marginTop:12,background:C.card,borderRadius:10,padding:'12px 14px',border:`1px solid ${C.border}`}}>
                    <p style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:8}}>Email Receipt</p>
                    <input value={emailAddr} onChange={e=>setEmailAddr(e.target.value)} placeholder="customer@email.com" type="email" style={{...iS,width:'100%',boxSizing:'border-box',marginBottom:8}}/>
                    <div style={{display:'flex',gap:6}}>
                      <button onClick={sendEmail} disabled={emailSending||!emailAddr.trim()} style={{...btn(true,C.violet),flex:1,opacity:emailSending?0.6:1}}>{emailSending?'Sending…':'Send'}</button>
                      <button onClick={()=>setShowEmail(false)} style={{...btn(),flex:1}}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* Return modal */}
                {showReturn&&(
                  <div style={{marginTop:12,background:C.card,borderRadius:10,padding:'12px 14px',border:`1px solid ${C.border}`}}>
                    <p style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:8}}>Return Items</p>
                    {returnItems.map((item,i)=>(
                      <div key={item.id} style={{display:'flex',gap:8,alignItems:'center',marginBottom:6}}>
                        <input type="checkbox" checked={item.selected} onChange={e=>setReturnItems(r=>r.map((x,j)=>j===i?{...x,selected:e.target.checked}:x))}/>
                        <span style={{flex:1,fontSize:12,color:C.text}}>{item.product_name}</span>
                        <input type="number" min={0} max={item.quantity} value={item.return_qty}
                          onChange={e=>setReturnItems(r=>r.map((x,j)=>j===i?{...x,return_qty:parseInt(e.target.value)||0}:x))}
                          style={{...iS,width:52,padding:'4px 6px',textAlign:'center'}}/>
                        <span style={{fontSize:11,color:C.muted}}>of {item.quantity}</span>
                      </div>
                    ))}
                    <select value={returnReason} onChange={e=>setReturnReason(e.target.value)} style={{...iS,width:'100%',marginTop:6,marginBottom:8,boxSizing:'border-box'}}>
                      <option value="customer_changed_mind">Customer changed mind</option>
                      <option value="defective">Defective product</option>
                      <option value="wrong_item">Wrong item</option>
                      <option value="overcharge">Overcharge</option>
                      <option value="other">Other</option>
                    </select>
                    <div style={{display:'flex',gap:6}}>
                      <button onClick={processReturn} disabled={processing} style={{...btn(true,C.green),flex:1,opacity:processing?0.6:1}}>{processing?'Processing…':'Process Return'}</button>
                      <button onClick={()=>setShowReturn(false)} style={{...btn(),flex:1}}>Cancel</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
