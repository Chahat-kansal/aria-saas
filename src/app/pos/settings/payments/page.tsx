'use client';
import { useState, useEffect } from 'react';

interface S { default_payment_method: string; accept_cash: boolean; accept_card: boolean; accept_split: boolean; card_surcharge_percent: number; rounding: string; }
const DEF: S = { default_payment_method: 'card', accept_cash: true, accept_card: true, accept_split: true, card_surcharge_percent: 0, rounding: 'none' };

export default function PaymentMethodsPage() {
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
      <div className="mb-6"><h1 className="text-xl font-semibold text-[#1a1a16]">Payment Methods</h1><p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Configure accepted payment types and defaults</p></div>
      <div className="space-y-4">
        <Section title="Accepted Types">
          {([['accept_cash','Accept Cash'],['accept_card','Accept Card / EFTPOS'],['accept_split','Accept Split Payment']] as [keyof S,string][]).map(([k,l])=>(
            <Row key={k} label={l}><Toggle value={s[k] as boolean} onChange={v=>setS(p=>({...p,[k]:v}))} /></Row>
          ))}
        </Section>
        <Section title="Default Payment Method">
          <div className="grid grid-cols-3 gap-2">
            {[['cash','Cash'],['card','Card'],['split','Split']].map(([v,l])=>(
              <button key={v} onClick={()=>setS(p=>({...p,default_payment_method:v}))}
                className={`py-2 rounded-xl text-sm font-medium border transition-colors ${s.default_payment_method===v?'bg-[#1a1a16] text-white border-[#1a1a16]':'border-[rgba(0,0,0,.1)] text-[rgba(26,26,22,.6)]'}`}>{l}</button>
            ))}
          </div>
        </Section>
        <Section title="Cash Rounding">
          <select value={s.rounding} onChange={e=>setS(p=>({...p,rounding:e.target.value}))} className="w-full border border-[rgba(0,0,0,.1)] rounded-xl px-3 py-2 text-sm outline-none bg-white">
            <option value="none">No rounding</option><option value="5">Nearest 5 cents</option><option value="10">Nearest 10 cents</option><option value="dollar">Nearest dollar</option>
          </select>
        </Section>
        <Section title="Card Surcharge">
          <Row label="Surcharge %">
            <input type="number" min={0} max={10} step={0.1} value={s.card_surcharge_percent} onChange={e=>setS(p=>({...p,card_surcharge_percent:parseFloat(e.target.value)||0}))} className="w-24 border border-[rgba(0,0,0,.1)] rounded-xl px-3 py-1.5 text-sm outline-none text-right" />
          </Row>
          <p className="text-xs text-[rgba(26,26,22,.4)] mt-1">Set to 0 to disable. Max 10%.</p>
        </Section>
      </div>
      <div className="mt-6"><button onClick={save} disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-[#1a1a16] text-white disabled:opacity-50">{saving?'Saving…':saved?'✓ Saved':'Save changes'}</button></div>
    </div>
  );
}
function Section({title,children}:{title:string;children:React.ReactNode}){return <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-5"><h3 className="text-sm font-semibold text-[#1a1a16] mb-3">{title}</h3><div className="space-y-3">{children}</div></div>;}
function Row({label,children}:{label:string;children:React.ReactNode}){return <div className="flex items-center justify-between"><span className="text-sm text-[rgba(26,26,22,.7)]">{label}</span>{children}</div>;}
function Toggle({value,onChange}:{value:boolean;onChange:(v:boolean)=>void}){return <button onClick={()=>onChange(!value)} className={`relative rounded-full transition-colors flex-shrink-0 ${value?'bg-[#1D9E75]':'bg-[rgba(0,0,0,.15)]'}`} style={{width:44,height:24}}><span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${value?'left-5':'left-0.5'}`}/></button>;}
