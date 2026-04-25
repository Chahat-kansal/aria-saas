'use client';
import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import { supabase } from '@/lib/supabase';
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
}

const PRIORITY_STYLES: Record<string, { dot: string; badge: string; label: string }> = {
  high:   { dot: 'bg-red-500',   badge: 'bg-red-500/10 text-red-400 border-red-500/20',   label: 'High' },
  medium: { dot: 'bg-amber-400', badge: 'bg-amber-400/10 text-amber-400 border-amber-400/20', label: 'Medium' },
  low:    { dot: 'bg-blue-400',  badge: 'bg-blue-400/10 text-blue-400 border-blue-400/20',  label: 'Low' },
};

const CATEGORY_ICONS: Record<string, string> = {
  customers: '👥',
  revenue:   '💰',
  stock:     '📦',
  reviews:   '⭐',
  marketing: '📣',
  compliance:'📋',
};

const ACTION_ROUTES: Record<string, string> = {
  winback:      '/dashboard/winback',
  review_reply: '/dashboard/reviews',
  promotion:    '/dashboard/churn',
  reorder:      '/pos/products',
  campaign:     '/dashboard/winback',
};

export function DailyBriefingModal() {
  const { business } = useBusinessContext();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];

  const load = useCallback(async () => {
    if (!business?.id) return;

    // Check if already dismissed today
    const { data: existing } = await supabase
      .from('daily_briefings')
      .select('recommendations, dismissed_at, generated_at')
      .eq('business_id', business.id)
      .eq('date', today)
      .single();

    if (existing?.dismissed_at) return;

    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    if (existing?.generated_at > sixHoursAgo && existing.recommendations?.length > 0) {
      setRecommendations(existing.recommendations as Recommendation[]);
      setTimeout(() => setVisible(true), 1500);
      return;
    }

    // Generate fresh
    setLoading(true);
    try {
      const res = await fetch('/api/aria/daily-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, industry: business.industry }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.recommendations?.length > 0) {
          setRecommendations(data.recommendations);
          setTimeout(() => setVisible(true), 1500);
        }
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [business?.id, business?.industry, today]);

  useEffect(() => { load(); }, [load]);

  async function dismiss() {
    setVisible(false);
    if (!business?.id) return;
    await fetch('/api/aria/daily-briefing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id }),
    });
  }

  async function handleAction(rec: Recommendation) {
    setActionLoading(rec.id);
    try {
      if (rec.action_type === 'dismiss') {
        // mark this one done visually
        setRecommendations(prev => prev.filter(r => r.id !== rec.id));
      } else if (rec.action_type === 'navigate' && rec.action_payload?.href) {
        router.push(rec.action_payload.href);
        setVisible(false);
      } else if (rec.action_type === 'winback') {
        router.push('/dashboard/winback');
        setVisible(false);
      } else {
        const route = ACTION_ROUTES[rec.action_type];
        if (route) { router.push(route); setVisible(false); }
      }
    } finally {
      setActionLoading(null);
    }
  }

  const sorted = [...recommendations].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority];
  });

  const firstName = business?.owner_name?.split(' ')[0] ?? 'there';
  const dateStr = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });

  if (loading || recommendations.length === 0) return null;

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop — mobile only */}
          <motion.div
            className="fixed inset-0 bg-black/40 z-40 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setVisible(false)}
          />

          {/* Panel — slides from right on desktop, slides up on mobile */}
          <motion.div
            className="fixed z-50 bg-[#13131a] border border-[rgba(255,255,255,0.08)] shadow-2xl overflow-hidden
              bottom-0 left-0 right-0 rounded-t-2xl
              md:bottom-6 md:right-6 md:left-auto md:w-[420px] md:rounded-2xl md:top-auto"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          >
            {/* Header */}
            <div className="px-5 pt-5 pb-4 border-b border-[rgba(255,255,255,0.06)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-semibold text-[#1D9E75] uppercase tracking-wider">Aria Daily Brief</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1D9E75] animate-pulse" />
                  </div>
                  <h2 className="text-[15px] font-semibold text-white leading-tight">
                    Good morning, {firstName}
                  </h2>
                  <p className="text-[11px] text-[rgba(255,255,255,0.35)] mt-0.5">{dateStr}</p>
                </div>
                <button
                  onClick={() => setVisible(false)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-[rgba(255,255,255,0.3)] hover:text-white hover:bg-[rgba(255,255,255,0.06)] transition-colors flex-shrink-0 mt-0.5"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* Recommendations */}
            <div className="overflow-y-auto max-h-[60vh] md:max-h-[420px] px-4 py-3 space-y-2.5">
              {sorted.map(rec => {
                const ps = PRIORITY_STYLES[rec.priority] ?? PRIORITY_STYLES.low;
                return (
                  <div
                    key={rec.id}
                    className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl p-3.5"
                  >
                    <div className="flex items-start gap-3">
                      <div className="text-lg leading-none mt-0.5 flex-shrink-0">
                        {CATEGORY_ICONS[rec.category] ?? '💡'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[12px] font-semibold text-white leading-tight">{rec.title}</span>
                          <span className={`flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded-full border font-semibold ${ps.badge}`}>
                            {ps.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-[rgba(255,255,255,0.5)] leading-snug mb-2.5">
                          {rec.description}
                        </p>
                        {rec.action_type !== 'dismiss' && (
                          <button
                            onClick={() => handleAction(rec)}
                            disabled={actionLoading === rec.id}
                            className="text-[11px] font-semibold text-[#1D9E75] hover:text-white border border-[rgba(29,158,117,0.3)] hover:bg-[#1D9E75] px-3 py-1 rounded-lg transition-all disabled:opacity-40"
                          >
                            {actionLoading === rec.id ? '…' : rec.action_label}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer actions */}
            <div className="px-4 py-3 border-t border-[rgba(255,255,255,0.06)] flex items-center gap-3">
              <button
                onClick={dismiss}
                className="flex-1 py-2 rounded-xl text-[12px] font-semibold bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.09)] text-[rgba(255,255,255,0.6)] transition-colors"
              >
                Dismiss for today
              </button>
              <button
                onClick={() => setVisible(false)}
                className="flex-1 py-2 rounded-xl text-[12px] font-semibold border border-[rgba(255,255,255,0.08)] text-[rgba(255,255,255,0.4)] hover:text-white transition-colors"
              >
                Remind me later
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}