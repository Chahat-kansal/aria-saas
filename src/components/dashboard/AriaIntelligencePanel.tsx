'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

type Mode = 'sales' | 'inventory' | 'reorder' | 'profit' | 'supplier' | 'customer' | 'staff' | 'health';

type Intelligence = {
  summary?: string;
  observations?: Array<{
    title: string;
    what_happened: string;
    what_it_means: string;
    evidence: string[];
    confidence: string;
  }>;
  recommendations?: Array<{
    recommendation: string;
    reason: string;
    evidence: string[];
    confidence: string;
  }>;
  missing_data?: string[];
  error?: string;
};

export function AriaIntelligencePanel({ mode, title = 'Aria Intelligence' }: { mode: Mode; title?: string }) {
  const { business } = useBusinessContext();
  const [data, setData] = useState<Intelligence | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!business?.id) return;
    let active = true;
    setLoading(true);
    fetch('/api/aria/business-brain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id, mode }),
    })
      .then(async res => {
        if (!res.ok) throw new Error(`Business brain returned ${res.status}`);
        return res.json();
      })
      .then(json => {
        if (active) setData(json);
      })
      .catch(error => {
        console.error(`Aria Intelligence (${mode}) failed`, error);
        if (active) setData({ error: 'Not enough live data to generate intelligence yet.', missing_data: [] });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [business?.id, mode]);

  const missing = data?.missing_data ?? [];
  const observation = data?.observations?.[0];
  const recommendation = data?.recommendations?.[0];

  return (
    <div className="mb-5 rounded-xl border border-[rgba(29,158,117,0.18)] bg-[rgba(29,158,117,0.07)] p-4">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[#1D9E75]" />
        <p className="text-sm font-semibold text-white">{title}</p>
      </div>
      {loading ? (
        <p className="text-sm text-white/45">Checking connected business records...</p>
      ) : missing.length > 0 || data?.error ? (
        <div>
          <p className="text-sm text-white/60">Not enough live data to generate intelligence yet.</p>
          {missing.length > 0 && <p className="mt-1 text-xs text-white/35">Missing: {missing.join(', ')}.</p>}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          <Info label="What changed" value={observation?.what_happened ?? data?.summary ?? 'No major change detected in connected records.'} />
          <Info label="What it means" value={observation?.what_it_means ?? recommendation?.reason ?? 'Aria did not find a supported risk in the available data.'} />
          <Info label="Recommended action" value={recommendation?.recommendation ?? 'No owner action recommended right now.'} />
          {recommendation?.evidence?.length ? (
            <Info label="Evidence" value={recommendation.evidence.slice(0, 3).join(' ')} />
          ) : observation?.evidence?.length ? (
            <Info label="Evidence" value={observation.evidence.slice(0, 3).join(' ')} />
          ) : null}
          <Info label="Confidence" value={recommendation?.confidence ?? observation?.confidence ?? 'low'} />
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-black/20 p-3">
      <p className="text-[10px] uppercase tracking-[.12em] text-white/30">{label}</p>
      <p className="mt-1 text-xs leading-relaxed text-white/60">{value}</p>
    </div>
  );
}
