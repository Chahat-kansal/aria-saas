'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
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
import { SIDEBAR_EVENT } from './Sidebar';

interface Message { role: 'user' | 'assistant'; content: string; fileUrl?: string; fileName?: string; artifacts?: CodeArtifact[]; }
interface Props { conversationId?: string; }

const MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', plan: 'free' },
  { id: 'claude-sonnet-4-20250514',  label: 'Sonnet 4',  plan: 'pro' },
  { id: 'claude-opus-4-20250514',    label: 'Opus 4',    plan: 'pro' },
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

export function ChatWindow({ conversationId }: Props) {
  const { data: session } = useSession();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
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
  const [rightPanel, setRightPanel] = useState<'preview' | 'image' | 'project' | 'execute' | 'canvas' | null>(null);
  const [execCode, setExecCode] = useState<{ code: string; language: string } | null>(null);
  const [pluginCalls, setPluginCalls] = useState<{ name: string; status: 'running' | 'done' | 'error' }[]>([]);
  const [lastAiMessage, setLastAiMessage] = useState('');
  const { speak, stop: stopSpeaking, speaking } = useTextToSpeech();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isPro = userPlan === 'pro';
  const showSplit = !!activeArtifact || !!rightPanel;

  // Load user plan
  useEffect(() => {
    fetch('/api/user').then(r => r.json()).then(d => setUserPlan(d.plan || 'free')).catch(() => {});
  }, []);

  // Load conversation
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

  // Scroll to bottom
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Sync state to sidebar
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('aria:mode-change', {
      detail: { mode, isPro, activeTool: rightPanel, plugins, webSearch, deepResearch }
    }));
  }, [mode, isPro, rightPanel, plugins, webSearch, deepResearch]);

  // Listen for tool selections from sidebar
  useEffect(() => {
    function onTool(e: Event) {
      const tool = (e as CustomEvent).detail as string;
      if (tool === 'mode:chat')     { setMode('chat'); setRightPanel(null); return; }
      if (tool === 'mode:builder')  { setMode('builder'); setRightPanel(null); return; }
      if (tool === 'search')        { setWebSearch(w => !w); setDeepResearch(false); setRightPanel(null); return; }
      if (tool === 'research')      { setDeepResearch(d => !d); setWebSearch(false); setRightPanel(null); return; }
      if (tool === 'plugins')       { setPlugins(p => !p); return; }
      if (tool === 'image')         { setRightPanel(p => p === 'image'   ? null : 'image');   setActiveArtifact(null); return; }
      if (tool === 'project')       { setRightPanel(p => p === 'project' ? null : 'project'); setActiveArtifact(null); return; }
      if (tool === 'canvas')        { setRightPanel(p => p === 'canvas'  ? null : 'canvas');  setActiveArtifact(null); return; }
      if (tool === 'execute')       { setRightPanel(p => p === 'execute' ? null : 'execute'); setActiveArtifact(null); return; }
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

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text && !pendingFile) return;
    if (loading) return;

    setMessages(prev => [...prev, { role: 'user', content: text, fileUrl: pendingFile?.url, fileName: pendingFile?.name }]);
    setInput('');
    setPendingFile(null);
    setLoading(true);
    setPluginCalls([]);

    if (mode === 'builder') {
      const placeholder: CodeArtifact = { id: crypto.randomUUID(), title: text.slice(0, 40), language: 'html', code: '', streaming: true };
      setActiveArtifact(placeholder);
      setRightPanel('preview');
    }
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const endpoint = mode === 'builder' ? '/api/builder' : '/api/plugins';
      const msgContent = pendingFile ? `${text ? text + '\n\n' : ''}[File: ${pendingFile.name}](${pendingFile.url})` : text;
      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msgContent, conversationId: activeConvoId, model, enablePlugins: plugins, enableWebSearch: webSearch || deepResearch }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Error'); }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '', fullContent = '';

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
              if (mode === 'builder') {
                const match = fullContent.match(/```(\w+)?\n([\s\S]*?)(?:```|$)/);
                if (match) {
                  const lang = (match[1] || 'html').toLowerCase() as CodeArtifact['language'];
                  setActiveArtifact(prev => prev ? { ...prev, language: lang, code: match[2], streaming: true } : null);
                }
              }
            }
            if (data.plugin_call) setPluginCalls(prev => [...prev, { name: data.plugin_call.name, status: 'running' }]);
            if (data.plugin_result) setPluginCalls(prev => prev.map(p => p.name === data.plugin_result.plugin && p.status === 'running' ? { ...p, status: data.plugin_result.success ? 'done' : 'error' } : p));
            if (data.conversationId) {
              setActiveConvoId(data.conversationId);
              router.replace(`/chat/${data.conversationId}`);
              window.dispatchEvent(new CustomEvent('aria:new-conversation'));
            }
            if (data.done) {
              const artifacts = extractArtifacts(fullContent, text);
              setMessages(prev => { const m = [...prev]; m[m.length - 1] = { ...m[m.length - 1], artifacts }; return m; });
              if (artifacts.length > 0) {
                const last = { ...artifacts[artifacts.length - 1], streaming: false };
                setActiveArtifact(last);
                if (['html', 'jsx', 'tsx'].includes(last.language)) setRightPanel('preview');
              } else if (mode === 'builder') {
                setActiveArtifact(prev => prev ? { ...prev, streaming: false } : null);
              }
              setLastAiMessage(fullContent);
            }
          } catch {}
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed');
      setMessages(prev => prev.slice(0, -2));
      setInput(text);
    } finally {
      setLoading(false);
    }
  }, [input, pendingFile, loading, model, mode, webSearch, deepResearch, activeConvoId, plugins, router]);

  function closePanel() { setActiveArtifact(null); setRightPanel(null); setExecCode(null); }
  function openExecutor(code: string, language: string) { setExecCode({ code, language }); setRightPanel('execute'); setActiveArtifact(null); }

  return (
    // Outer: fills the <main> column completely
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', position:'relative' }}>

      {/* ── CHAT PANEL ── */}
      {/* Uses CSS Grid: 3 rows = [topbar][messages(1fr)][input] */}
      {(!showSplit || typeof window !== 'undefined') && (
        <div
          style={{
            display: showSplit ? 'none' : 'grid',
            gridTemplateRows: 'auto 1fr auto',
            flex: 1,
            minWidth: 0,
            minheight: 0,
            overflow: 'hidden',
          }}
          className={showSplit ? 'md:!grid md:w-[46%] md:min-w-[300px]' : ''}
        >

          {/* Row 1: Top bar */}
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
            </div>
          </div>

          {/* Row 2: Messages — grid gives this row exactly the remaining space */}
          <div style={{ overflowY: 'auto', minHeight: 0 }} className="px-3 py-4"> className="px-3 py-4">
            {messages.length === 0 && (
              <div style={{ flex: 1 }} className="flex flex-col items-center justify-center text-center gap-3 pb-8 px-2">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#6C63FF] to-[#a78bfa] flex items-center justify-center text-xl animate-float shadow-[0_0_40px_rgba(108,99,255,0.3)]">
                  {mode === 'builder' ? '🔨' : '✦'}
                </div>
                <div>
                  <h2 className="text-base font-semibold">{mode === 'builder' ? 'Aria Builder' : "Hi, I'm Aria"}</h2>
                  <p className="text-[#888899] text-xs mt-1 max-w-[260px]">
                    {mode === 'builder' ? "Describe what to build — live preview opens automatically." : 'Pick a tool from the sidebar or just start chatting.'}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 w-full max-w-[280px]">
                  {(mode === 'builder' ? BUILDER_STARTERS : CHAT_STARTERS).map(s => (
                    <button key={s.text} onClick={() => { setInput(s.text); textareaRef.current?.focus(); }}
                      className="text-left text-[11px] bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-[#888899] hover:text-white transition-all leading-snug">
                      {s.icon} {s.text}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 self-start mt-0.5 ${msg.role === 'assistant' ? 'bg-gradient-to-br from-[#6C63FF] to-[#a78bfa] text-white' : 'bg-white/10 text-white'}`}>
                    {msg.role === 'assistant' ? 'A' : session?.user?.name?.[0] || 'U'}
                  </div>
                  <div className={`flex flex-col gap-1.5 min-w-0 ${msg.role === 'user' ? 'items-end max-w-[85%]' : 'flex-1'}`}>
                    {msg.fileUrl && (
                      <div className="text-xs text-[#888899] bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                        📎 <a href={msg.fileUrl} target="_blank" rel="noopener" className="hover:underline">{msg.fileName}</a>
                      </div>
                    )}
                    {msg.role === 'user' ? (
                      <div className="bg-[#6C63FF] text-white px-3 py-2.5 rounded-2xl rounded-tr-sm text-sm leading-relaxed break-words">{msg.content}</div>
                    ) : (
                      <>
                        {msg.content === '' && loading && i === messages.length - 1 ? (
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
                                  return (
                                    <div className="my-3 overflow-hidden rounded-lg border border-white/10">
                                      <div className="flex items-center justify-between bg-[#1a1a28] px-3 py-1.5">
                                        <span className="text-[10px] text-[#888899] font-mono">{lang}</span>
                                        <div className="flex gap-2">
                                          {isPreview && art && (
                                            <button onClick={() => { setActiveArtifact(art); setRightPanel('preview'); }} className="text-[10px] text-[#6C63FF]">👁 Preview</button>
                                          )}
                                          {isRunnable && (
                                            <button onClick={() => openExecutor(code, lang)} className="text-[10px] text-green-400">▶ Run</button>
                                          )}
                                          <button onClick={() => { navigator.clipboard.writeText(code); toast.success('Copied!'); }} className="text-[10px] text-[#888899] hover:text-white">Copy</button>
                                        </div>
                                      </div>
                                      <div className="overflow-x-auto">
                                        <SyntaxHighlighter style={oneDark} language={lang} PreTag="div"
                                          customStyle={{ margin: 0, borderRadius: 0, fontSize: '11.5px', border: 'none' }}>
                                          {code}
                                        </SyntaxHighlighter>
                                      </div>
                                    </div>
                                  );
                                }
                                return <code className="font-mono text-xs bg-white/10 px-1.5 py-0.5 rounded break-all">{children}</code>;
                              },
                            }}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        )}
                        {msg.artifacts && msg.artifacts.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {msg.artifacts.map(a => (
                              <button key={a.id} onClick={() => { setActiveArtifact(a); if (['html','jsx','tsx'].includes(a.language)) setRightPanel('preview'); }}
                                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${activeArtifact?.id === a.id ? 'bg-[#6C63FF]/20 border-[#6C63FF]/40 text-[#a78bfa]' : 'bg-white/5 border-white/10 text-[#888899] hover:text-white'}`}>
                                {['html','jsx','tsx'].includes(a.language) ? '👁' : '📄'} {a.title.slice(0, 20)} <span className="font-mono text-[10px] opacity-60">.{a.language}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div ref={bottomRef} />
          </div>

          {/* Row 3: Input — grid pins this to the bottom automatically */}
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
              <VoiceMode onTranscript={t => { setInput(t); setTimeout(() => sendMessage(), 100); }} isSpeaking={speaking} onStopSpeaking={stopSpeaking} lastAiMessage={lastAiMessage} autoRead={false} />
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
              <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={mode === 'builder' ? 'Describe what to build…' : 'Message Aria…'}
                rows={1} className="flex-1 bg-transparent resize-none outline-none text-sm text-white placeholder:text-[#555566] max-h-28 leading-5"
                style={{ minHeight: '20px' }}
                onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 112) + 'px'; }}
              />
              <button onClick={sendMessage} disabled={loading || (!input.trim() && !pendingFile)}
                className="bg-[#6C63FF] hover:bg-[#4b44cc] disabled:opacity-40 text-white w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0">
                {loading ? <span className="animate-spin text-sm">⟳</span> : '↑'}
              </button>
            </div>
            <p className="text-center text-[10px] text-[#555566] mt-1 hidden sm:block">Shift+Enter for new line · Aria can make mistakes</p>
          </div>
        </div>
      )}

      {/* ── RIGHT PANEL ── */}
      {showSplit && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: '#0e0e12' }}
          className="md:relative md:inset-auto md:flex-1 md:min-w-0">
          <div className="md:hidden flex items-center px-3 py-2 bg-[#16161d] border-b border-white/5 flex-shrink-0">
            <button onClick={closePanel} className="text-sm text-[#888899] hover:text-white">← Back to chat</button>
          </div>
          <div className="flex-1 overflow-hidden">
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
            {rightPanel === 'canvas'  && <Canvas isPro={isPro} onClose={closePanel} />}
          </div>
        </div>
      )}
    </div>
  );
}
