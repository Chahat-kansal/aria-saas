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

interface Message {
  role: 'user' | 'assistant';
  content: string;
  fileUrl?: string;
  fileName?: string;
  artifacts?: CodeArtifact[];
}

interface Props {
  conversationId?: string;
}

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

  const [pendingFile, setPendingFile] = useState<any>(null);
  const [uploading, setUploading] = useState(false);

  const [activeConvoId, setActiveConvoId] = useState<string | undefined>(conversationId);
  const [userPlan, setUserPlan] = useState('free');

  const [activeArtifact, setActiveArtifact] = useState<CodeArtifact | null>(null);
  const [rightPanel, setRightPanel] =
    useState<'preview' | 'image' | 'project' | 'execute' | 'canvas' | null>(null);

  const [execCode, setExecCode] = useState<{ code: string; language: string } | null>(null);

  const [pluginCalls, setPluginCalls] = useState<any[]>([]);
  const [lastAiMessage, setLastAiMessage] = useState('');

  const { speak, stop: stopSpeaking, speaking } = useTextToSpeech();

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isPro = userPlan === 'pro';
  const showSplit = !!activeArtifact || !!rightPanel;

  // Load user
  useEffect(() => {
    fetch('/api/user')
      .then(r => r.json())
      .then(d => setUserPlan(d.plan || 'free'))
      .catch(() => {});
  }, []);

  // Load conversation
  useEffect(() => {
    if (!conversationId) return;

    fetch(`/api/conversations/${conversationId}`)
      .then(r => r.json())
      .then(data => {
        if (data.messages) {
          const msgs = data.messages.map((m: any) => ({
            ...m,
            artifacts: m.role === 'assistant' ? extractArtifacts(m.content) : undefined,
          }));
          setMessages(msgs);

          const last = [...msgs].reverse().find(m => m.artifacts?.length);
          if (last?.artifacts?.[0]) setActiveArtifact(last.artifacts[0]);
        }

        if (data.model) setModel(data.model);
      });
  }, [conversationId]);

  // Scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Sync sidebar
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('aria:mode-change', {
        detail: { mode, isPro, activeTool: rightPanel, plugins, webSearch, deepResearch },
      })
    );
  }, [mode, isPro, rightPanel, plugins, webSearch, deepResearch]);

  // Tool listener
  useEffect(() => {
    function onTool(e: Event) {
      const tool = (e as CustomEvent).detail;

      if (tool === 'mode:chat') setMode('chat');
      if (tool === 'mode:builder') setMode('builder');

      if (tool === 'image') setRightPanel(p => (p === 'image' ? null : 'image'));
      if (tool === 'project') setRightPanel(p => (p === 'project' ? null : 'project'));
      if (tool === 'canvas') setRightPanel(p => (p === 'canvas' ? null : 'canvas'));
      if (tool === 'execute') setRightPanel(p => (p === 'execute' ? null : 'execute'));
    }

    window.addEventListener('aria:tool-select', onTool);
    return () => window.removeEventListener('aria:tool-select', onTool);
  }, []);

  function closePanel() {
    setActiveArtifact(null);
    setRightPanel(null);
    setExecCode(null);
  }

  function openExecutor(code: string, language: string) {
    setExecCode({ code, language });
    setRightPanel('execute');
    setActiveArtifact(null);
  }

  return (
    <div className="flex flex-col h-full relative overflow-hidden">

      {/* CHAT AREA */}
      <div
        className={`grid grid-rows-[auto_1fr_auto] h-full transition-all ${
          showSplit ? 'md:w-[46%]' : 'w-full'
        }`}
      >

        {/* TOP BAR */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-[#16161d]">
          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            className="bg-white/5 text-white text-xs px-2 py-1 rounded"
          >
            <option value="claude-haiku-4-5-20251001">Haiku</option>
            <option value="claude-sonnet-4-20250514">Sonnet</option>
          </select>
        </div>

        {/* MESSAGES */}
        <div className="overflow-y-auto min-h-0 px-3 py-4 flex flex-col">
          {messages.map((msg, i) => (
            <div key={i} className="mb-3">
              <div className="text-sm text-white">{msg.content}</div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* INPUT */}
        <div className="p-2 border-t border-white/5 bg-[#0e0e12]">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            className="w-full bg-transparent text-white outline-none"
          />
        </div>
      </div>

      {/* RIGHT PANEL (FIXED) */}
      {showSplit && (
        <div className="absolute top-0 right-0 h-full w-[54%] bg-[#0e0e12] flex flex-col overflow-hidden">

          <div className="flex-1 min-h-0 overflow-hidden">
            {rightPanel === 'preview' && activeArtifact && (
              <div className="h-full w-full flex flex-col">
                <PreviewPanel artifact={activeArtifact} onClose={closePanel} />
              </div>
            )}

            {rightPanel === 'image' && <ImageGenerator isPro={isPro} onClose={closePanel} />}
            {rightPanel === 'project' && <ProjectBuilder onClose={closePanel} />}
            {rightPanel === 'execute' && execCode && (
              <CodeExecutor code={execCode.code} language={execCode.language} onClose={closePanel} />
            )}
            {rightPanel === 'canvas' && <Canvas isPro={isPro} onClose={closePanel} />}
          </div>
        </div>
      )}
    </div>
  );
}
