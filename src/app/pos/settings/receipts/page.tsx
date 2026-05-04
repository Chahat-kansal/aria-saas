'use client';
import { useState, useEffect } from 'react';
interface S { receipt_business_name: string; receipt_abn: string; receipt_header: string; receipt_footer: string; receipt_show_gst: boolean; receipt_show_change: boolean; receipt_print_format: string; receipt_email_from: string; }
const DEF: S = { receipt_business_name: '', receipt_abn: '', receipt_header: '', receipt_footer: 'Thank you for your business!', receipt_show_gst: true, receipt_show_change: true, receipt_print_format: '80mm', receipt_email_from: '' };
export default function ReceiptsPage() {
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
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6"><h1 className="text-xl font-semibold text-[#1a1a16]">Receipts</h1><p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Customise what appears on printed and emailed receipts</p></div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-4">
          <Section title="Business Details">
            <Field label="Business name on receipt"><input value={s.receipt_business_name} onChange={e=>setS(p=>({...p,receipt_business_name:e.target.value}))} className="input" placeholder="Your Business Name" /></Field>
            <Field label="ABN"><input value={s.receipt_abn} onChange={e=>setS(p=>({...p,receipt_abn:e.target.value}))} className="input" placeholder="12 345 678 901" /></Field>
          </Section>
          <Section title="Header & Footer">
            <Field label="Header message"><input value={s.receipt_header} onChange={e=>setS(p=>({...p,receipt_header:e.target.value}))} className="input" placeholder="Optional header text" /></Field>
            <Field label="Footer message"><input value={s.receipt_footer} onChange={e=>setS(p=>({...p,receipt_footer:e.target.value}))} className="input" placeholder="Thank you for your business!" /></Field>
          </Section>
          <Section title="Display Options">
            <Row label="Show GST breakdown"><Toggle value={s.receipt_show_gst} onChange={v=>setS(p=>({...p,receipt_show_gst:v}))} /></Row>
            <Row label="Show change given"><Toggle value={s.receipt_show_change} onChange={v=>setS(p=>({...p,receipt_show_change:v}))} /></Row>
          </Section>
          <Section title="Format">
            <Field label="Print format">
              <select value={s.receipt_print_format} onChange={e=>setS(p=>({...p,receipt_print_format:e.target.value}))} className="input bg-white">
                <option value="80mm">80mm thermal</option><option value="58mm">58mm thermal</option><option value="a4">A4 full page</option>
              </select>
            </Field>
            <Field label="Email receipts from"><input value={s.receipt_email_from} onChange={e=>setS(p=>({...p,receipt_email_from:e.target.value}))} className="input" placeholder="receipts@yourbusiness.com.au" /></Field>
          </Section>
        </div>
        <div>
          <p className="text-xs font-semibold text-[rgba(26,26,22,.4)] uppercase tracking-wider mb-3">Preview</p>
          <div className="bg-white border border-[rgba(0,0,0,.1)] rounded-2xl p-5 text-center font-mono text-xs leading-relaxed text-[#1a1a16]" style={{maxWidth:200,margin:'0 auto'}}>
            <p className="font-bold text-sm">{s.receipt_business_name||'Your Business'}</p>
            {s.receipt_abn && <p className="text-[10px] text-[rgba(26,26,22,.5)]">ABN: {s.receipt_abn}</p>}
            {s.receipt_header && <p className="mt-1 text-[10px]">{s.receipt_header}</p>}
            <div className="border-t border-dashed border-[rgba(0,0,0,.2)] my-2" />
            <div className="text-left space-y-0.5 text-[11px]">
              <div className="flex justify-between"><span>Coffee x1</span><span>$4.50</span></div>
              <div className="flex justify-between"><span>Cake x1</span><span>$6.00</span></div>
            </div>
            <div className="border-t border-dashed border-[rgba(0,0,0,.2)] my-2" />
            {s.receipt_show_gst && <div className="flex justify-between text-[10px] text-[rgba(26,26,22,.5)]"><span>GST incl.</span><span>$0.95</span></div>}
            <div className="flex justify-between font-bold text-sm mt-1"><span>TOTAL</span><span>$10.50</span></div>
            {s.receipt_show_change && <div className="flex justify-between text-[10px] text-[rgba(26,26,22,.5)] mt-1"><span>Change</span><span>$9.50</span></div>}
            <div className="border-t border-dashed border-[rgba(0,0,0,.2)] my-2" />
            {s.receipt_footer && <p className="text-[10px] text-[rgba(26,26,22,.5)]">{s.receipt_footer}</p>}
          </div>
        </div>
      </div>
      <div className="mt-6"><button onClick={save} disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-[#1a1a16] text-white disabled:opacity-50">{saving?'Saving…':saved?'✓ Saved':'Save changes'}</button></div>
      <style jsx>{`.input{width:100%;border:1px solid rgba(0,0,0,.1);border-radius:10px;padding:7px 12px;font-size:13px;outline:none;}`}</style>
    </div>
  );
}
function Section({title,children}:{title:string;children:React.ReactNode}){return <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-4 space-y-3"><h3 className="text-xs font-semibold text-[rgba(26,26,22,.5)] uppercase tracking-wider">{title}</h3>{children}</div>;}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div><label className="block text-xs text-[rgba(26,26,22,.5)] mb-1">{label}</label>{children}</div>;}
function Row({label,children}:{label:string;children:React.ReactNode}){return <div className="flex items-center justify-between"><span className="text-sm text-[rgba(26,26,22,.7)]">{label}</span>{children}</div>;}
function Toggle({value,onChange}:{value:boolean;onChange:(v:boolean)=>void}){return <button onClick={()=>onChange(!value)} className={`relative rounded-full transition-colors flex-shrink-0 ${value?'bg-[#8B5CF6]':'bg-[rgba(0,0,0,.15)]'}`} style={{width:44,height:24}}><span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${value?'left-5':'left-0.5'}`}/></button>;}
