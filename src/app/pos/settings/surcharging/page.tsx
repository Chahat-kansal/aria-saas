'use client';
import { useState, useEffect } from 'react';
interface S { surcharge_enabled: boolean; surcharge_type: string; surcharge_value: number; surcharge_applies_to: string; surcharge_minimum_amount: number; surcharge_show_on_receipt: boolean; }
const DEF: S = { surcharge_enabled: false, surcharge_type: 'percent', surcharge_value: 0, surcharge_applies_to: 'card', surcharge_minimum_amount: 0, surcharge_show_on_receipt: true };
export default function SurchargingPage() {
  const [s, setS] = useState<S>(DEF);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { fetch('/api/pos/settings').then(r=>r.json()).then(d=>{ if(d.settings) setS({...DEF,...d.settings}); }); }, []);
  async function save() {
    setSaving(true);
    await fetch('/api/pos/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(s)});
    setSaving(false); setSaved(true); setTimeout(()=>setSaved(false),2000);
  }
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6"><h1 className="text-xl font-semibold text-[#1a1a16]">Surcharging</h1><p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Pass on payment processing fees to customers</p></div>
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-5">
          <Row label="Enable surcharging" sub="Add a fee to applicable transactions"><Toggle value={s.surcharge_enabled} onChange={v=>setS(p=>({...p,surcharge_enabled:v}))} /></Row>
        </div>
        {s.surcharge_enabled && (<>
          <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-5 space-y-4">
            <div>
              <label className="block text-xs text-[rgba(26,26,22,.5)] mb-2">Surcharge type</label>
              <div className="flex gap-2">
                {[['percent','Percentage'],['fixed','Fixed amount']].map(([v,l])=>(
                  <button key={v} onClick={()=>setS(p=>({...p,surcharge_type:v}))}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${s.surcharge_type===v?'bg-[#1a1a16] text-white border-[#1a1a16]':'border-[rgba(0,0,0,.1)] text-[rgba(26,26,22,.6)]'}`}>{l}</button>
                ))}
              </div>
            </div>
            <Row label={s.surcharge_type==='percent'?'Surcharge %':'Surcharge amount ($)'}>
              <input type="number" min={0} step={0.1} value={s.surcharge_value} onChange={e=>setS(p=>({...p,surcharge_value:parseFloat(e.target.value)||0}))} className="w-24 border border-[rgba(0,0,0,.1)] rounded-xl px-3 py-1.5 text-sm outline-none text-right" />
            </Row>
            <div>
              <label className="block text-xs text-[rgba(26,26,22,.5)] mb-2">Applies to</label>
              <select value={s.surcharge_applies_to} onChange={e=>setS(p=>({...p,surcharge_applies_to:e.target.value}))} className="w-full border border-[rgba(0,0,0,.1)] rounded-xl px-3 py-2 text-sm outline-none bg-white">
                <option value="card">Card payments only</option><option value="all">All transactions</option><option value="eftpos">EFTPOS only</option>
              </select>
            </div>
            <Row label="Minimum transaction for surcharge ($)">
              <input type="number" min={0} step={1} value={s.surcharge_minimum_amount} onChange={e=>setS(p=>({...p,surcharge_minimum_amount:parseFloat(e.target.value)||0}))} className="w-24 border border-[rgba(0,0,0,.1)] rounded-xl px-3 py-1.5 text-sm outline-none text-right" />
            </Row>
            <Row label="Show surcharge on receipt"><Toggle value={s.surcharge_show_on_receipt} onChange={v=>setS(p=>({...p,surcharge_show_on_receipt:v}))} /></Row>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-xs text-amber-700 font-medium">Australian surcharging rules</p>
            <p className="text-xs text-amber-600 mt-1">Under the RBA's surcharging standard, surcharges must not exceed the actual cost of acceptance. EFTPOS/Visa/Mastercard: typically 0.5–1.5%.</p>
          </div>
        </>)}
      </div>
      <div className="mt-6"><button onClick={save} disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-[#1a1a16] text-white disabled:opacity-50">{saving?'Saving…':saved?'✓ Saved':'Save changes'}</button></div>
    </div>
  );
}
function Row({label,sub,children}:{label:string;sub?:string;children:React.ReactNode}){return <div className="flex items-center justify-between gap-4"><div><p className="text-sm text-[rgba(26,26,22,.8)]">{label}</p>{sub&&<p className="text-xs text-[rgba(26,26,22,.4)] mt-0.5">{sub}</p>}</div>{children}</div>;}
function Toggle({value,onChange}:{value:boolean;onChange:(v:boolean)=>void}){return <button onClick={()=>onChange(!value)} className={`relative rounded-full transition-colors flex-shrink-0 ${value?'bg-[#1D9E75]':'bg-[rgba(0,0,0,.15)]'}`} style={{width:44,height:24}}><span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${value?'left-5':'left-0.5'}`}/></button>;}
