'use client';
import { useState, useEffect } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

const PLATFORMS = [
  {
    id: 'wix',
    name: 'Wix',
    logo: '🔷',
    desc: 'Most popular in Australia',
    badge: 'Most common',
    steps: [
      'Click "Add to Wix" below — you\'ll be taken to the Wix App Market',
      'Click Add to Site on the Aria Chat app page',
      'Select your Wix website and click Add',
      'Done — the chat widget appears on your site automatically',
    ],
    action: 'Add to Wix',
    // Deep link to Wix App Market — update with real app ID after submission
    url: (key: string) => `https://www.wix.com/app-market/add-app?appId=aria-chat&apiKey=${key}`,
    available: false, // Will be true after Wix marketplace approval
    eta: 'App under review · Est. 2 weeks',
  },
  {
    id: 'shopify',
    name: 'Shopify',
    logo: '🛍️',
    desc: 'For online stores',
    badge: '',
    steps: [
      'Click "Add to Shopify" below',
      'Log into your Shopify admin if prompted',
      'Click Install on the Aria Chat app',
      'Done — widget added to your store automatically',
    ],
    action: 'Add to Shopify',
    url: (key: string) => `https://apps.shopify.com/aria-chat?api_key=${key}`,
    available: false,
    eta: 'App under review · Est. 3 weeks',
  },
  {
    id: 'squarespace',
    name: 'Squarespace',
    logo: '⬛',
    desc: 'For design-focused sites',
    badge: '',
    steps: [
      'Click "Add to Squarespace" below',
      'Authorise Aria in your Squarespace account',
      'Done — chat widget live on your site',
    ],
    action: 'Add to Squarespace',
    url: (key: string) => `https://www.squarespace.com/extensions/details/aria-chat?apiKey=${key}`,
    available: false,
    eta: 'App under review · Est. 4 weeks',
  },
  {
    id: 'wordpress',
    name: 'WordPress',
    logo: '🔵',
    desc: 'Self-hosted or WordPress.com',
    badge: '',
    steps: [
      'In your WordPress dashboard, go to Plugins → Add New',
      'Search for "Aria OS Chat"',
      'Click Install Now, then Activate',
      'Go to Settings → Aria Chat and paste your API key (copied below)',
      'Done — widget live on your site',
    ],
    action: 'Find on WordPress',
    url: (_key: string) => 'https://wordpress.org/plugins/search/aria-os-chat/',
    available: true, // Can search right now
    eta: '',
  },
  {
    id: 'weebly',
    name: 'Weebly / Square Online',
    logo: '🟧',
    desc: 'Square-integrated stores',
    badge: '',
    steps: [
      'In your Weebly editor, go to Apps → App Center',
      'Search for Aria Chat and click Add',
      'Your API key is pre-filled — click Connect',
      'Done',
    ],
    action: 'Find on Weebly',
    url: (_key: string) => 'https://www.weebly.com/app-center',
    available: false,
    eta: 'Coming soon',
  },
  {
    id: 'webflow',
    name: 'Webflow',
    logo: '🌊',
    desc: 'For custom-designed sites',
    badge: '',
    steps: [
      'In Webflow, go to Apps & Integrations',
      'Find Aria Chat and click Install',
      'Done',
    ],
    action: 'Find on Webflow',
    url: (_key: string) => 'https://webflow.com/apps/search/aria',
    available: false,
    eta: 'Coming soon',
  },
  {
    id: 'gtm',
    name: 'Google Tag Manager',
    logo: '🏷️',
    desc: 'If your developer uses GTM',
    badge: 'Works now',
    steps: [
      'In GTM, click New Tag → Community Template Gallery',
      'Search "Aria OS Chat" and click Add',
      'Your API key is pre-filled — click Save',
      'Publish your container',
      'Done',
    ],
    action: 'Open GTM',
    url: (_key: string) => 'https://tagmanager.google.com/',
    available: true,
    eta: '',
  },
  {
    id: 'other',
    name: 'Other / Custom site',
    logo: '🌐',
    desc: 'Any website or platform',
    badge: '',
    steps: [],
    action: '',
    url: (_key: string) => '',
    available: true,
    eta: '',
  },
];

export default function WebsiteChatInstallPage() {
  const { business } = useBusinessContext();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [enabling, setEnabling] = useState(false);

  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://ariaos.site';

  useEffect(() => {
    if (!business?.id) return;
    supabase
      .from('widget_configs')
      .select('api_key, enabled')
      .eq('business_id', business.id)
      .maybeSingle()
      .then(({ data }) => {
        setApiKey(data?.api_key ?? null);
        setLoading(false);
      });
  }, [business?.id]);

  const enableWidget = async () => {
    if (!business?.id) return;
    setEnabling(true);
    // Generate api_key if needed, enable the widget
    const newKey = 'aria_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const { data } = await supabase
      .from('widget_configs')
      .upsert({
        business_id: business.id,
        enabled: true,
        api_key: newKey,
        bot_name: 'Aria',
        primary_color: '#1D9E75',
        greeting: 'Hi! How can I help you today?',
      }, { onConflict: 'business_id' })
      .select('api_key')
      .single();
    if (data?.api_key) setApiKey(data.api_key);
    setEnabling(false);
  };

  const embedUrl = apiKey ? `${appUrl}/api/public/widget/embed/${apiKey}` : '';
  const scriptTag = apiKey ? `<script src="${embedUrl}" defer></script>` : '';
  const shareableLink = apiKey ? `${appUrl}/install-chat?key=${apiKey}` : '';

  const copy = (text: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const platform = PLATFORMS.find(p => p.id === selected);

  if (loading) return <div className="p-8 text-[rgba(255,255,255,0.4)] text-sm">Loading...</div>;

  return (
    <div style={{ maxWidth: 760, padding: '28px 24px', color: '#e8ede7' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <Link href="/dashboard/website-chat" style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
          ← Back to Website Chat
        </Link>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px' }}>Connect to your website</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0 }}>
          Choose your website platform below. No code required — just one tap.
        </p>
      </div>

      {/* Enable step */}
      {!apiKey && (
        <div style={{ marginBottom: 24, padding: '20px 24px', background: 'rgba(29,158,117,0.08)', border: '1px solid rgba(29,158,117,0.25)', borderRadius: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>First, activate your chat widget</p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: '0 0 16px' }}>This generates your unique key so your website knows to connect to your Aria account.</p>
          <button onClick={enableWidget} disabled={enabling}
            style={{ padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: '#1D9E75', color: '#fff', opacity: enabling ? 0.6 : 1 }}>
            {enabling ? 'Activating...' : '✦ Activate Aria Chat'}
          </button>
        </div>
      )}

      {/* Platform grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10, marginBottom: 24 }}>
        {PLATFORMS.map(p => (
          <button key={p.id} onClick={() => setSelected(p.id === selected ? null : p.id)}
            style={{
              padding: '16px 14px', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
              border: '1px solid ' + (selected === p.id ? 'rgba(29,158,117,0.5)' : 'rgba(255,255,255,0.08)'),
              background: selected === p.id ? 'rgba(29,158,117,0.08)' : 'rgba(255,255,255,0.03)',
              textAlign: 'left', transition: 'all 0.2s',
            }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{p.logo}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#e8ede7', marginBottom: 2 }}>{p.name}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{p.desc}</div>
            {p.badge && (
              <div style={{ marginTop: 6, display: 'inline-block', fontSize: 10, padding: '2px 8px', borderRadius: 100, background: p.badge === 'Works now' ? 'rgba(29,158,117,0.15)' : 'rgba(245,158,11,0.15)', color: p.badge === 'Works now' ? '#1D9E75' : '#F59E0B', fontWeight: 600 }}>
                {p.badge}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Platform install panel */}
      {selected && platform && (
        <div style={{ padding: '24px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 18, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <span style={{ fontSize: 28 }}>{platform.logo}</span>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Install on {platform.name}</h2>
              {platform.eta && <p style={{ fontSize: 11, color: 'rgba(245,158,11,0.8)', margin: '3px 0 0' }}>⏳ {platform.eta}</p>}
            </div>
          </div>

          {platform.id === 'other' ? (
            /* Custom site — show options */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
                Send the link below to your web developer — they can add the chat widget in under a minute.
              </p>
              {/* Shareable link for developer */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', margin: '0 0 8px' }}>Developer install link</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1, padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.6)', wordBreak: 'break-all' }}>
                    {shareableLink || 'Activate your widget first ↑'}
                  </div>
                  {apiKey && (
                    <button onClick={() => copy(shareableLink, setLinkCopied)}
                      style={{ padding: '10px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid rgba(255,255,255,0.12)', background: linkCopied ? 'rgba(29,158,117,0.1)' : 'rgba(255,255,255,0.05)', color: linkCopied ? '#1D9E75' : 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap' }}>
                      {linkCopied ? '✓ Copied' : 'Copy link'}
                    </button>
                  )}
                </div>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', margin: '6px 0 0' }}>
                  Your developer will see exactly what to do on that page — no Aria login needed.
                </p>
              </div>
              {/* Also show script tag */}
              {apiKey && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', margin: '0 0 8px' }}>Or — the one line of code (for developers)</p>
                  <div style={{ position: 'relative' }}>
                    <div style={{ padding: '12px 14px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.5)', wordBreak: 'break-all', paddingRight: 80 }}>
                      {scriptTag}
                    </div>
                    <button onClick={() => copy(scriptTag, setCopied)}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: copied ? 'rgba(29,158,117,0.15)' : 'rgba(255,255,255,0.08)', color: copied ? '#1D9E75' : 'rgba(255,255,255,0.5)' }}>
                      {copied ? '✓' : 'Copy'}
                    </button>
                  </div>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', margin: '6px 0 0' }}>Paste into the &lt;head&gt; or &lt;body&gt; of any webpage.</p>
                </div>
              )}
            </div>
          ) : !platform.available ? (
            /* Coming soon */
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: '0 0 8px' }}>
                Aria Chat for {platform.name} is pending marketplace approval.
              </p>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', margin: '0 0 20px' }}>
                {platform.eta}. In the meantime, use the <strong style={{ color: 'rgba(255,255,255,0.5)' }}>Other / Custom site</strong> option to share a developer install link.
              </p>
              {/* API key for copy */}
              {apiKey && (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <button onClick={() => copy(shareableLink, setLinkCopied)}
                    style={{ padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid rgba(29,158,117,0.3)', background: 'rgba(29,158,117,0.08)', color: '#1D9E75' }}>
                    {linkCopied ? '✓ Copied developer link' : '🔗 Copy developer install link'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Available — show steps */
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                {platform.steps.map((step, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(29,158,117,0.15)', border: '1px solid rgba(29,158,117,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#1D9E75', flexShrink: 0 }}>
                      {i + 1}
                    </div>
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.6 }}>{step}</p>
                  </div>
                ))}
              </div>
              {/* API key display */}
              {apiKey && platform.id === 'wordpress' && (
                <div style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: '0 0 6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your API key</p>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <code style={{ flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{apiKey}</code>
                    <button onClick={() => copy(apiKey, setKeyCopied)}
                      style={{ padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: keyCopied ? 'rgba(29,158,117,0.15)' : 'rgba(255,255,255,0.08)', color: keyCopied ? '#1D9E75' : 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>
                      {keyCopied ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}
              {platform.action && (
                <a href={apiKey ? platform.url(apiKey) : '#'} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: '#1D9E75', color: '#fff', textDecoration: 'none', opacity: apiKey ? 1 : 0.4 }}>
                  {platform.action} →
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bottom: send to developer */}
      {apiKey && (
        <div style={{ padding: '20px 24px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 4px' }}>Have a web developer?</p>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: '0 0 14px' }}>
            Send them this link. They can install the Aria chat widget on any platform in under 2 minutes — no Aria login required.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, padding: '9px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9, fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {shareableLink}
            </div>
            <button onClick={() => copy(shareableLink, setLinkCopied)}
              style={{ padding: '9px 18px', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: linkCopied ? '#1D9E75' : 'rgba(255,255,255,0.08)', color: linkCopied ? '#fff' : 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap' }}>
              {linkCopied ? '✓ Copied' : 'Copy link'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
