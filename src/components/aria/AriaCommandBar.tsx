'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface NavResult {
  type: 'nav';
  label: string;
  href: string;
  description: string;
  icon: string;
}

interface AnswerResult {
  type: 'answer';
  text: string;
}

interface ActionResult {
  type: 'action';
  label: string;
  href: string;
  description: string;
}

type Result = NavResult | AnswerResult | ActionResult;

const NAV_ROUTES: NavResult[] = [
  { type: 'nav', label: 'Dashboard', href: '/dashboard', description: 'Daily briefing and overview', icon: '📊' },
  { type: 'nav', label: 'Ask Aria', href: '/dashboard/ask-aria', description: 'Chat with your business intelligence', icon: '✦' },
  { type: 'nav', label: 'Profit Leaks', href: '/dashboard/profit-leaks', description: 'Find where money is being lost', icon: '💰' },
  { type: 'nav', label: 'Customer Winback', href: '/dashboard/winback', description: 'Re-engage lapsed customers', icon: '👥' },
  { type: 'nav', label: 'Reviews', href: '/dashboard/reviews', description: 'Manage and reply to customer reviews', icon: '⭐' },
  { type: 'nav', label: 'Smart Reorder', href: '/dashboard/reorder', description: 'Products that need reordering', icon: '📦' },
  { type: 'nav', label: 'Staff', href: '/dashboard/staff', description: 'Team management and compliance', icon: '👤' },
  { type: 'nav', label: 'Stock', href: '/dashboard/warehouse/stock', description: 'Warehouse stock overview', icon: '🏭' },
  { type: 'nav', label: 'Variance', href: '/dashboard/variance', description: 'Track stock discrepancies', icon: '📉' },
  { type: 'nav', label: 'Recipes', href: '/dashboard/recipes', description: 'Recipe management and training', icon: '🍳' },
  { type: 'nav', label: 'Sell', href: '/pos/terminal', description: 'Open the POS terminal', icon: '🏪' },
  { type: 'nav', label: 'Products', href: '/pos/products', description: 'Manage product catalogue', icon: '📋' },
  { type: 'nav', label: 'Tables', href: '/pos/tables', description: 'Table management for hospitality', icon: '🪑' },
  { type: 'nav', label: 'Kitchen', href: '/pos/kitchen', description: 'Kitchen display system', icon: '👨‍🍳' },
  { type: 'nav', label: 'Purchase Orders', href: '/pos/orders', description: 'Manage supplier orders', icon: '🛒' },
  { type: 'nav', label: 'Customers', href: '/pos/customers', description: 'Customer management', icon: '👥' },
  { type: 'nav', label: 'Reports', href: '/pos/reports', description: 'Sales and performance reports', icon: '📈' },
  { type: 'nav', label: 'Settings', href: '/pos/settings', description: 'POS configuration', icon: '⚙️' },
  { type: 'nav', label: 'Website Chat', href: '/dashboard/website-chat', description: 'Customer website AI assistant', icon: '💬' },
];

function searchNav(query: string): NavResult[] {
  const q = query.toLowerCase();
  return NAV_ROUTES.filter(r =>
    r.label.toLowerCase().includes(q) ||
    r.description.toLowerCase().includes(q) ||
    r.href.includes(q)
  ).slice(0, 5);
}

const QUICK_ACTIONS = [
  { label: 'What should I do today?', icon: '🌅' },
  { label: 'Show me my profit leaks', icon: '💸' },
  { label: 'Which customers need a winback?', icon: '📱' },
  { label: 'What should I reorder?', icon: '📦' },
];

export function AriaCommandBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { business } = useBusinessContext();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Cmd/Ctrl+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(v => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on route change
  useEffect(() => { setOpen(false); }, [pathname]);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }

    // Always show nav results immediately
    const navResults = searchNav(q);

    // Check if it's a question (call API) vs just navigation
    const isQuestion = /\b(how|what|why|which|show|tell|compare|analyse|analyze|is|are|do|did|can|will|who|when)\b/i.test(q) || q.includes('?');

    if (!isQuestion) {
      setResults(navResults);
      return;
    }

    setResults(navResults); // show nav first while loading
    if (!business?.id) return;

    setLoading(true);
    try {
      const res = await fetch('/api/aria/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, query: q, page: pathname }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.type === 'answer' && d.results?.[0]?.text) {
          setResults([{ type: 'answer', text: d.results[0].text }, ...navResults.slice(0, 3)]);
        } else if (d.type === 'action' && d.results?.length > 0) {
          const actions: ActionResult[] = d.results.map((r: { label: string; href: string; description: string }) => ({
            type: 'action' as const, label: r.label, href: r.href, description: r.description,
          }));
          setResults([...actions, ...navResults.slice(0, 2)]);
        } else {
          setResults(navResults);
        }
      }
    } catch { setResults(navResults); }
    setLoading(false);
  }, [business?.id, pathname]);

  // Debounced search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, search]);

  function handleSelect(result: Result) {
    if (result.type === 'answer') return; // don't navigate on answer
    router.push((result as NavResult | ActionResult).href);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter') {
      const r = results[selectedIdx];
      if (r) handleSelect(r);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[999] flex items-start justify-center pt-[15vh]"
      style={{ backdropFilter: 'blur(8px)', background: 'rgba(0,0,0,0.7)' }}
      onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div className="w-full max-w-xl mx-4 rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.1)' }}>

        {/* Input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[rgba(255,255,255,0.07)]">
          <span className="text-[#1D9E75] text-lg flex-shrink-0">✦</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Aria anything…"
            className="flex-1 bg-transparent text-white text-base outline-none placeholder:text-[rgba(255,255,255,0.3)]"
          />
          {loading && (
            <div className="flex gap-1">
              {[0,1,2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#1D9E75]"
                  style={{ animation: `ariapulse 1.4s ease-in-out ${i*0.2}s infinite` }} />
              ))}
            </div>
          )}
          <kbd className="text-[10px] text-[rgba(255,255,255,0.25)] border border-[rgba(255,255,255,0.1)] rounded px-1.5 py-0.5 flex-shrink-0">ESC</kbd>
        </div>

        {/* Quick actions (no query) */}
        {!query && (
          <div className="p-3">
            <p className="text-[10px] font-semibold text-[rgba(255,255,255,0.3)] uppercase tracking-wider px-2 mb-2">Quick actions</p>
            <div className="space-y-0.5">
              {QUICK_ACTIONS.map(a => (
                <button key={a.label} onClick={() => setQuery(a.label)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-[rgba(255,255,255,0.05)] transition-colors group">
                  <span className="text-base">{a.icon}</span>
                  <span className="text-sm text-[rgba(255,255,255,0.6)] group-hover:text-white transition-colors">{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="p-3 space-y-0.5 max-h-80 overflow-y-auto">
            {results.map((r, i) => {
              const isSelected = i === selectedIdx;
              if (r.type === 'answer') {
                return (
                  <div key={i} className="px-3 py-3 rounded-xl"
                    style={{ background: 'rgba(29,158,117,0.08)', border: '1px solid rgba(29,158,117,0.15)' }}>
                    <p className="text-[10px] font-semibold text-[#1D9E75] uppercase tracking-wider mb-1.5">✦ Aria</p>
                    <p className="text-sm text-[rgba(255,255,255,0.75)] leading-relaxed">{r.text}</p>
                    <a href="/dashboard/ask-aria" onClick={() => setOpen(false)}
                      className="text-[11px] text-[#1D9E75] hover:text-[#8ff1c9] mt-2 inline-block transition-colors">
                      Continue in Ask Aria →
                    </a>
                  </div>
                );
              }
              const label = (r as NavResult | ActionResult).label;
              const href  = (r as NavResult | ActionResult).href;
              const desc  = (r as NavResult | ActionResult).description;
              const icon  = r.type === 'nav' ? (r as NavResult).icon : '→';
              return (
                <button key={i} onClick={() => handleSelect(r)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${isSelected ? 'bg-[rgba(255,255,255,0.08)]' : 'hover:bg-[rgba(255,255,255,0.04)]'}`}>
                  <span className="text-base flex-shrink-0">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{label}</p>
                    <p className="text-[11px] text-[rgba(255,255,255,0.4)] truncate">{desc} · {href}</p>
                  </div>
                  {isSelected && <kbd className="text-[10px] text-[rgba(255,255,255,0.3)] border border-[rgba(255,255,255,0.1)] rounded px-1.5 py-0.5 flex-shrink-0">↵</kbd>}
                </button>
              );
            })}
          </div>
        )}

        <div className="px-5 py-2.5 border-t border-[rgba(255,255,255,0.05)] flex items-center gap-4">
          <span className="text-[10px] text-[rgba(255,255,255,0.2)]">↑↓ navigate · ↵ select · ESC close</span>
        </div>
      </div>
      <style jsx global>{`
        @keyframes ariapulse {
          0%, 60%, 100% { opacity: 0.3; transform: scale(0.8); }
          30% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
