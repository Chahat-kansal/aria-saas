'use client';
import { useState, useEffect } from 'react';
interface Staff { id: string; name: string; email: string | null; role: string; is_active: boolean; color: string; pin: string | null; }
const COLORS = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#06b6d4'];
const ROLES = ['cashier','staff','manager','owner'];
export default function UsersPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{open:boolean;editing?:Staff}>({open:false});
  const [form, setForm] = useState({name:'',email:'',role:'staff',color:COLORS[0],pin:''});
  const [saving, setSaving] = useState(false);
  useEffect(() => { fetch('/api/pos/staff').then(r=>r.json()).then(d=>{ setStaff(d.staff||[]); setLoading(false); }); }, []);
  function openAdd(){ setForm({name:'',email:'',role:'staff',color:COLORS[Math.floor(Math.random()*COLORS.length)],pin:''}); setModal({open:true}); }
  function openEdit(s:Staff){ setForm({name:s.name,email:s.email||'',role:s.role,color:s.color,pin:s.pin||''}); setModal({open:true,editing:s}); }
  async function save(){
    setSaving(true);
    if(modal.editing){
      await fetch(`/api/pos/staff?id=${modal.editing.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});
      setStaff(p=>p.map(s=>s.id===modal.editing!.id?{...s,...form}:s));
    } else {
      const res=await fetch('/api/pos/staff',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});
      const d=await res.json(); if(d.staff_member) setStaff(p=>[...p,d.staff_member]);
    }
    setSaving(false); setModal({open:false});
  }
  async function toggleActive(s:Staff){
    await fetch(`/api/pos/staff?id=${s.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({is_active:!s.is_active})});
    setStaff(p=>p.map(x=>x.id===s.id?{...x,is_active:!x.is_active}:x));
  }
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-xl font-semibold text-[#1a1a16]">Staff & Users</h1><p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Manage who can access the POS</p></div>
        <button onClick={openAdd} className="px-4 py-2 rounded-xl text-sm font-medium bg-[#1a1a16] text-white">+ Add Staff</button>
      </div>
      {loading ? <div className="text-sm text-[rgba(26,26,22,.4)]">Loading…</div> : (
        <div className="space-y-2">
          {staff.map(s=>(
            <div key={s.id} className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{background:s.color}}>{s.name.charAt(0).toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#1a1a16]">{s.name}</p>
                <p className="text-xs text-[rgba(26,26,22,.4)]">{s.email||'No email'} · <span className="capitalize">{s.role}</span> {s.pin?'· PIN set':''}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${s.is_active?'bg-green-50 text-green-700':'bg-[rgba(0,0,0,.06)] text-[rgba(26,26,22,.4)]'}`}>{s.is_active?'Active':'Inactive'}</span>
              <button onClick={()=>openEdit(s)} className="text-xs text-[rgba(26,26,22,.4)] hover:text-[#1a1a16] px-2 py-1">Edit</button>
              <button onClick={()=>toggleActive(s)} className="text-xs text-[rgba(26,26,22,.4)] hover:text-[#1a1a16] px-2 py-1">{s.is_active?'Disable':'Enable'}</button>
            </div>
          ))}
          {staff.length===0 && <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-8 text-center text-sm text-[rgba(26,26,22,.4)]">No staff added yet. Add your first team member.</div>}
        </div>
      )}
      {modal.open&&(
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-base font-semibold text-[#1a1a16] mb-4">{modal.editing?'Edit Staff':'Add Staff'}</h2>
            <div className="space-y-3">
              <Field label="Name *"><input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} className="input" placeholder="Full name" /></Field>
              <Field label="Email"><input value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} className="input" placeholder="email@example.com" /></Field>
              <Field label="Role">
                <select value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))} className="input bg-white">
                  {ROLES.map(r=><option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
                </select>
              </Field>
              <Field label="PIN (optional)"><input type="password" maxLength={6} value={form.pin} onChange={e=>setForm(p=>({...p,pin:e.target.value}))} className="input" placeholder="4-6 digit PIN" /></Field>
              <Field label="Colour">
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map(c=><button key={c} onClick={()=>setForm(p=>({...p,color:c}))} className={`w-7 h-7 rounded-full border-2 ${form.color===c?'border-[#1a1a16]':'border-transparent'}`} style={{background:c}} />)}
                </div>
              </Field>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={()=>setModal({open:false})} className="px-4 py-2 rounded-xl text-sm text-[rgba(26,26,22,.6)] border border-[rgba(0,0,0,.1)]">Cancel</button>
              <button onClick={save} disabled={saving||!form.name.trim()} className="px-4 py-2 rounded-xl text-sm font-medium bg-[#1a1a16] text-white disabled:opacity-50">{saving?'Saving…':'Save'}</button>
            </div>
          </div>
        </div>
      )}
      <style jsx>{`.input{width:100%;border:1px solid rgba(0,0,0,.1);border-radius:10px;padding:7px 12px;font-size:13px;outline:none;}`}</style>
    </div>
  );
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div><label className="block text-xs text-[rgba(26,26,22,.5)] mb-1">{label}</label>{children}</div>;}
