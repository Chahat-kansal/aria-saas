'use client';
import { useState, useRef, useCallback } from 'react';
import { PreviewPanel, CodeArtifact } from './PreviewPanel';

interface Props { onClose: () => void; }

export function ScreenshotToCode({ onClose }: Props) {
  const [image, setImage] = useState<{ base64: string; mimeType: string; preview: string } | null>(null);
  const [framework, setFramework] = useState<'html' | 'jsx'>('html');
  const [generating, setGenerating] = useState(false);
  const [output, setOutput] = useState('');
  const [artifact, setArtifact] = useState<CodeArtifact | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const base64 = result.split(',')[1];
      setImage({ base64, mimeType: file.type, preview: result });
      setOutput('');
      setArtifact(null);
    };
    reader.readAsDataURL(file);
  }

  async function generate() {
    if (!image) return;
    setGenerating(true);
    setOutput('');
    setArtifact(null);
    let fullText = '';

    try {
      const res = await fetch('/api/screenshot-to-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: image.base64, mimeType: image.mimeType, framework }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.text) {
              fullText += d.text;
              setOutput(fullText);
              // Extract code as it streams
              const match = fullText.match(/```(?:html|jsx)\n([\s\S]*?)(?:```|$)/);
              if (match && match[1].trim().length > 50) {
                setArtifact({
                  id: 'screenshot-result',
                  title: 'Screenshot recreation',
                  language: framework,
                  code: match[1].trim(),
                  streaming: !d.done,
                });
              }
            }
          } catch {}
        }
      }
    } finally {
      setGenerating(false);
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  if (showPreview && artifact) {
    return <PreviewPanel artifact={artifact} onClose={() => setShowPreview(false)} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0e0e12' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-[#16161d] flex-shrink-0">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">📸 Screenshot to Code</h2>
          <p className="text-[10px] text-[#888899]">Paste or upload any screenshot — Aria recreates it as working code</p>
        </div>
        <button onClick={onClose} className="text-[#888899] hover:text-white text-lg">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Framework selector */}
        <div className="flex gap-2">
          {(['html', 'jsx'] as const).map(f => (
            <button key={f} onClick={() => setFramework(f)}
              className={`px-4 py-2 rounded-xl text-xs font-medium border transition-all ${framework === f ? 'bg-[#6C63FF] border-[#6C63FF] text-white' : 'border-white/10 text-[#888899] hover:border-white/20'}`}>
              {f === 'html' ? '🌐 HTML + Tailwind' : '⚛️ React JSX'}
            </button>
          ))}
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${dragging ? 'border-[#6C63FF] bg-[#6C63FF]/10' : 'border-white/10 hover:border-white/20'}`}
        >
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          {image ? (
            <div className="space-y-3">
              <img src={image.preview} alt="Screenshot" className="max-h-64 mx-auto rounded-xl object-contain" />
              <p className="text-xs text-[#888899]">Click or drag to replace</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-4xl">📷</div>
              <p className="text-sm text-[#888899]">Drop a screenshot here or click to upload</p>
              <p className="text-[10px] text-[#555566]">Also works with Ctrl+V to paste from clipboard</p>
            </div>
          )}
        </div>

        {/* Paste from clipboard */}
        <button onClick={async () => {
          try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
              const imageType = item.types.find(t => t.startsWith('image/'));
              if (imageType) {
                const blob = await item.getType(imageType);
                handleFile(new File([blob], 'paste.png', { type: imageType }));
                break;
              }
            }
          } catch { /* clipboard not supported */ }
        }} className="w-full py-2 text-xs text-[#555566] hover:text-[#888899] border border-white/5 rounded-xl transition-colors">
          📋 Paste from clipboard (Ctrl+V)
        </button>

        {/* Generate button */}
        {image && (
          <button onClick={generate} disabled={generating}
            className="w-full bg-[#6C63FF] hover:bg-[#4b44cc] disabled:opacity-50 text-white py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2">
            {generating ? <><span className="animate-spin">⟳</span> Generating code…</> : '✨ Recreate as code'}
          </button>
        )}

        {/* Output */}
        {artifact && (
          <div className="bg-[#16161d] border border-white/5 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">Code generated</span>
                <span className="text-[10px] text-[#555566]">{artifact.code.split('\n').length} lines</span>
                {generating && <span className="text-[10px] text-amber-400 animate-pulse">● streaming</span>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { navigator.clipboard.writeText(artifact.code); }}
                  className="text-xs text-[#888899] hover:text-white px-2 py-1 border border-white/10 rounded-lg">Copy</button>
                <button onClick={() => setShowPreview(true)}
                  className="text-xs bg-[#6C63FF] hover:bg-[#4b44cc] text-white px-3 py-1 rounded-lg">👁 Preview</button>
              </div>
            </div>
            <div className="text-[10px] text-[#555566] bg-black/20 rounded-lg p-2 font-mono max-h-24 overflow-hidden">
              {artifact.code.slice(0, 300)}…
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
