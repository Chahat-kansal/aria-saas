'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';

interface Convo { _id: string; title: string; }
interface Props { user: { name?: string; email?: string; image?: string; plan?: string; }; }

export const SIDEBAR_EVENT = 'aria:sidebar-toggle';

export function Sidebar({ user }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [convos, setConvos] = useState<Convo[]>([]);
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState<number>(0);
  const [activeMode, setActiveMode] = useState<'chat' | 'builder'>('chat');
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [searchOn, setSearchOn] = useState(false);
  const [pluginsOn, setPluginsOn] = useState(true);
  const [proUser, setProUser] = useState(user.plan === 'pro');

  const loadData = useCallback(() => {
    fetch('/api/conversations').then(r => r.json()).then(d => { if (Array.isArray(d)) setConvos(d); }).catch(() => {});
    fetch('/api/user').then(r => r.json()).then(d => {
      if (d?.messagesUsedThisMonth !== undefined) setUsage(d.messagesUsedThisMonth);
      if (d?.plan) setProUser(d.plan === 'pro');
    }).catch(() => {});
  }, []);

  useEffect(() => { loadData(); }, [pathname]);

  useEffect(() => {
    const onNewConvo = () => loadData();
    const onToggle = () => setOpen(o => !o);
    const onSync = (e: Event) => {
      const d = (e as CustomEvent).detail;
      setActiveMode(d.mode);
      setActiveTool(d.activeTool);
      setSearchOn(d.webSearch);
      setPluginsOn(d.plugins);
      setProUser(d.isPro);
    };
    window.addEventListener('aria:new-conversation', onNewConvo);
    window.addEventListener(SIDEBAR_EVENT, onToggle);
    window.addEventListener('aria:mode-change', onSync);
    return () => {
      window.removeEventListener('aria:new-conversation', onNewConvo);
      window.removeEventListener(SIDEBAR_EVENT, onToggle);
      window.removeEventListener('aria:mode-change', onSync);
    };
  }, [loadData]);

  useEffect(() => { setOpen(false); }, [pathname]);

  async function deleteConvo(id: string, e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    await fetch('/api/conversations', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    setConvos(c => c.filter(x => x._id !== id));
    if (pathname === `/chat/${id}`) router.push('/chat');
  }

  function emit(name: string) {
    window.dispatchEvent(new CustomEvent('aria:tool-select', { detail: name }));
    setOpen(false);
  }

  const inChat = pathname.startsWith('/chat');

  function ToolBtn({ name, emoji, label, pro = false }: { name: string; emoji: string; label: string; pro?: boolean }) {
    const locked = pro && !proUser;
    const on = activeTool === name || (name === 'search' && searchOn) || (name === 'plugins' && pluginsOn);
    return (
      <button onClick={() => !locked && emit(name)} disabled={locked}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all text-left
          ${on ? 'bg-[#6C63FF]/20 text-[#a78bfa] border border-[#6C63FF]/30' : 'text-[#888899] hover:bg-white/5 hover:text-white border border-transparent'}
          ${locked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
        <span className="text-base leading-none w-5 text-center flex-shrink-0">{emoji}</span>
        <span className="text-xs flex-1">{label}</span>
        {pro && !proUser && <span className="text-[9px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-full">Pro</span>}
        {on && !locked && <span className="w-1.5 h-1.5 rounded-full bg-[#6C63FF] flex-shrink-0" />}
      </button>
    );
  }

  return (
    <>
      {open && <div className="md:hidden fixed inset-0 bg-black/60 z-30" onClick={() => setOpen(false)} />}
      
      <aside
        className={`fixed md:relative z-40 flex flex-col w-[280px] md:w-64 bg-[#16161d] border-r border-white/5 transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
        style={{ height: '100dvh' }}
      >

        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-white/5 flex-shrink-0">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#6C63FF] to-[#a78bfa] flex items-center justify-center text-white text-xs font-bold">A</div>
          <span className="font-semibold text-sm">Aria</span>
          {proUser && <span className="ml-1 text-[10px] bg-[#6C63FF]/20 text-[#a78bfa] border border-[#6C63FF]/30 px-1.5 py-0.5 rounded-full">Pro</span>}
          <button onClick={() => setOpen(false)} className="md:hidden ml-auto text-[#888899] hover:text-white p-1 text-lg leading-none">✕</button>
        </div>

        {/* New conversation */}
        <div className="px-3 pt-3 flex-shrink-0">
          <Link href="/chat" onClick={() => setOpen(false)}
            className="flex items-center gap-2 w-full bg-[#6C63FF] hover:bg-[#4b44cc] text-white text-sm font-medium px-3 py-2.5 rounded-xl transition-colors">
            <span className="text-base leading-none">+</span> New conversation
          </Link>
        </div>

        {/* Tools */}
        {inChat && (
          <div className="px-3 pt-4 flex-shrink-0">
            <div className="text-[10px] text-[#444455] uppercase tracking-wider px-1 mb-1.5">Mode</div>
            <div className="flex bg-white/5 rounded-xl p-1 mb-3 gap-1">
              {(['chat', 'builder'] as const).map(m => (
                <button key={m} onClick={() => emit('mode:' + m)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all
                    ${activeMode === m ? 'bg-[#6C63FF] text-white shadow-sm' : 'text-[#888899] hover:text-white'}`}>
                  {m === 'chat' ? '💬' : '🔨'} {m === 'chat' ? 'Chat' : 'Builder'}
                </button>
              ))}
            </div>

            <div className="text-[10px] text-[#444455] uppercase tracking-wider px-1 mb-1.5">Tools</div>
            <div className="space-y-0.5">
              <ToolBtn name="search"   emoji="🔍" label="Web search"       pro />
              <ToolBtn name="research" emoji="🔬" label="Deep research"    pro />
              <ToolBtn name="image"    emoji="🎨" label="Image generation" pro />
              <ToolBtn name="project"  emoji="🏗️" label="Project builder" />
              <ToolBtn name="canvas"   emoji="📝" label="Canvas editor"    />
              <ToolBtn name="execute"  emoji="▶️" label="Code executor"    />
              <ToolBtn name="plugins"  emoji="🔌" label="Plugins"          />
            </div>
          </div>
        )}

        {/* Conversations */}
        <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0">
          {inChat && <div className="text-[10px] text-[#444455] uppercase tracking-wider px-1 mb-1.5 mt-1">Recent</div>}
          {convos.length === 0
            ? <p className="text-xs text-[#444455] text-center py-6">No conversations yet</p>
            : convos.map(c => (
              <Link key={c._id} href={`/chat/${c._id}`} onClick={() => setOpen(false)}
                className={`group flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors mb-0.5
                  ${pathname === `/chat/${c._id}` ? 'bg-white/10 text-white' : 'text-[#888899] hover:bg-white/5 hover:text-white'}`}>
                <span className="flex-1 truncate text-xs">{c.title}</span>
                <button onClick={e => deleteConvo(c._id, e)}
                  className="opacity-0 group-hover:opacity-100 text-[#555566] hover:text-red-400 text-xs px-1 flex-shrink-0">✕</button>
              </Link>
            ))
          }
        </div>

        {/* Bottom */}
        <div className="px-3 pb-4 border-t border-white/5 pt-3 flex-shrink-0 space-y-2">
          {!proUser && (
            <div className="bg-white/5 rounded-xl p-3">
              <div className="flex justify-between text-xs text-[#888899] mb-1.5">
                <span>Messages</span><span>{usage} / 50</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-[#6C63FF] rounded-full" style={{ width: `${Math.min((usage / 50) * 100, 100)}%` }} />
              </div>
              <Link href="/settings" onClick={() => setOpen(false)} className="block text-center text-xs text-[#6C63FF] hover:underline mt-2">Upgrade to Pro →</Link>
            </div>
          )}

          <Link href="/settings" onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors group">
            {user.image
              ? <img src={user.image} className="w-7 h-7 rounded-full flex-shrink-0" alt="" />
              : <div className="w-7 h-7 rounded-full bg-[#6C63FF]/30 flex items-center justify-center text-xs font-medium text-[#a78bfa] flex-shrink-0">{user.name?.[0]?.toUpperCase() || '?'}</div>}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-white truncate">{user.name}</div>
              <div className="text-[10px] text-[#555566] truncate">{user.email}</div>
            </div>
            <button onClick={e => { e.preventDefault(); signOut({ callbackUrl: '/login' }); }}
              className="opacity-0 group-hover:opacity-100 text-[#555566] hover:text-white text-xs" title="Sign out">⏻</button>
          </Link>
        </div>
      </aside>
    </>
  );
}
