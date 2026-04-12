'use client';
import { useState, useRef, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import toast from 'react-hot-toast';

export interface CodeArtifact {
  id: string;
  title: string;
  language: 'html' | 'jsx' | 'tsx' | 'css' | 'js' | 'ts' | 'python' | 'other';
  code: string;
  streaming?: boolean;
}

interface Props {
  artifact: CodeArtifact;
  onClose?: () => void;
}

const PREVIEW_LANGUAGES = new Set(['html', 'jsx', 'tsx']);

function buildPreviewHtml(artifact: CodeArtifact): string {
  if (artifact.language === 'html') return artifact.code;

  // For JSX/TSX — wrap in a React CDN + Babel transform sandbox
  if (artifact.language === 'jsx' || artifact.language === 'tsx') {
    const code = artifact.code
      // Strip imports — CDN handles them
      .replace(/^import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
      // Strip export default
      .replace(/^export\s+default\s+/m, 'const __Component = ');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<script src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  body { margin: 0; font-family: system-ui, sans-serif; background: #fff; color: #111; }
  * { box-sizing: border-box; }
</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel" data-presets="react,typescript">
const { useState, useEffect, useRef, useCallback, useMemo } = React;
${code}

// Try to render whatever was defined
const ComponentToRender = typeof __Component !== 'undefined' ? __Component 
  : typeof App !== 'undefined' ? App 
  : () => React.createElement('div', null, 'Component rendered');

ReactDOM.createRoot(document.getElementById('root')).render(
  React.createElement(ComponentToRender)
);
</script>
</body>
</html>`;
  }

  return `<pre style="padding:16px;font-family:monospace;font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-all;">${artifact.code.replace(/</g, '&lt;')}</pre>`;
}

export function PreviewPanel({ artifact, onClose }: Props) {
  const [tab, setTab] = useState<'preview' | 'code'>(PREVIEW_LANGUAGES.has(artifact.language) ? 'preview' : 'code');
  const [copied, setCopied] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const canPreview = PREVIEW_LANGUAGES.has(artifact.language);

  useEffect(() => {
    if (tab === 'preview' && iframeRef.current && !artifact.streaming) {
      const html = buildPreviewHtml(artifact);
      // Use blob URL instead of doc.write() — avoids CSP restrictions on Vercel
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      iframeRef.current.src = url;
      return () => URL.revokeObjectURL(url);
    }
  }, [artifact.code, tab, artifact.streaming]);

  function copy() {
    navigator.clipboard.writeText(artifact.code);
    setCopied(true); toast.success('Copied!');
    setTimeout(() => setCopied(false), 2000);
  }

  async function download() {
    const ext = artifact.language === 'jsx' || artifact.language === 'tsx' ? artifact.language : artifact.language === 'html' ? 'html' : artifact.language;
    const blob = new Blob([artifact.code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${artifact.title.replace(/\s+/g, '-').toLowerCase()}.${ext}`; a.click();
    URL.revokeObjectURL(url);
  }

  function openInNewTab() {
    if (!canPreview) return;
    const html = buildPreviewHtml(artifact);
    const blob = new Blob([html], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  }

  return (
    <div className="flex flex-col h-full bg-[#0e0e12] border-l border-white/5">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/5 bg-[#16161d] flex-shrink-0">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-xs font-mono text-[#6C63FF] bg-[#6C63FF]/10 px-2 py-0.5 rounded">{artifact.language}</span>
          <span className="text-xs text-[#888899] truncate">{artifact.title}</span>
          {artifact.streaming && <span className="text-[10px] text-amber-400 animate-pulse">● streaming…</span>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {canPreview && (
            <button onClick={openInNewTab} title="Open in new tab" className="text-[#888899] hover:text-white text-xs px-2 py-1 rounded hover:bg-white/5 transition-all">↗</button>
          )}
          <button onClick={download} title="Download" className="text-[#888899] hover:text-white text-xs px-2 py-1 rounded hover:bg-white/5 transition-all">↓</button>
          <button onClick={copy} title="Copy code" className="text-[#888899] hover:text-white text-xs px-2 py-1 rounded hover:bg-white/5 transition-all">{copied ? '✓' : '⧉'}</button>
          {onClose && <button onClick={onClose} className="text-[#888899] hover:text-white text-xs px-2 py-1 rounded hover:bg-white/5 transition-all">✕</button>}
        </div>
      </div>

      {/* Tabs */}
      {canPreview && (
        <div className="flex border-b border-white/5 bg-[#16161d] flex-shrink-0">
          <button onClick={() => setTab('preview')} className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 ${tab === 'preview' ? 'border-[#6C63FF] text-white' : 'border-transparent text-[#888899] hover:text-white'}`}>
            Preview
          </button>
          <button onClick={() => setTab('code')} className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 ${tab === 'code' ? 'border-[#6C63FF] text-white' : 'border-transparent text-[#888899] hover:text-white'}`}>
            Code
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'preview' && canPreview ? (
          <div className="w-full h-full bg-white relative">
            {artifact.streaming ? (
              <div className="absolute inset-0 flex items-center justify-center bg-[#0e0e12] text-[#888899] text-sm">
                <div className="flex flex-col items-center gap-3">
                  <div className="flex gap-1">
                    <span className="typing-dot w-2 h-2 rounded-full bg-[#6C63FF]" />
                    <span className="typing-dot w-2 h-2 rounded-full bg-[#6C63FF]" />
                    <span className="typing-dot w-2 h-2 rounded-full bg-[#6C63FF]" />
                  </div>
                  Building preview…
                </div>
              </div>
            ) : (
              <iframe ref={iframeRef} className="w-full h-full border-0" sandbox="allow-scripts allow-same-origin allow-forms allow-modals" title={artifact.title} />
            )}
          </div>
        ) : (
          <div className="h-full overflow-auto">
            <SyntaxHighlighter
              style={oneDark}
              language={artifact.language === 'jsx' || artifact.language === 'tsx' ? 'jsx' : artifact.language}
              customStyle={{ margin: 0, height: '100%', background: '#0e0e12', fontSize: '12px', lineHeight: '1.6' }}
              showLineNumbers
            >
              {artifact.code || '// Generating…'}
            </SyntaxHighlighter>
          </div>
        )}
      </div>
    </div>
  );
}
