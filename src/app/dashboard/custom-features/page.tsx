'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import FeatureRenderer, { type BusinessFeature } from '@/components/features/FeatureRenderer';

type FeatureConfig = Record<string, unknown>;

interface FeaturePreview {
  feature_config: FeatureConfig;
  preview_description: string;
}

type BuildState = 'idle' | 'generating' | 'previewing' | 'confirming' | 'done' | 'error';

export default function CustomFeaturesPage() {
  const { business } = useBusinessContext();
  const [features, setFeatures] = useState<BusinessFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState('');
  const [buildState, setBuildState] = useState<BuildState>('idle');
  const [preview, setPreview] = useState<FeaturePreview | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    if (!business?.id) return;
    try {
      const res = await fetch(`/api/business-features?business_id=${business.id}`);
      if (res.ok) { const d = await res.json(); setFeatures(d.features ?? []); }
    } catch { /* silent */ }
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  const generate = useCallback(async () => {
    if (!request.trim() || !business?.id) return;
    setBuildState('generating');
    setErrorMsg('');
    setPreview(null);
    try {
      const res = await fetch('/api/aria/feature-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, feature_request: request.trim(), phase: 'generate' }),
      });
      const data = await res.json();
      if (data.feature_config) {
        setPreview({ feature_config: data.feature_config, preview_description: data.preview_description ?? '' });
        setBuildState('previewing');
      } else {
        setErrorMsg(data.error ?? 'Aria could not generate a feature for that request. Try describing it differently.');
        setBuildState('error');
      }
    } catch {
      setErrorMsg('Something went wrong. Please try again.');
      setBuildState('error');
    }
  }, [request, business?.id]);

  const confirm = useCallback(async () => {
    if (!preview || !business?.id) return;
    setBuildState('confirming');
    try {
      const res = await fetch('/api/aria/feature-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, phase: 'confirm', feature_config: preview.feature_config }),
      });
      const data = await res.json();
      if (data.ok) {
        setSuccessMsg(data.message ?? '✦ Feature added!');
        setRequest('');
        setPreview(null);
        setBuildState('done');
        await load();
        setTimeout(() => { setBuildState('idle'); setSuccessMsg(''); }, 3000);
      } else {
        setErrorMsg(data.error ?? 'Failed to save feature.');
        setBuildState('error');
      }
    } catch {
      setErrorMsg('Something went wrong saving the feature.');
      setBuildState('error');
    }
  }, [preview, business?.id, load]);

  const removeFeature = useCallback(async (id: string) => {
    setRemovingId(id);
    try {
      await fetch(`/api/business-features/${id}`, { method: 'DELETE' });
      setFeatures(prev => prev.filter(f => f.id !== id));
    } catch { /* silent */ }
    setRemovingId(null);
  }, []);

  const reset = () => { setBuildState('idle'); setPreview(null); setErrorMsg(''); };

  const demoFeature: BusinessFeature | null = preview ? {
    id: '__preview__',
    name: (preview.feature_config.feature_name as string) ?? 'Custom Feature',
    description: (preview.feature_config.description as string) ?? undefined,
    feature_type: (preview.feature_config.feature_type as string) ?? 'metric_card',
    config: (preview.feature_config.config as Record<string, unknown>) ?? {},
    is_active: true,
  } : null;

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: '#0d0d14' }}>
      {/* Header */}
      <div className="border-b px-6 py-5 flex-shrink-0"
        style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#13131a' }}>
        <h1 className="font-semibold text-white text-xl">Custom Features</h1>
        <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>
          Aria builds live dashboard widgets for {business?.name ?? 'your business'} — no code, no deployment.
        </p>
      </div>

      <div className="p-6 space-y-6 max-w-4xl mx-auto w-full">

        {/* Build box */}
        {buildState === 'idle' || buildState === 'error' ? (
          <div className="rounded-2xl p-5" style={{ background: 'rgba(29,158,117,0.07)', border: '1px solid rgba(29,158,117,0.2)' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[#1D9E75] font-bold text-base">✦</span>
              <p className="text-white font-medium text-sm">Tell Aria what you want to track</p>
            </div>
            <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Describe a metric, leaderboard, tracker, calculator or data table in plain English.
              Aria builds it live — only your business sees it.
            </p>
            <div className="flex gap-3">
              <textarea
                ref={textareaRef}
                value={request}
                onChange={e => setRequest(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generate(); }}}
                placeholder={'e.g. "Show me a leaderboard of my top cashiers by sales this week"\nor "Track which customers are closest to their 10th coffee"'}
                rows={3}
                className="flex-1 px-4 py-3 rounded-xl text-sm outline-none resize-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
              />
              <button
                onClick={generate}
                disabled={!request.trim()}
                className="px-5 py-3 rounded-xl text-sm font-medium self-end transition-opacity disabled:opacity-40 flex-shrink-0"
                style={{ background: '#1D9E75', color: '#fff' }}
              >
                Build it
              </button>
            </div>
            {buildState === 'error' && errorMsg && (
              <p className="text-xs mt-3 text-red-400">{errorMsg}</p>
            )}
            {/* Example prompts */}
            <div className="flex flex-wrap gap-2 mt-4">
              {[
                'Sales leaderboard by cashier this week',
                '10th coffee free — punch card tracker',
                'Commission earned calculator',
                'Top products by revenue this month',
              ].map(ex => (
                <button key={ex} onClick={() => { setRequest(ex); textareaRef.current?.focus(); }}
                  className="text-xs px-3 py-1.5 rounded-full transition-colors"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : buildState === 'generating' ? (
          <div className="rounded-2xl p-8 flex flex-col items-center gap-3" style={{ background: 'rgba(29,158,117,0.07)', border: '1px solid rgba(29,158,117,0.2)' }}>
            <div className="w-8 h-8 rounded-full border-2 border-[#1D9E75] border-t-transparent animate-spin" />
            <p className="text-sm text-white font-medium">Aria is designing your feature…</p>
            <p className="text-xs text-gray-500">This takes 5–10 seconds</p>
          </div>
        ) : buildState === 'previewing' && demoFeature ? (
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(29,158,117,0.3)', background: 'rgba(29,158,117,0.05)' }}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(29,158,117,0.15)' }}>
              <div>
                <p className="text-white font-medium text-sm">✦ Feature Preview</p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>{preview?.preview_description}</p>
              </div>
              <button onClick={reset} className="text-xs text-gray-500 hover:text-white transition-colors">✕ Discard</button>
            </div>
            <div className="p-5">
              <div className="mb-5">
                <FeatureRenderer feature={demoFeature} businessId={business?.id ?? ''} />
              </div>
              <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
                This will be added to your dashboard and live-updated with your real data.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={confirm}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90"
                  style={{ background: '#1D9E75' }}
                >
                  Add to my dashboard
                </button>
                <button onClick={reset}
                  className="px-5 py-2.5 rounded-xl text-sm transition-colors"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
                  Not this
                </button>
              </div>
            </div>
          </div>
        ) : buildState === 'confirming' ? (
          <div className="rounded-2xl p-8 flex flex-col items-center gap-3" style={{ background: 'rgba(29,158,117,0.07)', border: '1px solid rgba(29,158,117,0.2)' }}>
            <div className="w-8 h-8 rounded-full border-2 border-[#1D9E75] border-t-transparent animate-spin" />
            <p className="text-sm text-white">Adding to your dashboard…</p>
          </div>
        ) : buildState === 'done' ? (
          <div className="rounded-2xl p-6 text-center" style={{ background: 'rgba(29,158,117,0.07)', border: '1px solid rgba(29,158,117,0.3)' }}>
            <p className="text-[#1D9E75] font-medium text-sm mb-1">✦ Done!</p>
            <p className="text-xs text-gray-400">{successMsg}</p>
          </div>
        ) : null}

        {/* Live features grid */}
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-5 h-5 rounded-full border-2 border-[#1D9E75] border-t-transparent animate-spin" />
          </div>
        ) : features.length > 0 ? (
          <div>
            <h2 className="text-sm font-semibold text-white mb-3">Your live features</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {features.map(f => (
                <div key={f.id} className="relative group">
                  <FeatureRenderer feature={f} businessId={business?.id ?? ''} />
                  {/* Gear overlay */}
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1.5">
                    <button
                      onClick={() => removeFeature(f.id)}
                      disabled={removingId === f.id}
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] transition-colors disabled:opacity-50"
                      style={{ background: 'rgba(239,68,68,0.2)', color: '#ef4444' }}
                      title="Remove feature"
                    >
                      {removingId === f.id ? '…' : '✕'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          buildState === 'idle' && (
            <div className="text-center py-6">
              <p className="text-sm text-gray-500">No custom features yet. Describe one above and Aria will build it live.</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
