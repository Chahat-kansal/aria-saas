'use client';
import { useState, useEffect } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

const PLATFORMS = [
  {
    id: 'wix', name: 'Wix', logo: '🔷',
    badge: 'No partnership needed', badgeGreen: true,
    deepLink: 'https://manage.wix.com/dashboard/custom-code',
    deepLinkLabel: 'Open Wix Custom Code →',
    steps: [
      { t: 'Log into your Wix account and open your site editor' },
      { t: 'Click Add → Embed Code → Custom Code', d: "It's in the left panel under the + Add button" },
      { t: 'Click Add Custom Code in the header section' },
      { t: 'Paste your Aria script tag into the code box' },
      { t: 'Click Apply — your chat widget is live immediately' },
    ],
  },
  {
    id: 'squarespace', name: 'Squarespace', logo: '⬛',
    badge: 'No partnership needed', badgeGreen: true,
    deepLink: 'https://account.squarespace.com/',
    deepLinkLabel: 'Open Squarespace →',
    steps: [
      { t: 'Log into Squarespace and open your website' },
      { t: 'Click Settings in the left menu' },
      { t: 'Click Advanced → Code Injection' },
      { t: 'Paste your Aria script tag into the Header field' },
      { t: 'Click Save — done' },
    ],
  },
  {
    id: 'shopify', name: 'Shopify', logo: '🛍️',
    badge: 'No partnership needed', badgeGreen: true,
    deepLink: 'https://admin.shopify.com/',
    deepLinkLabel: 'Open Shopify Admin →',
    steps: [
      { t: 'In your Shopify admin, go to Online Store → Themes' },
      { t: 'Click ••• next to your active theme → Edit code' },
      { t: 'Open the file theme.liquid' },
      { t: 'Find </head> and paste your Aria script tag just above it' },
      { t: 'Click Save — live immediately' },
    ],
  },
  {
    id: 'wordpress', name: 'WordPress', logo: '🔵',
    badge: 'No partnership needed', badgeGreen: true,
    deepLink: 'https://wordpress.org/plugins/insert-headers-and-footers/',
    deepLinkLabel: 'Get the free helper plugin →',
    steps: [
      { t: 'In your WordPress dashboard go to Plugins → Add New' },
      { t: 'Search Insert Headers and Footers and install it', d: 'Free plugin — 1 million+ installs' },
      { t: 'Go to Settings → Insert Headers and Footers' },
      { t: 'Paste your Aria script tag in the Header section' },
      { t: 'Click Save — done' },
    ],
  },
  {
    id: 'webflow', name: 'Webflow', logo: '🌊',
    badge: 'No partnership needed', badgeGreen: true,
    deepLink: 'https://webflow.com/dashboard',
    deepLinkLabel: 'Open Webflow →',
    steps: [
      { t: 'Open your project in Webflow' },
      { t: 'Click the gear icon → Custom Code tab' },
      { t: 'Paste your Aria script tag in Head Code' },
      { t: 'Click Save and publish your site' },
    ],
  },
  {
    id: 'gtm', name: 'Google Tag Manager', logo: '🏷️',
    badge: 'For developers', badgeGreen: false,
    deepLink: 'https://tagmanager.google.com/',
    deepLinkLabel: 'Open Google Tag Manager →',
    steps: [
      { t: 'In GTM, create a new Tag → Custom HTML' },
      { t: 'Paste your Aria script tag in the HTML field' },
      { t: 'Set the trigger to All Pages' },
      { t: 'Click Save, then Submit and Publish' },
    ],
  },
  {
    id: 'developer', name: 'Send to my developer', logo: '👨‍💻',
    badge: 'Quickest option', badgeGreen: true,
    steps: [],
  },
];

export default function WebsiteChatInstallPage() {
  const { business } = useBusinessContext();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState<'script'|'link'|null>(null);

  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://ariaos.site';

  useEffect(() => {
    if (!business?.id) return;
    supabase.from('widget_configs').select('api_key,enabled').eq('business_id', business.id).maybeSingle()
      .then(({ data }) => { setApiKey(data?.api_key ?? null); setLoading(false); });
  }, [business?.id]);

  const activate = async () => {
    if (!business?.id) return;
    setEnabling(true);
    const newKey = 'aria_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const { data } = await supabase.from('widget_configs').upsert({
      business_id: business.id, enabled: true, api_key: newKey,
      bot_name: 'Aria', primary_color: '#1D9E75',
      greeting: 'Hi! How can I help you today?',
    }, { onConflict: 'business_id' }).select('api_key').single();
    if (data?.api_key) setApiKey(data.api_key);
    setEnabling(false);
  };

  const scriptTag = apiKey ? '<script src="' + appUrl + '/api/public/widget/embed/' + apiKey + '" defer></script>' : '';
  const shareLink = apiKey ? appUrl + '/install-chat?key=' + apiKey : '';
  const plt = PLATFORMS.find(p => p.id === selected);

  const copy = (type: 'script'|'link') => {
    navigator.clipboard.writeText(type === 'script' ? scriptTag : shareLink);
    setCopied(type); setTimeout(() => setCopied(null), 2500);
  };

  if (loading) return <div style={{ padding: 32, color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading...</div>;

  return (
    <div style={{ maxWidth: 680, padding: '28px 24px', color: '#e8ede7' }}>
      <Link href="/dashboard/website-chat"
        style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20 }}>
        ← Website Chat settings
      </Link>

      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px' }}>Add Aria to your website</h1>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', margin: '0 0 28px', lineHeight: 1.65 }}>
        No app stores or partnerships needed. Every major platform lets you add custom code — we show you exactly where to click.
      </p>

      {/* Step 1 */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
            background: apiKey ? '#1D9E75' : 'rgba(255,255,255,0.1)', color: apiKey ? '#fff' : 'rgba(255,255,255,0.4)' }}>
            {apiKey ? '✓' : '1'}
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: apiKey ? 'rgba(255,255,255,0.45)' : '#e8ede7' }}>Activate your chat widget</span>
        </div>
        <div style={{ marginLeft: 36 }}>
          {!apiKey ? (
            <div style={{ padding: '16px 20px', background: 'rgba(29,158,117,0.07)', border: '1px solid rgba(29,158,117,0.2)', borderRadius: 14 }}>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: '0 0 14px', lineHeight: 1.65 }}>
                Generates your unique connection key — links your website to your Aria account.
              </p>
              <button onClick={activate} disabled={enabling}
                style={{ padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: '#1D9E75', color: '#fff', opacity: enabling ? 0.6 : 1 }}>
                {enabling ? 'Activating...' : '✦ Activate Aria Chat'}
              </button>
            </div>
          ) : (
            <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 }}>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', margin: '0 0 5px', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Your script tag — copy and paste on your website</p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <code style={{ flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scriptTag}</code>
                <button onClick={() => copy('script')}
                  style={{ padding: '5px 14px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', whiteSpace: 'nowrap', flexShrink: 0,
                    background: copied === 'script' ? 'rgba(29,158,117,0.2)' : 'rgba(255,255,255,0.08)',
                    color: copied === 'script' ? '#1D9E75' : 'rgba(255,255,255,0.5)' }}>
                  {copied === 'script' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Step 2 */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
            background: selected ? '#1D9E75' : 'rgba(255,255,255,0.1)', color: selected ? '#fff' : 'rgba(255,255,255,0.4)' }}>
            {selected ? '✓' : '2'}
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#e8ede7' }}>Choose your website platform</span>
        </div>

        <div style={{ marginLeft: 36 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 8, marginBottom: 20 }}>
            {PLATFORMS.map(p => (
              <button key={p.id} onClick={() => setSelected(p.id === selected ? null : p.id)}
                style={{ padding: '13px 11px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.15s',
                  border: '1px solid ' + (selected === p.id ? 'rgba(29,158,117,0.5)' : 'rgba(255,255,255,0.08)'),
                  background: selected === p.id ? 'rgba(29,158,117,0.08)' : 'rgba(255,255,255,0.03)' }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{p.logo}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#e8ede7', marginBottom: 4 }}>{p.name}</div>
                {p.badge && <div style={{ fontSize: 9, padding: '2px 6px', borderRadius: 100, display: 'inline-block', fontWeight: 600,
                  background: p.badgeGreen ? 'rgba(29,158,117,0.15)' : 'rgba(245,158,11,0.15)',
                  color: p.badgeGreen ? '#1D9E75' : '#F59E0B' }}>{p.badge}</div>}
              </button>
            ))}
          </div>

          {selected && plt && (
            <div style={{ padding: '20px 22px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                <span style={{ fontSize: 20 }}>{plt.logo}</span>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{plt.name}</span>
              </div>

              {plt.id === 'developer' ? (
                <div>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 14px', lineHeight: 1.65 }}>
                    Send this link to your developer. They see exactly what to do — no Aria login needed.
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1, padding: '9px 13px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9, fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {apiKey ? shareLink : 'Activate in step 1 first'}
                    </div>
                    {apiKey && <button onClick={() => copy('link')}
                      style={{ padding: '9px 16px', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: 'none', whiteSpace: 'nowrap', flexShrink: 0,
                        background: copied === 'link' ? '#1D9E75' : 'rgba(255,255,255,0.1)', color: copied === 'link' ? '#fff' : 'rgba(255,255,255,0.6)' }}>
                      {copied === 'link' ? '✓ Copied' : 'Copy link'}
                    </button>}
                  </div>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', margin: '8px 0 0' }}>WhatsApp or email this to your developer.</p>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 13, marginBottom: 18 }}>
                    {plt.steps.map((s: any, i: number) => (
                      <div key={i} style={{ display: 'flex', gap: 11 }}>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(29,158,117,0.1)', border: '1px solid rgba(29,158,117,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#1D9E75', flexShrink: 0, marginTop: 2 }}>
                          {i + 1}
                        </div>
                        <div>
                          <p style={{ fontSize: 13, color: '#e8ede7', margin: 0, lineHeight: 1.6 }}>{s.t}</p>
                          {s.d && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.33)', margin: '2px 0 0' }}>{s.d}</p>}
                        </div>
                      </div>
                    ))}
                    {/* Copy step */}
                    <div style={{ display: 'flex', gap: 11 }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(29,158,117,0.1)', border: '1px solid rgba(29,158,117,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#1D9E75', flexShrink: 0, marginTop: 2 }}>
                        {plt.steps.length + 1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 13, color: '#e8ede7', margin: '0 0 8px', lineHeight: 1.6 }}>Copy your Aria script and paste it in:</p>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <div style={{ flex: 1, padding: '8px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 9, fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {apiKey ? scriptTag : 'Activate first ↑'}
                          </div>
                          {apiKey && <button onClick={() => copy('script')}
                            style={{ padding: '8px 16px', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: 'none', whiteSpace: 'nowrap', flexShrink: 0,
                              background: copied === 'script' ? '#1D9E75' : '#2D5240', color: '#fff' }}>
                            {copied === 'script' ? '✓ Copied' : 'Copy script tag'}
                          </button>}
                        </div>
                      </div>
                    </div>
                  </div>

                  {'deepLink' in plt && plt.deepLink && (
                    <a href={plt.deepLink} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, color: '#1D9E75', textDecoration: 'none' }}>
                      {plt.deepLinkLabel}
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 28, padding: '14px 18px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12 }}>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', margin: 0, lineHeight: 1.7 }}>
          <strong style={{ color: 'rgba(255,255,255,0.45)' }}>Not sure what platform your site uses?</strong> Wix sites show "wix.com" in the editor URL. Squarespace shows "squarespace.com". Shopify shows "myshopify.com". If unsure, send the link to your developer.
        </p>
      </div>
    </div>
  );
}
