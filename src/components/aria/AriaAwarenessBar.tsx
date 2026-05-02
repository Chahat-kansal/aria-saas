'use client';
import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface Insight {
  insight: string;
  priority: 'info' | 'warning' | 'critical';
  link?: string;
}

const BORDER: Record<string, string> = {
  info:     'border-l-[#1D9E75] bg-[rgba(29,158,117,0.04)]',
  warning:  'border-l-amber-500 bg-[rgba(245,158,11,0.04)]',
  critical: 'border-l-red-500 bg-[rgba(239,68,68,0.05)]',
};
const TEXT: Record<string, string> = {
  info:     'text-[rgba(255,255,255,0.55)]',
  warning:  'text-amber-200/70',
  critical: 'text-red-300/80',
};
const DOT: Record<string, string> = {
  info:     'bg-[#1D9E75]',
  warning:  'bg-amber-500',
  critical: 'bg-red-500',
};

// Page slug from pathname
function pageSlug(pathname: string): string {
  const stripped = pathname.replace('/dashboard/', '').replace('/pos/', '').replace(/\/$/, '');
  if (!stripped || stripped === 'dashboard' || stripped === 'pos') return 'dashboard';
  return stripped;
}

const SESSION_KEY = (page: string, bid: string) => `aria_insight_${page}_${bid}`;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export function AriaAwarenessBar() {
  const { business } = useBusinessContext();
  const pathname = usePathname();
  const [insight, setInsight] = useState<Insight | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);

  const page = pageSlug(pathname);
  const cacheKey = business?.id ? SESSION_KEY(page, business.id) : null;

  const fetchInsight = useCallback(async () => {
    if (!business?.id || dismissed) return;

    // Check sessionStorage cache
    if (cacheKey) {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const { data, ts } = JSON.parse(cached);
          if (Date.now() - ts < CACHE_TTL) { setInsight(data); return; }
        }
      } catch { /* ignore */ }
    }

    setLoading(true);
    try {
      const res = await fetch('/api/aria/page-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, page }),
      });
      if (res.ok) {
        const data: Insight = await res.json();
        if (data.insight) {
          setInsight(data);
          if (cacheKey) {
            try { sessionStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() })); } catch { /* ignore */ }
          }
        }
      }
    } catch { /* silent — awareness bar is non-critical */ }
    setLoading(false);
  }, [business?.id, page, dismissed, cacheKey]);

  useEffect(() => {
    setInsight(null);
    setDismissed(false);
    fetchInsight();
  }, [fetchInsight]);

  if (dismissed || (!loading && !insight)) return null;

  const priority = insight?.priority ?? 'info';

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 border-l-2 flex-shrink-0 ${BORDER[priority]}`}
      style={{ minHeight: '36px' }}
    >
      {loading && !insight ? (
        <div className="flex gap-1">
          {[0, 1, 2].map(i => (
            <div key={i} className={`w-1 h-1 rounded-full ${DOT.info}`}
              style={{ animation: `ariapulse 1.4s ease-in-out ${i * 0.2}s infinite`, opacity: 0.4 }} />
          ))}
        </div>
      ) : insight ? (
        <>
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT[priority]}`} />
          <p className={`text-xs flex-1 min-w-0 ${TEXT[priority]}`}>
            <span className="font-medium text-[rgba(255,255,255,0.35)] mr-1">Aria:</span>
            {insight.insight}
          </p>
          {insight.link && (
            <a href={insight.link}
              className="text-[11px] text-[#1D9E75] hover:text-[#8ff1c9] transition-colors flex-shrink-0 ml-2">
              →
            </a>
          )}
        </>
      ) : null}
      <button
        onClick={() => setDismissed(true)}
        className="text-[rgba(255,255,255,0.2)] hover:text-[rgba(255,255,255,0.5)] transition-colors text-sm leading-none flex-shrink-0 ml-1"
        aria-label="Dismiss insight"
      >
        ×
      </button>
      <style jsx>{`
        @keyframes ariapulse {
          0%, 60%, 100% { opacity: 0.3; transform: scale(0.8); }
          30% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
