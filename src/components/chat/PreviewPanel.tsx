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
  if (artifact.language === 'html') {
    let html = artifact.code;
    // Inject Tailwind if not already present
    if (!html.includes('tailwind') && !html.includes('<style>') && !html.includes('<style ')) {
      html = html.includes('</head>')
        ? html.replace('</head>', '<script src="https://cdn.tailwindcss.com"></script></head>')
        : '<script src="https://cdn.tailwindcss.com"></script>' + html;
    }
    return html;
  }

  if (artifact.language === 'jsx' || artifact.language === 'tsx') {
    const code = artifact.code
      .replace(/^import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
      .replace(/^export\s+default\s+/m, 'const __Component = ');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script src="https://cdn.tailwindcss.com"></script>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#fff;color:#111;}*{box-sizing:border-box;}</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel" data-presets="react,typescript">
const { useState, useEffect, useRef, useCallback, useMemo } = React;
${code}
const ComponentToRender = typeof __Component !== 'undefined' ? __Component
  : typeof App !== 'undefined' ? App
  : () => React.createElement('div', { style: { padding: 20 } }, 'Component loaded');
try {
  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(ComponentToRender));
} catch(e) {
  document.getElementById('root').innerHTML = '<div style="padding:20px;color:red;font-family:monospace;font-size:13px;">Error: ' + e.message + '</div>';
}
</script>
</body>
</html>`;
  }

  return `<!DOCTYPE html><html><body style="margin:0;"><pre style="padding:16px;font-family:monospace;font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-all;">${artifact.code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre></body></html>`;
}

export function PreviewPanel({ artifact, onClose }: Props) {
  const [tab, setTab] = useState<'preview' | 'code'>(PREVIEW_LANGUAGES.has(artifact.language) ? 'preview' : 'code');
  const [copied, setCopied] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const canPreview = PREVIEW_LANGUAGES.has(artifact.language);

  // Reset to preview tab and force iframe remount when artifact changes
  useEffect(() => {
    if (canPreview) {
      setTab('preview');
      setIframeKey(k => k + 1);
    }
  }, [artifact.id]);

  // Inject HTML into iframe via srcdoc whenever code or tab changes
  useEffect(() => {
    if (tab !== 'preview' || artifact.streaming || !canPreview) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.srcdoc = buildPreviewHtml(artifact);
  }, [artifact.code, artifact.language, tab, artifact.streaming, iframeKey]);

  function copy() {
    navigator.clipboard.writeText(artifact.code);
    setCopied(true);
    toast.success('Copied!');
    setTimeout(() => setCopied(false), 2000);
  }

  function download() {
    const extMap: Record<string, string> = { jsx: 'jsx', tsx: 'tsx', html: 'html', css: 'css', python: 'py', js: 'js', ts: 'ts' };
    const ext = extMap[artifact.language] || 'txt';
    const blob = new Blob([artifact.code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function openInNewTab() {
    if (!canPreview) return;
    const html = buildPreviewHtml(artifact);
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  }

  return (
    <div className="flex flex-col bg-[#0e0e12] border-l border-white/5" style={{ height: '100%' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-[#16161d] flex-shrink-0">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-[11px] font-mono text-[#6C63FF] bg-[#6C63FF]/10 px-2 py-0.5 rounded flex-shrink-0">{artifact.language}</span>
          <span className="text-xs text-[#888899] truncate">{artifact.title}</span>
          {artifact.streaming && <span className="text-[10px] text-amber-400 animate-pulse flex-shrink-0">● streaming…</span>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {canPreview && (
            <button onClick={openInNewTab} title="Open in new tab" className="text-[#888899] hover:text-white text-xs px-2 py-1 rounded hover:bg-white/5">↗</button>
          )}
          <button onClick={download} title="Download" className="text-[#888899] hover:text-white text-xs px-2 py-1 rounded hover:bg-white/5">↓</button>
          <button onClick={copy} title="Copy" className="text-[#888899] hover:text-white text-xs px-2 py-1 rounded hover:bg-white/5">{copied ? '✓' : '⧉'}</button>
          {onClose && (
            <button onClick={onClose} className="text-[#888899] hover:text-white text-xs px-2 py-1 rounded hover:bg-white/5">✕</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      {canPreview && (
        <div className="flex border-b border-white/5 bg-[#16161d] flex-shrink-0">
          {(['preview', 'code'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors capitalize ${tab === t ? 'border-[#6C63FF] text-white' : 'border-transparent text-[#888899] hover:text-white'}`}>
              {t === 'preview' ? '👁 Preview' : '📄 Code'}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
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
                  <span>Building preview…</span>
                </div>
              </div>
            ) : (
              <iframe
                key={iframeKey}
                ref={iframeRef}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-forms allow-modals"
                title={artifact.title}
              />
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
