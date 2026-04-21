'use client';
import { useState, useRef, useEffect } from 'react';
import { useBusiness } from '@/components/providers/BusinessProvider';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function AskAriaPage() {
  const business = useBusiness();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function send() {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);

    const res = await fetch('/api/aria/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, conversationId: convId }),
    });

    if (!res.body) { setLoading(false); return; }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let reply = '';
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.text) {
            reply += data.text;
            setMessages(prev => {
              const copy = [...prev];
              copy[copy.length - 1] = { role: 'assistant', content: reply };
              return copy;
            });
          }
          if (data.conversationId) setConvId(data.conversationId);
        } catch {}
      }
    }
    setLoading(false);
  }

  const suggestions = [
    `What's my biggest profit leak this week?`,
    `Which customers haven't been back in 60 days?`,
    `Draft a winback SMS for lapsed customers`,
    `How do I compare to my competitors?`,
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]" style={{ background: '#0d0d14' }}>
      <div className="border-b px-6 py-4" style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#13131a' }}>
        <h1 className="font-semibold text-white text-lg">Ask Aria</h1>
        <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>
          Your AI business advisor — knows your {business?.industry ?? 'business'} inside out
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="max-w-2xl mx-auto">
            <p className="text-center mb-6" style={{ color: '#6b7280' }}>
              Hi {business?.owner_name?.split(' ')[0] ?? 'there'} — what can I help you with today?
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => { setInput(s); }}
                  className="text-left px-4 py-3 rounded-xl text-sm transition-all"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#d1d5db' }}
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
              className="max-w-2xl px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap"
              style={
                m.role === 'user'
                  ? { background: '#1D9E75', color: '#fff' }
                  : { background: 'rgba(255,255,255,0.06)', color: '#e5e7eb', border: '1px solid rgba(255,255,255,0.08)' }
              }
            >
              {m.content || <span className="opacity-50">▌</span>}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="px-6 py-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#13131a' }}>
        <div className="flex gap-3 max-w-3xl mx-auto">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Ask anything about your business..."
            className="flex-1 px-4 py-3 rounded-xl text-sm outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="px-5 py-3 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40"
            style={{ background: '#1D9E75', color: '#fff' }}
          >
            {loading ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}