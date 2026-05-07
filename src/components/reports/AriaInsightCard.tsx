'use client';
import React, { useState } from 'react';

interface AriaInsightCardProps {
  bullets?: string[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}

const shimmer: React.CSSProperties = {
  height: 14,
  borderRadius: 6,
  background: 'linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-overlay) 50%, var(--bg-elevated) 75%)',
  backgroundSize: '200% 100%',
  animation: 'aria-shimmer 1.4s infinite',
  marginBottom: 8,
};

export default function AriaInsightCard({ bullets, loading, error, onRetry }: AriaInsightCardProps) {
  return (
    <>
      <style>{`
        @keyframes aria-shimmer {
          0% { background-position: 200% 0 }
          100% { background-position: -200% 0 }
        }
      `}</style>
      <div style={{
        background: 'linear-gradient(135deg, rgba(124,58,237,0.18) 0%, rgba(167,139,250,0.10) 100%)',
        border: '1px solid rgba(167,139,250,0.28)',
        borderRadius: 16,
        padding: '16px 20px',
        marginBottom: 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 16 }}>✨</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--violet)', fontFamily: "'Instrument Serif',Georgia,serif", fontStyle: 'italic', letterSpacing: '0.01em' }}>
            Aria Insights
          </span>
        </div>
        {loading ? (
          <>
            <div style={{ ...shimmer, width: '82%' }} />
            <div style={{ ...shimmer, width: '64%', marginBottom: 0 }} />
          </>
        ) : error ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 12, color: '#FBBF24' }}>
              Aria couldn&apos;t generate insights right now.
            </div>
            {onRetry && (
              <button onClick={onRetry} style={{ background: 'none', border: '1px solid #FBBF24', borderRadius: 6, padding: '2px 8px', color: '#FBBF24', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                ↺ Retry
              </button>
            )}
          </div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
            {(bullets ?? []).map((b, i) => (
              <li key={i} style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.5, paddingLeft: 16, position: 'relative', marginBottom: i < (bullets?.length ?? 0) - 1 ? 6 : 0 }}>
                <span style={{ position: 'absolute', left: 0, color: 'var(--violet)' }}>·</span>
                {b}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
