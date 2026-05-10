'use client';
import React from 'react';

interface State { hasError: boolean; error: Error | null }

export default class POSErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[POSErrorBoundary]', error, info);
    // Forward to Sentry if available
    if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).Sentry) {
      const Sentry = (window as unknown as Record<string, { captureException: (e: Error) => void }>).Sentry;
      Sentry.captureException(error);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center', fontFamily: "'Manrope',sans-serif", color: 'var(--text-primary)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ color: 'var(--text-tertiary)', fontSize: 13, marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
            {this.state.error?.message ?? 'Unknown error'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Reload page
          </button>
          <a href="/pos/terminal" style={{ marginLeft: 16, fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'underline' }}>
            Back to terminal
          </a>
        </div>
      );
    }
    return this.props.children;
  }
}
