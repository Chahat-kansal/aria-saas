'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface Doc {
  id: string; client_id: string; document_name: string; document_type: string;
  file_url: string; file_size: number; expiry_date: string; verified: boolean; created_at: string;
  visa_clients?: { full_name: string };
}
interface Client { id: string; full_name: string; }

const DOC_TYPES = ['passport', 'skills_assessment', 'employment', 'health', 'character', 'financial', 'other'];
const DOC_ICONS: Record<string, string> = {
  passport: '🛂', skills_assessment: '📊', employment: '💼',
  health: '🏥', character: '🔒', financial: '💰', other: '📄',
};

function daysUntil(d: string) { return !d ? null : Math.ceil((new Date(d).getTime() - Date.now()) / 864e5); }

export default function DocumentsPage() {
  const params = useSearchParams();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filterClient, setFilterClient] = useState(params.get('client') || '');
  const [filterType, setFilterType] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ client_id: '', document_type: 'other', expiry_date: '' });
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const [{ data: d }, { data: c }] = await Promise.all([
      supabase.from('visa_documents').select('*, visa_clients(full_name)').eq('agent_id', session.user.id).order('created_at', { ascending: false }),
      supabase.from('visa_clients').select('id, full_name').eq('agent_id', session.user.id).order('full_name'),
    ]);
    setDocs(d || []);
    setClients(c || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) { setUploadError('Please select a file'); return; }
    if (!uploadForm.client_id) { setUploadError('Please select a client'); return; }
    setUploading(true); setUploadError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('client_id', uploadForm.client_id);
      fd.append('document_type', uploadForm.document_type);
      if (uploadForm.expiry_date) fd.append('expiry_date', uploadForm.expiry_date);
      const res = await fetch('/api/visa/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) { setUploadError(json.error || 'Upload failed'); return; }
      setShowUpload(false);
      setUploadForm({ client_id: '', document_type: 'other', expiry_date: '' });
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (e: any) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
    }
  }

  const filtered = docs.filter(d => {
    const mc = !filterClient || d.client_id === filterClient;
    const mt = !filterType || d.document_type === filterType;
    return mc && mt;
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Document vault</h1>
          <p className="text-xs text-[rgba(255,255,255,.4)] mt-0.5">{docs.length} documents</p>
        </div>
        <button onClick={() => setShowUpload(true)}
          className="text-sm font-medium px-4 py-2 rounded-xl text-white hover:opacity-90 transition-opacity"
          style={{ background: 'linear-gradient(135deg,#7F77DD,#5f57c0)' }}>
          + Upload document
        </button>
      </div>

      <div className="flex gap-3 mb-5">
        <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
          className="bg-[#111118] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-[rgba(255,255,255,.7)] outline-none focus:border-[#7F77DD]/50">
          <option value="">All clients</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="bg-[#111118] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-[rgba(255,255,255,.7)] outline-none focus:border-[#7F77DD]/50">
          <option value="">All types</option>
          {DOC_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 rounded-full border-2 border-[#7F77DD] border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">📁</p>
          <p className="text-sm text-[rgba(255,255,255,.3)]">No documents yet</p>
          <button onClick={() => setShowUpload(true)} className="text-xs text-[#7F77DD] hover:underline mt-2">Upload first document</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(doc => {
            const days = daysUntil(doc.expiry_date);
            const expiring = days !== null && days < 60;
            return (
              <div key={doc.id} className="rounded-xl p-4" style={{ background: '#111118', border: `1px solid ${expiring ? 'rgba(226,75,74,.3)' : 'rgba(255,255,255,.07)'}` }}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">{DOC_ICONS[doc.document_type] ?? '📄'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white leading-snug truncate">{doc.document_name}</p>
                    <p className="text-[11px] text-[rgba(255,255,255,.4)] mt-0.5">
                      {doc.visa_clients?.full_name ?? 'Unknown'} · {doc.document_type.replace('_', ' ')}
                    </p>
                    {doc.file_size && (
                      <p className="text-[10px] text-[rgba(255,255,255,.25)] mt-0.5">{Math.round(doc.file_size / 1024)}KB</p>
                    )}
                  </div>
                </div>
                {doc.expiry_date && (
                  <div className={`mt-3 text-[11px] flex items-center gap-1.5 ${expiring ? 'text-red-400' : 'text-[rgba(255,255,255,.4)]'}`}>
                    {expiring && <span className="w-1.5 h-1.5 rounded-full bg-red-400" />}
                    Expires {doc.expiry_date}{days !== null && ` (${days < 0 ? 'expired' : `${days}d`})`}
                  </div>
                )}
                {doc.file_url && (
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                    className="mt-3 block text-center text-[11px] py-1.5 rounded-lg transition-colors"
                    style={{ background: 'rgba(127,119,221,.1)', color: '#a8a3f0', border: '1px solid rgba(127,119,221,.2)' }}>
                    Download
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.7)' }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: '#111118', border: '1px solid rgba(255,255,255,.1)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">Upload document</h2>
              <button onClick={() => setShowUpload(false)} className="text-[rgba(255,255,255,.4)] hover:text-white">✕</button>
            </div>
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-xs text-[rgba(255,255,255,.5)] mb-1.5">Client *</label>
                <select required value={uploadForm.client_id} onChange={e => setUploadForm(f => ({ ...f, client_id: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[rgba(127,119,221,.5)]">
                  <option value="">Select client…</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[rgba(255,255,255,.5)] mb-1.5">Document type</label>
                <select value={uploadForm.document_type} onChange={e => setUploadForm(f => ({ ...f, document_type: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[rgba(127,119,221,.5)]">
                  {DOC_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[rgba(255,255,255,.5)] mb-1.5">Document expiry (optional)</label>
                <input type="date" value={uploadForm.expiry_date} onChange={e => setUploadForm(f => ({ ...f, expiry_date: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[rgba(127,119,221,.5)]" />
              </div>
              <div>
                <label className="block text-xs text-[rgba(255,255,255,.5)] mb-1.5">File *</label>
                <input ref={fileRef} type="file" required
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-[rgba(255,255,255,.7)] file:mr-3 file:text-xs file:bg-[#7F77DD]/20 file:text-[#c4c0f7] file:border-0 file:rounded-lg file:px-3 file:py-1 file:cursor-pointer" />
              </div>
              {uploadError && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{uploadError}</p>}
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={uploading}
                  className="flex-1 py-3 rounded-xl text-sm font-medium text-white disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#7F77DD,#5f57c0)' }}>
                  {uploading ? 'Uploading…' : 'Upload'}
                </button>
                <button type="button" onClick={() => setShowUpload(false)}
                  className="px-5 py-3 rounded-xl text-sm text-[rgba(255,255,255,.5)] border border-white/10 hover:text-white transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}