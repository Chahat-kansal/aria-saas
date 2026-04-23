'use client';
import { useState, useRef, useEffect } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

export default function AskAriaPage() {
  const { business, loading } = useBusinessContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;

    setInput('');
    const userMsg: Message = { role: 'user', content: msg };
    const newHistory = [...messages, userMsg];
    setMessages([...newHistory, { role: 'assistant', content: '', streaming: true }]);
    setSending(true);

    try {
      const response = await fetch('/api/aria/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newHistory,
          business_id: business?.id ?? null,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || 'Request failed');
      }

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              assistantMessage += parsed.text;
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') {
                  updated[updated.length - 1] = { role: 'assistant', content: assistantMessage, streaming: true };
                }
                return updated;
              });
            }
          } catch {}
        }
      }

      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === 'assistant') {
          updated[updated.length - 1] = { role: 'assistant', content: assistantMessage, streaming: false };
        }
        return updated;
      });
    } catch (err: any) {
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === 'assistant') {
          updated[updated.length - 1] = { role: 'assistant', content: `Error: ${err.message}`, streaming: false };
        }
        return updated;
      });
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const suggestions = [
    "What's my biggest profit leak right now?",
    "Which customers haven't been back in 60 days?",
    "Draft a winback SMS for lapsed customers",
    "How do I compare to my competitors?",
    "What should I focus on this week to grow revenue?",
    "Which products have the worst margins?",
  ];

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center" style={{ background: '#0d0d14' }}>
        <div className="w-6 h-6 rounded-full border-2 border-[#1D9E75] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#0d0d14' }}>
      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center justify-between flex-shrink-0"
        style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#13131a' }}>
        <div>
          <h1 className="font-semibold text-white text-lg leading-tight">Ask Aria</h1>
          <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
            AI advisor for {business?.name ?? 'your business'} — {business?.industry ?? 'all industries'}
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.05)' }}
          >
            Clear chat
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="max-w-2xl mx-auto">
            <p className="text-center mb-6 text-sm" style={{ color: '#6b7280' }}>
              Hi {business?.owner_name?.split(' ')[0] ?? 'there'} — what can I help you with today?
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left px-4 py-3 rounded-xl text-sm transition-all hover:opacity-80"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#d1d5db',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className="max-w-2xl px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed"
              style={
                m.role === 'user'
                  ? { background: '#1D9E75', color: '#fff', borderRadius: '18px 18px 4px 18px' }
                  : { background: 'rgba(255,255,255,0.06)', color: '#e5e7eb', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '18px 18px 18px 4px' }
              }
            >
              {m.content || (m.streaming ? <span className="opacity-60 animate-pulse">▌</span> : null)}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t flex-shrink-0"
        style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#13131a' }}>
        <div className="flex gap-3 max-w-3xl mx-auto items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your business… (Enter to send, Shift+Enter for new line)"
            rows={1}
            className="flex-1 px-4 py-3 rounded-xl text-sm outline-none resize-none"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#fff',
              maxHeight: '120px',
            }}
          />
          <button
            onClick={() => send()}
            disabled={sending || !input.trim()}
            className="px-5 py-3 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40 flex-shrink-0"
            style={{ background: '#1D9E75', color: '#fff' }}
          >
            {sending ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : 'Send'}
          </button>
        </div>
        <p className="text-center text-[10px] mt-2" style={{ color: 'rgba(255,255,255,0.2)' }}>
          Aria can make mistakes. Verify important business decisions.
        </p>
      </div>
    </div>
  );
}