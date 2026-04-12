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
import { v4 as uuid } from 'uuid';
import { CodeExecutor } from '@/components/project/CodeExecutor';
import { ImageGenerator } from '@/components/project/ImageGenerator';
import { ProjectBuilder } from '@/components/project/ProjectBuilder';
import { VoiceMode, useTextToSpeech } from '@/components/voice/VoiceMode';
import { Canvas } from '@/components/canvas/Canvas';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  fileUrl?: string;
  fileName?: string;
  artifacts?: CodeArtifact[];
}

interface Props { conversationId?: string; }

const MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', plan: 'free' },
  { id: 'claude-sonnet-4-20250514',  label: 'Sonnet 4',  plan: 'pro' },
  { id: 'claude-opus-4-20250514',    label: 'Opus 4',    plan: 'pro' },
];

const CHAT_STARTERS = [
  { icon: '💡', text: 'Brainstorm startup ideas for 2025' },
  { icon: '🐛', text: 'Debug my code' },
  { icon: '✍️', text: 'Help me write an email' },
  { icon: '📊', text: 'Analyse this data' },
];

const BUILDER_STARTERS = [
  { icon: '🌐', text: 'Build a landing page for a SaaS startup' },
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
  const [pendingFile, setPendingFile] = useState<{ url: string; name: string; type: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activeConvoId, setActiveConvoId] = useState<string | undefined>(conversationId);
  const [userPlan, setUserPlan] = useState('free');
  const [activeArtifact, setActiveArtifact] = useState<CodeArtifact | null>(null);
  const [streamingCode, setStreamingCode] = useState('');
  const [rightPanel, setRightPanel] = useState<'preview' | 'image' | 'project' | 'execute' | 'canvas' | null>(null);
  const [execCode, setExecCode] = useState<{ code: string; language: string } | null>(null);
  const [plugins, setPlugins] = useState(true);
  const [pluginCalls, setPluginCalls] = useState<{ name: string; status: 'running' | 'done' | 'error'; result?: any }[]>([]);
  const [lastAiMessage, setLastAiMessage] = useState('');
  const { speak, stop: stopSpeaking, speaking } = useTextToSpeech();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/user').then(r => r.json()).then(d => setUserPlan(d.plan || 'free')).catch(() => {});
  }, []);

  useEffect(() => {
    if (conversationId) {
      fetch(`/api/conversations/${conversationId}`)
        .then(r => r.json())
        .then(data => {
          if (data.messages) {
            const msgs: Message[] = data.messages.map((m: any) => ({
              ...m,
              artifacts: m.role === 'assistant' ? extractArtifacts(m.content) : undefined,
            }));
            setMessages(msgs);
            const last = [...msgs].reverse().find(m => m.artifacts?.length);
            if (last?.artifacts?.[0]) setActiveArtifact(last.artifacts[0]);
          }
          if (data.model) setModel(data.model);
        }).catch(() => {});
    } else {
      setMessages([]); setActiveConvoId(undefined); setActiveArtifact(null);
    }
  }, [conversationId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
  }, [input]);

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

    const userMsg: Message = { role: 'user', content: text, fileUrl: pendingFile?.url, fileName: pendingFile?.name };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setPendingFile(null);
    setLoading(true);
    setStreamingCode('');

    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    // Streaming artifact for builder mode — pre-open the panel
    if (mode === 'builder') {
      const placeholder: CodeArtifact = { id: uuid(), title: text.slice(0, 40), language: 'html', code: '', streaming: true };
      setActiveArtifact(placeholder);
      setRightPanel('preview');
    }

    try {
      const endpoint = mode === 'builder' ? '/api/builder' : '/api/plugins';
      const msgContent = pendingFile ? `${text ? text + '\n\n' : ''}[File: ${pendingFile.name}](${pendingFile.url})` : text;

      setPluginCalls([]);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msgContent,
          conversationId: activeConvoId,
          model,
          enablePlugins: plugins,
          enableWebSearch: webSearch || deepResearch,
        }),
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
            if (data.plugin_call) {
              setPluginCalls(prev => [...prev, { name: data.plugin_call.name, status: 'running' }]);
            }
            if (data.plugin_result) {
              setPluginCalls(prev => prev.map((p: any) =>
                p.name === data.plugin_result.plugin && p.status === 'running'
                  ? { ...p, status: data.plugin_result.success ? 'done' : 'error', result: data.plugin_result }
                  : p
              ));
            }
            if (data.conversationId) {
              setActiveConvoId(data.conversationId);
              router.replace(`/chat/${data.conversationId}`);
            }
            if (data.done) {
              const artifacts = extractArtifacts(fullContent, text);
              setMessages(prev => { const m = [...prev]; m[m.length - 1] = { ...m[m.length - 1], artifacts }; return m; });
              if (artifacts.length > 0) {
                const lastArtifact = { ...artifacts[artifacts.length - 1], streaming: false };
                setActiveArtifact(lastArtifact);
                // Auto-open preview panel for HTML/JSX/TSX artifacts
                if (['html', 'jsx', 'tsx'].includes(lastArtifact.language)) {
                  setRightPanel('preview');
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
      setInput(text);
    } finally {
      setLoading(false);
    }
  }, [input, pendingFile, loading, model, mode, webSearch, deepResearch, activeConvoId, router]);

  const isPro = userPlan === 'pro';
  const showSplit = !!activeArtifact || !!rightPanel;

  function openArtifact(a: CodeArtifact) { setActiveArtifact(a); setRightPanel('preview'); }
  function closePanel() { setActiveArtifact(null); setRightPanel(null); setExecCode(null); }
  function openImageGen() { setRightPanel('image'); setActiveArtifact(null); }
  function openProjectBuilder() { setRightPanel('project'); setActiveArtifact(null); }
  function openCanvas() { setRightPanel('canvas'); setActiveArtifact(null); }
  function openExecutor(code: string, language: string) { setExecCode({ code, language }); setRightPanel('execute'); setActiveArtifact(null); }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── CHAT PANEL ── */}
      <div className={`flex flex-col transition-all duration-300 ${showSplit ? 'w-[44%] min-w-[320px]' : 'flex-1'} border-r border-white/5`}>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-[#16161d] flex-shrink-0 overflow-x-auto">
          <div className="flex bg-white/5 rounded-lg p-0.5 flex-shrink-0">
            {(['chat','builder'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${mode === m ? 'bg-[#6C63FF] text-white' : 'text-[#888899] hover:text-white'}`}>
                {m === 'chat' ? '💬 Chat' : '🔨 Builder'}
              </button>
            ))}
          </div>

          <select value={model} onChange={e => setModel(e.target.value)} className="bg-white/5 border border-white/10 text-xs rounded-lg px-2 py-1.5 outline-none text-white flex-shrink-0">
            {MODELS.map(m => <option key={m.id} value={m.id} disabled={m.plan === 'pro' && !isPro}>{m.label}{m.plan === 'pro' && !isPro ? ' ⭐' : ''}</option>)}
          </select>

          {mode === 'chat' && (
            <>
              <button onClick={() => { setWebSearch(w => !w); setDeepResearch(false); }} disabled={!isPro}
                className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all flex-shrink-0 ${webSearch ? 'bg-[#6C63FF]/20 border-[#6C63FF]/50 text-[#a78bfa]' : 'bg-white/5 border-white/10 text-[#888899] hover:text-white'} ${!isPro ? 'opacity-40 cursor-not-allowed' : ''}`}>
                🔍 Search
              </button>
              <button onClick={() => { setDeepResearch(d => !d); setWebSearch(!deepResearch); }} disabled={!isPro}
                className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all flex-shrink-0 ${deepResearch ? 'bg-purple-500/20 border-purple-500/50 text-purple-300' : 'bg-white/5 border-white/10 text-[#888899] hover:text-white'} ${!isPro ? 'opacity-40 cursor-not-allowed' : ''}`}>
                🔬 Research
              </button>
            </>
          )}
          <button onClick={openImageGen}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all flex-shrink-0 ${rightPanel === 'image' ? 'bg-pink-500/20 border-pink-500/50 text-pink-300' : 'bg-white/5 border-white/10 text-[#888899] hover:text-white'}`}>
            🎨 Image
          </button>
          <button onClick={openProjectBuilder}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all flex-shrink-0 ${rightPanel === 'project' ? 'bg-amber-500/20 border-amber-500/50 text-amber-300' : 'bg-white/5 border-white/10 text-[#888899] hover:text-white'}`}>
            🏗️ Projects
          </button>
          <button onClick={openCanvas}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all flex-shrink-0 ${rightPanel === 'canvas' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' : 'bg-white/5 border-white/10 text-[#888899] hover:text-white'}`}>
            📝 Canvas
          </button>
          <button onClick={() => setPlugins(p => !p)}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all flex-shrink-0 ${plugins ? 'bg-orange-500/20 border-orange-500/50 text-orange-300' : 'bg-white/5 border-white/10 text-[#888899] hover:text-white'}`}
            title="Toggle plugins (weather, stocks, calculator, email, calendar)">
            🔌 Plugins
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4 pb-16">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#6C63FF] to-[#a78bfa] flex items-center justify-center text-2xl animate-float shadow-[0_0_40px_rgba(108,99,255,0.3)]">
                {mode === 'builder' ? '🔨' : '✦'}
              </div>
              <div>
                <h2 className="text-xl font-semibold">{mode === 'builder' ? 'Aria Builder' : 'Hi, I\'m Aria'}</h2>
                <p className="text-[#888899] text-sm mt-1 max-w-xs">
                  {mode === 'builder' ? 'Describe what to build — I\'ll generate it with live preview.' : 'Your AI assistant for real work.'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
                {(mode === 'builder' ? BUILDER_STARTERS : CHAT_STARTERS).map(s => (
                  <button key={s.text} onClick={() => { setInput(s.text); textareaRef.current?.focus(); }}
                    className="text-left text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 py-2.5 text-[#888899] hover:text-white transition-all">
                    {s.icon} {s.text}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 self-start mt-0.5 ${msg.role === 'assistant' ? 'bg-gradient-to-br from-[#6C63FF] to-[#a78bfa] text-white' : 'bg-white/10 text-white'}`}>
                {msg.role === 'assistant' ? 'A' : session?.user?.name?.[0] || 'U'}
              </div>
              <div className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end max-w-[80%]' : 'flex-1 min-w-0'}`}>
                {msg.fileUrl && (
                  <div className="text-xs text-[#888899] bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                    📎 <a href={msg.fileUrl} target="_blank" rel="noopener" className="hover:underline">{msg.fileName}</a>
                  </div>
                )}
                {msg.role === 'user' ? (
                  <div className="bg-[#6C63FF] text-white px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm leading-relaxed">{msg.content}</div>
                ) : (
                  <>
                    {msg.content === '' && loading && i === messages.length - 1 ? (
                      <div className="flex gap-1 py-2">
                        <span className="typing-dot w-1.5 h-1.5 rounded-full bg-[#888899]" />
                        <span className="typing-dot w-1.5 h-1.5 rounded-full bg-[#888899]" />
                        <span className="typing-dot w-1.5 h-1.5 rounded-full bg-[#888899]" />
                      </div>
                    ) : (
                      <div className="prose-aria text-sm">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                          code({ className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || '');
                            if (!props.inline && match) {
                              const lang = match[1];
                              const code = String(children).replace(/\n$/, '');
                              const art = msg.artifacts?.find(a => a.code.slice(0, 60) === code.slice(0, 60));
                              const isPreview = ['html','jsx','tsx','js','javascript'].includes(lang);
                              return (
                                <div className="my-3">
                                  <div className="flex items-center justify-between bg-[#1a1a28] px-3 py-1.5 rounded-t-lg border border-white/10 border-b-0">
                                    <span className="text-[10px] text-[#888899] font-mono">{lang}</span>
                                    <div className="flex gap-1.5">
                                      {isPreview && art && (
                                        <button onClick={() => setActiveArtifact(art)} className="text-[10px] text-[#6C63FF] hover:underline">
                                          Preview ↗
                                        </button>
                                      )}
                                      <button onClick={() => { navigator.clipboard.writeText(code); toast.success('Copied!'); }} className="text-[10px] text-[#888899] hover:text-white">Copy</button>
                                    </div>
                                  </div>
                                  <SyntaxHighlighter style={oneDark} language={lang} PreTag="div"
                                    customStyle={{ margin: 0, borderRadius: '0 0 8px 8px', fontSize: '11.5px', border: '1px solid rgba(255,255,255,0.1)', borderTop: 'none' }}>
                                    {code}
                                  </SyntaxHighlighter>
                                </div>
                              );
                            }
                            return <code className="font-mono text-xs bg-white/10 px-1.5 py-0.5 rounded">{children}</code>;
                          },
                        }}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    )}
                    {msg.artifacts && msg.artifacts.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {msg.artifacts.map(a => (
                          <button key={a.id} onClick={() => setActiveArtifact(a)}
                            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${activeArtifact?.id === a.id ? 'bg-[#6C63FF]/20 border-[#6C63FF]/40 text-[#a78bfa]' : 'bg-white/5 border-white/10 text-[#888899] hover:text-white'}`}>
                            {['html','jsx','tsx'].includes(a.language) ? '👁' : '📄'} {a.title.slice(0, 24)} <span className="font-mono text-[10px] opacity-60">.{a.language}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-3 pb-3 flex-shrink-0">
          {/* Plugin status indicators */}
          {pluginCalls.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mb-2">
              {pluginCalls.map((p, i) => (
                <div key={i} className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg border ${
                  p.status === 'running' ? 'bg-orange-500/10 border-orange-500/20 text-orange-300 animate-pulse' :
                  p.status === 'done' ? 'bg-green-500/10 border-green-500/20 text-green-400' :
                  'bg-red-500/10 border-red-500/20 text-red-400'
                }`}>
                  {p.status === 'running' ? '⟳' : p.status === 'done' ? '✓' : '✗'}
                  {p.name.replace(/_/g, ' ')}
                </div>
              ))}
            </div>
          )}
          {/* Voice mode */}
          <div className="flex items-center gap-2 mb-2">
            <VoiceMode
              onTranscript={text => { setInput(text); setTimeout(() => sendMessage(), 100); }}
              isSpeaking={speaking}
              onStopSpeaking={stopSpeaking}
              lastAiMessage={lastAiMessage}
              autoRead={false}
            />
            {lastAiMessage && (
              <button onClick={() => speaking ? stopSpeaking() : speak(lastAiMessage)}
                className={`text-[10px] px-2 py-1 rounded-lg border transition-all ${speaking ? 'bg-blue-500/20 border-blue-500/40 text-blue-300' : 'bg-white/5 border-white/10 text-[#888899] hover:text-white'}`}>
                {speaking ? '⏹ Stop reading' : '🔊 Read aloud'}
              </button>
            )}
          </div>
          {pendingFile && (
            <div className="flex items-center gap-2 mb-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-[#888899]">
              📎 {pendingFile.name} <button onClick={() => setPendingFile(null)} className="ml-auto hover:text-white">✕</button>
            </div>
          )}
          <div className="flex gap-2 items-end bg-[#1f1f2a] border border-white/10 rounded-2xl px-3 py-2 focus-within:border-[#6C63FF]/50 transition-colors">
            <input ref={fileRef} type="file" className="hidden" accept="image/*,.pdf,.txt,.csv,.md" onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0])} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className="text-[#888899] hover:text-white p-1.5 transition-colors flex-shrink-0">
              {uploading ? <span className="animate-spin">⟳</span> : '📎'}
            </button>
            <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder={mode === 'builder' ? 'Describe what to build…' : 'Message Aria…'}
              rows={1} className="flex-1 bg-transparent resize-none outline-none text-sm text-white placeholder:text-[#555566] max-h-40" />
            <button onClick={sendMessage} disabled={loading || (!input.trim() && !pendingFile)}
              className="bg-[#6C63FF] hover:bg-[#4b44cc] disabled:opacity-40 text-white w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0">
              {loading ? <span className="animate-spin text-sm">⟳</span> : '↑'}
            </button>
          </div>
          <p className="text-center text-[10px] text-[#555566] mt-1.5">Shift+Enter for new line · Aria can make mistakes</p>
        </div>
      </div>

      {/* ── PREVIEW PANEL ── */}
      {showSplit && (
        <div className="flex-1 overflow-hidden min-w-0">
          {rightPanel === 'preview' && activeArtifact && (
            <PreviewPanel artifact={activeArtifact} onClose={closePanel} />
          )}
          {rightPanel === 'image' && (
            <ImageGenerator isPro={isPro} onClose={closePanel} />
          )}
          {rightPanel === 'project' && (
            <ProjectBuilder onClose={closePanel} />
          )}
          {rightPanel === 'execute' && execCode && (
            <CodeExecutor code={execCode.code} language={execCode.language} onClose={closePanel} />
          )}
          {rightPanel === 'canvas' && (
            <Canvas isPro={isPro} onClose={closePanel} />
          )}
        </div>
      )}
    </div>
  );
}
