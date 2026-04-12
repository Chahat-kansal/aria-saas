'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { formatDistanceToNow } from 'date-fns';

interface Convo { _id: string; title: string; updatedAt: string; }
interface Props { user: { name?: string; email?: string; image?: string; plan?: string; id?: string; }; }

export function Sidebar({ user }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [convos, setConvos] = useState<Convo[]>([]);
  const [open, setOpen] = useState(true);
  const [usage, setUsage] = useState<{ used: number } | null>(null);

  useEffect(() => {
    fetch('/api/conversations').then(r => r.json()).then(setConvos).catch(() => {});
    fetch('/api/user').then(r => r.json()).then(d => setUsage({ used: d.messagesUsedThisMonth })).catch(() => {});
  }, [pathname]);

  async function deleteConvo(id: string, e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    await fetch('/api/conversations', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    setConvos(c => c.filter(x => x._id !== id));
    if (pathname === `/chat/${id}`) router.push('/chat');
  }

  return (
    <>
      {/* Mobile toggle */}
      <button onClick={() => setOpen(o => !o)} className="lg:hidden fixed top-4 left-4 z-50 bg-[#1f1f2a] border border-white/10 rounded-lg p-2 text-white">
        {open ? '✕' : '☰'}
      </button>

      <aside className={`${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 transition-transform fixed lg:relative z-40 flex flex-col w-64 h-full bg-[#16161d] border-r border-white/5`}>
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-white/5">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#6C63FF] to-[#a78bfa] flex items-center justify-center text-white text-xs font-bold">A</div>
          <span className="font-semibold text-sm">Aria</span>
          {user.plan === 'pro' && <span className="ml-auto text-[10px] bg-[#6C63FF]/20 text-[#a78bfa] border border-[#6C63FF]/30 px-1.5 py-0.5 rounded-full">Pro</span>}
        </div>

        {/* New chat */}
        <div className="px-3 pt-3">
          <Link href="/chat" className="flex items-center gap-2 w-full bg-[#6C63FF] hover:bg-[#4b44cc] text-white text-sm font-medium px-3 py-2.5 rounded-xl transition-colors">
            <span className="text-lg leading-none">+</span> New conversation
          </Link>
        </div>

        {/* Conversations */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          {convos.length === 0 && (
            <p className="text-xs text-[#555566] text-center py-8">No conversations yet</p>
          )}
          {convos.map(c => (
            <Link key={c._id} href={`/chat/${c._id}`} className={`group flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-colors ${pathname === `/chat/${c._id}` ? 'bg-white/10 text-white' : 'text-[#888899] hover:bg-white/5 hover:text-white'}`}>
              <span className="flex-1 truncate">{c.title}</span>
              <button onClick={e => deleteConvo(c._id, e)} className="opacity-0 group-hover:opacity-100 text-[#555566] hover:text-red-400 transition-all text-xs px-1">✕</button>
            </Link>
          ))}
        </div>

        {/* Bottom: usage + user */}
        <div className="px-3 pb-4 space-y-2 border-t border-white/5 pt-3">
          {user.plan === 'free' && usage && (
            <div className="bg-white/5 rounded-xl p-3">
              <div className="flex justify-between text-xs text-[#888899] mb-1.5">
                <span>Messages</span>
                <span>{usage.used} / 50</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-[#6C63FF] rounded-full transition-all" style={{ width: `${Math.min((usage.used / 50) * 100, 100)}%` }} />
              </div>
              <Link href="/settings" className="block text-center text-xs text-[#6C63FF] hover:underline mt-2">Upgrade to Pro →</Link>
            </div>
          )}
          <Link href="/settings" className="flex items-center gap-2 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors group">
            {user.image ? <img src={user.image} className="w-7 h-7 rounded-full" alt="" /> : <div className="w-7 h-7 rounded-full bg-[#6C63FF]/30 flex items-center justify-center text-xs font-medium text-[#a78bfa]">{user.name?.[0]?.toUpperCase()}</div>}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-white truncate">{user.name}</div>
              <div className="text-[10px] text-[#555566] truncate">{user.email}</div>
            </div>
            <button onClick={() => signOut({ callbackUrl: '/login' })} className="opacity-0 group-hover:opacity-100 text-[#555566] hover:text-white text-xs transition-all" title="Sign out">⏻</button>
          </Link>
        </div>
      </aside>
    </>
  );
}
