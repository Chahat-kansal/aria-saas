'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import Link from 'next/link';

interface IntelligenceEvent {
  id: string;
  event_type: string;
  severity: 'critical' | 'high' | 'medium' | 'info';
  title: string;
  body: string;
  data?: Record<string, unknown>;
  action_label?: string;
  action_href?: string;
  triggered_at: string;
  acknowledged: boolean;
}

const SEV_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  critical: { bg: 'rgba(239,68,68,0.1)',  text: '#ef4444', dot: '#ef4444' },
  high:     { bg: 'rgba(251,191,36,0.1)', text: '#fbbf24', dot: '#f59e0b' },
  medium:   { bg: 'rgba(99,102,241,0.1)', text: '#818cf8', dot: '#818cf8' },
  info:     { bg: 'rgba(255,255,255,0.04)', text: 'rgba(255,255,255,0.6)', dot: 'rgba(255,255,255,0.3)' },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function IntelligencePage() {
  const { business } = useBusinessContext();
  const [events, setEvents] = useState<IntelligenceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('unread');
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    try {
      const acknowledged = filter === 'unread' ? 'false' : undefined;
      const url = `/api/intelligence-events?business_id=${business.id}&limit=50${acknowledged ? `&acknowledged=${acknowledged}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      setEvents(data.events ?? []);
    } finally {
      setLoading(false);
    }
  }, [business?.id, filter]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  async function acknowledge(id: string) {
    if (!business?.id) return;
    setAcknowledging(id);
    try {
      await fetch('/api/intelligence-events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, business_id: business.id, acknowledged: true }),
      });
      setEvents(prev => prev.filter(e => e.id !== id));
    } finally {
      setAcknowledging(null);
    }
  }

  async function acknowledgeAll() {
    if (!business?.id) return;
    const unread = events.filter(e => !e.acknowledged);
    await Promise.all(unread.map(e =>
      fetch('/api/intelligence-events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: e.id, business_id: business.id, acknowledged: true }),
      })
    ));
    fetchEvents();
  }

  const critical = events.filter(e => e.severity === 'critical' && !e.acknowledged).length;
  const high = events.filter(e => e.severity === 'high' && !e.acknowledged).length;

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: '#0d0d14' }}>
      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center justify-between flex-shrink-0"
        style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#13131a' }}>
        <div>
          <h1 className="font-semibold text-white text-lg">Intelligence Centre</h1>
          <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
            Aria-detected events, alerts, and opportunities for {business?.name ?? 'your business'}
          </p>
        </div>
        {events.some(e => !e.acknowledged) && (
          <button onClick={acknowledgeAll}
            className="text-xs px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
            Clear all
          </button>
        )}
      </div>

      <div className="p-6 space-y-5 max-w-4xl mx-auto w-full">
        {/* Summary bar */}
        {(critical > 0 || high > 0) && (
          <div className="rounded-xl p-4 border flex items-center gap-4"
            style={{ background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.2)' }}>
            {critical > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm font-medium text-red-400">{critical} critical</span>
              </div>
            )}
            {high > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-sm font-medium text-amber-400">{high} high priority</span>
              </div>
            )}
            <p className="text-xs ml-auto" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Requires attention today
            </p>
          </div>
        )}

        {/* Filter */}
        <div className="flex gap-2">
          {(['unread', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-lg text-xs capitalize"
              style={{
                background: filter === f ? 'rgba(29,158,117,0.2)' : 'rgba(255,255,255,0.04)',
                color: filter === f ? '#1D9E75' : 'rgba(255,255,255,0.5)',
                border: `1px solid ${filter === f ? 'rgba(29,158,117,0.4)' : 'rgba(255,255,255,0.08)'}`,
              }}>
              {f === 'unread' ? 'Active alerts' : 'All history'}
            </button>
          ))}
        </div>

        {/* Events list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 rounded-full border-2 border-[#1D9E75] border-t-transparent animate-spin" />
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-16" style={{ color: 'rgba(255,255,255,0.3)' }}>
            <div className="w-12 h-12 rounded-full bg-[rgba(29,158,117,0.1)] flex items-center justify-center mx-auto mb-3">
              <span className="text-[#1D9E75] text-lg font-bold">✓</span>
            </div>
            <p className="text-lg mb-1">All clear</p>
            <p className="text-sm">No active alerts for your business right now.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map(event => {
              const style = SEV_STYLE[event.severity] ?? SEV_STYLE.info;
              return (
                <div key={event.id} className="rounded-xl p-4 border"
                  style={{ background: style.bg, borderColor: 'rgba(255,255,255,0.08)' }}>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: style.dot }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm font-medium" style={{ color: style.text }}>{event.title}</p>
                        <span className="text-xs flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }}>
                          {timeAgo(event.triggered_at)}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
                        {event.body}
                      </p>
                      <div className="flex items-center gap-3 mt-2.5">
                        {event.action_href && event.action_label && (
                          <Link href={event.action_href}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium"
                            style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>
                            {event.action_label} →
                          </Link>
                        )}
                        <button
                          onClick={() => acknowledge(event.id)}
                          disabled={acknowledging === event.id}
                          className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-40"
                          style={{ color: 'rgba(255,255,255,0.4)' }}>
                          {acknowledging === event.id ? 'Dismissing…' : 'Dismiss'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Quick links to related pages */}
        <div className="pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>Related intelligence</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Missed Demand', href: '/dashboard/missed-demand' },
              { label: 'Profit Leaks', href: '/dashboard/profit-leaks' },
              { label: 'Smart Reorder', href: '/dashboard/reorder' },
              { label: 'Ask Aria', href: '/dashboard/ask-aria' },
            ].map(link => (
              <Link key={link.href} href={link.href}
                className="px-3 py-2.5 rounded-lg text-xs text-center transition-colors"
                style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.07)' }}>
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
