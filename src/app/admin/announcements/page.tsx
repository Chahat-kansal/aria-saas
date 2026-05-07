'use client';
import { useState, useEffect } from 'react';

const C = { card: 'var(--bg-surface)', border: 'rgba(0,229,255,0.08)', text: 'var(--text-primary)', muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)', cyan: '#00E5FF', green: '#22C55E', red: '#EF4444', amber: '#F59E0B' };
const TYPE_COLORS: Record<string,string> = { info:'rgba(56,189,248,0.15)', warning:'rgba(245,158,11,0.15)', success:'rgba(34,197,94,0.15)', critical:'rgba(239,68,68,0.15)', maintenance:'rgba(139,92,246,0.15)' };
const TYPE_TEXT: Record<string,string>   = { info:'#38BDF8', warning:C.amber, success:C.green, critical:C.red, maintenance:'#8B5CF6' };

const EMPTY = { title: '', message: '', type: 'info', show_to_plans: null, cta_label: '', cta_href: '', expires_at: '' };

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading]  = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm]         = useState({ ...EMPTY });
  const [saving, setSaving]     = useState(false);
  const [emailForm, setEmailForm] = useState({ to: 'all', subject: '', html: '' });
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult]   = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/announcements').then(r => r.json()).then(d => {
      setAnnouncements(d.announcements || []); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    const payload = { ...form, expires_at: form.expires_at || null, cta_label: form.cta_label || null, cta_href: form.cta_href || null };
    const res = await fetch('/api/admin/announcements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const d = await res.json();
    if (d.announcement) { setAnnouncements(prev => [d.announcement, ...prev]); setCreating(false); setForm({ ...EMPTY }); }
    setSaving(false);
  }

  async function toggle(id: string, is_active: boolean) {
    await fetch(`/api/admin/announcements?id=${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active }) });
    setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, is_active } : a));
  }

  async function del(id: string) {
    if (!confirm('Delete this announcement?')) return;
    await fetch(`/api/admin/announcements?id=${id}`, { method: 'DELETE' });
    setAnnouncements(prev => prev.filter(a => a.id !== id));
  }

  async function sendEmailBlast() {
    if (!emailForm.subject || !emailForm.html) { alert('Subject and body required'); return; }
    setEmailSending(true);
    const res = await fetch('/api/admin/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(emailForm) });
    const d = await res.json();
    setEmailResult(d.ok ? `✓ Sent to ${d.sent_count} of ${d.total_recipients} recipients` : `✗ ${d.error}`);
    setEmailSending(false);
  }

  const iS = { background: 'var(--bg-base)', border: `1px solid rgba(0,229,255,0.12)`, borderRadius: 8, padding: '9px 12px', fontSize: 13, color: C.text, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const };

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:800, color:C.text }}>Announcements</h1>
        <button onClick={() => setCreating(c => !c)} style={{ padding:'9px 20px', borderRadius:9, border:'none', background:C.cyan, color:'#000', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
          + New announcement
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div style={{ background:C.card, border:`1px solid rgba(0,229,255,0.15)`, borderRadius:16, padding:'20px 22px', marginBottom:20 }}>
          <p style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:14 }}>Create announcement</p>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <input value={form.title} onChange={e => setForm(f => ({...f,title:e.target.value}))} placeholder="Title *" style={iS} />
            <textarea value={form.message} onChange={e => setForm(f => ({...f,message:e.target.value}))} placeholder="Message *" rows={3} style={{ ...iS, resize:'vertical' as const }} />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
              <select value={form.type} onChange={e => setForm(f => ({...f,type:e.target.value}))} style={{ ...iS, background:'var(--bg-base)' }}>
                {['info','warning','success','critical','maintenance'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input value={form.cta_label} onChange={e => setForm(f => ({...f,cta_label:e.target.value}))} placeholder="CTA label (optional)" style={iS} />
              <input value={form.cta_href} onChange={e => setForm(f => ({...f,cta_href:e.target.value}))} placeholder="CTA URL" style={iS} />
            </div>
            <input type="datetime-local" value={form.expires_at} onChange={e => setForm(f => ({...f,expires_at:e.target.value}))} style={iS} />
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={() => setCreating(false)} style={{ padding:'8px 16px', borderRadius:8, border:`1px solid ${C.border}`, background:'transparent', color:C.muted, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
              <button onClick={save} disabled={saving || !form.title || !form.message} style={{ padding:'8px 22px', borderRadius:8, border:'none', background:C.cyan, color:'#000', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', opacity:saving||!form.title||!form.message?0.5:1 }}>
                {saving ? 'Saving…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active announcements */}
      {loading ? <p style={{ color:C.muted }}>Loading…</p> : (
        <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:32 }}>
          {announcements.map(ann => (
            <div key={ann.id} style={{ background:TYPE_COLORS[ann.type]||TYPE_COLORS.info, border:`1px solid rgba(0,229,255,0.08)`, borderRadius:14, padding:'14px 18px', display:'flex', alignItems:'flex-start', gap:14 }}>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <span style={{ fontSize:10, padding:'2px 8px', borderRadius:99, background:`${TYPE_TEXT[ann.type]}20`, color:TYPE_TEXT[ann.type]||C.cyan, fontWeight:700, textTransform:'uppercase' }}>{ann.type}</span>
                  <span style={{ fontSize:10, padding:'2px 8px', borderRadius:99, background: ann.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(130,160,200,0.1)', color: ann.is_active ? C.green : C.muted, fontWeight:700 }}>
                    {ann.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:3 }}>{ann.title}</p>
                <p style={{ fontSize:13, color:C.muted }}>{ann.message}</p>
              </div>
              <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                <button onClick={() => toggle(ann.id, !ann.is_active)} style={{ padding:'5px 10px', borderRadius:7, border:`1px solid ${C.border}`, background:'transparent', color:C.muted, fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>
                  {ann.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button onClick={() => del(ann.id)} style={{ padding:'5px 10px', borderRadius:7, border:'1px solid rgba(239,68,68,0.3)', background:'transparent', color:C.red, fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>Delete</button>
              </div>
            </div>
          ))}
          {!announcements.length && <p style={{ color:C.dim, textAlign:'center', padding:24 }}>No announcements yet</p>}
        </div>
      )}

      {/* Email blast */}
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:'20px 22px' }}>
        <p style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:14 }}>📧 Email Blast</p>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <select value={emailForm.to} onChange={e => setEmailForm(f => ({...f,to:e.target.value}))} style={{ ...iS, background:'var(--bg-base)' }}>
            <option value="all">All users</option>
            <option value="free">Free plan</option>
            <option value="pro">Pro plan</option>
            <option value="enterprise">Enterprise plan</option>
          </select>
          <input value={emailForm.subject} onChange={e => setEmailForm(f => ({...f,subject:e.target.value}))} placeholder="Subject *" style={iS} />
          <textarea value={emailForm.html} onChange={e => setEmailForm(f => ({...f,html:e.target.value}))} placeholder="Email body (HTML or plain text) *" rows={5} style={{ ...iS, resize:'vertical' as const }} />
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <button onClick={sendEmailBlast} disabled={emailSending || !emailForm.subject || !emailForm.html} style={{ padding:'9px 22px', borderRadius:9, border:'none', background:C.cyan, color:'#000', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', opacity:emailSending||!emailForm.subject||!emailForm.html?0.5:1 }}>
              {emailSending ? 'Sending…' : 'Send email blast'}
            </button>
            {emailResult && <p style={{ fontSize:13, color: emailResult.startsWith('✓') ? C.green : C.red }}>{emailResult}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
