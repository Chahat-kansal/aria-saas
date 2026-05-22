'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const PLATFORMS = [
  { id: 'html', label: 'HTML / Any site', icon: '🌐', instruction: 'Paste this into the <head> or <body> of your HTML file:' },
  { id: 'wix', label: 'Wix', icon: '🔷', instruction: 'In your Wix editor: Add → Embed Code → Embed HTML. Paste the code below and click Apply.' },
  { id: 'squarespace', label: 'Squarespace', icon: '⬛', instruction: 'Settings → Advanced → Code Injection → Header. Paste the code below and click Save.' },
  { id: 'shopify', label: 'Shopify', icon: '🛍️', instruction: 'Online Store → Themes → Edit Code → theme.liquid. Paste before </head> and click Save.' },
  { id: 'wordpress', label: 'WordPress', icon: '🔵', instruction: 'Appearance → Theme Editor → header.php. Paste before </head> and click Update File. Or use a plugin like "Insert Headers and Footers".' },
  { id: 'webflow', label: 'Webflow', icon: '🌊', instruction: 'Project Settings → Custom Code → Head Code. Paste the code below and click Save.' },
  { id: 'gtm', label: 'Google Tag Manager', icon: '🏷️', instruction: 'New Tag → Custom HTML. Paste the code below, set trigger to All Pages, and Publish.' },
];

function InstallContent() {
  const params = useSearchParams();
  const apiKey = params.get('key');
  const [platform, setPlatform] = useState('html');
  const [copied, setCopied] = useState(false);
  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://ariaos.site';
  const scriptTag = apiKey ? `<script src="${appUrl}/api/public/widget/embed/${apiKey}" defer></script>` : '';
  const current = PLATFORMS.find(p => p.id === platform)!;

  const copy = () => {
    if (!scriptTag) return;
    navigator.clipboard.writeText(scriptTag);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!apiKey) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e8ede7', fontFamily: 'Inter, sans-serif' }}>
        <p style={{ color: 'rgba(255,255,255,0.4)' }}>Invalid install link. Please ask your client to resend it from Aria OS.</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e8ede7', fontFamily: 'Inter, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '20px 32px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 18, fontWeight: 700 }}>aria<span style={{ color: '#1D9E75' }}>OS</span></span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>· Developer install guide</span>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 10px' }}>Install Aria Chat Widget</h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0, lineHeight: 1.7 }}>
            Your client has connected their Aria OS account. You just need to add one line of code to their website — choose the platform below for specific instructions.
          </p>
        </div>

        {/* Platform selector */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
          {PLATFORMS.map(p => (
            <button key={p.id} onClick={() => setPlatform(p.id)}
              style={{ padding: '8px 14px', borderRadius: 100, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                border: '1px solid ' + (platform === p.id ? 'rgba(29,158,117,0.5)' : 'rgba(255,255,255,0.1)'),
                background: platform === p.id ? 'rgba(29,158,117,0.1)' : 'transparent',
                color: platform === p.id ? '#1D9E75' : 'rgba(255,255,255,0.5)' }}>
              {p.icon} {p.label}
            </button>
          ))}
        </div>

        {/* Instructions */}
        <div style={{ marginBottom: 20, padding: '16px 20px', background: 'rgba(29,158,117,0.06)', border: '1px solid rgba(29,158,117,0.15)', borderRadius: 14 }}>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.7 }}>
            <strong style={{ color: '#1D9E75' }}>📋 {current.label}:</strong> {current.instruction}
          </p>
        </div>

        {/* Script tag */}
        <div style={{ position: 'relative', marginBottom: 24 }}>
          <pre style={{ margin: 0, padding: '18px 20px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,255,255,0.7)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', paddingRight: 90 }}>
            {scriptTag}
          </pre>
          <button onClick={copy}
            style={{ position: 'absolute', top: 14, right: 14, padding: '7px 16px', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: copied ? '#1D9E75' : 'rgba(255,255,255,0.1)', color: copied ? '#fff' : 'rgba(255,255,255,0.7)', transition: 'all 0.2s' }}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>

        {/* What it does */}
        <div style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px' }}>What this does</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {['Adds a chat bubble to the bottom-right of the website', 'Visitors can chat with an AI assistant trained on your client\'s business info, products and opening hours', 'Appointments can be booked through the chat — owner receives instant SMS notification', 'All conversations are saved in your client\'s Aria OS dashboard', 'Completely hosted by Aria — no maintenance needed'].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
                <span style={{ color: '#1D9E75', flexShrink: 0 }}>✓</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', marginTop: 24, textAlign: 'center' }}>
          Questions? Contact Aria OS at <a href="mailto:support@ariaos.site" style={{ color: 'rgba(29,158,117,0.7)' }}>support@ariaos.site</a>
        </p>
      </div>
    </div>
  );
}

export default function InstallChatPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0a0f' }} />}>
      <InstallContent />
    </Suspense>
  );
}
