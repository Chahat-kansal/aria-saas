'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { parseLLMJsonOr } from '@/lib/ai-json';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import dynamic from 'next/dynamic';
import FeatureRenderer, { type BusinessFeature } from '@/components/features/FeatureRenderer';

const ChartBlock = dynamic(() => import('@/components/dashboard/ChartBlock'), { ssr: false });

interface ChartData {
  type: 'bar' | 'line' | 'pie';
  title: string;
  data: { label: string; value: number; color?: string }[];
  unit: 'currency' | 'count' | 'percentage';
}

interface FeaturePreview {
  feature_config: Record<string, unknown>;
  preview_description: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  chart?: ChartData;
  feature_preview?: FeaturePreview;
  confirm_state?: 'idle' | 'confirming' | 'done' | 'error';
  timestamp: Date;
}

const DATA_QUERY_RE = /stock|inventory|sales|revenue|customer|margin|profit|product|sell|order|reorder|slow|best|worst|trend|compare|last (week|month)|how many|how much|top|bottom|lapsed/i;

const BASE_SUGGESTIONS = [
  "Where am I losing the most money right now?",
  "Which customers should I win back this week?",
  "What should I reorder before the weekend?",
  "How does this week compare to last week?",
  "What's my slowest day and how can I fill it?",
  "Show me my top 10 products by revenue",
];

const INDUSTRY_SUGGESTIONS: Record<string, string[]> = {
  cafe:        ["How was yesterday compared to the same day last week?", "Which menu item has the best margin?", "What's our busiest hour today?", "Which customers usually come on weekdays?"],
  restaurant:  ["How are covers tracking vs last month?", "Which dishes are we selling the most?", "What should I 86 based on slow movement?", "Who are our most valuable regulars?"],
  retail:      ["Which products are dragging down my margins?", "What stock should I order before the long weekend?", "Which customers haven't been back in 60 days?", "What's my cash vs card split today?"],
  warehouse:   ["What's expiring in the next 30 days?", "Which supplier has the worst fill rate?", "What items are below reorder point?", "Show me variance for the past month"],
  tradie:      ["Which quotes haven't had a follow-up?", "Who are my most profitable clients?", "What jobs do I have this week?", "How much revenue is outstanding?"],
  salon:       ["Which services generate the most revenue?", "Who are my regulars that haven't booked recently?", "What's my busiest day of the week?", "How does this month compare to last month?"],
};

function getSuggestions(industry?: string): string[] {
  const specific = industry ? (INDUSTRY_SUGGESTIONS[industry] ?? []) : [];
  return [...specific, ...BASE_SUGGESTIONS].slice(0, 6);
}

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

function FeaturePreviewBubble({
  preview, businessId, msgIdx,
  onConfirm, onDismiss,
}: {
  preview: FeaturePreview;
  businessId: string;
  msgIdx: number;
  onConfirm: (idx: number) => void;
  onDismiss: (idx: number) => void;
}) {
  const cfg = preview.feature_config as Record<string, unknown>;
  const demoFeature: BusinessFeature = {
    id: '__preview__',
    name: (cfg.feature_name as string) ?? 'Custom Feature',
    description: (cfg.description as string) ?? undefined,
    feature_type: (cfg.feature_type as string) ?? 'metric_card',
    config: (cfg.config as Record<string, unknown>) ?? {},
    is_active: true,
  };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(29,158,117,0.3)', background: 'rgba(29,158,117,0.05)' }}>
      <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(29,158,117,0.15)' }}>
        <span className="text-[#1D9E75] text-sm font-medium">✦ Feature Preview</span>
      </div>
      <div className="p-4">
        <p className="text-sm text-white mb-1 font-medium">{demoFeature.name}</p>
        <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.5)' }}>{preview.preview_description}</p>
        {/* Live demo */}
        <div className="mb-4">
          <FeatureRenderer feature={demoFeature} businessId={businessId} />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onConfirm(msgIdx)}
            className="flex-1 py-2 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: '#1D9E75' }}
          >
            Add to my dashboard
          </button>
          <button
            onClick={() => onDismiss(msgIdx)}
            className="px-4 py-2 rounded-xl text-sm transition-colors"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}
          >
            Not this
          </button>
        </div>
      </div>
    </div>
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

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    if (q && !input && messages.length === 0) setInput(q);
  }, [input, messages.length]);

  const confirmFeature = useCallback(async (msgIdx: number) => {
    const msg = messages[msgIdx];
    if (!msg?.feature_preview || !business?.id) return;

    setMessages(prev => {
      const u = [...prev];
      u[msgIdx] = { ...u[msgIdx], confirm_state: 'confirming' };
      return u;
    });

    try {
      const res = await fetch('/api/aria/feature-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, phase: 'confirm', feature_config: msg.feature_preview.feature_config }),
      });
      const data = await res.json();
      setMessages(prev => {
        const u = [...prev];
        u[msgIdx] = { ...u[msgIdx], confirm_state: 'done', content: data.message ?? '✦ Feature added to your dashboard.' };
        return u;
      });
    } catch {
      setMessages(prev => {
        const u = [...prev];
        u[msgIdx] = { ...u[msgIdx], confirm_state: 'error', content: 'Something went wrong saving the feature.' };
        return u;
      });
    }
  }, [messages, business?.id]);

  const dismissFeature = useCallback((msgIdx: number) => {
    setMessages(prev => {
      const u = [...prev];
      u[msgIdx] = { ...u[msgIdx], feature_preview: undefined, content: 'No problem — let me know if you want to try a different version.' };
      return u;
    });
  }, []);

  const send = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;

    setInput('');
    const userMsg: Message = { role: 'user', content: msg, timestamp: new Date() };
    const trimmedMessages = messages.length > 20 ? messages.slice(-20) : messages;
    const history = trimmedMessages.slice(-10);
    setMessages(prev => {
      const trimmed = prev.length > 20 ? prev.slice(-20) : prev;
      return [...trimmed, userMsg, { role: 'assistant', content: '', streaming: true, timestamp: new Date() }];
    });
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
      let featurePreview: FeaturePreview | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value, { stream: true }).split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const parsed = parseLLMJsonOr<{ type?: string; feature_config?: Record<string, unknown>; preview_description?: string; text?: string; chart?: unknown; done?: boolean }>(raw, {}, 'ask-aria/sse');
            if (parsed.type === 'feature_preview') {
              featurePreview = { feature_config: parsed.feature_config ?? {}, preview_description: parsed.preview_description ?? '' };
            }
            if (parsed.text) {
              const clean = parsed.text.replace(/<chart>[\s\S]*?<\/chart>/g, '');
              assistantText += clean;
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') updated[updated.length - 1] = { ...last, content: assistantText };
                return updated;
              });
            }
            if (parsed.chart) chart = parsed.chart as typeof chart;
            if (parsed.done) break;
          } catch { /* malformed chunk */ }
        }
      }

      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === 'assistant') {
          const cleanContent = assistantText.replace(/<chart>[\s\S]*?<\/chart>/g, '').trim();
          updated[updated.length - 1] = {
            ...last,
            content: cleanContent,
            streaming: false,
            chart,
            feature_preview: featurePreview,
            confirm_state: featurePreview ? 'idle' : undefined,
          };
        }
        return updated;
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === 'assistant') {
          updated[updated.length - 1] = { ...last, content: `Sorry, something went wrong: ${errMsg}`, streaming: false };
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
        {messages.length === 0 && input.length === 0 && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <div className="w-12 h-12 rounded-full bg-[rgba(29,158,117,0.15)] flex items-center justify-center mx-auto mb-3">
                <span className="text-[#1D9E75] font-bold text-lg">A</span>
              </div>
              <p className="text-white font-medium mb-1">
                Hi {business?.owner_name?.split(' ')[0] ?? 'there'} — what can I help you with?
              </p>
              <p className="text-sm text-[rgba(255,255,255,0.35)]">
                I use connected business data when it exists, and I will say exactly what is missing when it does not.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {getSuggestions(business?.industry ?? undefined).map((s: string) => (
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
              {/* Feature preview bubble */}
              {m.role === 'assistant' && m.feature_preview && m.confirm_state === 'idle' && business?.id && (
                <FeaturePreviewBubble
                  preview={m.feature_preview}
                  businessId={business.id}
                  msgIdx={i}
                  onConfirm={confirmFeature}
                  onDismiss={dismissFeature}
                />
              )}

              {/* Confirming spinner */}
              {m.role === 'assistant' && m.confirm_state === 'confirming' && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="w-4 h-4 rounded-full border-2 border-[#1D9E75] border-t-transparent animate-spin" />
                  <span style={{ color: 'rgba(255,255,255,0.6)' }}>Adding to your dashboard…</span>
                </div>
              )}

              {/* Normal text or done/error state */}
              {(!m.feature_preview || m.confirm_state === 'done' || m.confirm_state === 'error') && (
                <div className="px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed"
                  style={m.role === 'user'
                    ? { background: '#1D9E75', color: '#fff', borderRadius: '18px 18px 4px 18px' }
                    : { background: 'rgba(255,255,255,0.05)', color: '#e5e7eb', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '18px 18px 18px 4px' }}>
                  {m.content || (m.streaming
                    ? <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#1D9E75] animate-pulse" /><span className="opacity-60">Thinking…</span></span>
                    : null)}
                </div>
              )}

              {m.role === 'assistant' && !m.streaming && m.content && !m.feature_preview && <CopyButton text={m.content} />}
              {m.role === 'assistant' && !m.streaming && m.chart && m.chart.data && m.chart.data.length > 0 && (
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
          Aria uses connected records only. It will not invent missing sales, stock, customer, supplier or margin data.
        </p>
      </div>
    </div>
  );
}
