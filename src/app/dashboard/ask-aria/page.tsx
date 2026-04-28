'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import dynamic from 'next/dynamic';

const ChartBlock = dynamic(() => import('@/components/dashboard/ChartBlock'), { ssr: false });

interface ChartData {
  type: 'bar' | 'line' | 'pie';
  title: string;
  data: { label: string; value: number; color?: string }[];
  unit: 'currency' | 'count' | 'percentage';
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  chart?: ChartData;
  timestamp: Date;
}

const DATA_QUERY_RE = /stock|inventory|sales|revenue|customer|margin|profit|product|sell|order|reorder|slow|best|worst|trend|compare|last (week|month)|how many|how much|top|bottom|lapsed/i;

const SUGGESTIONS = [
  "What's my best margin product this month?",
  "Which customers haven't visited in 60+ days?",
  "What should I reorder this week?",
  "How does this week compare to last week?",
  "What's my slowest day and how can I fill it?",
  "Show me my top 10 products by revenue",
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-[rgba(255,255,255,0.3)] hover:text-[rgba(255,255,255,0.7)] flex items-center gap-1 mt-1"
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
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

  const send = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;

    setInput('');
    const userMsg: Message = { role: 'user', content: msg, timestamp: new Date() };
    const history = messages.slice(-10);
    setMessages(prev => [...prev, userMsg, { role: 'assistant', content: '', streaming: true, timestamp: new Date() }]);
    setSending(true);

    const include_data = DATA_QUERY_RE.test(msg);

    try {
      const response = await fetch('/api/aria/business-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          conversation_history: history.map(m => ({ role: m.role, content: m.content })),
          business_id: business?.id ?? null,
          include_data,
        }),
      });

      if (!response.ok) {
        throw new Error((await response.json().catch(() => ({}))).error ?? 'Request failed');
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';
      let chart: ChartData | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value, { stream: true }).split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.text) {
              // Strip chart tags from display text
              const clean = parsed.text.replace(/<chart>[\s\S]*?<\/chart>/g, '');
              assistantText += clean;
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') updated[updated.length - 1] = { ...last, content: assistantText };
                return updated;
              });
            }
            if (parsed.chart) chart = parsed.chart;
            if (parsed.done) break;
          } catch { /* malformed chunk */ }
        }
      }

      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === 'assistant') {
          // Clean chart tags from final content
          const cleanContent = assistantText.replace(/<chart>[\s\S]*?<\/chart>/g, '').trim();
          updated[updated.length - 1] = { ...last, content: cleanContent, streaming: false, chart };
        }
        return updated;
      });
    } catch (err: any) {
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === 'assistant') {
          updated[updated.length - 1] = { ...last, content: `Sorry, something went wrong: ${err.message}`, streaming: false };
        }
        return updated;
      });
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [input, sending, messages, business?.id]);

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

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
            AI advisor for {business?.name ?? 'your business'}
            {' · '}
            <span className="text-[#1D9E75]">{business?.data_source === 'square' ? 'Square data' : 'Aria POS data'}</span>
          </p>
        </div>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.05)' }}>
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {messages.length === 0 && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <div className="w-12 h-12 rounded-full bg-[rgba(29,158,117,0.15)] flex items-center justify-center mx-auto mb-3">
                <span className="text-[#1D9E75] font-bold text-lg">A</span>
              </div>
              <p className="text-white font-medium mb-1">
                Hi {business?.owner_name?.split(' ')[0] ?? 'there'} — what can I help you with?
              </p>
              <p className="text-sm text-[rgba(255,255,255,0.35)]">
                I have access to your live business data and can answer questions with real numbers.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)}
                  className="text-left px-4 py-3 rounded-xl text-sm transition-all hover:border-[#1D9E75] hover:text-white"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#d1d5db' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} group`}>
            <div className="max-w-2xl w-full">
              <div className="px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed"
                style={m.role === 'user'
                  ? { background: '#1D9E75', color: '#fff', borderRadius: '18px 18px 4px 18px' }
                  : { background: 'rgba(255,255,255,0.05)', color: '#e5e7eb', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '18px 18px 18px 4px' }}>
                {m.content || (m.streaming
                  ? <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#1D9E75] animate-pulse" /><span className="opacity-60">Thinking…</span></span>
                  : null)}
              </div>
              {m.role === 'assistant' && !m.streaming && m.content && <CopyButton text={m.content} />}
              {m.role === 'assistant' && !m.streaming && m.chart && (
                <div className="mt-3">
                  <ChartBlock chart={m.chart} />
                </div>
              )}
              <p className="text-[9px] mt-1 px-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
                {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t flex-shrink-0"
        style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#13131a' }}>
        <div className="flex gap-3 max-w-3xl mx-auto items-end">
          <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask anything… (Enter to send, Shift+Enter for new line)"
            rows={1}
            className="flex-1 px-4 py-3 rounded-xl text-sm outline-none resize-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', maxHeight: '120px' }}
          />
          <button onClick={() => send()} disabled={sending || !input.trim()}
            className="px-5 py-3 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40 flex-shrink-0"
            style={{ background: '#1D9E75', color: '#fff' }}>
            {sending
              ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              : 'Send'}
          </button>
        </div>
        <p className="text-center text-[10px] mt-2" style={{ color: 'rgba(255,255,255,0.2)' }}>
          Aria reads your live {business?.data_source === 'square' ? 'Square' : 'Aria POS'} data. Verify important decisions.
        </p>
      </div>
    </div>
  );
}
