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

const MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', plan: 'free' },
  { id: 'claude-sonnet-4-20250514', label: 'Sonnet 4', plan: 'pro' },
  { id: 'claude-opus-4-20250514', label: 'Opus 4', plan: 'pro' },
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

// Placeholder component for ModelComparison
function ModelComparison({ isPro, onClose }: { isPro: boolean; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-3">
      <span className="text-4xl">🔄</span>
      <p className="text-[#888899] text-sm">Model comparison feature coming soon</p>
      <button onClick={onClose} className="text-xs text-[#555566] hover:text-white">
        Close
      </button>
    </div>
  );
}

// Placeholder component for PromptPicker
function PromptPicker({ onSelect, onClose }: { onSelect: (prompt: string) => void; onClose: () => void }) {
  const prompts = ['Explain this code', 'Write unit tests', 'Optimize performance', 'Add error handling'];
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <h3 className="text-sm font-semibold text-white">Saved Prompts</h3>
        <button onClick={onClose} className="text-[#888899] hover:text-white">
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {prompts.map((p, i) => (
          <button
            key={i}
            onClick={() => onSelect(p)}
            className="w-full text-left text-sm px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-[#888899] hover:text-white transition-colors"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
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
  const [pendingFile, setPendingFile] = useState<{ url: string; name: string; type: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activeConvoId, setActiveConvoId] = useState<string | undefined>(conversationId);
  const [userPlan, setUserPlan] = useState('free');
  const [activeArtifact, setActiveArtifact] = useState<CodeArtifact | null>(null);
  const [rightPanel, setRightPanel] = useState<'preview' | 'image' | 'project' | 'execute' | 'canvas' | 'compare' | 'prompts' | null>(null);
  const [execCode, setExecCode] = useState<{ code: string; language: string } | null>(null);
  const [pluginCalls, setPluginCalls] = useState<{ name: string; status: 'running' | 'done' | 'error' }[]>([]);
  const [lastAiMessage, setLastAiMessage] = useState('');
  const { speak, stop: stopSpeaking, speaking } = useTextToSpeech();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const isPro = userPlan === 'pro';
  const showSplit = !!activeArtifact || !!rightPanel;

  // Load user plan
  useEffect(() => {
    fetch('/api/user')
      .then(r => r.json())
      .then(d => setUserPlan(d.plan || 'free'))
      .catch(err => {
        console.error('Failed to fetch user plan:', err);
      });
  }, []);

  // Load conversation
  useEffect(() => {
    if (conversationId) {
      fetch(`/api/conversations/${conversationId}`)
        .then(r => {
          if (!r.ok) throw new Error('Failed to load conversation');
          return r.json();
        })
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
        .catch(err => {
          console.error('Failed to load conversation:', err);
          toast.error('Failed to load conversation');
        });
    } else {
      setMessages([]);
      setActiveConvoId(undefined);
      setActiveArtifact(null);
      setRightPanel(null);
    }
  }, [conversationId]);

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Sync state to sidebar
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('aria:mode-change', {
        detail: { mode, isPro, activeTool: rightPanel, plugins, webSearch, deepResearch },
      })
    );
  }, [mode, isPro, rightPanel, plugins, webSearch, deepResearch]);

  // Listen for tool selections from sidebar
  useEffect(() => {
    function onTool(e: Event) {
      const tool = (e as CustomEvent).detail as string;
      if (tool === 'mode:chat') {
        setMode('chat');
        setRightPanel(null);
        return;
      }
      if (tool === 'mode:builder') {
        setMode('builder');
        setRightPanel(null);
        return;
      }
      if (tool === 'search') {
        setWebSearch(w => !w);
        setDeepResearch(false);
        setRightPanel(null);
        return;
      }
      if (tool === 'research') {
        setDeepResearch(d => !d);
        setWebSearch(false);
        setRightPanel(null);
        return;
      }
      if (tool === 'plugins') {
        setPlugins(p => !p);
        return;
      }
      if (tool === 'image') {
        setRightPanel(p => (p === 'image' ? null : 'image'));
        setActiveArtifact(null);
        return;
      }
      if (tool === 'project') {
        setRightPanel(p => (p === 'project' ? null : 'project'));
        setActiveArtifact(null);
        return;
      }
      if (tool === 'canvas') {
        setRightPanel(p => (p === 'canvas' ? null : 'canvas'));
        setActiveArtifact(null);
        return;
      }
      if (tool === 'execute') {
        setRightPanel(p => (p === 'execute' ? null : 'execute'));
        setActiveArtifact(null);
        return;
      }
    }
    window.addEventListener('aria:tool-select', onTool);
    return () => window.removeEventListener('aria:tool-select', onTool);
  }, []);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Upload failed');
        return;
      }

      setPendingFile({ url: data.url, name: data.name, type: data.type });
      toast.success('File attached');
    } catch (err: any) {
      console.error('Upload error:', err);
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  }

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text && !pendingFile) return;
    if (loading) return;

    // Add user message
    setMessages(prev => [
      ...prev,
      { role: 'user', content: text, fileUrl: pendingFile?.url, fileName: pendingFile?.name },
    ]);
    setInput('');
    setPendingFile(null);
    setLoading(true);
    setPluginCalls([]);

    // Setup builder mode
    if (mode === 'builder') {
      const placeholder: CodeArtifact = {
        id: crypto.randomUUID(),
        title: text.slice(0, 40),
        language: 'html',
        code: '',
        streaming: true,
      };
      setActiveArtifact(placeholder);
      setRightPanel('preview');
    }

    // Add placeholder assistant message
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      // Cancel previous request if any
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const endpoint = mode === 'builder' ? '/api/builder' : '/api/plugins';
      const msgContent = pendingFile
        ? `${text ? text + '\n\n' : ''}[File: ${pendingFile.name}](${pendingFile.url})`
        : text;

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
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error');
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          try {
            const data = JSON.parse(line.slice(6));

            if (data.text) {
              fullContent += data.text;
              setMessages(prev => {
                const m = [...prev];
                m[m.length - 1] = { ...m[m.length - 1], content: fullContent };
                return m;
              });

              if (mode === 'builder') {
                // Match the last code block as it streams - FIXED REGEX
                const codeBlockRegex = /
