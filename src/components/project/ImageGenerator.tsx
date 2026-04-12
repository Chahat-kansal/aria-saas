'use client';
import { useState } from 'react';
import toast from 'react-hot-toast';

interface Props {
  onClose?: () => void;
  isPro: boolean;
}

const SIZES = [
  { value: '1024x1024', label: 'Square (1024×1024)' },
  { value: '1792x1024', label: 'Landscape (1792×1024)' },
  { value: '1024x1792', label: 'Portrait (1024×1792)' },
];

export function ImageGenerator({ onClose, isPro }: Props) {
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('1024x1024');
  const [quality, setQuality] = useState<'standard' | 'hd'>('standard');
  const [style, setStyle] = useState<'vivid' | 'natural'>('vivid');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ url: string; revised_prompt: string } | null>(null);

  async function generate() {
    if (!prompt.trim()) { toast.error('Enter a prompt'); return; }
    if (!isPro) { toast.error('Image generation requires Pro plan'); return; }
    setLoading(true); setResult(null);

    try {
      const res = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, size, quality, style }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Generation failed'); return; }
      setResult(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function download() {
    if (!result?.url) return;
    const a = document.createElement('a');
    a.href = result.url; a.download = `aria-image-${Date.now()}.png`;
    a.target = '_blank'; a.click();
  }

  return (
    <div className="flex flex-col h-full bg-[#0e0e12]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-[#16161d] flex-shrink-0">
        <span className="text-base">🎨</span>
        <span className="text-sm font-medium text-white">Image Generator</span>
        {!isPro && <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full ml-1">Pro only</span>}
        <div className="flex-1" />
        {onClose && <button onClick={onClose} className="text-[#888899] hover:text-white text-xs px-2 py-1 rounded hover:bg-white/5">✕</button>}
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Prompt */}
        <div>
          <label className="text-xs text-[#888899] uppercase tracking-wider block mb-1.5">Prompt</label>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
            placeholder="A futuristic city at sunset with neon lights, ultra realistic, 8K…"
            rows={4} disabled={!isPro}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white resize-none outline-none focus:border-[#6C63FF]/50 transition-colors placeholder:text-[#555566] disabled:opacity-50" />
          <div className="text-right text-[10px] text-[#555566] mt-1">{prompt.length}/4000</div>
        </div>

        {/* Options */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[#888899] uppercase tracking-wider block mb-1.5">Size</label>
            <select value={size} onChange={e => setSize(e.target.value)} disabled={!isPro}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none disabled:opacity-50">
              {SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[#888899] uppercase tracking-wider block mb-1.5">Quality</label>
            <select value={quality} onChange={e => setQuality(e.target.value as any)} disabled={!isPro}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none disabled:opacity-50">
              <option value="standard">Standard</option>
              <option value="hd">HD (2x cost)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[#888899] uppercase tracking-wider block mb-1.5">Style</label>
            <select value={style} onChange={e => setStyle(e.target.value as any)} disabled={!isPro}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none disabled:opacity-50">
              <option value="vivid">Vivid</option>
              <option value="natural">Natural</option>
            </select>
          </div>
        </div>

        {/* Generate button */}
        <button onClick={generate} disabled={loading || !isPro || !prompt.trim()}
          className="w-full bg-gradient-to-r from-[#6C63FF] to-[#a78bfa] hover:opacity-90 disabled:opacity-40 text-white py-3 rounded-xl font-medium text-sm transition-all">
          {loading ? <span className="flex items-center justify-center gap-2"><span className="animate-spin">⟳</span> Generating with DALL-E 3…</span> : '✨ Generate image'}
        </button>

        {!isPro && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center">
            <p className="text-amber-300 text-sm mb-2">Image generation requires Pro plan</p>
            <a href="/settings" className="text-xs text-[#6C63FF] hover:underline">Upgrade to Pro →</a>
          </div>
        )}

        {/* Result */}
        {loading && (
          <div className="bg-[#1a1a28] border border-white/5 rounded-xl p-8 flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-full border-2 border-[#6C63FF] border-t-transparent animate-spin" />
            <p className="text-sm text-[#888899]">DALL-E 3 is generating your image…</p>
            <p className="text-xs text-[#555566]">Usually takes 10-20 seconds</p>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="relative group rounded-xl overflow-hidden border border-white/10">
              <img src={result.url} alt={prompt} className="w-full object-cover" />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                <button onClick={download} className="bg-white text-black text-xs px-4 py-2 rounded-lg font-medium hover:bg-gray-100">
                  ↓ Download
                </button>
                <button onClick={() => window.open(result.url, '_blank')} className="bg-white/20 text-white text-xs px-4 py-2 rounded-lg font-medium hover:bg-white/30">
                  ↗ Open
                </button>
              </div>
            </div>
            {result.revised_prompt && result.revised_prompt !== prompt && (
              <div className="bg-white/5 border border-white/5 rounded-lg p-3">
                <p className="text-[10px] text-[#888899] uppercase tracking-wider mb-1">DALL-E revised your prompt:</p>
                <p className="text-xs text-[#888899] leading-relaxed italic">{result.revised_prompt}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
