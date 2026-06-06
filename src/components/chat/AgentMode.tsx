'use client';
import { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props { isPro: boolean; onClose: () => void; }

const EXAMPLE_GOALS = [
  'Research the top 5 competitors in the AI SaaS space and summarize their pricing',
  'Write a complete marketing plan for a mobile app launch',
  'Design a database schema for an e-commerce platform with users, products, orders',
  'Create a step-by-step tutorial for building a REST API in Node.js',
  'Analyze the pros and cons of microservices vs monolith for a startup',
];

export function AgentMode({ isPro, onClose }: Props) {
  const [goal, setGoal] = useState('');
  const [context, setContext] = useState('');
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState('');
  const [done, setDone] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function runAgent() {
    if (!goal.trim() || running) return;
    setRunning(true); setOutput(''); setDone(false);
    let full = '';

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, context }),
      });

      if (!res.ok) {
        const err = await res.json();
        setOutput(`**Error:** ${err.error}`);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) { full += data.text; setOutput(full); }
            if (data.done) setDone(true);
          } catch (e) { console.error('[silent-catch]', e) }
        }
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0e0e12' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-[#16161d] flex-shrink-0">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            🤖 Agent Mode
            {!isPro && <span className="text-[9px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full">Pro</span>}
          </h2>
          <p className="text-[10px] text-[#888899]">Give Aria a goal — she plans and executes it autonomously</p>
        </div>
        <button onClick={onClose} className="text-[#888899] hover:text-white text-lg">✕</button>
      </div>

      {!isPro ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-4">
          <div className="text-5xl">🤖</div>
          <h3 className="font-semibold">Agent Mode is Pro only</h3>
          <p className="text-sm text-[#888899] max-w-xs">Upgrade to Pro to give Aria goals and watch her plan and execute them autonomously.</p>
          <a href="/settings?tab=billing" className="bg-[#6C63FF] hover:bg-[#4b44cc] text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors">Upgrade to Pro →</a>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!output ? (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <label className="text-xs text-[#888899] mb-2 block font-medium">Your Goal</label>
                <textarea
                  ref={textareaRef}
                  value={goal}
                  onChange={e => setGoal(e.target.value)}
                  placeholder="e.g. Research top AI writing tools and create a comparison table with pricing..."
                  rows={3}
                  className="w-full bg-[#16161d] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-[#555566] outline-none focus:border-[#6C63FF]/50 resize-none transition-colors"
                />
              </div>
              <div>
                <label className="text-xs text-[#888899] mb-2 block font-medium">Additional Context <span className="text-[#444]">(optional)</span></label>
                <textarea
                  value={context}
                  onChange={e => setContext(e.target.value)}
                  placeholder="e.g. I'm building a B2B SaaS for small teams, budget-conscious users..."
                  rows={2}
                  className="w-full bg-[#16161d] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-[#555566] outline-none focus:border-[#6C63FF]/50 resize-none transition-colors"
                />
              </div>

              <div>
                <p className="text-[10px] text-[#444] mb-2 uppercase tracking-wider">Example goals</p>
                <div className="space-y-1.5">
                  {EXAMPLE_GOALS.map(eg => (
                    <button key={eg} onClick={() => setGoal(eg)}
                      className="w-full text-left text-xs text-[#888899] hover:text-white bg-[#16161d] border border-white/5 hover:border-white/10 rounded-xl px-3 py-2.5 transition-all">
                      {eg}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={runAgent} disabled={!goal.trim()}
                className="w-full bg-[#6C63FF] hover:bg-[#4b44cc] disabled:opacity-40 text-white py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2">
                🚀 Launch Agent
              </button>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Running indicator */}
              {running && (
                <div className="flex items-center gap-2 px-4 py-2 bg-[#6C63FF]/10 border-b border-[#6C63FF]/20 flex-shrink-0">
                  <span className="w-2 h-2 rounded-full bg-[#6C63FF] animate-pulse" />
                  <span className="text-xs text-[#a78bfa]">Agent working…</span>
                </div>
              )}
              {done && (
                <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border-b border-green-500/20 flex-shrink-0">
                  <span className="text-xs text-green-400">✓ Agent completed</span>
                  <button onClick={() => { setOutput(''); setDone(false); setGoal(''); }}
                    className="ml-auto text-xs text-[#888899] hover:text-white">New goal →</button>
                </div>
              )}
              <div style={{ flex: 1, overflowY: 'auto' }} className="px-4 py-4">
                <div className="text-xs text-[#555566] mb-3 font-mono">Goal: {goal}</div>
                <div className="prose-aria text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{output}</ReactMarkdown>
                </div>
              </div>
              {done && (
                <div className="flex gap-2 px-4 py-3 border-t border-white/5 flex-shrink-0">
                  <button onClick={() => { navigator.clipboard.writeText(output); }}
                    className="flex-1 py-2 text-xs border border-white/10 rounded-xl text-[#888899] hover:text-white transition-colors">Copy result</button>
                  <button onClick={() => { setOutput(''); setDone(false); }}
                    className="flex-1 py-2 text-xs bg-[#6C63FF] hover:bg-[#4b44cc] text-white rounded-xl transition-colors">New goal</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
