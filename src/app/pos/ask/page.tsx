'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import AriaMessage from '@/components/aria/AriaMessage';
import AriaChart, { ChartSpec } from '@/components/aria/AriaChart';

interface Message {
  role: 'user' | 'aria' | 'tool' | 'error';
  content: string;
  toolName?: string;
  streaming?: boolean;
}

interface VizBlock {
  type: 'chart' | 'table';
  id: string;
  tool?: string;
  data?: unknown;
  chart_spec?: ChartSpec;
}

interface ChatHistory {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTED_PROMPTS = [
  'Show me Friday afternoon revenue vs last 4 Fridays',
  'Which products lost margin this month?',
  'Top 10 customers — what should I send them?',
  'Compare this outlet vs last week by category',
  'Why is wine slow this week?',
  'Build me a clearance promo for dead stock',
];

function TableViz({ tool, data }: { tool?: string; data: unknown }) {
  const label = tool?.replace(/_/g, ' ') ?? 'Results';
  const result = data as Record<string, unknown>;

  const getRows = (): Record<string, unknown>[] => {
    if (Array.isArray(result)) return (result as Record<string, unknown>[]).slice(0, 20);
    if (result?.rows && Array.isArray(result.rows)) return (result.rows as Record<string, unknown>[]).slice(0, 20);
    if (result?.products && Array.isArray(result.products)) return (result.products as Record<string, unknown>[]).slice(0, 20);
    if (result?.customers && Array.isArray(result.customers)) return (result.customers as Record<string, unknown>[]).slice(0, 20);
    return [];
  };

  const rows = getRows();
  if (rows.length === 0) return null;
  const cols = Object.keys(rows[0]);

  const cellStyle: React.CSSProperties = {
    padding: '6px 10px',
    fontSize: 12,
    borderBottom: '1px solid var(--divider)',
    color: 'var(--text-primary)',
    fontFamily: 'Manrope, sans-serif',
    whiteSpace: 'nowrap',
  };

  const headStyle: React.CSSProperties = {
    ...cellStyle,
    color: 'var(--text-secondary)',
    fontWeight: 600,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'capitalize', fontFamily: 'Manrope, sans-serif' }}>
        {label}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 300 }}>
          <thead>
            <tr>
              {cols.map(c => (
                <th key={c} style={headStyle}>{c.replace(/_/g, ' ')}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {cols.map(c => (
                  <td key={c} style={cellStyle}>
                    {typeof row[c] === 'number'
                      ? (c.includes('amount') || c.includes('revenue') || c.includes('spent') || c.includes('price'))
                        ? `$${Number(row[c]).toFixed(2)}`
                        : c.includes('pct')
                          ? `${Number(row[c]).toFixed(1)}%`
                          : String(row[c])
                      : String(row[c] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AskAriaPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [vizBlocks, setVizBlocks] = useState<VizBlock[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatHistory[]>([]);
  const [convId, setConvId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  const addMessage = useCallback((msg: Message) => {
    setMessages(prev => [...prev, msg]);
  }, []);

  const addViz = useCallback((viz: VizBlock) => {
    setVizBlocks(prev => [viz, ...prev]);
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || streaming) return;
    setStreaming(true);
    setInput('');
    addMessage({ role: 'user', content });

    const res = await fetch('/api/pos/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: content, history: chatHistory, conversation_id: convId }),
    });

    if (!res.body) {
      addMessage({ role: 'error', content: 'No response from server.' });
      setStreaming(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentText = '';
    let ariaMessageIdx = -1;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === 'text') {
            currentText += event.chunk;
            setMessages(prev => {
              if (ariaMessageIdx >= 0) {
                const next = [...prev];
                next[ariaMessageIdx] = { role: 'aria', content: currentText, streaming: true };
                return next;
              }
              ariaMessageIdx = prev.length;
              return [...prev, { role: 'aria', content: currentText, streaming: true }];
            });
          } else if (event.type === 'tool_start') {
            addMessage({ role: 'tool', content: '', toolName: event.tool });
          } else if (event.type === 'tool_result') {
            if (event.tool === 'generate_chart' && event.result?.chart_spec) {
              addViz({ type: 'chart', id: event.id, chart_spec: event.result.chart_spec as ChartSpec });
            } else if (['query_sales', 'query_inventory', 'query_customers', 'compare_periods'].includes(event.tool)) {
              addViz({ type: 'table', id: event.id, tool: event.tool, data: event.result });
            }
          } else if (event.type === 'done') {
            setConvId(event.conversation_id);
            setChatHistory(prev => [...prev, { role: 'user', content }, { role: 'assistant', content: currentText }]);
            setMessages(prev => prev.map(m => ({ ...m, streaming: false })));
            setStreaming(false);
          } else if (event.type === 'error') {
            addMessage({ role: 'error', content: event.message });
            setStreaming(false);
          }
        } catch {}
      }
    }
    setStreaming(false);
  }, [streaming, chatHistory, convId, addMessage, addViz]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const isEmpty = messages.length === 0;

  const panelStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  };

  const inputAreaStyle: React.CSSProperties = {
    padding: '12px 16px',
    borderTop: '1px solid var(--divider)',
    background: 'var(--bg-surface)',
    display: 'flex',
    gap: 8,
    alignItems: 'flex-end',
    flexShrink: 0,
  };

  const textareaStyle: React.CSSProperties = {
    flex: 1,
    resize: 'none',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--divider)',
    borderRadius: 12,
    padding: '10px 14px',
    fontSize: 14,
    color: 'var(--text-primary)',
    fontFamily: 'Manrope, sans-serif',
    outline: 'none',
    lineHeight: 1.5,
    minHeight: 42,
    maxHeight: 120,
  };

  const sendBtnStyle: React.CSSProperties = {
    background: 'var(--violet)',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '10px 18px',
    fontSize: 13,
    fontWeight: 600,
    cursor: streaming ? 'not-allowed' : 'pointer',
    opacity: streaming ? 0.6 : 1,
    fontFamily: 'Manrope, sans-serif',
    flexShrink: 0,
    height: 42,
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        height: 'calc(100vh - 64px)',
        background: 'var(--bg-base)',
        fontFamily: 'Manrope, sans-serif',
        overflow: 'hidden',
      }}
    >
      <div style={{ flex: '0 0 45%', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--divider)', ...panelStyle }}>
        {isEmpty ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: '40px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Ask Aria anything about your business.
            </h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
              She has access to every sale, every product, every customer. Ask in plain English.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 10,
              }}
            >
              {SUGGESTED_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(prompt)}
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--divider)',
                    borderRadius: 10,
                    padding: '10px 12px',
                    fontSize: 12,
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'Manrope, sans-serif',
                    lineHeight: 1.4,
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--violet)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--divider)')}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div
            ref={threadRef}
            style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 8px' }}
          >
            {messages.map((msg, i) => (
              <AriaMessage
                key={i}
                role={msg.role}
                content={msg.content}
                toolName={msg.toolName}
                streaming={msg.streaming}
              />
            ))}
          </div>
        )}

        <div style={inputAreaStyle}>
          <textarea
            style={textareaStyle}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about sales, inventory, customers..."
            disabled={streaming}
            rows={1}
          />
          <button
            style={sendBtnStyle}
            onClick={() => sendMessage(input)}
            disabled={streaming}
          >
            {streaming ? '...' : 'Send'}
          </button>
        </div>
      </div>

      <div
        style={{
          flex: '0 0 55%',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-surface)',
          overflow: 'hidden',
        }}
      >
        {vizBlocks.length > 0 ? (
          <>
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--divider)',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                flexShrink: 0,
              }}
            >
              Visualisation
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {vizBlocks.map((viz) => (
                <div
                  key={viz.id}
                  style={{
                    background: 'var(--bg-elevated)',
                    borderRadius: 12,
                    padding: 16,
                    border: '1px solid var(--divider)',
                  }}
                >
                  {viz.type === 'chart' && viz.chart_spec ? (
                    <AriaChart chart_spec={viz.chart_spec} />
                  ) : viz.type === 'table' ? (
                    <TableViz tool={viz.tool} data={viz.data} />
                  ) : null}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              color: 'var(--text-secondary)',
            }}
          >
            <div style={{ fontSize: 32, opacity: 0.4 }}>📊</div>
            <div style={{ fontSize: 13, opacity: 0.6 }}>Charts and data will appear here</div>
          </div>
        )}
      </div>
    </div>
  );
}
