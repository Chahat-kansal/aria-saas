'use client';
import { useState, useEffect } from 'react';
interface S { gst_rate: number; tax_inclusive: boolean; apply_gst_to_all: boolean; }
const DEF: S = { gst_rate: 10, tax_inclusive: true, apply_gst_to_all: true };
export default function TaxRatesPage() {
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
      <div className="mb-6"><h1 className="text-xl font-semibold text-[#1a1a16]">Tax Rates</h1><p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Configure GST and tax display settings</p></div>
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-5">
          <h3 className="text-sm font-semibold text-[#1a1a16] mb-4">GST Settings</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[rgba(26,26,22,.5)] mb-1.5">GST Rate (%)</label>
              <div className="flex items-center gap-3">
                <input type="number" min={0} max={100} step={0.5} value={s.gst_rate} onChange={e=>setS(p=>({...p,gst_rate:parseFloat(e.target.value)||0}))} className="w-28 border border-[rgba(0,0,0,.1)] rounded-xl px-3 py-2 text-sm outline-none" />
                <span className="text-sm text-[rgba(26,26,22,.4)]">Australia standard GST is 10%</span>
              </div>
            </div>
            <Row label="Tax-inclusive pricing" sub="Prices already include GST"><Toggle value={s.tax_inclusive} onChange={v=>setS(p=>({...p,tax_inclusive:v}))} /></Row>
            <Row label="Apply GST to all products" sub="New products default to GST-applicable"><Toggle value={s.apply_gst_to_all} onChange={v=>setS(p=>({...p,apply_gst_to_all:v}))} /></Row>
          </div>
        </div>
        <div className="bg-[rgba(29,158,117,0.06)] border border-[rgba(29,158,117,0.15)] rounded-2xl p-4">
          <p className="text-xs text-[#1a6645] font-medium">Country: Australia</p>
          <p className="text-xs text-[rgba(26,26,22,.5)] mt-1">Tax settings are fixed to Australian tax law. GST registration required for businesses with turnover &gt; $75,000.</p>
        </div>
      </div>
      <div className="mt-6"><button onClick={save} disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-[#1a1a16] text-white disabled:opacity-50">{saving?'Saving…':saved?'✓ Saved':'Save changes'}</button></div>
    </div>
  );
}
function Row({label,sub,children}:{label:string;sub?:string;children:React.ReactNode}){return <div className="flex items-center justify-between gap-4"><div><p className="text-sm text-[rgba(26,26,22,.8)]">{label}</p>{sub&&<p className="text-xs text-[rgba(26,26,22,.4)] mt-0.5">{sub}</p>}</div>{children}</div>;}
function Toggle({value,onChange}:{value:boolean;onChange:(v:boolean)=>void}){return <button onClick={()=>onChange(!value)} className={`relative rounded-full transition-colors flex-shrink-0 ${value?'bg-[#8B5CF6]':'bg-[rgba(0,0,0,.15)]'}`} style={{width:44,height:24}}><span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${value?'left-5':'left-0.5'}`}/></button>;}
