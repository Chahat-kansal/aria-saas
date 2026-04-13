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

  const [activeConvoId, setActiveConvoId] = useState<string | undefined>(conversationId);

  const [rightPanel, setRightPanel] =
    useState<'preview' | 'image' | 'project' | 'execute' | 'canvas' | null>(null);

  const [activeArtifact, setActiveArtifact] = useState<CodeArtifact | null>(null);
  const [execCode, setExecCode] = useState<{ code: string; language: string } | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  const { speak, stop: stopSpeaking, speaking } = useTextToSpeech();

  const showSplit = !!activeArtifact || !!rightPanel;

  // Auto scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ---------------- SEND MESSAGE ----------------
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setInput('');
    setLoading(true);

    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/plugins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationId: activeConvoId,
        }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      let buffer = '';
      let full = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const data = JSON.parse(line.slice(6));

          if (data.text) {
            full += data.text;

            setMessages(prev => {
              const copy = [...prev];
              copy[copy.length - 1] = {
                ...copy[copy.length - 1],
                content: full,
              };
              return copy;
            });
          }

          if (data.conversationId) {
            setActiveConvoId(data.conversationId);
            router.replace(`/chat/${data.conversationId}`);
          }

          if (data.done) {
            const artifacts = extractArtifacts(full, text);

            setMessages(prev => {
              const copy = [...prev];
              copy[copy.length - 1] = {
                ...copy[copy.length - 1],
                artifacts,
              };
              return copy;
            });

            if (artifacts.length > 0) {
              setActiveArtifact(artifacts[artifacts.length - 1]);
            }
          }
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Error');
    } finally {
      setLoading(false);
    }
  }, [input, loading, activeConvoId, router]);

  // ---------------- CLOSE PANELS ----------------
  function closePanel() {
    setActiveArtifact(null);
    setRightPanel(null);
    setExecCode(null);
  }

  // ---------------- UI ----------------
  return (
    <div className="flex h-screen overflow-hidden bg-[#0e0e12]">

      {/* LEFT CHAT */}
      {!showSplit && (
        <div className="grid grid-rows-[auto_1fr_auto] flex-1">

          {/* TOP BAR */}
          <div className="p-2 border-b border-white/10">
            <button
              onClick={() => window.dispatchEvent(new Event(SIDEBAR_EVENT))}
              className="text-white"
            >
              ☰
            </button>
          </div>

          {/* MESSAGES */}
          <div className="overflow-y-auto p-3">
            {messages.map((m, i) => (
              <div key={i} className="mb-3 text-white">
                <b>{m.role}:</b> {m.content}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* INPUT */}
          <div className="p-3 border-t border-white/10 flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              className="flex-1 p-2 rounded bg-white/10 text-white"
              placeholder="Message..."
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
            />
            <button
              onClick={sendMessage}
              className="px-4 py-2 bg-purple-600 text-white rounded"
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* RIGHT PANEL (FIXED — NO ABSOLUTE POSITIONING) */}
      {showSplit && (
        <div className="flex flex-1 min-w-0 border-l border-white/10">

          <div className="flex-1 grid grid-rows-[auto_1fr_auto]">
            <div className="p-2 border-b border-white/10">
              <button onClick={closePanel} className="text-white">
                ← Back
              </button>
            </div>

            <div className="p-3 overflow-y-auto text-white">
              {rightPanel === 'preview' && activeArtifact && (
                <PreviewPanel artifact={activeArtifact} onClose={closePanel} />
              )}

              {rightPanel === 'image' && (
                <ImageGenerator isPro={true} onClose={closePanel} />
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
                <Canvas isPro={true} onClose={closePanel} />
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
