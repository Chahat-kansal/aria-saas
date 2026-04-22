'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface NewsItem {
  id: string; title: string; summary: string; source: string; source_url: string;
  published_at: string; visa_classes_mentioned: string[]; relevance_score: number; created_at: string;
}

function timeAgo(d: string) {
  const ms = Date.now() - new Date(d).getTime();
  const days = Math.floor(ms / 864e5), h = Math.floor(ms / 3.6e6);
  if (days > 0) return `${days}d ago`;
  if (h > 0) return `${h}h ago`;
  return 'Just now';
}

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [filterVisa, setFilterVisa] = useState('');
  const [runMsg, setRunMsg] = useState('');

  async function load() {
    const { data } = await supabase.from('immigration_news').select('*').order('created_at', { ascending: false }).limit(100);
    setNews(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function runMonitor() {
    setRunning(true); setRunMsg('');
    try {
      const res = await fetch('/api/visa/monitor', { method: 'POST' });
      const json = await res.json();
      setRunMsg(res.ok ? `Done — ${json.saved ?? 0} new articles saved` : json.error || 'Monitor failed');
      if (res.ok) await load();
    } catch {
      setRunMsg('Monitor request failed');
    } finally {
      setRunning(false);
    }
  }

  const allVisaClasses = [...new Set((news.flatMap(n => n.visa_classes_mentioned || [])))];
  const filtered = news.filter(n => !filterVisa || n.visa_classes_mentioned?.includes(filterVisa));

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">News monitor</h1>
          <p className="text-xs text-[rgba(255,255,255,.4)] mt-0.5">{news.length} articles tracked</p>
        </div>
        <button onClick={runMonitor} disabled={running}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl text-white disabled:opacity-60 transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg,#7F77DD,#5f57c0)' }}>
          {running ? (
            <><span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" /> Scanning…</>
          ) : '📡 Run monitor'}
        </button>
      </div>

      {runMsg && (
        <div className="mb-4 text-xs px-4 py-3 rounded-xl" style={{ background: 'rgba(127,119,221,.1)', color: '#c4c0f7', border: '1px solid rgba(127,119,221,.2)' }}>
          {runMsg}
        </div>
      )}

      {allVisaClasses.length > 0 && (
        <div className="flex gap-2 mb-5 flex-wrap">
          <button onClick={() => setFilterVisa('')}
            className={`text-[10px] px-3 py-1.5 rounded-full transition-colors ${!filterVisa ? 'bg-[#7F77DD]/20 text-[#c4c0f7] border border-[#7F77DD]/30' : 'bg-white/5 text-[rgba(255,255,255,.5)] border border-white/10 hover:bg-white/10'}`}>
            All
          </button>
          {allVisaClasses.map(v => (
            <button key={v} onClick={() => setFilterVisa(v === filterVisa ? '' : v)}
              className={`text-[10px] px-3 py-1.5 rounded-full transition-colors ${filterVisa === v ? 'bg-[#7F77DD]/20 text-[#c4c0f7] border border-[#7F77DD]/30' : 'bg-white/5 text-[rgba(255,255,255,.5)] border border-white/10 hover:bg-white/10'}`}>
              {v}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 rounded-full border-2 border-[#7F77DD] border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-3xl mb-3">📡</p>
          <p className="text-sm text-[rgba(255,255,255,.3)] mb-4">No news articles yet</p>
          <p className="text-xs text-[rgba(255,255,255,.2)]">Click &quot;Run monitor&quot; to scan immigration sources</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(n => (
            <div key={n.id} className="rounded-2xl p-5" style={{ background: '#111118', border: '1px solid rgba(255,255,255,.07)' }}>
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {n.source && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(127,119,221,.1)', color: '#a8a3f0', border: '1px solid rgba(127,119,221,.2)' }}>
                      {n.source}
                    </span>
                  )}
                  {n.relevance_score >= 7 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
                      High relevance
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-[rgba(255,255,255,.3)] flex-shrink-0">{timeAgo(n.created_at)}</span>
              </div>
              <h3 className="text-sm font-medium text-white leading-snug mb-2">{n.title}</h3>
              {n.summary && <p className="text-xs text-[rgba(255,255,255,.5)] leading-relaxed mb-3">{n.summary}</p>}
              <div className="flex items-center gap-3">
                {n.visa_classes_mentioned?.map((v: string) => (
                  <span key={v} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-[rgba(255,255,255,.4)]">
                    {v}
                  </span>
                ))}
                {n.source_url && (
                  <a href={n.source_url} target="_blank" rel="noopener noreferrer"
                    className="ml-auto text-[10px] text-[#7F77DD] hover:underline flex-shrink-0">
                    Read original →
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}