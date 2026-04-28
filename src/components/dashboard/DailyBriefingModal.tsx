'use client';
import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import { useRouter } from 'next/navigation';

interface Recommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: 'customers' | 'revenue' | 'stock' | 'reviews' | 'marketing' | 'compliance';
  title: string;
  description: string;
  action_label: string;
  action_type: 'winback' | 'review_reply' | 'promotion' | 'reorder' | 'campaign' | 'navigate' | 'dismiss';
  action_payload: Record<string, string>;
  metric?: string;
  metric_label?: string;
  trend?: 'up' | 'down' | 'flat' | null;
}

const PRIORITY_BAR: Record<string, string> = {
  high: 'bg-red-500', medium: 'bg-amber-400', low: 'bg-emerald-500',
};
const PRIORITY_BADGE: Record<string, string> = {
  high: 'bg-red-500/10 text-red-400 border border-red-500/20',
  medium: 'bg-amber-400/10 text-amber-400 border border-amber-400/20',
  low: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
};
const ACTION_BTN: Record<string, string> = {
  winback: 'bg-emerald-600 hover:bg-emerald-500 text-white',
  campaign: 'bg-emerald-600 hover:bg-emerald-500 text-white',
  review_reply: 'bg-amber-500 hover:bg-amber-400 text-white',
  reorder: 'bg-blue-600 hover:bg-blue-500 text-white',
  promotion: 'bg-violet-600 hover:bg-violet-500 text-white',
  navigate: 'border border-[rgba(255,255,255,0.15)] text-[rgba(255,255,255,0.7)] hover:text-white',
  dismiss: 'border border-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.4)]',
};
const CATEGORY_ICON: Record<string, string> = {
  customers: '👥', revenue: '💰', stock: '📦',
  reviews: '⭐', marketing: '📣', compliance: '✅',
};
const ACTION_ROUTES: Record<string, string> = {
  winback: '/dashboard/winback', review_reply: '/dashboard/reviews',
  promotion: '/dashboard/churn', reorder: '/pos/products?filter=low_stock',
  campaign: '/dashboard/winback',
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function SkeletonCard() {
  return (
    <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl p-3.5 animate-pulse">
      <div className="flex gap-3">
        <div className="w-6 h-6 rounded bg-[rgba(255,255,255,0.06)] flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-[rgba(255,255,255,0.06)] rounded w-3/4" />
          <div className="h-2.5 bg-[rgba(255,255,255,0.04)] rounded w-full" />
          <div className="h-2.5 bg-[rgba(255,255,255,0.04)] rounded w-2/3" />
        </div>
      </div>
    </div>
  );
}

export function DailyBriefingModal() {
  const { business } = useBusinessContext();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const load = useCallback(async () => {
    if (!business?.id) return;

    // Check localStorage for recent dismiss (mobile UX)
    const lsKey = `aria_briefing_dismissed_${today}`;
    if (localStorage.getItem(lsKey)) return;

    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/aria/daily-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id }),
      });
      if (!res.ok) { setError(true); setLoading(false); return; }
      const data = await res.json();

      if (!data.recommendations?.length) { setLoading(false); return; }

      // Check dismiss/remind state
      if (data.dismissed_at) { setLoading(false); return; }
      if (data.remind_at && new Date(data.remind_at) > new Date()) { setLoading(false); return; }

      setRecs(data.recommendations);
      setTimeout(() => setVisible(true), 1500);
    } catch {
      setError(true);
    }
    setLoading(false);
  }, [business?.id, today]);

  useEffect(() => { load(); }, [load]);

  async function dismiss() {
    setVisible(false);
    localStorage.setItem(`aria_briefing_dismissed_${today}`, '1');
    if (!business?.id) return;
    await fetch('/api/aria/daily-briefing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id }),
    });
  }

  async function remindLater() {
    setVisible(false);
    if (!business?.id) return;
    await fetch('/api/aria/daily-briefing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id, remind_in_hours: 2 }),
    });
  }

  async function handleAction(rec: Recommendation) {
    setActionLoading(rec.id);
    if (rec.action_type === 'dismiss') {
      setRecs(prev => prev.filter(r => r.id !== rec.id));
      setActionLoading(null);
      return;
    }
    const route = rec.action_type === 'navigate' && rec.action_payload?.href
      ? rec.action_payload.href
      : ACTION_ROUTES[rec.action_type];
    if (route) { router.push(route); setVisible(false); }
    setActionLoading(null);
  }

  const sorted = [...recs].sort((a, b) => {
    const o = { high: 0, medium: 1, low: 2 };
    return o[a.priority] - o[b.priority];
  });

  const firstName = business?.owner_name?.split(' ')[0] ?? 'there';
  const dateStr = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <AnimatePresence>
      {/* Show skeleton while loading (only after 2s to avoid flash) */}
      {loading && (
        <motion.div
          key="skeleton"
          className="fixed z-50 bg-[#13131a] border border-[rgba(255,255,255,0.08)] shadow-2xl
            bottom-0 left-0 right-0 rounded-t-2xl
            md:bottom-6 md:right-6 md:left-auto md:w-[420px] md:rounded-2xl"
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ delay: 2, type: 'spring', damping: 28, stiffness: 300 }}
        >
          <div className="px-5 pt-5 pb-4 border-b border-[rgba(255,255,255,0.06)]">
            <div className="h-3 bg-[rgba(255,255,255,0.06)] rounded w-32 mb-2 animate-pulse" />
            <div className="h-4 bg-[rgba(255,255,255,0.08)] rounded w-48 animate-pulse" />
          </div>
          <div className="px-4 py-3 space-y-2.5">
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        </motion.div>
      )}

      {visible && !loading && (
        <motion.div
          key="modal"
          className="fixed z-50 bg-[#13131a] border border-[rgba(255,255,255,0.08)] shadow-2xl overflow-hidden
            bottom-0 left-0 right-0 rounded-t-2xl
            md:bottom-6 md:right-6 md:left-auto md:w-[420px] md:rounded-2xl md:max-h-[85vh]"
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        >
          {/* Backdrop for mobile */}
          <motion.div
            className="fixed inset-0 bg-black/40 z-[-1] md:hidden"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setVisible(false)}
          />

          {/* Header */}
          <div className="px-5 pt-5 pb-4 border-b border-[rgba(255,255,255,0.06)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-5 h-5 rounded-full bg-[#1D9E75] flex items-center justify-center">
                    <span className="text-[9px] font-bold text-white">A</span>
                  </div>
                  <span className="text-[10px] font-semibold text-[#1D9E75] uppercase tracking-wider">Aria Daily Brief</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1D9E75] animate-pulse" />
                </div>
                <h2 className="text-[15px] font-semibold text-white">
                  {greeting()}, {firstName}
                </h2>
                <p className="text-[11px] text-[rgba(255,255,255,0.35)] mt-0.5">{dateStr}</p>
                <p className="text-[11px] text-[rgba(255,255,255,0.4)] mt-0.5">
                  Here&apos;s what I noticed about {business?.name}
                </p>
              </div>
              <button onClick={() => setVisible(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-[rgba(255,255,255,0.3)] hover:text-white hover:bg-[rgba(255,255,255,0.06)] transition-colors flex-shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Error state */}
          {error && (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-[rgba(255,255,255,0.5)] mb-3">Aria couldn&apos;t load today&apos;s insights.</p>
              <button onClick={load} className="text-xs text-[#1D9E75] hover:underline">Tap to retry</button>
            </div>
          )}

          {/* Empty state */}
          {!error && sorted.length === 0 && (
            <div className="px-5 py-8 text-center">
              <p className="text-2xl mb-2">🎉</p>
              <p className="text-sm font-semibold text-white mb-1">Your business looks healthy today</p>
              <p className="text-xs text-[rgba(255,255,255,0.4)]">No urgent actions needed.</p>
              <button onClick={dismiss} className="mt-4 text-xs text-[rgba(255,255,255,0.4)] hover:text-white transition-colors">Dismiss</button>
            </div>
          )}

          {/* Recommendation cards */}
          {!error && sorted.length > 0 && (
            <div className="overflow-y-auto max-h-[55vh] md:max-h-[400px] px-3 py-3 space-y-2">
              {sorted.map(rec => (
                <div key={rec.id}
                  className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden flex">
                  {/* Priority accent bar */}
                  <div className={`w-1 flex-shrink-0 ${PRIORITY_BAR[rec.priority]}`} />
                  <div className="flex-1 p-3.5 min-w-0">
                    <div className="flex items-start gap-2.5">
                      <span className="text-base leading-none flex-shrink-0 mt-0.5">{CATEGORY_ICON[rec.category] ?? '💡'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="text-[12px] font-semibold text-white leading-tight">{rec.title}</span>
                          {rec.trend === 'up' && <span className="text-emerald-400 text-sm flex-shrink-0">↑</span>}
                          {rec.trend === 'down' && <span className="text-red-400 text-sm flex-shrink-0">↓</span>}
                          {rec.trend === 'flat' && <span className="text-gray-400 text-sm flex-shrink-0">→</span>}
                        </div>

                        {/* Metric */}
                        {rec.metric && (
                          <div className="mb-1.5">
                            <span className="text-xl font-bold text-white">{rec.metric}</span>
                            {rec.metric_label && (
                              <span className="text-[11px] text-[rgba(255,255,255,0.4)] ml-1.5">{rec.metric_label}</span>
                            )}
                          </div>
                        )}

                        <p className="text-[11px] text-[rgba(255,255,255,0.45)] leading-snug mb-2.5">{rec.description}</p>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleAction(rec)}
                            disabled={actionLoading === rec.id}
                            className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-40 ${ACTION_BTN[rec.action_type] ?? ACTION_BTN.navigate}`}
                          >
                            {actionLoading === rec.id ? '…' : rec.action_label}
                          </button>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${PRIORITY_BADGE[rec.priority]}`}>
                            {rec.priority}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="px-4 py-3 border-t border-[rgba(255,255,255,0.06)]">
            <div className="flex gap-2 mb-2">
              <button onClick={remindLater}
                className="flex-1 py-2 rounded-xl text-[11px] font-medium bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.08)] text-[rgba(255,255,255,0.5)] transition-colors">
                Remind in 2 hours
              </button>
              <button onClick={dismiss}
                className="flex-1 py-2 rounded-xl text-[11px] font-medium bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.35)] transition-colors border border-[rgba(255,255,255,0.06)]">
                Dismiss for today
              </button>
            </div>
            <p className="text-center text-[9px] text-[rgba(255,255,255,0.2)]">Aria analyses your data every 6 hours</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
