'use client';
import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import toast from 'react-hot-toast';
import { PreviewPanel, CodeArtifact } from './PreviewPanel';
import { extractArtifacts } from '@/lib/codeDetection';
import { CodeExecutor } from '@/components/project/CodeExecutor';
import { ImageGenerator } from '@/components/project/ImageGenerator';
import { ProjectBuilder } from '@/components/project/ProjectBuilder';
import { VoiceMode, useTextToSpeech } from '@/components/voice/VoiceMode';
import { Canvas } from '@/components/canvas/Canvas';
import { ScreenshotToCode } from './ScreenshotToCode';
import { AgentMode } from './AgentMode';
import { SIDEBAR_EVENT } from './Sidebar';

interface Message { role: 'user' | 'assistant'; content: string; fileUrl?: string; fileName?: string; artifacts?: CodeArtifact[]; userPrompt?: string; }
interface Props { conversationId?: string; }

const MODELS = [
  { id: 'claude-haiku-4-5-20251001',  label: 'Haiku 4.5',  plan: 'free' },
  { id: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5', plan: 'pro' },
  { id: 'claude-opus-4-5-20251101',   label: 'Opus 4.5',   plan: 'pro' },
];

const CHAT_STARTERS = [
  { icon: '💡', text: 'Brainstorm startup ideas' },
  { icon: '🐛', text: 'Debug my code' },
  { icon: '✍️', text: 'Help me write an email' },
  { icon: '📊', text: 'Analyse this data' },
];
const BUILDER_STARTERS = [
  { icon: '🌐', text: 'Build a landing page for a SaaS' },
  { icon: '🧩', text: 'Create a React dashboard with charts' },
  { icon: '🎨', text: 'Design a pricing page with 3 tiers' },
  { icon: '📝', text: 'Build a contact form with validation' },
];

// ── Memoized message bubble — only re-renders when its own content changes ──
const MessageBubble = memo(({ msg, isLast, loading, session, onPreview, onRun, onArtifactClick, activeArtifactId }: {
  msg: Message; isLast: boolean; loading: boolean; session: any;
  onPreview: (art: CodeArtifact) => void;
  onRun: (code: string, lang: string) => void;
  onArtifactClick: (art: CodeArtifact) => void;
  activeArtifactId?: string;
  onRegenerate?: () => void;
  msgIndex: number;
}) => {
  if (msg.role === 'user') {
    return (
      <div className="flex gap-2 flex-row-reverse">
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 self-start mt-0.5 bg-white/10 text-white">
          {session?.user?.name?.[0] || 'U'}
        </div>
        <div className="flex flex-col gap-1.5 min-w-0 items-end max-w-[85%]">
          {msg.fileUrl && <div className="text-xs text-[#888899] bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">📎 <a href={msg.fileUrl} target="_blank" rel="noopener" className="hover:underline">{msg.fileName}</a></div>}
          <div className="bg-[#6C63FF] text-white px-3 py-2.5 rounded-2xl rounded-tr-sm text-sm leading-relaxed break-words">{msg.content}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 self-start mt-0.5 bg-gradient-to-br from-[#6C63FF] to-[#a78bfa] text-white">A</div>
      <div className="flex flex-col gap-1.5 min-w-0 flex-1">
        {msg.content === '' && loading && isLast ? (
          <div className="flex gap-1 py-2">
            <span className="typing-dot w-1.5 h-1.5 rounded-full bg-[#888899]" />
            <span className="typing-dot w-1.5 h-1.5 rounded-full bg-[#888899]" />
            <span className="typing-dot w-1.5 h-1.5 rounded-full bg-[#888899]" />
          </div>
        ) : (
          <div className="prose-aria text-sm overflow-x-hidden">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
              code({ className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || '');
                if (!props.inline && match) {
                  const lang = match[1];
                  const code = String(children).replace(/\n$/, '');
                  const art = msg.artifacts?.find(a => a.code.slice(0, 60) === code.slice(0, 60));
                  const isPreview = ['html','jsx','tsx','js','javascript'].includes(lang);
                  const isRunnable = ['python','javascript','typescript','bash','c','cpp','go','rust','ruby','java','r','php','swift','kotlin'].includes(lang);
                  // Long code (>20 lines or previewable) → show as artifact pill, not inline flood
                  const lineCount = code.split('\n').length;
                  const isLongCode = lineCount > 15 || isPreview;
                  
                  if (isLongCode && art) {
                    // Show as a clean file pill — like Claude's artifact cards
                    return (
                      <div className="my-2 flex items-center gap-3 bg-[#16161d] border border-white/10 rounded-xl px-4 py-3 cursor-pointer hover:border-[#6C63FF]/40 transition-all group" onClick={() => isPreview ? onPreview(art) : onRun(code, lang)}>
                        <div className="w-8 h-8 rounded-lg bg-[#6C63FF]/20 flex items-center justify-center flex-shrink-0 text-sm">
                          {isPreview ? '👁' : isRunnable ? '▶' : '📄'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white truncate">{art.title || `${lang} file`}</div>
                          <div className="text-[10px] text-[#555566]">{lineCount} lines · <span className="font-mono">.{lang}</span></div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          {isPreview && <span className="text-[10px] text-[#6C63FF]">Open preview →</span>}
                          {isRunnable && !isPreview && <span className="text-[10px] text-green-400">Run →</span>}
                          <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(code); toast.success('Copied!'); }} className="text-[10px] text-[#888899] hover:text-white">Copy</button>
                        </div>
                      </div>
                    );
                  }

                  // Short code → show inline with syntax highlighting
                  return (
                    <div className="my-3 overflow-hidden rounded-lg border border-white/10">
                      <div className="flex items-center justify-between bg-[#1a1a28] px-3 py-1.5">
                        <span className="text-[10px] text-[#888899] font-mono">{lang}</span>
                        <div className="flex gap-2">
                          {isRunnable && <button onClick={() => onRun(code, lang)} className="text-[10px] text-green-400">▶ Run</button>}
                          <button onClick={() => { navigator.clipboard.writeText(code); toast.success('Copied!'); }} className="text-[10px] text-[#888899] hover:text-white">Copy</button>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <SyntaxHighlighter style={oneDark} language={lang} PreTag="div" customStyle={{ margin: 0, borderRadius: 0, fontSize: '11.5px', border: 'none' }}>{code}</SyntaxHighlighter>
                      </div>
                    </div>
                  );
                }
                return <code className="font-mono text-xs bg-white/10 px-1.5 py-0.5 rounded break-all">{children}</code>;
              },
            }}>{msg.content}</ReactMarkdown>
          </div>
        )}
        {msg.artifacts && msg.artifacts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {msg.artifacts.map(a => (
              <button key={a.id} onClick={() => onArtifactClick(a)}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${activeArtifactId === a.id ? 'bg-[#6C63FF]/20 border-[#6C63FF]/40 text-[#a78bfa]' : 'bg-white/5 border-white/10 text-[#888899] hover:text-white'}`}>
                {['html','jsx','tsx'].includes(a.language) ? '👁' : '📄'} {a.title.slice(0, 20)} <span className="font-mono text-[10px] opacity-60">.{a.language}</span>
              </button>
            ))}
          </div>
        )}
        {/* Regenerate button — shown below last assistant message */}
        {isLast && !loading && onRegenerate && (
          <div className="flex items-center gap-3 mt-1">
            <button onClick={onRegenerate}
              className="flex items-center gap-1.5 text-[10px] text-[#555566] hover:text-[#888899] transition-colors group">
              <svg className="w-3 h-3 group-hover:rotate-180 transition-transform duration-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                <path d="M8 16H3v5"/>
              </svg>
              Regenerate
            </button>
          </div>
        )}
      </div>
    </div>
  );
}, (prev, next) => {
  // Only re-render if content, loading state, or artifacts changed
  return prev.msg.content === next.msg.content &&
    prev.msg.artifacts === next.msg.artifacts &&
    prev.loading === next.loading &&
    prev.activeArtifactId === next.activeArtifactId &&
    prev.isLast === next.isLast;
});
MessageBubble.displayName = 'MessageBubble';

export function ChatWindow({ conversationId }: Props) {
  const { data: session } = useSession();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState('claude-haiku-4-5-20251001');
  const [mode, setMode] = useState<'chat' | 'builder'>('chat');
  const [webSearch, setWebSearch] = useState(false);
  const [deepResearch, setDeepResearch] = useState(false);
  const [plugins, setPlugins] = useState(true);
  const [pendingFile, setPendingFile] = useState<{ url: string; name: string; type: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activeConvoId, setActiveConvoId] = useState<string | undefined>(conversationId);
  const [userPlan, setUserPlan] = useState('free');
  const [activeArtifact, setActiveArtifact] = useState<CodeArtifact | null>(null);
  const [rightPanel, setRightPanel] = useState<'preview' | 'image' | 'project' | 'execute' | 'canvas' | 'screenshot' | 'agent' | null>(null);
  const [execCode, setExecCode] = useState<{ code: string; language: string } | null>(null);
  const [pluginCalls, setPluginCalls] = useState<{ name: string; status: 'running' | 'done' | 'error' }[]>([]);
  const [lastAiMessage, setLastAiMessage] = useState('');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const { speak, stop: stopSpeaking, speaking } = useTextToSpeech();

  // Refs — no re-renders on change
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stateRef = useRef({ model, mode, webSearch, deepResearch, activeConvoId, plugins, loading, pendingFile });

  // Keep stateRef in sync without causing re-renders in sendMessage
  useEffect(() => {
    stateRef.current = { model, mode, webSearch, deepResearch, activeConvoId, plugins, loading, pendingFile };
  });

  const isPro = userPlan === 'pro';
  const showSplit = (!!activeArtifact && (activeArtifact.streaming || !!activeArtifact.code)) || !!rightPanel;

  useEffect(() => {
    fetch('/api/user').then(r => r.json()).then(d => setUserPlan(d.plan || 'free')).catch(() => {});
  }, []);

  useEffect(() => {
    if (conversationId) {
      fetch(`/api/conversations/${conversationId}`).then(r => r.json()).then(data => {
        if (data.messages) {
          const msgs: Message[] = data.messages.map((m: any) => ({
            ...m, artifacts: m.role === 'assistant' ? extractArtifacts(m.content) : undefined,
          }));
          setMessages(msgs);
          const last = [...msgs].reverse().find(m => m.artifacts?.length);
          if (last?.artifacts?.[0]) setActiveArtifact(last.artifacts[0]);
        }
        if (data.model) setModel(data.model);
      }).catch(() => {});
    } else {
      setMessages([]); setActiveConvoId(undefined); setActiveArtifact(null); setRightPanel(null);
    }
  }, [conversationId]);

  // Scroll to bottom — but only when a new message is added, not on every streaming chunk
  const msgCount = messages.length;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgCount]);

  // Auto-scroll during streaming — use a separate effect with requestAnimationFrame
  const lastLoadingRef = useRef(false);
  useEffect(() => {
    if (loading && !lastLoadingRef.current) {
      // Streaming started - begin smooth scroll
      const interval = setInterval(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 500);
      lastLoadingRef.current = true;
      return () => { clearInterval(interval); lastLoadingRef.current = false; };
    }
  }, [loading]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('aria:mode-change', {
      detail: { mode, isPro, activeTool: rightPanel, plugins, webSearch, deepResearch }
    }));
  }, [mode, isPro, rightPanel, plugins, webSearch, deepResearch]);

  useEffect(() => {
    function onTool(e: Event) {
      const tool = (e as CustomEvent).detail as string;
      if (tool === 'mode:chat')    { setMode('chat'); setRightPanel(null); return; }
      if (tool === 'mode:builder') { setMode('builder'); setRightPanel(null); return; }
      if (tool === 'search')       { setWebSearch(w => !w); setDeepResearch(false); setRightPanel(null); return; }
      if (tool === 'research')     { setDeepResearch(d => !d); setWebSearch(false); setRightPanel(null); return; }
      if (tool === 'plugins')      { setPlugins(p => !p); return; }
      if (tool === 'image')        { setRightPanel(p => p === 'image'   ? null : 'image');   setActiveArtifact(null); return; }
      if (tool === 'project')      { setRightPanel(p => p === 'project' ? null : 'project'); setActiveArtifact(null); return; }
      if (tool === 'canvas')       { setRightPanel(p => p === 'canvas'  ? null : 'canvas');  setActiveArtifact(null); return; }
      if (tool === 'execute')      { setRightPanel(p => p === 'execute' ? null : 'execute'); setActiveArtifact(null); return; }
      if (tool === 'screenshot')   { setRightPanel(p => p === 'screenshot' ? null : 'screenshot'); setActiveArtifact(null); return; }
      if (tool === 'agent')        { setRightPanel(p => p === 'agent' ? null : 'agent'); setActiveArtifact(null); return; }
    }
    window.addEventListener('aria:tool-select', onTool);
    return () => window.removeEventListener('aria:tool-select', onTool);
  }, []);

  async function uploadFile(file: File) {
    setUploading(true);
    const fd = new FormData(); fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    setUploading(false);
    if (!res.ok) { toast.error(data.error || 'Upload failed'); return; }
    setPendingFile({ url: data.url, name: data.name, type: data.type });
    toast.success('File attached');
  }

  // sendMessage uses stateRef so it never needs to be recreated
  const sendMessage = useCallback(async () => {
    const s = stateRef.current;
    if (s.loading) return;
    const text = textareaRef.current?.value?.trim() || '';
    if (!text && !s.pendingFile) return;

    // Clear textarea immediately - feels instant
    if (textareaRef.current) { textareaRef.current.value = ''; textareaRef.current.style.height = 'auto'; }

    setMessages(prev => [...prev, { role: 'user', content: text, fileUrl: s.pendingFile?.url, fileName: s.pendingFile?.name, userPrompt: text }]);
    setPendingFile(null);
    setLoading(true);
    setPluginCalls([]);

    if (s.mode === 'builder') { setRightPanel(null); setActiveArtifact(null); }
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const endpoint = s.mode === 'builder' ? '/api/builder' : '/api/plugins';
      const msgContent = s.pendingFile ? `${text ? text + '\n\n' : ''}[File: ${s.pendingFile.name}](${s.pendingFile.url})` : text;
      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msgContent, conversationId: s.activeConvoId, model: s.model, enablePlugins: s.plugins, enableWebSearch: s.webSearch || s.deepResearch }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Error'); }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '', fullContent = '';
      let artifactId = crypto.randomUUID();

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
              fullContent += data.text;
              setMessages(prev => { const m = [...prev]; m[m.length - 1] = { ...m[m.length - 1], content: fullContent }; return m; });
              if (s.mode === 'builder') {
                const match = fullContent.match(/```(\w+)?\n([\s\S]*)$/);
                if (match) {
                  const rawCode = match[2].replace(/```\s*$/, '');
                  const lang = (match[1] || 'html').toLowerCase() as CodeArtifact['language'];
                  if (rawCode.trim().length > 20) {
                    setActiveArtifact({ id: artifactId, title: text.slice(0, 40), language: lang, code: rawCode, streaming: true });
                    setRightPanel('preview');
                  }
                }
              }
            }
            if (data.plugin_call) setPluginCalls(prev => [...prev, { name: data.plugin_call.name, status: 'running' }]);
            if (data.plugin_result) setPluginCalls(prev => prev.map(p => p.name === data.plugin_result.plugin && p.status === 'running' ? { ...p, status: data.plugin_result.success ? 'done' : 'error' } : p));
            if (data.conversationId) {
              setActiveConvoId(data.conversationId);
              router.replace(`/chat/${data.conversationId}`, { scroll: false });
              window.dispatchEvent(new CustomEvent('aria:new-conversation'));
            }
            if (data.done) {
              const artifacts = extractArtifacts(fullContent, text);
              setMessages(prev => { const m = [...prev]; m[m.length - 1] = { ...m[m.length - 1], artifacts }; return m; });
              if (artifacts.length > 0) {
                const last = { ...artifacts[artifacts.length - 1], streaming: false };
                setActiveArtifact(last);
                if (['html','jsx','tsx'].includes(last.language)) setRightPanel('preview');
              } else if (s.mode === 'builder') {
                const fm = fullContent.match(/```(\w+)?\n([\s\S]+?)(?:```|$)/s);
                if (fm) {
                  const lang = (fm[1] || 'html').toLowerCase() as CodeArtifact['language'];
                  setActiveArtifact({ id: artifactId, title: text.slice(0, 40), language: lang, code: fm[2].trim(), streaming: false });
                  if (['html','jsx','tsx'].includes(lang)) setRightPanel('preview');
                } else {
                  setActiveArtifact(prev => prev ? { ...prev, streaming: false } : null);
                }
              }
              setLastAiMessage(fullContent);
            }
          } catch {}
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed');
      setMessages(prev => prev.slice(0, -2));
      if (textareaRef.current) textareaRef.current.value = text;
    } finally {
      setLoading(false);
    }
  }, []); // ← empty deps — reads everything from stateRef, never stale

  async function exportConversation(format: 'markdown' | 'json') {
    if (!activeConvoId) return;
    const a = document.createElement('a');
    a.href = `/api/export?id=${activeConvoId}&format=${format}`;
    a.download = format === 'markdown' ? 'conversation.md' : 'conversation.json';
    a.click();
  }

  const closePanel = useCallback(() => { setActiveArtifact(null); setRightPanel(null); setExecCode(null); }, []);

  const shareConversation = useCallback(async () => {
    const s = stateRef.current;
    if (!s.activeConvoId) return;
    setSharing(true);
    try {
      const res = await fetch('/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: s.activeConvoId }) });
      const data = await res.json();
      if (data.shareUrl) { setShareUrl(data.shareUrl); navigator.clipboard.writeText(data.shareUrl); toast.success('Share link copied!'); }
    } finally { setSharing(false); }
  }, []);

  const branchConversation = useCallback(async (fromIndex: number) => {
    const s = stateRef.current;
    if (!s.activeConvoId) return;
    const res = await fetch('/api/conversations/branch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: s.activeConvoId, fromMessageIndex: fromIndex }) });
    const data = await res.json();
    if (data.conversationId) { toast.success('Branch created!'); window.location.href = `/chat/${data.conversationId}`; }
  }, []);

  // Regenerate: remove last assistant message and resend the last user message
  const regenerate = useCallback(async () => {
    const s = stateRef.current;
    if (s.loading) return;
    setMessages(prev => {
      // Find and remove the last assistant message
      const lastAssistant = [...prev].reverse().findIndex(m => m.role === 'assistant');
      if (lastAssistant === -1) return prev;
      const idx = prev.length - 1 - lastAssistant;
      return prev.slice(0, idx);
    });
    // Get last user message prompt and re-fire it
    setMessages(prev => {
      const lastUser = [...prev].reverse().find(m => m.role === 'user');
      if (lastUser && textareaRef.current) {
        // Temporarily set textarea value so sendMessage picks it up
        textareaRef.current.value = lastUser.content;
        // Use setTimeout to let state settle before calling sendMessage
        setTimeout(() => {
          if (textareaRef.current) textareaRef.current.value = lastUser.content;
          sendMessage();
        }, 50);
      }
      return prev;
    });
  }, [sendMessage]);
  const openExecutor = useCallback((code: string, language: string) => { setExecCode({ code, language }); setRightPanel('execute'); setActiveArtifact(null); }, []);
  const onPreview = useCallback((art: CodeArtifact) => { setActiveArtifact(art); setRightPanel('preview'); }, []);
  const onArtifactClick = useCallback((art: CodeArtifact) => { setActiveArtifact(art); if (['html','jsx','tsx'].includes(art.language)) setRightPanel('preview'); }, []);

  return (
    <div style={{ display:'flex', flexDirection: showSplit ? 'row' : 'column', flex:1, minHeight:0, overflow:'hidden', position:'relative' }}>

      {/* ── CHAT PANEL ── */}
      <div style={{ display:'grid', gridTemplateRows:'auto minmax(0,1fr) auto', flex: showSplit ? '0 0 45%' : 1, minWidth:0, minHeight:0, overflow:'hidden' }}
        className={showSplit ? 'hidden md:grid' : ''}>

        {/* Top bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-[#16161d]">
          <button onClick={() => window.dispatchEvent(new Event(SIDEBAR_EVENT))}
            className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-[#888899] border border-white/10 text-sm flex-shrink-0">☰</button>
          <select value={model} onChange={e => setModel(e.target.value)}
            className="bg-white/5 border border-white/10 text-xs rounded-lg px-2 py-1.5 outline-none text-white flex-shrink-0">
            {MODELS.map(m => <option key={m.id} value={m.id} disabled={m.plan === 'pro' && !isPro}>{m.label}{m.plan === 'pro' && !isPro ? ' ⭐' : ''}</option>)}
          </select>
          <div className="flex gap-1 flex-wrap flex-1 min-w-0 overflow-hidden">
            {mode === 'builder' && <span className="text-[10px] bg-[#6C63FF]/20 text-[#a78bfa] border border-[#6C63FF]/30 px-2 py-0.5 rounded-full whitespace-nowrap">🔨 Builder</span>}
            {webSearch && <span className="text-[10px] bg-[#6C63FF]/20 text-[#a78bfa] border border-[#6C63FF]/30 px-2 py-0.5 rounded-full whitespace-nowrap">🔍 Search</span>}
            {deepResearch && <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full whitespace-nowrap">🔬 Research</span>}
            {!plugins && <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full whitespace-nowrap">Plugins off</span>}
            {activeConvoId && (
              <button onClick={shareConversation} disabled={sharing} title="Share conversation"
                className="text-[#555566] hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5 flex-shrink-0" style={{marginLeft:'auto'}}>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16,6 12,2 8,6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
              </button>
            )}
            {activeConvoId && (
              <div className="relative group flex-shrink-0">
                <button className="text-[10px] text-[#555566] hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-white/5">⬇ Export</button>
                <div className="absolute right-0 top-full mt-1 bg-[#16161d] border border-white/10 rounded-xl overflow-hidden shadow-xl hidden group-hover:block z-50 w-36">
                  <button onClick={() => exportConversation('markdown')} className="w-full text-left px-3 py-2 text-xs text-[#888899] hover:text-white hover:bg-white/5">📄 Markdown</button>
                  <button onClick={() => exportConversation('json')} className="w-full text-left px-3 py-2 text-xs text-[#888899] hover:text-white hover:bg-white/5">📦 JSON</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Messages */}
        <div style={{ overflowY:'auto', minHeight:0 }} className="px-3 py-4 flex flex-col">
          {messages.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 pb-8 px-2">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#6C63FF] to-[#a78bfa] flex items-center justify-center text-xl animate-float shadow-[0_0_40px_rgba(108,99,255,0.3)]">
                {mode === 'builder' ? '🔨' : '✦'}
              </div>
              <div>
                <h2 className="text-base font-semibold">{mode === 'builder' ? 'Aria Builder' : "Hi, I'm Aria"}</h2>
                <p className="text-[#888899] text-xs mt-1 max-w-[260px]">
                  {mode === 'builder' ? 'Describe what to build — live preview opens automatically.' : 'Pick a tool from the sidebar or just start chatting.'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 w-full max-w-[280px]">
                {(mode === 'builder' ? BUILDER_STARTERS : CHAT_STARTERS).map(s => (
                  <button key={s.text} onClick={() => {
                    if (textareaRef.current) { textareaRef.current.value = s.text; textareaRef.current.focus(); }
                  }} className="text-left text-[11px] bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-[#888899] hover:text-white transition-all leading-snug">
                    {s.icon} {s.text}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <MessageBubble
                key={i}
                msg={msg}
                msgIndex={i}
                isLast={i === messages.length - 1}
                loading={loading}
                session={session}
                onPreview={onPreview}
                onRun={openExecutor}
                onArtifactClick={onArtifactClick}
                activeArtifactId={activeArtifact?.id}
                onRegenerate={msg.role === 'assistant' ? regenerate : undefined}
              />
            ))}
          </div>
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-2 border-t border-white/5 bg-[#0e0e12]" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))', paddingTop: '8px' }}>
          {pluginCalls.length > 0 && (
            <div className="flex gap-1 flex-wrap mb-1">
              {pluginCalls.map((p, i) => (
                <div key={i} className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg border ${p.status === 'running' ? 'bg-orange-500/10 border-orange-500/20 text-orange-300 animate-pulse' : p.status === 'done' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                  {p.status === 'running' ? '⟳' : p.status === 'done' ? '✓' : '✗'} {p.name.replace(/_/g, ' ')}
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5 mb-1">
            <VoiceMode onTranscript={t => { if (textareaRef.current) { textareaRef.current.value = t; } setTimeout(() => sendMessage(), 100); }} isSpeaking={speaking} onStopSpeaking={stopSpeaking} lastAiMessage={lastAiMessage} autoRead={false} />
            {lastAiMessage && (
              <button onClick={() => speaking ? stopSpeaking() : speak(lastAiMessage)}
                className={`text-[10px] px-2 py-1 rounded-lg border transition-all ${speaking ? 'bg-blue-500/20 border-blue-500/40 text-blue-300' : 'bg-white/5 border-white/10 text-[#888899]'}`}>
                {speaking ? '⏹' : '🔊'}
              </button>
            )}
          </div>
          {pendingFile && (
            <div className="flex items-center gap-2 mb-1 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-[#888899]">
              📎 <span className="truncate flex-1">{pendingFile.name}</span>
              <button onClick={() => setPendingFile(null)} className="hover:text-white flex-shrink-0">✕</button>
            </div>
          )}
          <div className="flex gap-2 items-end bg-[#1f1f2a] border border-white/10 rounded-2xl px-3 py-2 focus-within:border-[#6C63FF]/50 transition-colors">
            <input ref={fileRef} type="file" className="hidden" accept="image/*,.pdf,.txt,.csv,.md" onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0])} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className="text-[#888899] hover:text-white flex-shrink-0 text-base leading-none pb-0.5">
              {uploading ? <span className="animate-spin inline-block text-sm">⟳</span> : '📎'}
            </button>
            <textarea
              ref={textareaRef}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder={mode === 'builder' ? 'Describe what to build…' : 'Message Aria…'}
              rows={1}
              className="flex-1 bg-transparent resize-none outline-none text-sm text-white placeholder:text-[#555566] max-h-28 leading-5"
              style={{ minHeight: '20px' }}
              onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 112) + 'px'; }}
            />
            <button onClick={sendMessage} disabled={loading}
              className="bg-[#6C63FF] hover:bg-[#4b44cc] disabled:opacity-40 text-white w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0">
              {loading ? <span className="animate-spin text-sm">⟳</span> : '↑'}
            </button>
          </div>
          <p className="text-center text-[10px] text-[#555566] mt-1 hidden sm:block">Shift+Enter for new line · Aria can make mistakes</p>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      {showSplit && (
        <div style={{ display:'flex', flexDirection:'column', flex:1, minWidth:0, minHeight:0, overflow:'hidden', background:'#0e0e12' }}
          className="absolute inset-0 md:relative md:inset-auto">
          <div className="md:hidden flex items-center px-3 py-2 bg-[#16161d] border-b border-white/5 flex-shrink-0">
            <button onClick={closePanel} className="text-sm text-[#888899] hover:text-white">← Back to chat</button>
          </div>
          <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
            {rightPanel === 'preview' && activeArtifact && <PreviewPanel artifact={activeArtifact} onClose={closePanel} />}
            {rightPanel === 'image'   && <ImageGenerator isPro={isPro} onClose={closePanel} />}
            {rightPanel === 'project' && <ProjectBuilder onClose={closePanel} />}
            {rightPanel === 'execute' && execCode && <CodeExecutor code={execCode.code} language={execCode.language} onClose={closePanel} />}
            {rightPanel === 'execute' && !execCode && (
              <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-3">
                <span className="text-4xl">▶️</span>
                <p className="text-[#888899] text-sm">Click <span className="text-green-400">▶ Run</span> on any code block to execute it here.</p>
                <button onClick={closePanel} className="text-xs text-[#555566] hover:text-white">Close</button>
              </div>
            )}
            {rightPanel === 'canvas' && <Canvas isPro={isPro} onClose={closePanel} />}
            {rightPanel === 'screenshot' && <ScreenshotToCode onClose={closePanel} />}
            {rightPanel === 'agent' && <AgentMode isPro={isPro} onClose={closePanel} />}
          </div>
        </div>
      )}
    </div>
  );
}
