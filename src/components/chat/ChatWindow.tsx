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
          const msgs: Message[] = data.messages.map((m: any) => ({
            ...m,
            artifacts: m.role === 'assistant' ? extractArtifacts(m.content) : undefined,
          }));
          setMessages(msgs);

          const last = [...msgs].reverse().find(m => m.artifacts?.length);
          if (last?.artifacts?.[0]) setActiveArtifact(last.artifacts[0]);
        }

        if (data.model) setModel(data.model);
      })
      .catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>

      {/* CHAT */}
      <div className={`grid grid-rows-[auto_1fr_auto] h-full ${showSplit ? 'md:w-[46%]' : 'w-full'}`}>

        {/* MESSAGES */}
        <div className="overflow-y-auto px-3 py-4 min-h-0">
          {messages.map((msg, i) => (
            <div key={i} className="mb-3 text-white text-sm">
              {msg.content}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* INPUT */}
        <div className="p-2 border-t border-white/5">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            className="w-full bg-transparent text-white outline-none"
          />
        </div>
      </div>

      {/* RIGHT PANEL — FIXED */}
      {showSplit && (
        <div className="absolute top-0 right-0 h-full w-[54%] bg-[#0e0e12] flex flex-col overflow-hidden">

          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
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
              <CodeExecutor
                code={execCode.code}
                language={execCode.language}
                onClose={closePanel}
              />
            )}

            {rightPanel === 'canvas' && (
              <Canvas isPro={isPro} onClose={closePanel} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
