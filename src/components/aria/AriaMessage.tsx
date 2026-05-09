'use client';

import { useState } from 'react';

interface AriaMessageProps {
  role: 'user' | 'aria' | 'tool' | 'error';
  content: string;
  toolName?: string;
  streaming?: boolean;
}

function parseMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const lines = text.split('\n');

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let key = 0;

    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      const codeMatch = remaining.match(/`([^`]+)`/);

      const boldIdx = boldMatch ? remaining.indexOf(boldMatch[0]) : Infinity;
      const codeIdx = codeMatch ? remaining.indexOf(codeMatch[0]) : Infinity;

      if (boldMatch && boldIdx <= codeIdx) {
        if (boldIdx > 0) parts.push(<span key={key++}>{remaining.slice(0, boldIdx)}</span>);
        parts.push(<strong key={key++} style={{ fontWeight: 700 }}>{boldMatch[1]}</strong>);
        remaining = remaining.slice(boldIdx + boldMatch[0].length);
      } else if (codeMatch && codeIdx < Infinity) {
        if (codeIdx > 0) parts.push(<span key={key++}>{remaining.slice(0, codeIdx)}</span>);
        parts.push(
          <code
            key={key++}
            style={{
              background: 'var(--bg-elevated)',
              borderRadius: 4,
              padding: '1px 5px',
              fontFamily: 'monospace',
              fontSize: '0.88em',
              color: 'var(--violet)',
            }}
          >
            {codeMatch[1]}
          </code>
        );
        remaining = remaining.slice(codeIdx + codeMatch[0].length);
      } else {
        parts.push(<span key={key++}>{remaining}</span>);
        remaining = '';
      }
    }

    nodes.push(<span key={li}>{parts}</span>);
    if (li < lines.length - 1) nodes.push(<br key={`br-${li}`} />);
  }

  return nodes;
}

export default function AriaMessage({ role, content, toolName, streaming }: AriaMessageProps) {
  const [expanded, setExpanded] = useState(false);

  if (role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <div
          style={{
            background: '#8B5CF6',
            color: '#fff',
            borderRadius: '18px 18px 4px 18px',
            padding: '10px 16px',
            maxWidth: '70%',
            fontSize: 14,
            lineHeight: 1.5,
            fontFamily: 'Manrope, sans-serif',
            wordBreak: 'break-word',
          }}
        >
          {content}
        </div>
      </div>
    );
  }

  if (role === 'aria') {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 16, marginTop: 2, flexShrink: 0 }}>✨</span>
        <div
          style={{
            color: 'var(--text-primary)',
            fontSize: 14,
            lineHeight: 1.6,
            fontFamily: 'Manrope, sans-serif',
            maxWidth: '85%',
            wordBreak: 'break-word',
          }}
        >
          {parseMarkdown(content)}
          {streaming && (
            <span
              style={{
                display: 'inline-block',
                width: 2,
                height: '1em',
                background: 'var(--text-primary)',
                marginLeft: 2,
                verticalAlign: 'middle',
                animation: 'aria-blink 1s step-end infinite',
              }}
            />
          )}
          <style>{`@keyframes aria-blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
        </div>
      </div>
    );
  }

  if (role === 'tool') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--divider)',
            borderRadius: 20,
            padding: '4px 14px',
            fontSize: 12,
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontFamily: 'Manrope, sans-serif',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            animation: 'tool-pulse 1.5s ease-in-out infinite',
          }}
        >
          <style>{`@keyframes tool-pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }`}</style>
          <span>🔍</span>
          <span>Looking at {toolName ?? 'data'}...</span>
          <span style={{ fontSize: 10 }}>{expanded ? '▲' : '▼'}</span>
        </button>
        {expanded && content && (
          <div
            style={{
              position: 'absolute',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--divider)',
              borderRadius: 8,
              padding: 12,
              fontSize: 11,
              color: 'var(--text-secondary)',
              maxWidth: 300,
              wordBreak: 'break-all',
              fontFamily: 'monospace',
              marginTop: 32,
              zIndex: 10,
            }}
          >
            {content}
          </div>
        )}
      </div>
    );
  }

  if (role === 'error') {
    return (
      <div
        style={{
          border: '1px solid #F59E0B',
          borderRadius: 8,
          padding: '8px 14px',
          color: '#EF4444',
          fontSize: 13,
          fontFamily: 'Manrope, sans-serif',
          marginBottom: 8,
        }}
      >
        ⚠️ {content}
      </div>
    );
  }

  return null;
}
