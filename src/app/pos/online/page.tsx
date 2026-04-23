'use client';
import { useState, useEffect } from 'react';

interface OnlineSettings { enabled: boolean; store_name: string; store_description: string; store_slug: string; }

export default function OnlineStorePage() {
  const [settings, setSettings] = useState<OnlineSettings>({ enabled: false, store_name: '', store_description: '', store_slug: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/pos/online').then(r => r.json()).then(d => {
      if (d.settings) setSettings(d.settings);
      setLoading(false);
    });
  }, []);

  async function save() {
    setSaving(true);
    await fetch('/api/pos/online', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  const storeUrl = settings.store_slug ? `/shop/${settings.store_slug}` : null;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a16]">Online Store</h1>
          <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Sell your products online with a public storefront</p>
        </div>
        {storeUrl && (
          <a href={storeUrl} target="_blank" rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[rgba(0,0,0,.1)] text-[rgba(26,26,22,.6)] hover:bg-[rgba(0,0,0,.04)] transition-colors">
            View Store →
          </a>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] shadow-sm p-6 space-y-5">
        {/* Enable toggle */}
        <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: settings.enabled ? 'rgba(22,163,74,.06)' : 'rgba(0,0,0,.03)', border: `1.5px solid ${settings.enabled ? 'rgba(22,163,74,.2)' : 'rgba(0,0,0,.08)'}` }}>
          <div>
            <p className="text-sm font-semibold text-[#1a1a16]">{settings.enabled ? 'Store is Live' : 'Store is Offline'}</p>
            <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">{settings.enabled ? 'Your store is publicly visible and accepting orders' : 'Enable to publish your online storefront'}</p>
          </div>
          <button onClick={() => setSettings(s => ({ ...s, enabled: !s.enabled }))}
            className={`relative w-11 h-6 rounded-full transition-colors ${settings.enabled ? 'bg-emerald-500' : 'bg-[rgba(0,0,0,.15)]'}`}>
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.enabled ? 'translate-x-5.5 left-0' : 'left-0.5'}`} style={{ transform: settings.enabled ? 'translateX(20px)' : 'translateX(0)' }} />
          </button>
        </div>

        <div>
          <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Store Name</label>
          <input value={settings.store_name} onChange={e => setSettings(s => ({ ...s, store_name: e.target.value }))}
            placeholder="My Awesome Store"
            className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] placeholder-[rgba(26,26,22,.3)] focus:outline-none focus:border-[#2563eb]" />
        </div>

        <div>
          <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Store URL Slug</label>
          <div className="flex items-center gap-0">
            <span className="px-3 py-2.5 bg-[rgba(0,0,0,.04)] border border-r-0 border-[rgba(0,0,0,.1)] rounded-l-lg text-xs text-[rgba(26,26,22,.5)]">aria.com/shop/</span>
            <input value={settings.store_slug} onChange={e => setSettings(s => ({ ...s, store_slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
              placeholder="my-store"
              className="flex-1 bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-r-lg px-3 py-2.5 text-sm text-[#1a1a16] placeholder-[rgba(26,26,22,.3)] focus:outline-none focus:border-[#2563eb]" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Store Description</label>
          <textarea value={settings.store_description} onChange={e => setSettings(s => ({ ...s, store_description: e.target.value }))} rows={3}
            placeholder="Describe your store to customers…"
            className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] placeholder-[rgba(26,26,22,.3)] focus:outline-none focus:border-[#2563eb] resize-none" />
        </div>

        <div className="pt-1 border-t border-[rgba(0,0,0,.06)] flex items-center justify-between">
          <p className="text-xs text-[rgba(26,26,22,.4)]">Products with "Show Online" enabled will appear in your store</p>
          <div className="flex items-center gap-3">
            {saved && <span className="text-xs text-emerald-600 font-medium">Saved!</span>}
            <button onClick={save} disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}