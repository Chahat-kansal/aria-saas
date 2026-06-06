'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

interface CanvasDoc {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Props {
  onClose?: () => void;
  isPro: boolean;
}

const CANVAS_SYSTEM = `You are Aria in Canvas mode — a collaborative writing assistant.
When the user asks you to write, edit, or improve content:
1. Output the COMPLETE document content — not just the changed parts
2. Use markdown formatting: # headings, **bold**, *italic*, bullet lists, etc.
3. Be thorough and produce professional, polished content
4. When editing, preserve the user's existing content and style unless asked to change it
Always output the full document so the canvas can be completely replaced with your version.`;

export function Canvas({ onClose, isPro }: Props) {
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('Untitled document');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [saved, setSaved] = useState(true);
  const [docs, setDocs] = useState<CanvasDoc[]>([]);
  const [showDocs, setShowDocs] = useState(false);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [previousContent, setPreviousContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // Load saved docs from localStorage
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('aria-canvas-docs') || '[]');
      setDocs(saved);
    } catch (e) { console.error('[silent-catch]', e) }
  }, []);

  useEffect(() => {
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    setWordCount(words);
  }, [content]);

  function saveDoc() {
    const doc: CanvasDoc = {
      id: activeDocId || `doc-${Date.now()}`,
      title,
      content,
      createdAt: activeDocId ? docs.find(d => d.id === activeDocId)?.createdAt || new Date() : new Date(),
      updatedAt: new Date(),
    };
    const updated = activeDocId
      ? docs.map(d => d.id === activeDocId ? doc : d)
      : [doc, ...docs];
    setDocs(updated);
    setActiveDocId(doc.id);
    localStorage.setItem('aria-canvas-docs', JSON.stringify(updated));
    setSaved(true);
    toast.success('Document saved');
  }

  function loadDoc(doc: CanvasDoc) {
    setTitle(doc.title);
    setContent(doc.content);
    setActiveDocId(doc.id);
    setSaved(true);
    setShowDocs(false);
  }

  function newDoc() {
    setTitle('Untitled document');
    setContent('');
    setActiveDocId(null);
    setSaved(true);
    setPrompt('');
  }

  function deleteDoc(id: string) {
    const updated = docs.filter(d => d.id !== id);
    setDocs(updated);
    localStorage.setItem('aria-canvas-docs', JSON.stringify(updated));
    if (activeDocId === id) newDoc();
  }

  function downloadDoc() {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function askAria() {
    if (!prompt.trim()) return;
    setLoading(true);
    setStreamingText('');
    setPreviousContent(content);
    setShowDiff(false);

    const fullPrompt = content
      ? `Current document:\n\n${content}\n\n---\n\nUser request: ${prompt}`
      : prompt;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: fullPrompt,
          system: CANVAS_SYSTEM,
          model: 'claude-sonnet-4-20250514',
        }),
      });

      if (!res.ok) { const e = await res.json(); toast.error(e.error || 'Error'); return; }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '', full = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) {
              full += data.text;
              setStreamingText(full);
            }
          } catch (e) { console.error('[silent-catch]', e) }
        }
      }

      // Apply the streamed content to canvas
      if (full) {
        // Strip any preamble — get just the document content
        const cleaned = full
          .replace(/^(Here(?:'s| is) (?:the |your )?(?:updated |revised |complete )?document[^:]*:\n+)/im, '')
          .replace(/^(I(?:'ve| have) (?:written|updated|revised|created)[^.]+\.\n+)/im, '')
          .trim();
        setContent(cleaned);
        setSaved(false);
        setShowDiff(true);
      }

      setPrompt('');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
      setStreamingText('');
    }
  }

  function revertChange() {
    setContent(previousContent);
    setShowDiff(false);
    setSaved(false);
    toast.success('Reverted to previous version');
  }

  // Convert markdown to simple HTML for preview
  function markdownToHtml(md: string): string {
    return md
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>[\s\S]*<\/li>)/, '<ul>$1</ul>')
      .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^(.+)$/gm, (line) => {
        if (line.startsWith('<h') || line.startsWith('<ul') || line.startsWith('<li') || line.startsWith('</') || line === '') return line;
        return line;
      });
  }

  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');

  return (
    <div className="flex flex-col h-full bg-[#0e0e12]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-[#16161d] flex-shrink-0">
        <span className="text-sm">📝</span>
        <input
          value={title}
          onChange={e => { setTitle(e.target.value); setSaved(false); }}
          className="flex-1 bg-transparent text-sm font-medium text-white outline-none min-w-0"
          placeholder="Document title…"
        />
        {!saved && <span className="text-[10px] text-[#555566]">Unsaved</span>}
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-[10px] text-[#555566]">{wordCount} words</span>
          <div className="flex bg-white/5 rounded-lg p-0.5 ml-1">
            {(['edit', 'preview'] as const).map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`px-2.5 py-1 text-[10px] rounded-md font-medium transition-all capitalize ${viewMode === m ? 'bg-[#6C63FF] text-white' : 'text-[#888899] hover:text-white'}`}>
                {m}
              </button>
            ))}
          </div>
          <button onClick={() => setShowDocs(s => !s)} className="text-[#888899] hover:text-white text-xs px-2 py-1 rounded hover:bg-white/5">📁</button>
          <button onClick={downloadDoc} className="text-[#888899] hover:text-white text-xs px-2 py-1 rounded hover:bg-white/5">↓</button>
          <button onClick={saveDoc} className="text-xs bg-[#6C63FF] hover:bg-[#4b44cc] text-white px-2.5 py-1 rounded-lg transition-colors">Save</button>
          <button onClick={newDoc} className="text-[#888899] hover:text-white text-xs px-2 py-1 rounded hover:bg-white/5">+ New</button>
          {onClose && <button onClick={onClose} className="text-[#888899] hover:text-white text-xs px-2 py-1 rounded hover:bg-white/5">✕</button>}
        </div>
      </div>

      {/* Diff banner */}
      {showDiff && (
        <div className="flex items-center gap-3 px-4 py-2 bg-[#6C63FF]/10 border-b border-[#6C63FF]/20 flex-shrink-0">
          <span className="text-xs text-[#a78bfa]">✨ Aria updated the document</span>
          <button onClick={revertChange} className="text-xs text-[#888899] hover:text-white border border-white/10 px-2 py-0.5 rounded hover:bg-white/5">↩ Revert</button>
          <button onClick={() => setShowDiff(false)} className="ml-auto text-[#888899] hover:text-white text-xs">✕</button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Saved docs sidebar */}
        {showDocs && (
          <div className="w-48 border-r border-white/5 bg-[#12121a] flex flex-col flex-shrink-0">
            <div className="px-3 py-2 border-b border-white/5">
              <span className="text-[10px] text-[#555566] uppercase tracking-wider">Saved documents</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {docs.length === 0 && <p className="text-[10px] text-[#555566] text-center py-4">No saved docs yet</p>}
              {docs.map(doc => (
                <div key={doc.id} className="group flex items-start gap-1 px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer" onClick={() => loadDoc(doc)}>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-white truncate">{doc.title}</div>
                    <div className="text-[9px] text-[#555566]">{doc.content.length} chars</div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); deleteDoc(doc.id); }} className="opacity-0 group-hover:opacity-100 text-[#555566] hover:text-red-400 text-xs">✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main editor area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Document editor */}
          <div className="flex-1 overflow-auto">
            {viewMode === 'edit' ? (
              <textarea
                ref={textareaRef}
                value={loading && streamingText ? streamingText : content}
                onChange={e => { setContent(e.target.value); setSaved(false); }}
                className="w-full h-full bg-transparent text-[#f0f0f5] font-mono text-sm p-6 resize-none outline-none leading-7"
                placeholder={`Start writing, or ask Aria to write something for you below…

Try:
• "Write a blog post about AI in 2025"
• "Draft a product requirements document for a todo app"
• "Write a professional email declining a meeting"
• "Improve the writing in this document"
• "Add an executive summary to the top"`}
                readOnly={loading}
              />
            ) : (
              <div
                className="p-6 prose prose-invert max-w-none text-[#f0f0f5] leading-7"
                style={{ fontFamily: 'var(--font-sans)', fontSize: '15px', lineHeight: '1.8' }}
                dangerouslySetInnerHTML={{ __html: markdownToHtml(content) || '<p class="text-[#555566] italic">Nothing to preview yet</p>' }}
              />
            )}
          </div>

          {/* Aria prompt bar */}
          <div className="border-t border-white/5 bg-[#16161d] p-3 flex-shrink-0">
            <div className="flex gap-2 items-end bg-[#1f1f2a] border border-white/10 rounded-xl px-3 py-2 focus-within:border-[#6C63FF]/50 transition-colors">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#6C63FF] to-[#a78bfa] flex items-center justify-center text-white text-xs font-bold flex-shrink-0 self-end mb-0.5">A</div>
              <textarea
                ref={promptRef}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askAria(); } }}
                placeholder="Ask Aria to write, edit, improve, or transform the document…"
                rows={1}
                className="flex-1 bg-transparent resize-none outline-none text-sm text-white placeholder:text-[#555566] max-h-24"
                style={{ minHeight: '24px' }}
                onInput={e => {
                  const t = e.target as HTMLTextAreaElement;
                  t.style.height = 'auto';
                  t.style.height = Math.min(t.scrollHeight, 96) + 'px';
                }}
              />
              <button onClick={askAria} disabled={loading || !prompt.trim()}
                className="bg-[#6C63FF] hover:bg-[#4b44cc] disabled:opacity-40 text-white w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 self-end transition-all">
                {loading ? <span className="animate-spin text-xs">⟳</span> : '↑'}
              </button>
            </div>
            <p className="text-[10px] text-[#555566] text-center mt-1.5">Aria writes in the document · You can edit directly · Shift+Enter for new line</p>
          </div>
        </div>
      </div>
    </div>
  );
}
