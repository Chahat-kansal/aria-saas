'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';

interface Convo { _id: string; title: string; updatedAt: string; }
interface Props {
  user: { name?: string; email?: string; image?: string; plan?: string; id?: string; };
}

export const SIDEBAR_EVENT = 'aria:sidebar-toggle';

export function Sidebar({ user }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [convos, setConvos] = useState<Convo[]>([]);
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState<{ used: number } | null>(null);

  // Synced state from ChatWindow
  const [activeMode, setActiveMode] = useState<'chat' | 'builder'>('chat');
  const [activePanelTool, setActivePanelTool] = useState<string | null>(null);
  const [searchOn, setSearchOn] = useState(false);
  const [pluginsOn, setPluginsOn] = useState(true);
  const [proUser, setProUser] = useState(false);

  const loadData = useCallback(() => {
    fetch('/api/conversations')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) setConvos(d);
      })
      .catch(() => {});

    fetch('/api/user')
      .then(r => r.json())
      .then(d => {
        if (d?.messagesUsedThisMonth !== undefined) {
          setUsage({ used: d.messagesUsedThisMonth });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => { loadData(); }, [pathname]);

  useEffect(() => {
    const onNewConvo = () => loadData();
    const onToggle = () => setOpen(o => !o);

    const onModeChange = (e: Event) => {
      const { mode, isPro, activeTool, plugins, webSearch } = (e as CustomEvent).detail;
      setActiveMode(mode);
      setActivePanelTool(activeTool);
      setSearchOn(webSearch);
      setPluginsOn(plugins);
      setProUser(isPro);
    };

    window.addEventListener('aria:new-conversation', onNewConvo);
    window.addEventListener(SIDEBAR_EVENT, onToggle);
    window.addEventListener('aria:mode-change', onModeChange);

    return () => {
      window.removeEventListener('aria:new-conversation', onNewConvo);
      window.removeEventListener(SIDEBAR_EVENT, onToggle);
      window.removeEventListener('aria:mode-change', onModeChange);
    };
  }, [loadData]);

  useEffect(() => { setOpen(false); }, [pathname]);

  async function deleteConvo(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    await fetch('/api/conversations', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });

    setConvos(c => c.filter(x => x._id !== id));

    if (pathname === `/chat/${id}`) router.push('/chat');
  }

  function selectTool(name: string) {
    window.dispatchEvent(new CustomEvent('aria:tool-select', { detail: name }));
    setOpen(false);
  }

  function ToolBtn({
    name,
    emoji,
    label,
    proOnly = false,
  }: {
    name: string;
    emoji: string;
    label: string;
    proOnly?: boolean;
  }) {
    const isActive =
      activePanelTool === name ||
      (name === 'search' && searchOn) ||
      (name === 'plugins' && pluginsOn);

    const disabled = proOnly && !proUser;

    return (
      <button
        onClick={() => !disabled && selectTool(name)}
        disabled={disabled}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors text-left
          ${isActive ? 'bg-[#6C63FF]/20 text-[#a78bfa] border border-[#6C63FF]/30' : 'text-[#888899] hover:bg-white/5 hover:text-white'}
          ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className="text-base">{emoji}</span>
        <span className="text-xs font-medium flex-1">{label}</span>

        {proOnly && !proUser && (
          <span className="text-[9px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-full">
            Pro
          </span>
        )}

        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#6C63FF]" />}
      </button>
    );
  }

  const isInChat = pathname.startsWith('/chat');

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-30"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`
          fixed md:relative z-40 flex flex-col overflow-hidden
          w-[85vw] max-w-[300px] md:w-64
          bg-[#16161d] border-r border-white/5
          transition-transform duration-200 ease-in-out
          ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          h-screen md:h-auto md:sticky md:top-0
        `}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-white/5">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#6C63FF] to-[#a78bfa] flex items-center justify-center text-white text-xs font-bold">
            A
          </div>
          <span className="font-semibold text-sm">Aria</span>

          {user.plan === 'pro' && (
            <span className="ml-2 text-[10px] bg-[#6C63FF]/20 text-[#a78bfa] border border-[#6C63FF]/30 px-1.5 py-0.5 rounded-full">
              Pro
            </span>
          )}

          <button
            onClick={() => setOpen(false)}
            className="md:hidden ml-auto text-[#888899] hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* New Chat */}
        <div className="px-3 pt-3">
          <Link
            href="/chat"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 w-full bg-[#6C63FF] hover:bg-[#4b44cc] text-white text-sm font-medium px-3 py-2.5 rounded-xl"
          >
            + New conversation
          </Link>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0">
          {isInChat && (
            <>
              <div className="text-[10px] text-[#555566] uppercase mb-2">Mode</div>

              <div className="flex bg-white/5 rounded-xl p-1 mb-3">
                {(['chat', 'builder'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => selectTool('mode:' + m)}
                    className={`flex-1 py-1.5 text-xs rounded-lg ${
                      activeMode === m
                        ? 'bg-[#6C63FF] text-white'
                        : 'text-[#888899]'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              <div className="text-[10px] text-[#555566] uppercase mb-2">Tools</div>

              <ToolBtn name="search" emoji="🔍" label="Web search" proOnly />
              <ToolBtn name="research" emoji="🔬" label="Deep research" proOnly />
              <ToolBtn name="image" emoji="🎨" label="Image generation" proOnly />
              <ToolBtn name="project" emoji="🏗️" label="Project builder" />
              <ToolBtn name="canvas" emoji="📝" label="Canvas editor" />
              <ToolBtn name="execute" emoji="▶️" label="Code executor" />
              <ToolBtn name="plugins" emoji="🔌" label="Plugins" />

              <div className="mt-4 text-[10px] text-[#555566] uppercase">
                Recent chats
              </div>
            </>
          )}

          {convos.length === 0 ? (
            <p className="text-xs text-[#555566] text-center py-6">
              No conversations yet
            </p>
          ) : (
            convos.map(c => (
              <Link
                key={c._id}
                href={`/chat/${c._id}`}
                className="block px-3 py-2 text-sm text-[#888899] hover:text-white"
              >
                {c.title}
              </Link>
            ))
          )}
        </div>

        {/* Bottom */}
        <div className="px-3 pb-4 border-t border-white/5 pt-3">
          <Link href="/settings" className="text-sm text-[#6C63FF]">
            Settings
          </Link>

          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="block text-red-400 text-sm mt-2"
          >
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
