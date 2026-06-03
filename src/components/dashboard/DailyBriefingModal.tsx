'use client';
import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
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

// Exported so other components can trigger the briefing manually.
// Clears any local dismiss flag for today, then dispatches an event
// the modal listens for. The modal re-runs load() on the event.
export function showAriaBriefing() {
  if (typeof window === 'undefined') return;
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  localStorage.removeItem(`aria_briefing_dismissed_${today}`);
  window.dispatchEvent(new CustomEvent('aria:show-briefing'));
}

export function DailyBriefingModal() {
  const { business } = useBusinessContext();
  const router = useRouter();

  // Visibility is ALWAYS controlled by user action — never by data state
  const [isBriefingOpen, setIsBriefingOpen] = useState(false);
  const [hasUserDismissedBriefing, setHasUserDismissedBriefing] = useState(false);
  const [isBriefingLoading, setIsBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState(false);
  const [authFailed, setAuthFailed] = useState(false);  // stop all retries after 401
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [hasLiveData, setHasLiveData] = useState(false);

  // LOCAL date (YYYY-MM-DD) — UTC caused dismissals to persist across
  // the user's local day in AU timezones until UTC midnight rolled over.
  const today = (() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  })();

  const load = useCallback(async () => {
    if (!business?.id) return;
    if (authFailed) return;  // session expired — don't hammer API

    // Respect localStorage dismiss for today only — never auto-dismiss for other reasons
    const lsKey = `aria_briefing_dismissed_${today}`;
    if (localStorage.getItem(lsKey)) {
      setHasUserDismissedBriefing(true);
      return;
    }

    setIsBriefingLoading(true);
    setBriefingError(false);

    try {
      // Primary: council briefing — the 4-brain AI system
      const councilRes = await fetch('/api/aria/briefing?businessId=' + business.id);

      if (councilRes.status === 401 || councilRes.status === 429) {
        setAuthFailed(true);
        setIsBriefingLoading(false);
        return;
      }

      if (councilRes.ok) {
        const councilData = await councilRes.json();
        if (councilData?.briefing || councilData?.recommendations?.length) {
          // If council returned structured recommendations, use them directly
          if (Array.isArray(councilData.recommendations) && councilData.recommendations.length > 0) {
            setRecs(councilData.recommendations.filter((r: Recommendation) => r.title?.trim() && r.description?.trim()));
            setHasLiveData(true);
            setTimeout(() => setIsBriefingOpen(true), 800);
            setIsBriefingLoading(false);
            return;
          }
          // Council returned a text briefing — parse into multiple insight cards
          if (councilData?.briefing) {
            const text: string = councilData.briefing;
            // Split on sentence-ending punctuation followed by capital letter (new insight)
            // Also split on em-dash sections, numbered points, or double newlines
            const rawSentences = text
              .split(/(?<=[.!?])\s+(?=[A-Z])|—\s*(?=[A-Z])|

+/)
              .map((s: string) => s.trim())
              .filter((s: string) => s.length > 20);

            // Group into meaningful cards (2-3 sentences each, max 4 cards)
            const chunkSize = Math.ceil(rawSentences.length / Math.min(4, Math.max(1, Math.ceil(rawSentences.length / 2))));
            const chunks: string[][] = [];
            for (let i = 0; i < rawSentences.length; i += chunkSize) {
              chunks.push(rawSentences.slice(i, i + chunkSize));
            }

            // Map chunks to recommendation cards with varied categories/priorities
            const categoryMap: Array<{ category: Recommendation['category']; priority: Recommendation['priority']; icon: string }> = [
              { category: 'revenue', priority: 'high', icon: '💰' },
              { category: 'customers', priority: 'high', icon: '👥' },
              { category: 'stock', priority: 'medium', icon: '📦' },
              { category: 'marketing', priority: 'medium', icon: '📣' },
              { category: 'reviews', priority: 'low', icon: '⭐' },
            ];

            const parsed: Recommendation[] = chunks.slice(0, 4).map((chunk, idx) => {
              const meta = categoryMap[idx % categoryMap.length];
              const sentences = chunk.join(' ');
              // Extract a short title from first ~6 words
              const words = sentences.split(' ');
              const title = words.slice(0, 6).join(' ').replace(/[,.:;]$/, '') + (words.length > 6 ? '…' : '');
              return {
                id: \`council-\${idx}\`,
                priority: meta.priority,
                category: meta.category,
                title,
                description: sentences,
                action_label: idx === 0 ? 'View full briefing' : 'Take action',
                action_type: 'navigate' as const,
                metric: '',
                metric_label: '',
                trend: null,
                action_payload: { href: '/dashboard/ask-aria' },
              };
            });

            // Always add a "view full briefing" card at the end if more than 1 card
            if (parsed.length > 1) {
              parsed.push({
                id: 'council-view-full',
                priority: 'low',
                category: 'compliance',
                title: 'Read full intelligence brief',
                description: 'Open Ask Aria to see the complete analysis with all insights, trends, and recommendations for today.',
                action_label: 'Open full briefing →',
                action_type: 'navigate',
                metric: '',
                metric_label: '',
                trend: null,
                action_payload: { href: '/dashboard/ask-aria' },
              });
            }

            setRecs(parsed.filter(r => r.title.trim() && r.description.trim()));
            setHasLiveData(true);
            setTimeout(() => setIsBriefingOpen(true), 800);
            setIsBriefingLoading(false);
            return;
          }
        }
      }

      // Fallback: legacy daily-briefing route
      const res = await fetch('/api/aria/daily-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, force_refresh: true }),
      });

      if (res.status === 401 || res.status === 429) {
        setAuthFailed(true);
        setIsBriefingLoading(false);
        return;
      }

      if (!res.ok) {
        // Legacy route failed — show empty state instead of error
        setRecs([]);
        setHasLiveData(false);
        setTimeout(() => setIsBriefingOpen(true), 800);
        setIsBriefingLoading(false);
        return;
      }

      const data = await res.json();

      if (data.dismissed_at) {
        const dd = new Date(data.dismissed_at);
        const yyyy = dd.getFullYear();
        const mm = String(dd.getMonth() + 1).padStart(2, '0');
        const day = String(dd.getDate()).padStart(2, '0');
        const dismissedDate = `${yyyy}-${mm}-${day}`;
        if (dismissedDate === today) {
          setHasUserDismissedBriefing(true);
          setIsBriefingLoading(false);
          return;
        }
      }

      if (data.remind_at && new Date(data.remind_at) > new Date()) {
        setIsBriefingLoading(false);
        return;
      }

      const validRecs = (data.recommendations ?? []).filter(
        (r: Recommendation) => r.title?.trim() && r.description?.trim()
      );

      setRecs(validRecs);
      setHasLiveData(validRecs.length > 0);
      setTimeout(() => setIsBriefingOpen(true), 800);
    } catch {
      // Never show error — open with empty state instead
      setRecs([]);
      setHasLiveData(false);
      setTimeout(() => setIsBriefingOpen(true), 800);
    }

    setIsBriefingLoading(false);
  }, [business?.id, today, authFailed]);

  useEffect(() => { load(); }, [load]);

  // Listen for manual trigger from header button
  useEffect(() => {
    const handler = () => {
      setHasUserDismissedBriefing(false);
      setIsBriefingOpen(false);
      // Brief delay so React commits the closed state before reopening
      setTimeout(() => { load(); }, 100);
    };
    window.addEventListener('aria:show-briefing', handler);
    return () => window.removeEventListener('aria:show-briefing', handler);
  }, [load]);

  // Dismiss: user explicitly closes — set localStorage + PATCH DB
  async function dismiss() {
    setIsBriefingOpen(false);
    setHasUserDismissedBriefing(true);
    localStorage.setItem(`aria_briefing_dismissed_${today}`, '1');
    if (!business?.id) return;
    await fetch('/api/aria/daily-briefing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id }),
    });
  }

  async function remindLater() {
    setIsBriefingOpen(false);
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
    if (route) { router.push(route); setIsBriefingOpen(false); }
    setActionLoading(null);
  }

  const sorted = [...recs].sort((a, b) => {
    const o = { high: 0, medium: 1, low: 2 };
    return o[a.priority] - o[b.priority];
  });

  const firstName = business?.owner_name?.split(' ')[0] ?? 'there';
  const dateStr = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });

  // Don't render if dismissed today
  if (hasUserDismissedBriefing) return null;

  return (
    <AnimatePresence>
      {/* Loading skeleton — appears after 1s delay to avoid flash on fast connections */}
      {isBriefingLoading && (
        <motion.div
          key="skeleton"
          className="fixed z-50 bg-[#13131a] border border-[rgba(255,255,255,0.08)] shadow-2xl
            bottom-0 left-0 right-0 rounded-t-2xl
            md:bottom-6 md:right-6 md:left-auto md:w-[420px] md:rounded-2xl"
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ delay: 1, type: 'spring', damping: 28, stiffness: 300 }}
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

      {isBriefingOpen && !isBriefingLoading && (
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
          {/* Mobile backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/40 z-[-1] md:hidden"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={dismiss}
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
              </div>
              <button
                onClick={dismiss}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-[rgba(255,255,255,0.3)] hover:text-white hover:bg-[rgba(255,255,255,0.06)] transition-colors flex-shrink-0"
                aria-label="Close briefing"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Error state — API failed but modal still shows */}
          {briefingError && (
            <div className="px-5 py-8 text-center">
              <p className="text-2xl mb-3">⚠️</p>
              <p className="text-sm font-semibold text-white mb-1">Couldn&apos;t load today&apos;s insights</p>
              <p className="text-xs text-[rgba(255,255,255,0.4)] mb-4">Aria couldn&apos;t connect to your business data right now.</p>
              <button
                onClick={() => { setBriefingError(false); setIsBriefingLoading(true); load(); }}
                className="text-xs font-medium text-[#1D9E75] hover:underline"
              >
                Retry
              </button>
              <button onClick={dismiss} className="block mx-auto mt-3 text-xs text-[rgba(255,255,255,0.3)] hover:text-white transition-colors">
                Dismiss for today
              </button>
            </div>
          )}

          {/* No live data — show onboarding state instead of empty/healthy */}
          {!briefingError && !hasLiveData && sorted.length === 0 && (
            <div className="px-5 py-6">
              <div className="text-center mb-5">
                <p className="text-2xl mb-2">🏪</p>
                <p className="text-sm font-semibold text-white mb-1">Aria is ready</p>
                <p className="text-xs text-[rgba(255,255,255,0.45)] leading-relaxed">
                  Live business activity hasn&apos;t started yet. Start using Aria POS or connect your existing POS to unlock live intelligence.
                </p>
              </div>
              <div className="space-y-2">
                <Link
                  href="/pos"
                  onClick={dismiss}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-[#1D9E75] text-white text-xs font-semibold hover:bg-[#179968] transition-colors"
                >
                  Open Aria POS
                </Link>
                <Link
                  href="/dashboard/integrations"
                  onClick={dismiss}
                  className="flex items-center justify-center w-full py-2.5 rounded-xl border border-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.6)] text-xs font-medium hover:text-white hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                >
                  Connect existing POS
                </Link>
                <Link
                  href="/dashboard/import-data"
                  onClick={dismiss}
                  className="block text-center text-[10px] text-[rgba(255,255,255,0.25)] hover:text-[rgba(255,255,255,0.5)] transition-colors pt-1"
                >
                  Import historical data
                </Link>
              </div>
            </div>
          )}

          {/* Has live recommendations */}
          {!briefingError && sorted.length > 0 && (
            <>
              <p className="px-5 pt-3 pb-1 text-[11px] text-[rgba(255,255,255,0.4)]">
                Here&apos;s what I noticed about {business?.name}
              </p>
              <div className="overflow-y-auto max-h-[55vh] md:max-h-[400px] px-3 py-2 space-y-2">
                {sorted.map(rec => (
                  <div key={rec.id}
                    className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden flex">
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
            </>
          )}

          {/* Footer — always shown */}
          {!briefingError && (
            <div className="px-4 py-3 border-t border-[rgba(255,255,255,0.06)]">
              <div className="flex gap-2 mb-2">
                <button
                  onClick={remindLater}
                  className="flex-1 py-2 rounded-xl text-[11px] font-medium bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.08)] text-[rgba(255,255,255,0.5)] transition-colors"
                >
                  Remind in 2 hours
                </button>
                <button
                  onClick={dismiss}
                  className="flex-1 py-2 rounded-xl text-[11px] font-medium bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.35)] transition-colors border border-[rgba(255,255,255,0.06)]"
                >
                  Dismiss for today
                </button>
              </div>
              <p className="text-center text-[9px] text-[rgba(255,255,255,0.2)]">Aria analyses your data every 6 hours</p>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
