'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import Link from 'next/link';

interface SquareStatus {
  connected: boolean;
  last_synced_at: string | null;
  sync_status: string;
  item_count: number;
  customer_count: number;
}

export default function IntegrationsPage() {
  const { business } = useBusinessContext();
  const [squareStatus, setSquareStatus] = useState<SquareStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState('');

  const loadStatus = useCallback(async () => {
    if (!business?.id) return;
    const res = await fetch(`/api/integrations/square/status?business_id=${business.id}`);
    if (res.ok) setSquareStatus(await res.json());
  }, [business?.id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'square') setMessage('Square connected successfully!');
    if (params.get('error')) setMessage(`Connection failed: ${params.get('error')}`);
    loadStatus();
  }, [loadStatus]);

  async function syncNow() {
    if (!business?.id) return;
    setSyncing(true);
    const res = await fetch('/api/integrations/square/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id }),
    });
    setSyncing(false);
    if (res.ok) { setMessage('Sync complete!'); loadStatus(); }
    else { const d = await res.json(); setMessage(`Sync failed: ${d.error}`); }
  }

  async function disconnect() {
    if (!business?.id || !confirm('Disconnect Square? Your synced data will be kept.')) return;
    setDisconnecting(true);
    await fetch('/api/integrations/square/disconnect', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id }),
    });
    setDisconnecting(false);
    setMessage('Square disconnected.');
    loadStatus();
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white mb-1">Integrations</h1>
        <p style={{ color: '#6b7280' }}>Connect your business tools to Aria</p>
      </div>

      {message && (
        <div className={`rounded-xl px-4 py-3 mb-6 text-sm ${message.includes('failed') || message.includes('Failed') ? 'bg-red-900/20 text-red-400' : 'bg-green-900/20 text-green-400'}`}>
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Square */}
        <div className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[rgba(255,255,255,0.05)] flex items-center justify-center text-white font-bold text-lg">⬛</div>
              <div>
                <p className="font-semibold text-white">Square</p>
                <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>POS, inventory, customers</p>
              </div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${squareStatus?.connected ? 'bg-green-900/30 text-green-400' : 'bg-[rgba(255,255,255,0.06)] text-gray-500'}`}>
              {squareStatus?.connected ? 'Connected' : 'Not connected'}
            </span>
          </div>

          {squareStatus?.connected ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: '#9ca3af' }}>
                <div>
                  <p style={{ color: '#6b7280' }}>Products synced</p>
                  <p className="text-white font-medium mt-0.5">{squareStatus.item_count.toLocaleString()}</p>
                </div>
                <div>
                  <p style={{ color: '#6b7280' }}>Customers synced</p>
                  <p className="text-white font-medium mt-0.5">{squareStatus.customer_count.toLocaleString()}</p>
                </div>
              </div>
              {squareStatus.last_synced_at && (
                <p className="text-xs" style={{ color: '#6b7280' }}>
                  Last synced: {new Date(squareStatus.last_synced_at).toLocaleString()}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={syncNow} disabled={syncing} className="flex-1 py-2 rounded-lg text-xs font-medium bg-[#1D9E75] text-white hover:bg-[#179968] disabled:opacity-50 transition-colors">
                  {syncing ? 'Syncing…' : 'Sync now'}
                </button>
                <button onClick={disconnect} disabled={disconnecting} className="py-2 px-3 rounded-lg text-xs font-medium border border-red-900 text-red-400 hover:bg-red-900/20 disabled:opacity-50 transition-colors">
                  {disconnecting ? '…' : 'Disconnect'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-xs mb-3" style={{ color: '#6b7280' }}>Connect your Square account to sync products, sales, and customers automatically.</p>
              <a href="/api/integrations/square/connect" className="block text-center py-2 rounded-lg text-xs font-medium bg-[#1D9E75] text-white hover:bg-[#179968] transition-colors">
                Connect Square →
              </a>
            </div>
          )}
        </div>

        {/* Aria POS */}
        <div className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[rgba(29,158,117,0.1)] flex items-center justify-center text-[#1D9E75] font-bold">A</div>
              <div>
                <p className="font-semibold text-white">Aria POS</p>
                <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>Built-in — no connection needed</p>
              </div>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/30 text-green-400">Active</span>
          </div>
          <p className="text-xs mb-3" style={{ color: '#6b7280' }}>Your built-in POS is always connected. All data is stored and analysed automatically.</p>
          <Link href="/pos" className="block text-center py-2 rounded-lg text-xs font-medium border border-[rgba(255,255,255,0.1)] text-white hover:border-[rgba(255,255,255,0.2)] transition-colors">
            Open Aria POS →
          </Link>
        </div>

        {/* Shopfront */}
        <div className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)', opacity: 0.6 }}>
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[rgba(255,255,255,0.05)] flex items-center justify-center text-gray-400 text-lg">🏪</div>
              <div>
                <p className="font-semibold text-white">Shopfront</p>
                <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>POS integration</p>
              </div>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>Soon</span>
          </div>
          <p className="text-xs" style={{ color: '#6b7280' }}>Connect your Shopfront account to sync data automatically.</p>
        </div>

        {/* Xero */}
        <div className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)', opacity: 0.6 }}>
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[rgba(255,255,255,0.05)] flex items-center justify-center text-gray-400 text-lg">📊</div>
              <div>
                <p className="font-semibold text-white">Xero</p>
                <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>Accounting sync</p>
              </div>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>Soon</span>
          </div>
          <p className="text-xs" style={{ color: '#6b7280' }}>Sync your sales and invoices to Xero automatically.</p>
        </div>

      </div>
    </div>
  );
}
