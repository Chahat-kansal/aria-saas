'use client';
import { useState, useEffect } from 'react';
interface S { loyalty_enabled: boolean; loyalty_program_name: string; loyalty_points_per_dollar: number; loyalty_redemption_rate: number; loyalty_welcome_bonus: number; loyalty_birthday_bonus: number; }
const DEF: S = { loyalty_enabled: false, loyalty_program_name: 'Rewards', loyalty_points_per_dollar: 1, loyalty_redemption_rate: 100, loyalty_welcome_bonus: 0, loyalty_birthday_bonus: 0 };
export default function LoyaltyProgramPage() {
  const [s, setS] = useState<S>(DEF);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { fetch('/api/pos/settings').then(r=>r.json()).then(d=>{ if(d.settings) setS({...DEF,...d.settings}); }); }, []);
  async function save() {
    setSaving(true);
    await fetch('/api/pos/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(s)});
    setSaving(false); setSaved(true); setTimeout(()=>setSaved(false),2000);
  }
  const eg = s.loyalty_points_per_dollar > 0 && s.loyalty_redemption_rate > 0
    ? `$100 spend = ${(100*s.loyalty_points_per_dollar).toFixed(0)} pts = $${(100*s.loyalty_points_per_dollar/s.loyalty_redemption_rate).toFixed(2)} discount`
    : '';
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6"><h1 className="text-xl font-semibold text-[#1a1a16]">Loyalty Program</h1><p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Reward repeat customers with points</p></div>
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-5">
          <Row label="Enable loyalty program" sub="Customers earn points on every purchase"><Toggle value={s.loyalty_enabled} onChange={v=>setS(p=>({...p,loyalty_enabled:v}))} /></Row>
        </div>
        {s.loyalty_enabled && (<>
          <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-5 space-y-4">
            <Field label="Program name"><input value={s.loyalty_program_name} onChange={e=>setS(p=>({...p,loyalty_program_name:e.target.value}))} className="input" placeholder="e.g. Clayton Rewards" /></Field>
            <Field label="Points per $1 spent"><input type="number" min={0} step={0.5} value={s.loyalty_points_per_dollar} onChange={e=>setS(p=>({...p,loyalty_points_per_dollar:parseFloat(e.target.value)||0}))} className="input w-28" /></Field>
            <Field label="Points needed for $1 discount"><input type="number" min={1} value={s.loyalty_redemption_rate} onChange={e=>setS(p=>({...p,loyalty_redemption_rate:parseFloat(e.target.value)||100}))} className="input w-28" /></Field>
            {eg && <p className="text-xs text-[rgba(26,26,22,.45)] bg-[rgba(0,0,0,.03)] rounded-lg px-3 py-2">{eg}</p>}
          </div>
          <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-5 space-y-4">
            <h3 className="text-sm font-semibold text-[#1a1a16]">Bonus Points</h3>
            <Field label="Welcome bonus (new customers)"><input type="number" min={0} value={s.loyalty_welcome_bonus} onChange={e=>setS(p=>({...p,loyalty_welcome_bonus:parseInt(e.target.value)||0}))} className="input w-28" /></Field>
            <Field label="Birthday bonus points"><input type="number" min={0} value={s.loyalty_birthday_bonus} onChange={e=>setS(p=>({...p,loyalty_birthday_bonus:parseInt(e.target.value)||0}))} className="input w-28" /></Field>
          </div>
        </>)}
      </div>
      <div className="mt-6"><button onClick={save} disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-[#1a1a16] text-white disabled:opacity-50">{saving?'Saving…':saved?'✓ Saved':'Save changes'}</button></div>
      <style jsx>{`.input{width:100%;border:1px solid rgba(0,0,0,.1);border-radius:12px;padding:8px 12px;font-size:13px;outline:none;background:white;}`}</style>
    </div>
  );
}
function Row({label,sub,children}:{label:string;sub?:string;children:React.ReactNode}){return <div className="flex items-center justify-between gap-4"><div><p className="text-sm text-[rgba(26,26,22,.8)]">{label}</p>{sub&&<p className="text-xs text-[rgba(26,26,22,.4)] mt-0.5">{sub}</p>}</div>{children}</div>;}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div><label className="block text-xs font-medium text-[rgba(26,26,22,.5)] mb-1.5">{label}</label>{children}</div>;}
function Toggle({value,onChange}:{value:boolean;onChange:(v:boolean)=>void}){return <button onClick={()=>onChange(!value)} className={`relative rounded-full transition-colors flex-shrink-0 ${value?'bg-[#8B5CF6]':'bg-[rgba(0,0,0,.15)]'}`} style={{width:44,height:24}}><span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${value?'left-5':'left-0.5'}`}/></button>;}
