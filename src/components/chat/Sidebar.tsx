'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';

interface Convo {
  _id: string;
  title: string;
  updatedAt: string;
}

interface Props {
  user: {
    name?: string;
    email?: string;
    image?: string;
    plan?: string;
    id?: string;
  };
  onToolSelect?: (tool: string) => void;
  activeTool?: string;
  mode?: 'chat' | 'builder';
  onModeChange?: (mode: 'chat' | 'builder') => void;
  isPro?: boolean; // ✅ KEEP ONLY THIS (prop)
}

// Sidebar event for mobile toggle
export const SIDEBAR_EVENT = 'aria:sidebar-toggle';

export function Sidebar({
  user,
  onToolSelect,
  activeTool,
  mode,
  onModeChange,
  isPro,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();

  const [convos, setConvos] = useState<Convo[]>([]);
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState<{ used: number } | null>(null);

  const [activeMode, setActiveMode] = useState<'chat' | 'builder'>('chat');
  const [activePanelTool, setActivePanelTool] = useState<string | null>(null);
  const [searchOn, setSearchOn] = useState(false);
  const [pluginsOn, setPluginsOn] = useState(true);

  // ❌ REMOVED: const [isPro, setIsPro] = useState(false);

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

  useEffect(() => {
    loadData();
  }, [pathname, loadData]);

  useEffect(() => {
    const handler = () => loadData();
    window.addEventListener('aria:new-conversation', handler);
    return () =>
      window.removeEventListener('aria:new-conversation', handler);
  }, [loadData]);

  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const { mode, activeTool, plugins, webSearch } = e.detail;

      setActiveMode(mode);
      setActivePanelTool(activeTool);
      setSearchOn(webSearch);
      setPluginsOn(plugins);

      // ❌ REMOVED: setIsPro(pro);
    };

    window.addEventListener('aria:mode-change', handler as EventListener);
    return () =>
      window.removeEventListener('aria:mode-change', handler as EventListener);
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener(SIDEBAR_EVENT, handler);
    return () => window.removeEventListener(SIDEBAR_EVENT, handler);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function deleteConvo(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    await fetch('/api/conversations', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });

    setConvos(c => c.filter(x => x._id !== id));

    if (pathname === `/chat/${id}`) {
      router.push('/chat');
    }
  }

  function tool(
    name: string,
    emoji: string,
    label: string,
    proOnly = false
  ) {
    const active =
      activePanelTool === name ||
      (name === 'search' && searchOn) ||
      (name === 'plugins' && pluginsOn);

    const disabled = proOnly && !isPro;

    return (
      <button
        onClick={() => {
          if (!disabled) {
            window.dispatchEvent(
              new CustomEvent('aria:tool-select', { detail: name })
            );
            setOpen(false);
          }
        }}
        disabled={disabled}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors text-left
        ${
          active
            ? 'bg-[#6C63FF]/20 text-[#a78bfa] border border-[#6C63FF]/30'
            : 'text-[#888899] hover:bg-white/5 hover:text-white'
        }
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className="text-base">{emoji}</span>
        <span className="text-xs font-medium flex-1">{label}</span>

        {proOnly && !isPro && (
          <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">
            Pro
          </span>
        )}
      </button>
    );
  }

  const isInChat = pathname.startsWith('/chat');

  return (
    <>
      {open && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-30"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`
        fixed md:relative z-40 flex flex-col
        w-[280px] md:w-64
        bg-[#16161d] border-r border-white/5
        transition-transform duration-200 ease-in-out
        ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}
        style={{ height: '100dvh' }}
      >
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-white/5">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#6C63FF] to-[#a78bfa] flex items-center justify-center text-white text-xs font-bold">
            A
          </div>
          <span className="font-semibold text-sm">Aria</span>

          {user.plan === 'pro' && (
            <span className="ml-2 text-[10px] bg-[#6C63FF]/20 text-[#a78bfa] px-1.5 py-0.5 rounded-full">
              Pro
            </span>
          )}

          <button
            onClick={() => setOpen(false)}
            className="md:hidden ml-auto text-[#888899]"
          >
            ✕
          </button>
        </div>

        <div className="px-3 pt-3">
          <Link
            href="/chat"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 w-full bg-[#6C63FF] text-white px-3 py-2.5 rounded-xl"
          >
            + New conversation
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {convos.length === 0 ? (
            <p className="text-xs text-[#555566] text-center py-6">
              No conversations yet
            </p>
          ) : (
            convos.map(c => (
              <Link
                key={c._id}
                href={`/chat/${c._id}`}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between px-3 py-2 rounded-xl text-sm text-[#888899] hover:bg-white/5"
              >
                <span className="truncate text-xs">{c.title}</span>
                <button
                  onClick={e => deleteConvo(c._id, e)}
                  className="text-red-400 text-xs"
                >
                  ✕
                </button>
              </Link>
            ))
          )}
        </div>

        <div className="px-3 pb-4 border-t border-white/5 pt-3">
          <Link
            href="/settings"
            className="text-xs text-[#888899] hover:text-white"
          >
            Settings
          </Link>

          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="block mt-2 text-xs text-red-400"
          >
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
