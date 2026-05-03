'use client';
import { useState, useEffect } from 'react';

interface Props {
  page: string;
  businessId?: string | null;
}

export function POSAriaInsight({ page, businessId }: Props) {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!businessId) { setLoading(false); return; }
    const cacheKey = `aria_pos_insight_${page}_${businessId}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { text, ts } = JSON.parse(cached);
        if (Date.now() - ts < 3600000) { setInsight(text); setLoading(false); return; }
      }
    } catch { /* ignore */ }

    fetch('/api/aria/page-insight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId, page }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.insight) {
          setInsight(d.insight);
          try { sessionStorage.setItem(cacheKey, JSON.stringify({ text: d.insight, ts: Date.now() })); } catch { /* ignore */ }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [page, businessId]);

  if (!loading && !insight) return null;

  return (
    <div className="border-b border-gray-100 bg-white px-4 py-2 border-l-[3px] border-l-[#059669] flex items-center gap-2">
      <span className="text-xs font-semibold text-[#059669] flex-shrink-0">Aria</span>
      {loading ? (
        <div className="h-3 bg-gray-100 rounded animate-pulse flex-1 max-w-md" />
      ) : (
        <p className="text-sm text-gray-700 truncate">{insight}</p>
      )}
    </div>
  );
}
