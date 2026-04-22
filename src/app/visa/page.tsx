import { createServerSupabaseClient } from '@/lib/supabase-server';
import Link from 'next/link';

export default async function VisaDashboard() {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const agentId = session.user.id;
  const today = new Date().toISOString().split('T')[0];
  const in90 = new Date(Date.now() + 90 * 864e5).toISOString().split('T')[0];

  const [
    { count: clientCount }, { count: lodgedCount }, { count: expiringCount }, { count: docCount },
    { data: alerts }, { data: clients }, { data: docs }, { data: news },
  ] = await Promise.all([
    supabase.from('visa_clients').select('*', { count: 'exact', head: true }).eq('agent_id', agentId),
    supabase.from('visa_applications').select('*', { count: 'exact', head: true }).eq('agent_id', agentId).eq('status', 'lodged'),
    supabase.from('visa_clients').select('*', { count: 'exact', head: true }).eq('agent_id', agentId).lte('visa_expiry', in90).gte('visa_expiry', today),
    supabase.from('visa_documents').select('*', { count: 'exact', head: true }).eq('agent_id', agentId),
    supabase.from('immigration_alerts').select('*').eq('agent_id', agentId).eq('is_read', false).order('detected_at', { ascending: false }).limit(6),
    supabase.from('visa_clients').select('*').eq('agent_id', agentId).order('created_at', { ascending: false }).limit(8),
    supabase.from('visa_documents').select('*').eq('agent_id', agentId).order('created_at', { ascending: false }).limit(5),
    supabase.from('immigration_news').select('*').order('created_at', { ascending: false }).limit(5),
  ]);

  const urgent = (alerts || []).filter((a: any) => a.severity === 'critical' || a.severity === 'high');
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">{greeting}</h1>
          <p className="text-xs text-[rgba(255,255,255,.4)] mt-0.5">
            {urgent.length > 0
              ? `${urgent.length} urgent alert${urgent.length > 1 ? 's' : ''} need your attention`
              : 'All clear — no urgent policy alerts'}
          </p>
        </div>
        {urgent.length > 0 && (
          <Link href="/visa/alerts" className="flex items-center gap-2 text-xs px-4 py-2 rounded-full"
            style={{ background: 'rgba(226,75,74,.12)', border: '1px solid rgba(226,75,74,.3)', color: '#f87171' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            {urgent.length} policy change{urgent.length > 1 ? 's' : ''} detected
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Active clients', value: clientCount || 0, g: 'rgba(127,119,221,.18)', b: 'rgba(127,119,221,.3)' },
          { label: 'Applications lodged', value: lodgedCount || 0, g: 'rgba(29,158,117,.18)', b: 'rgba(29,158,117,.3)' },
          { label: 'Expiring in 90 days', value: expiringCount || 0, g: 'rgba(239,159,39,.18)', b: 'rgba(239,159,39,.3)' },
          { label: 'Documents stored', value: docCount || 0, g: 'rgba(226,75,74,.12)', b: 'rgba(226,75,74,.2)' },
        ].map((s: any) => (
          <div key={s.label} className="rounded-xl p-4 border"
            style={{ background: `linear-gradient(135deg,${s.g},transparent)`, borderColor: s.b }}>
            <p className="text-[10px] uppercase tracking-[.1em] text-[rgba(255,255,255,.4)] mb-2">{s.label}</p>
            <p className="text-2xl font-semibold text-white">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="rounded-2xl p-5" style={{ background: '#111118', border: '1px solid rgba(255,255,255,.07)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-white">Live policy alerts</h2>
            <Link href="/visa/alerts" className="text-[10px] text-[#7F77DD] hover:underline">View all</Link>
          </div>
          {!alerts?.length ? (
            <p className="text-xs text-[rgba(255,255,255,.25)] py-6 text-center">No unread alerts</p>
          ) : (
            <ul className="space-y-3">
              {(alerts as any[]).map(a => (
                <li key={a.id} className="border-b border-white/5 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-start gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${
                      a.severity === 'critical' || a.severity === 'high' ? 'bg-red-400'
                      : a.severity === 'medium' ? 'bg-amber-400' : 'bg-white/20'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[rgba(255,255,255,.85)] leading-snug">{a.title}</p>
                      {a.description && <p className="text-[11px] text-[rgba(255,255,255,.4)] mt-0.5 line-clamp-2">{a.description}</p>}
                      {a.affected_client_ids?.length > 0 && (
                        <p className="text-[10px] text-red-400 mt-1">{a.affected_client_ids.length} of your clients affected</p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl p-5" style={{ background: '#111118', border: '1px solid rgba(255,255,255,.07)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-white">Recent clients</h2>
            <Link href="/visa/clients" className="text-[10px] text-[#7F77DD] hover:underline">All clients</Link>
          </div>
          {!clients?.length ? (
            <div className="py-6 text-center">
              <p className="text-xs text-[rgba(255,255,255,.25)] mb-3">No clients yet</p>
              <Link href="/visa/clients/new" className="text-xs text-[#7F77DD] hover:underline">Add your first client</Link>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {(clients as any[]).map(c => (
                <li key={c.id} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0"
                    style={{ background: 'rgba(127,119,221,.2)', color: '#c4c0f7' }}>
                    {c.full_name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[rgba(255,255,255,.85)] truncate">{c.full_name}</p>
                    <p className="text-[10px] text-[rgba(255,255,255,.35)]">{c.visa_type || 'No visa'} · {c.nationality || 'Unknown'}</p>
                  </div>
                  <StatusPill status={c.application_status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl p-5" style={{ background: '#111118', border: '1px solid rgba(255,255,255,.07)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-white">Document vault</h2>
            <Link href="/visa/documents" className="text-[10px] text-[#7F77DD] hover:underline">View all</Link>
          </div>
          {!docs?.length ? (
            <p className="text-xs text-[rgba(255,255,255,.25)] py-4 text-center">No documents uploaded yet</p>
          ) : (
            <ul className="space-y-2.5">
              {(docs as any[]).map(d => (
                <li key={d.id} className="flex items-center gap-2">
                  <span className="text-base w-6 text-center flex-shrink-0">
                    {({ passport: '🛂', skills_assessment: '📊', employment: '💼', health: '🏥', character: '🔒', financial: '💰' } as Record<string, string>)[d.document_type] ?? '📄'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[rgba(255,255,255,.8)] truncate">{d.document_name}</p>
                    <p className="text-[10px] text-[rgba(255,255,255,.3)]">{d.document_type}</p>
                  </div>
                  {d.file_size && <span className="text-[10px] text-[rgba(255,255,255,.25)]">{Math.round(d.file_size / 1024)}KB</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl p-5" style={{ background: '#111118', border: '1px solid rgba(255,255,255,.07)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-white">Immigration news</h2>
            <Link href="/visa/news" className="text-[10px] text-[#7F77DD] hover:underline">View all</Link>
          </div>
          {!news?.length ? (
            <p className="text-xs text-[rgba(255,255,255,.25)] py-4 text-center">No news yet — run the monitor</p>
          ) : (
            <ul className="space-y-3">
              {(news as any[]).map(n => (
                <li key={n.id} className="border-b border-white/5 pb-3 last:border-0 last:pb-0">
                  {n.source && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full inline-block mb-1"
                      style={{ background: 'rgba(127,119,221,.1)', color: '#a8a3f0', border: '1px solid rgba(127,119,221,.2)' }}>
                      {n.source}
                    </span>
                  )}
                  <p className="text-xs text-[rgba(255,255,255,.8)] leading-snug line-clamp-2">{n.title}</p>
                  <p className="text-[10px] text-[rgba(255,255,255,.3)] mt-0.5">{timeAgo(n.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Link href="/visa/ask" className="rounded-2xl p-5 block"
          style={{ background: 'rgba(127,119,221,.08)', border: '1px solid rgba(127,119,221,.2)' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] uppercase tracking-[.15em] font-medium text-[#7F77DD]">VisaAI</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#7F77DD] animate-pulse" />
          </div>
          <p className="text-sm text-[rgba(255,255,255,.55)] mb-4 leading-relaxed">
            Ask about eligibility, policy changes, document requirements, or generate application letters.
          </p>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: 'rgba(127,119,221,.1)', border: '1px solid rgba(127,119,221,.2)' }}>
            <span className="text-xs text-[rgba(255,255,255,.3)] flex-1">Ask VisaAI something…</span>
            <span className="text-xs text-[#7F77DD]">→</span>
          </div>
        </Link>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    approved:    ['#34d399', 'rgba(52,211,153,.12)'],
    in_progress: ['#c4c0f7', 'rgba(127,119,221,.12)'],
    lodged:      ['#fbbf24', 'rgba(251,191,36,.12)'],
    refused:     ['#f87171', 'rgba(248,113,113,.12)'],
    not_started: ['rgba(255,255,255,.35)', 'rgba(255,255,255,.05)'],
    bridging:    ['#60a5fa', 'rgba(96,165,250,.12)'],
  };
  const labels: Record<string, string> = {
    approved: 'Approved', in_progress: 'In progress', lodged: 'Lodged',
    refused: 'Refused', not_started: 'Not started', bridging: 'Bridging',
  };
  const [color, bg] = map[status] ?? map['not_started'];
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ color, background: bg }}>
      {labels[status] ?? status}
    </span>
  );
}

function timeAgo(d: string) {
  const ms = Date.now() - new Date(d).getTime();
  const days = Math.floor(ms / 864e5), h = Math.floor(ms / 3.6e6);
  if (days > 0) return `${days}d ago`;
  if (h > 0) return `${h}h ago`;
  return 'Just now';
}