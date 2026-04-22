'use client';
import { useEffect, useRef, useState } from 'react';

interface Message { role: 'user' | 'assistant'; content: string; }

export default function AskVisaPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const q = input.trim();
    if (!q || streaming) return;
    setInput('');
    const next: Message[] = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setStreaming(true);
    const assistantMsg: Message = { role: 'assistant', content: '' };
    setMessages(m => [...m, assistantMsg]);
    try {
      const res = await fetch('/api/visa/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok || !res.body) {
        setMessages(m => m.map((x, i) => i === m.length - 1 ? { ...x, content: 'Sorry, something went wrong. Please try again.' } : x));
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const d = line.slice(6).trim();
            if (d === '[DONE]') break;
            try {
              const j = JSON.parse(d);
              const text = j.delta?.text ?? j.choices?.[0]?.delta?.content ?? '';
              if (text) {
                buf += text;
                setMessages(m => m.map((x, i) => i === m.length - 1 ? { ...x, content: buf } : x));
              }
            } catch {}
          }
        }
      }
    } catch {
      setMessages(m => m.map((x, i) => i === m.length - 1 ? { ...x, content: 'Connection error. Please try again.' } : x));
    } finally {
      setStreaming(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  const SUGGESTIONS = [
    'What documents are needed for a 482 TSS visa?',
    'Explain the 189 points test requirements',
    'What are the English requirements for a 500 student visa?',
    'Draft a cover letter for a skills assessment',
    'What changed in the 2024 migration program?',
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3" style={{ background: '#111118' }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-bold"
          style={{ background: 'linear-gradient(135deg,#7F77DD,#5f57c0)' }}>V</div>
        <div>
          <div className="text-sm font-semibold text-white">VisaAI</div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#7F77DD] animate-pulse" />
            <span className="text-[10px] text-[rgba(255,255,255,.4)]">Expert Australian migration assistant</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full pb-10">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-4"
              style={{ background: 'rgba(127,119,221,.15)', border: '1px solid rgba(127,119,221,.25)' }}>
              ✦
            </div>
            <h2 className="text-base font-semibold text-white mb-1">Ask VisaAI</h2>
            <p className="text-xs text-[rgba(255,255,255,.4)] text-center mb-8 max-w-sm">
              Expert knowledge on Australian visa subclasses, the Migration Act, MARA requirements, and current immigration policy.
            </p>
            <div className="w-full max-w-lg space-y-2">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                  className="w-full text-left text-xs px-4 py-3 rounded-xl transition-colors"
                  style={{ background: 'rgba(127,119,221,.08)', border: '1px solid rgba(127,119,221,.15)', color: 'rgba(255,255,255,.6)' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mr-3 mt-0.5"
                  style={{ background: 'linear-gradient(135deg,#7F77DD,#5f57c0)' }}>V</div>
              )}
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'text-white'
                  : 'text-[rgba(255,255,255,.85)]'
              }`} style={m.role === 'user'
                ? { background: 'linear-gradient(135deg,#7F77DD,#5f57c0)' }
                : { background: '#111118', border: '1px solid rgba(255,255,255,.08)' }}>
                {m.content || (
                  <span className="flex items-center gap-1.5 text-[rgba(255,255,255,.4)]">
                    <span className="w-1 h-1 rounded-full bg-[#7F77DD] animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 rounded-full bg-[#7F77DD] animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 rounded-full bg-[#7F77DD] animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-white/5" style={{ background: '#111118' }}>
        <div className="flex gap-3 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Ask about visa policy, eligibility, documents…"
            className="flex-1 resize-none bg-[rgba(255,255,255,.05)] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-[rgba(255,255,255,.3)] outline-none focus:border-[rgba(127,119,221,.5)] transition-colors"
            style={{ maxHeight: '120px', overflowY: 'auto' }}
          />
          <button onClick={send} disabled={!input.trim() || streaming}
            className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-white disabled:opacity-40 transition-opacity"
            style={{ background: 'linear-gradient(135deg,#7F77DD,#5f57c0)' }}>
            {streaming
              ? <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
              : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
            }
          </button>
        </div>
        <p className="text-[10px] text-[rgba(255,255,255,.2)] mt-2 text-center">
          VisaAI is an AI assistant. Always verify critical immigration advice with official sources.
        </p>
      </div>
    </div>
  );
}