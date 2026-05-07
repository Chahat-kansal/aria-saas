'use client';
import React from 'react';

interface AriaInsightCardProps {
  bullets?: string[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}

const cardBase: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(124,58,237,0.18) 0%, rgba(167,139,250,0.10) 100%)',
  border: '1px solid rgba(167,139,250,0.28)',
  borderRadius: 16,
  padding: '16px 20px',
  marginBottom: 18,
};

const shimmerBar: React.CSSProperties = {
  height: 14,
  borderRadius: 6,
  background: 'linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-overlay) 50%, var(--bg-elevated) 75%)',
  backgroundSize: '200% 100%',
  animation: 'aria-shimmer 1.4s infinite',
  marginBottom: 8,
};

const header = (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
    <span style={{ fontSize: 16 }}>✨</span>
    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--violet)', fontFamily: "'Instrument Serif',Georgia,serif", fontStyle: 'italic', letterSpacing: '0.01em' }}>
      Aria Insights
    </span>
  </div>
);

export default function AriaInsightCard({ bullets, loading, error, onRetry }: AriaInsightCardProps) {
  return (
    <>
      <style>{`
        @keyframes aria-shimmer {
          0% { background-position: 200% 0 }
          100% { background-position: -200% 0 }
        }
      `}</style>

      {loading ? (
        <div style={cardBase}>
          {header}
          <div style={{ ...shimmerBar, width: '82%' }} />
          <div style={{ ...shimmerBar, width: '64%' }} />
          <div style={{ ...shimmerBar, width: '48%', marginBottom: 0 }} />
        </div>
      ) : error ? (
        <div style={{ ...cardBase, border: '1px solid rgba(251,191,36,0.28)', background: 'rgba(251,191,36,0.06)' }}>
          {header}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: '#FBBF24' }}>
              Aria briefing unavailable — try refresh.
            </span>
            {onRetry && (
              <button onClick={onRetry} style={{ background: 'none', border: '1px solid #FBBF24', borderRadius: 6, padding: '2px 8px', color: '#FBBF24', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                ↺ Retry
              </button>
            )}
          </div>
        </div>
      ) : !bullets || bullets.length === 0 ? (
        <div style={{ ...cardBase, opacity: 0.6 }}>
          {header}
          <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
            No insights available for this period.
          </span>
        </div>
      ) : (
        <div style={cardBase}>
          {header}
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
            {bullets.map((b, i) => (
              <li key={i} style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.5, paddingLeft: 16, position: 'relative', marginBottom: i < bullets.length - 1 ? 6 : 0 }}>
                <span style={{ position: 'absolute', left: 0, color: 'var(--violet)' }}>·</span>
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
