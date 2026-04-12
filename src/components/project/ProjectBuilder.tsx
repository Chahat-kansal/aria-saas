'use client';
import { useState, useRef, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import toast from 'react-hot-toast';
import { CodeExecutor } from './CodeExecutor';

interface ProjectFile {
  name: string;
  path: string;
  content: string;
  language: string;
}

interface Project {
  _id?: string;
  name: string;
  description: string;
  framework: string;
  files: ProjectFile[];
  instructions?: string;
}

const LANG_ICONS: Record<string, string> = {
  html: '🌐', css: '🎨', javascript: '🟨', js: '🟨', typescript: '🔷', ts: '🔷',
  jsx: '⚛️', tsx: '⚛️', json: '📋', python: '🐍', markdown: '📝', md: '📝',
  bash: '💻', text: '📄',
};

function buildPreview(files: ProjectFile[], framework: string): string {
  if (framework === 'html' || framework === 'vanilla') {
    const html = files.find(f => f.name === 'index.html' || f.language === 'html');
    const css = files.find(f => f.language === 'css');
    const js = files.find(f => (f.language === 'javascript' || f.language === 'js') && !f.name.includes('node'));

    if (!html) return '<p style="padding:20px;font-family:sans-serif;color:#888">No index.html found</p>';

    let doc = html.content;
    if (css && !doc.includes(css.name)) {
      doc = doc.replace('</head>', `<style>${css.content}</style></head>`);
    }
    if (js && !doc.includes(js.name)) {
      doc = doc.replace('</body>', `<script>${js.content}</script></body>`);
    }
    return doc;
  }

  if (framework === 'react') {
    const app = files.find(f => f.name.includes('App') && (f.language === 'jsx' || f.language === 'tsx' || f.language === 'javascript'));
    if (!app) return '<p style="padding:20px;font-family:sans-serif;color:#888">No App component found</p>';

    const css = files.find(f => f.language === 'css');
    const code = app.content
      .replace(/^import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
      .replace(/^export\s+default\s+/m, 'const __App = ');

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<script src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script src="https://cdn.tailwindcss.com"></script>
${css ? `<style>${css.content}</style>` : ''}
<style>body{margin:0;font-family:system-ui,sans-serif;}</style>
</head><body>
<div id="root"></div>
<script type="text/babel" data-presets="react,typescript">
const { useState, useEffect, useRef, useCallback, useMemo } = React;
${code}
const ComponentToRender = typeof __App !== 'undefined' ? __App : () => React.createElement('div', null, 'App');
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(ComponentToRender));
</script></body></html>`;
  }

  return '<p style="padding:20px;font-family:sans-serif;color:#888">Preview not available for this framework. Use the Run button for server-side code.</p>';
}

interface Props { onClose?: () => void; }

export function ProjectBuilder({ onClose }: Props) {
  const [project, setProject] = useState<Project | null>(null);
  const [activeFile, setActiveFile] = useState<ProjectFile | null>(null);
  const [tab, setTab] = useState<'preview' | 'code' | 'run'>('preview');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [savedProjects, setSavedProjects] = useState<any[]>([]);
  const [showProjects, setShowProjects] = useState(false);
  const [saving, setSaving] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    fetch('/api/project').then(r => r.json()).then(setSavedProjects).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === 'preview' && project && iframeRef.current) {
      const html = buildPreview(project.files, project.framework);
      const doc = iframeRef.current.contentDocument;
      if (doc) { doc.open(); doc.write(html); doc.close(); }
    }
  }, [tab, project]);

  async function generate() {
    if (!prompt.trim()) { toast.error('Describe what to build'); return; }
    setLoading(true); setStreaming(''); setProject(null);

    try {
      const res = await fetch('/api/project/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model: 'claude-sonnet-4-20250514', existingProject: project }),
      });

      if (!res.ok) { const e = await res.json(); toast.error(e.error); setLoading(false); return; }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '', fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) { fullText += data.text; setStreaming(fullText); }
            if (data.done && data.project) {
              setProject(data.project);
              setActiveFile(data.project.files[0] || null);
              setTab('preview');
              setStreaming('');
              toast.success(`Built ${data.project.files.length} files!`);
            }
            if (data.error) toast.error(data.error);
          } catch {}
        }
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveProject() {
    if (!project) return;
    setSaving(true);
    try {
      const method = project._id ? 'PUT' : 'POST';
      const res = await fetch('/api/project', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      setProject({ ...project, _id: data._id });
      setSavedProjects(prev => {
        const idx = prev.findIndex(p => p._id === data._id);
        if (idx >= 0) { const updated = [...prev]; updated[idx] = data; return updated; }
        return [data, ...prev];
      });
      toast.success('Project saved!');
    } finally {
      setSaving(false);
    }
  }

  function updateFileContent(content: string) {
    if (!activeFile || !project) return;
    const files = project.files.map(f => f.path === activeFile.path ? { ...f, content } : f);
    setProject({ ...project, files });
    setActiveFile({ ...activeFile, content });
  }

  function downloadProject() {
    if (!project) return;
    // Download each file as a zip would be ideal but we'll download individually
    project.files.forEach((file, i) => {
      setTimeout(() => {
        const blob = new Blob([file.content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = file.name; a.click();
        URL.revokeObjectURL(url);
      }, i * 100);
    });
    toast.success(`Downloading ${project.files.length} files…`);
  }

  return (
    <div className="flex flex-col h-full bg-[#0e0e12]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-[#16161d] flex-shrink-0">
        <span className="text-sm">🏗️</span>
        <span className="text-sm font-medium text-white truncate">{project?.name || 'Project Builder'}</span>
        {project && <span className="text-[10px] text-[#888899] bg-white/5 px-1.5 py-0.5 rounded">{project.files.length} files</span>}
        <div className="flex-1" />
        {project && (
          <>
            <button onClick={saveProject} disabled={saving} className="text-xs px-2.5 py-1 rounded-lg border border-white/10 text-[#888899] hover:text-white hover:border-white/20 transition-all">
              {saving ? '⟳' : '💾'} Save
            </button>
            <button onClick={downloadProject} className="text-xs px-2.5 py-1 rounded-lg border border-white/10 text-[#888899] hover:text-white hover:border-white/20 transition-all">
              ↓ Download
            </button>
          </>
        )}
        <button onClick={() => setShowProjects(s => !s)} className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${showProjects ? 'border-[#6C63FF]/50 text-[#a78bfa] bg-[#6C63FF]/10' : 'border-white/10 text-[#888899] hover:text-white'}`}>
          📁 My projects
        </button>
        {onClose && <button onClick={onClose} className="text-[#888899] hover:text-white text-xs px-2 py-1 rounded hover:bg-white/5">✕</button>}
      </div>

      {/* Prompt bar */}
      <div className="flex gap-2 px-3 py-2 border-b border-white/5 bg-[#16161d] flex-shrink-0">
        <input value={prompt} onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && generate()}
          placeholder={project ? 'Describe changes… (e.g. "add dark mode toggle")' : 'Describe a project to build… (e.g. "build a todo app with React")'}
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#6C63FF]/50 placeholder:text-[#555566]" />
        <button onClick={generate} disabled={loading || !prompt.trim()}
          className="bg-[#6C63FF] hover:bg-[#4b44cc] disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap">
          {loading ? <span className="flex items-center gap-1.5"><span className="animate-spin">⟳</span> Building…</span> : project ? '🔄 Update' : '🚀 Build'}
        </button>
      </div>

      {/* Saved projects panel */}
      {showProjects && (
        <div className="border-b border-white/5 bg-[#12121a] px-3 py-2 flex-shrink-0 max-h-40 overflow-y-auto">
          {savedProjects.length === 0 ? (
            <p className="text-xs text-[#555566] text-center py-2">No saved projects yet</p>
          ) : savedProjects.map(p => (
            <button key={p._id} onClick={() => { setProject(p); setActiveFile(p.files[0]); setShowProjects(false); setTab('preview'); }}
              className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 transition-all group">
              <span className="text-sm">🏗️</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-white truncate">{p.name}</div>
                <div className="text-[10px] text-[#555566]">{p.files?.length || 0} files · {p.framework}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Streaming indicator */}
      {loading && streaming && (
        <div className="px-3 py-2 bg-[#6C63FF]/10 border-b border-[#6C63FF]/20 flex-shrink-0">
          <p className="text-xs text-[#a78bfa] animate-pulse">⟳ Building your project… (Claude is writing {streaming.length} characters)</p>
        </div>
      )}

      {/* Main area */}
      {!project && !loading ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 p-8">
          <div className="text-4xl">🏗️</div>
          <h3 className="text-lg font-semibold">Multi-File Project Builder</h3>
          <p className="text-sm text-[#888899] max-w-sm">
            Describe any project and I'll generate all the files — HTML, CSS, JS, React components, Node.js APIs, and more.
          </p>
          <div className="grid grid-cols-2 gap-2 max-w-sm w-full">
            {[
              '🌐 Build a restaurant landing page',
              '⚛️ Create a React todo app',
              '🔌 Build a Node.js REST API',
              '📊 Build a data dashboard',
            ].map(s => (
              <button key={s} onClick={() => setPrompt(s.slice(3))}
                className="text-xs text-left bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 py-2.5 text-[#888899] hover:text-white transition-all">
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : project ? (
        <div className="flex flex-1 overflow-hidden">
          {/* File tree */}
          <div className="w-44 flex-shrink-0 border-r border-white/5 bg-[#12121a] overflow-y-auto">
            <div className="px-3 py-2">
              <p className="text-[10px] text-[#555566] uppercase tracking-wider mb-2">Files</p>
              {project.files.map(file => (
                <button key={file.path} onClick={() => { setActiveFile(file); setTab('code'); }}
                  className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left transition-all ${activeFile?.path === file.path ? 'bg-[#6C63FF]/20 text-white' : 'text-[#888899] hover:text-white hover:bg-white/5'}`}>
                  <span className="text-xs flex-shrink-0">{LANG_ICONS[file.language] || '📄'}</span>
                  <span className="text-xs truncate">{file.name}</span>
                </button>
              ))}
            </div>
            {project.instructions && (
              <div className="px-3 py-2 border-t border-white/5 mt-2">
                <p className="text-[10px] text-[#555566] uppercase tracking-wider mb-1">How to run</p>
                <p className="text-[10px] text-[#888899] leading-relaxed">{project.instructions}</p>
              </div>
            )}
          </div>

          {/* Editor / Preview */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-white/5 bg-[#16161d] flex-shrink-0">
              {(['preview', 'code', 'run'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-2 text-xs font-medium border-b-2 transition-all capitalize ${tab === t ? 'border-[#6C63FF] text-white' : 'border-transparent text-[#888899] hover:text-white'}`}>
                  {t === 'preview' ? '👁 Preview' : t === 'code' ? '📝 Code' : '▶ Run'}
                </button>
              ))}
            </div>

            {tab === 'preview' && (
              <iframe ref={iframeRef} className="flex-1 bg-white border-0 w-full"
                sandbox="allow-scripts allow-same-origin allow-forms allow-modals" title="preview" />
            )}

            {tab === 'code' && activeFile && (
              <div className="flex-1 overflow-hidden flex flex-col">
                <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/5 bg-[#16161d] flex-shrink-0">
                  <span className="text-xs">{LANG_ICONS[activeFile.language] || '📄'}</span>
                  <span className="text-xs text-[#888899] font-mono">{activeFile.path}</span>
                  <button onClick={() => { navigator.clipboard.writeText(activeFile.content); toast.success('Copied!'); }}
                    className="ml-auto text-[10px] text-[#888899] hover:text-white px-2 py-0.5 rounded hover:bg-white/5">Copy</button>
                </div>
                <textarea value={activeFile.content} onChange={e => updateFileContent(e.target.value)}
                  className="flex-1 bg-transparent text-white font-mono text-xs p-4 resize-none outline-none leading-6 overflow-auto"
                  spellCheck={false} />
              </div>
            )}

            {tab === 'run' && activeFile && (
              <div className="flex-1 overflow-hidden">
                <CodeExecutor code={activeFile.content} language={activeFile.language} />
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
