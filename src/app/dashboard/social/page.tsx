'use client';
import { useState, useEffect, useRef } from 'react';

const C = { bg: '#0A0E1E', card: '#111827', border: '#1E2A3A', text: '#F0F4FF', muted: '#6B7E99', dim: '#3A4A5C', violet: '#8B5CF6', green: '#22C55E', red: '#EF4444', amber: '#F59E0B', blue: '#3B82F6' };

interface SocialPost { id: string; platform: string; status: string; caption: string; hashtags: string[]; image_url: string | null; image_prompt: string | null; image_credit: string | null; scheduled_for: string | null; published_at: string | null; aria_reasoning: string | null; industry_context: string | null; reel_concept: string | null; reel_script: string | null; created_at: string; }
interface Providers { image: { stability_ai: boolean; dalle3: boolean; unsplash: boolean }; video: { runway: boolean; replicate: boolean }; voiceover: { elevenlabs: boolean } }
interface SocialConn { id: string; platform: string; platform_account_name: string | null; is_active: boolean; }
interface Prefs { brand_voice: string; post_frequency: string; auto_hashtags: string[]; topics_to_avoid: string | null; target_audience: string | null; business_tagline: string | null; }

const PLATFORM_ICONS: Record<string, string> = { instagram: '📸', facebook: '👤', google_business: '🏢' };
const PLATFORM_COLORS: Record<string, string> = { instagram: '#E1306C', facebook: '#1877F2', google_business: '#4285F4' };

function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: `${PLATFORM_COLORS[platform] ?? '#666'}20`, color: PLATFORM_COLORS[platform] ?? '#aaa', fontWeight: 700, border: `1px solid ${PLATFORM_COLORS[platform] ?? '#666'}40` }}>
      {PLATFORM_ICONS[platform]} {platform.replace('_', ' ')}
    </span>
  );
}

export default function SocialPage() {
  const [bid, setBid]               = useState<string | null>(null);
  const [industry, setIndustry]     = useState<string>('retail');
  const [bizName, setBizName]       = useState('');
  const [connections, setConnections] = useState<SocialConn[]>([]);
  const [posts, setPosts]           = useState<SocialPost[]>([]);
  const [prefs, setPrefs]           = useState<Prefs>({ brand_voice: 'friendly', post_frequency: 'weekly', auto_hashtags: [], topics_to_avoid: null, target_audience: null, business_tagline: null });
  const [generating, setGenerating] = useState(false);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editCaption, setEditCaption] = useState('');
  const [editHashtags, setEditHashtags] = useState('');
  const [imageGridId, setImageGridId] = useState<string | null>(null);
  const [images, setImages]         = useState<any[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [prefsOpen, setPrefsOpen]   = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [hashtagInput, setHashtagInput] = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);
  const [providers, setProviders] = useState<Providers | null>(null);
  const [imgGenerating, setImgGenerating] = useState<Record<string, boolean>>({});
  const [videoJobs, setVideoJobs] = useState<Record<string, string>>({});
  const [videoStatus, setVideoStatus] = useState<Record<string, { status: string; url?: string }>>({});
  const [voiceOpen, setVoiceOpen] = useState<string | null>(null);
  const [voiceText, setVoiceText] = useState('');
  const [voiceGenerating, setVoiceGenerating] = useState(false);
  const [voiceUrls, setVoiceUrls] = useState<Record<string, string>>({});

  const urlSuccess = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('connected') : null;
  const urlError   = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('error') : null;

  const INDUSTRY_SUBTITLE: Record<string, string> = {
    cafe: 'Aria manages your Instagram and Google presence so you can focus on making great coffee',
    restaurant: 'Aria keeps your socials active with dish reveals, events, and reservation prompts',
    retail: 'Aria promotes your products and specials across Instagram, Facebook, and Google',
    warehouse: 'Aria helps your team stay connected with industry updates and stock announcements',
  };

  useEffect(() => {
    fetch('/api/social/providers').then(r => r.json()).then(d => { if (!d.error) setProviders(d); }).catch(() => {});
    fetch('/api/pos/products').then(r => r.json()).then(d => {
      if (d.business_id) {
        setBid(d.business_id);
        setBizName(d.business_name || '');
        loadAll(d.business_id);
      } else setLoadingPosts(false);
    });
  }, []);

  async function loadAll(businessId: string) {
    setLoadingPosts(true);
    const [connRes, postsRes, prefsRes, bizRes] = await Promise.all([
      fetch(`/api/social/posts?business_id=${businessId}`).then(r => r.json()).catch(() => ({ posts: [] })),
      fetch(`/api/social/posts?business_id=${businessId}&status=draft`).then(r => r.json()).catch(() => ({ posts: [] })),
      fetch(`/api/social/preferences?business_id=${businessId}`).then(r => r.json()).catch(() => ({ preferences: null })),
      fetch('/api/businesses/current').then(r => r.json()).catch(() => null),
    ]);
    // connections come from a different endpoint
    const allConns = await fetch(`/api/social/posts?business_id=${businessId}`).then(r => r.json()).catch(() => ({ posts: [] }));
    setPosts(postsRes.posts ?? []);
    if (prefsRes.preferences) setPrefs(p => ({ ...p, ...prefsRes.preferences }));
    if (bizRes?.industry) setIndustry(bizRes.industry);
    setLoadingPosts(false);
  }

  async function generate() {
    if (!bid) return;
    setGenerating(true);
    const res = await fetch('/api/aria/social-suggest', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: bid, platforms: ['instagram', 'facebook', 'google_business'], count: 3 }),
    });
    const d = await res.json();
    if (d.posts) setPosts(prev => [...d.posts, ...prev.filter(p => p.status !== 'draft')]);
    setGenerating(false);
  }

  async function approve(postId: string, imageUrl?: string) {
    if (!bid) return;
    const post = posts.find(p => p.id === postId);
    const updates: any = { post_id: postId, business_id: bid };
    if (editingId === postId) { updates.edited_caption = editCaption; updates.edited_hashtags = editHashtags.split(',').map(h => h.trim()).filter(Boolean); }
    if (imageUrl) updates.image_url = imageUrl;
    await fetch('/api/social/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: 'approved', image_url: imageUrl ?? p.image_url } : p));
    setEditingId(null);
  }

  async function skip(postId: string) {
    if (!bid) return;
    await fetch(`/api/social/approve?post_id=${postId}&business_id=${bid}`, { method: 'DELETE' });
    setPosts(prev => prev.filter(p => p.id !== postId));
  }

  async function publish(postId: string) {
    if (!bid) return;
    const res = await fetch('/api/social/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ post_id: postId, business_id: bid }) });
    const d = await res.json();
    if (d.ok) setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: 'published', published_at: new Date().toISOString() } : p));
  }

  async function loadImages(postId: string, prompt: string | null) {
    setImageGridId(postId); setLoadingImages(true);
    const res = await fetch(`/api/social/image-suggest?query=${encodeURIComponent(prompt || '')}&industry=${industry}`);
    const d = await res.json();
    setImages(d.photos || []); setLoadingImages(false);
  }

  async function savePrefs() {
    if (!bid) return;
    setPrefsSaving(true);
    await fetch('/api/social/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: bid, ...prefs }) });
    setPrefsSaving(false);
  }

  async function generateImage(postId: string, prompt: string | null, searchQuery: string | null) {
    setImgGenerating(p => ({ ...p, [postId]: true }));
    const res = await fetch('/api/social/generate-image', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, search_query: searchQuery, post_id: postId, business_id: bid }),
    });
    const d = await res.json();
    if (d.image_url) setPosts(prev => prev.map(p => p.id === postId ? { ...p, image_url: d.image_url, image_credit: d.credit } : p));
    setImgGenerating(p => { const n = { ...p }; delete n[postId]; return n; });
  }

  async function generateVideo(postId: string, concept: string | null) {
    const post = posts.find(p => p.id === postId);
    const prompt = concept || post?.reel_concept || post?.caption || '';
    const res = await fetch('/api/social/generate-video', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, image_url: post?.image_url }),
    });
    const d = await res.json();
    if (d.job_id) setVideoJobs(p => ({ ...p, [postId]: d.job_id }));
  }

  async function pollVideoStatus(postId: string, jobId: string) {
    const res = await fetch(`/api/social/video-status?job_id=${encodeURIComponent(jobId)}`);
    const d = await res.json();
    setVideoStatus(p => ({ ...p, [postId]: d }));
    if (d.status === 'processing') setTimeout(() => pollVideoStatus(postId, jobId), 5000);
  }

  // Start polling when a video job is created
  useEffect(() => {
    for (const [postId, jobId] of Object.entries(videoJobs)) {
      if (!videoStatus[postId]) pollVideoStatus(postId, jobId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoJobs]);

  async function generateVoiceover(postId: string) {
    if (!voiceText.trim()) return;
    setVoiceGenerating(true);
    const res = await fetch('/api/social/generate-voiceover', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: voiceText, business_id: bid }),
    });
    const d = await res.json();
    if (d.audio_url) setVoiceUrls(p => ({ ...p, [postId]: d.audio_url }));
    setVoiceGenerating(false);
    setVoiceOpen(null);
    setVoiceText('');
  }

  const draftPosts     = posts.filter(p => p.status === 'draft');
  const scheduledPosts = posts.filter(p => p.status === 'approved').sort((a, b) => (a.scheduled_for ?? '').localeCompare(b.scheduled_for ?? ''));
  const publishedPosts = posts.filter(p => p.status === 'published' && p.published_at && new Date(p.published_at) > new Date(Date.now() - 14 * 86400000));

  const S = { display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.05em' };
  const iS = { background: 'rgba(15,20,40,0.9)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', fontSize: 13, color: C.text, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Manrope',system-ui,sans-serif", padding: '28px 32px', maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 6 }}>Social Media Manager</h1>
        <p style={{ fontSize: 14, color: C.muted }}>{INDUSTRY_SUBTITLE[industry] || INDUSTRY_SUBTITLE.retail}</p>
      </div>

      {urlError && <div style={{ background: 'rgba(239,68,68,0.08)', border: `1px solid rgba(239,68,68,0.25)`, borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: C.red }}>⚠️ {urlError.replace(/\+/g, ' ')}</div>}
      {urlSuccess && <div style={{ background: 'rgba(34,197,94,0.06)', border: `1px solid rgba(34,197,94,0.2)`, borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: C.green }}>✓ {urlSuccess} connected successfully</div>}

      {/* Creative Tools Status Bar */}
      {providers && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginRight: 4 }}>Creative Tools:</span>
          {[
            { label: 'SDXL', active: providers.image.stability_ai, group: 'image' },
            { label: 'DALL·E 3', active: providers.image.dalle3, group: 'image' },
            { label: 'Unsplash', active: providers.image.unsplash, group: 'image' },
            { label: 'Runway', active: providers.video.runway, group: 'video' },
            { label: 'Replicate', active: providers.video.replicate, group: 'video' },
            { label: 'ElevenLabs', active: providers.voiceover.elevenlabs, group: 'voice' },
          ].map(({ label, active, group }) => {
            const col = group === 'image' ? C.violet : group === 'video' ? C.blue : C.amber;
            return (
              <span key={label} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, fontWeight: 600, border: `1px solid ${active ? col + '60' : C.border}`, background: active ? col + '15' : 'transparent', color: active ? col : C.dim }}>
                {active ? '✓' : '○'} {label}
              </span>
            );
          })}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: C.dim }}>
            {[providers.image.stability_ai, providers.image.dalle3, providers.image.unsplash, providers.video.runway, providers.video.replicate, providers.voiceover.elevenlabs].filter(Boolean).length} / 6 active
          </span>
        </div>
      )}

      {/* Connect Platforms */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>Connected Platforms</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {[
            { platform: 'instagram', label: 'Instagram', connectUrl: '/api/social/connect/facebook', color: '#E1306C' },
            { platform: 'facebook', label: 'Facebook', connectUrl: '/api/social/connect/facebook', color: '#1877F2' },
            { platform: 'google_business', label: 'Google Business', connectUrl: '/api/social/connect/google', color: '#4285F4' },
          ].map(({ platform, label, connectUrl, color }) => {
            const conn = connections.find(c => c.platform === platform);
            return (
              <div key={platform} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: `${color}15`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  {PLATFORM_ICONS[platform]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{label}</p>
                  {conn ? <p style={{ fontSize: 11, color: C.green }}>@{conn.platform_account_name ?? 'Connected'}</p>
                    : <p style={{ fontSize: 11, color: C.muted }}>Not connected</p>}
                </div>
                {!conn && (
                  <a href={connectUrl} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 7, border: `1px solid ${color}40`, color, background: `${color}10`, textDecoration: 'none', fontWeight: 600, flexShrink: 0 }}>
                    Connect
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Generate button */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Aria&rsquo;s Suggestions</h2>
            {generating && <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Analysing your {industry} data…</p>}
          </div>
          <button onClick={generate} disabled={generating || !bid}
            style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: generating ? 0.6 : 1 }}>
            {generating ? '✨ Generating…' : '+ Generate new'}
          </button>
        </div>

        {loadingPosts ? (
          <p style={{ color: C.dim, fontSize: 13, padding: '24px 0' }}>Loading posts…</p>
        ) : draftPosts.length === 0 ? (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '40px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 32, marginBottom: 12 }}>✨</p>
            <p style={{ color: C.muted, fontSize: 14 }}>No suggestions yet</p>
            <p style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>Click "Generate new" and Aria will create posts based on your sales data</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {draftPosts.map(post => (
              <div key={post.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <PlatformBadge platform={post.platform} />
                    {post.scheduled_for && (
                      <span style={{ fontSize: 11, color: C.dim }}>
                        Scheduled: {new Date(post.scheduled_for).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>

                  {/* Image suggestion */}
                  <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                    {post.image_url ? (
                      <img src={post.image_url} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <div style={{ width: 80, height: 80, borderRadius: 10, background: 'rgba(139,92,246,0.08)', border: `1px dashed ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>📷</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>Suggested image:</p>
                      <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{post.image_prompt?.slice(0, 120)}</p>
                      <button onClick={() => { setImageGridId(post.id); loadImages(post.id, post.image_prompt); }}
                        style={{ marginTop: 6, fontSize: 11, padding: '3px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Change image
                      </button>
                    </div>
                  </div>

                  {/* Image picker grid */}
                  {imageGridId === post.id && (
                    <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 12, marginBottom: 12 }}>
                      {loadingImages ? <p style={{ fontSize: 12, color: C.dim, textAlign: 'center' }}>Loading images…</p> : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                          {images.map(img => (
                            <div key={img.id} onClick={() => { approve(post.id, img.url); setImageGridId(null); }}
                              style={{ cursor: 'pointer', borderRadius: 8, overflow: 'hidden', aspectRatio: '1', position: 'relative' }}>
                              <img src={img.small} alt={img.photographer} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', padding: '2px 4px' }}>
                                <p style={{ fontSize: 9, color: '#fff' }}>📷 {img.photographer}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <button onClick={() => setImageGridId(null)} style={{ marginTop: 8, fontSize: 11, color: C.muted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                    </div>
                  )}

                  {/* Caption */}
                  {editingId === post.id ? (
                    <div style={{ marginBottom: 10 }}>
                      <textarea value={editCaption} onChange={e => setEditCaption(e.target.value)} rows={4}
                        style={{ ...iS, resize: 'vertical' as const, marginBottom: 8 }} />
                      <input value={editHashtags} onChange={e => setEditHashtags(e.target.value)} placeholder="hashtag1, hashtag2, hashtag3"
                        style={iS} />
                    </div>
                  ) : (
                    <p style={{ fontSize: 14, color: C.text, lineHeight: 1.65, marginBottom: 10, whiteSpace: 'pre-wrap' }}>{post.caption}</p>
                  )}

                  {/* Hashtags */}
                  {!editingId && post.hashtags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
                      {post.hashtags.map(h => (
                        <span key={h} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'rgba(139,92,246,0.1)', color: C.violet }}>#{h}</span>
                      ))}
                    </div>
                  )}

                  {/* Aria reasoning */}
                  {post.aria_reasoning && (
                    <div style={{ background: 'rgba(139,92,246,0.06)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
                      <p style={{ fontSize: 12, color: C.muted }}><span style={{ color: C.violet }}>💡 Why this works:</span> {post.aria_reasoning}</p>
                      {post.industry_context && <p style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>🎯 {post.industry_context}</p>}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {editingId === post.id ? (
                      <>
                        <button onClick={() => approve(post.id)}
                          style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: C.violet, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          ✓ Save & Approve
                        </button>
                        <button onClick={() => setEditingId(null)}
                          style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setEditingId(post.id); setEditCaption(post.caption); setEditHashtags(post.hashtags.join(', ')); }}
                          style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                          ✏️ Edit
                        </button>
                        <button onClick={() => approve(post.id)}
                          style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: C.violet, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          ✓ Approve & Schedule
                        </button>
                        <button onClick={() => skip(post.id)}
                          style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid rgba(239,68,68,0.3)`, background: 'rgba(239,68,68,0.05)', color: C.red, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                          ✗ Skip
                        </button>
                      </>
                    )}
                  </div>

                  {/* Creative Tools */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                    <button
                      onClick={() => generateImage(post.id, post.image_prompt, null)}
                      disabled={!!imgGenerating[post.id]}
                      style={{ padding: '5px 12px', borderRadius: 7, border: `1px solid ${C.violet}40`, background: `${C.violet}10`, color: C.violet, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: imgGenerating[post.id] ? 0.6 : 1 }}>
                      {imgGenerating[post.id] ? '⏳ Generating…' : '🖼 Generate Image'}
                    </button>
                    {providers?.video.runway || providers?.video.replicate ? (
                      videoJobs[post.id] ? (
                        <span style={{ fontSize: 11, padding: '5px 12px', borderRadius: 7, border: `1px solid ${C.blue}40`, background: `${C.blue}10`, color: videoStatus[post.id]?.status === 'completed' ? C.green : C.blue }}>
                          {videoStatus[post.id]?.status === 'completed' ? '✓ Video ready' : videoStatus[post.id]?.status === 'failed' ? '✗ Failed' : '⏳ Processing…'}
                          {videoStatus[post.id]?.url && <a href={videoStatus[post.id]!.url} target="_blank" rel="noreferrer" style={{ marginLeft: 6, color: C.green }}>▶ Watch</a>}
                        </span>
                      ) : (
                        <button onClick={() => generateVideo(post.id, post.reel_concept)}
                          style={{ padding: '5px 12px', borderRadius: 7, border: `1px solid ${C.blue}40`, background: `${C.blue}10`, color: C.blue, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                          🎬 Generate Video
                        </button>
                      )
                    ) : null}
                    {providers?.voiceover.elevenlabs ? (
                      voiceUrls[post.id] ? (
                        <audio controls src={voiceUrls[post.id]} style={{ height: 28, borderRadius: 7, outline: 'none' }} />
                      ) : (
                        <button onClick={() => { setVoiceOpen(post.id); setVoiceText(post.reel_script || post.caption.slice(0, 500)); }}
                          style={{ padding: '5px 12px', borderRadius: 7, border: `1px solid ${C.amber}40`, background: `${C.amber}10`, color: C.amber, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                          🎙 Generate Voice
                        </button>
                      )
                    ) : null}
                  </div>

                  {/* Voiceover modal */}
                  {voiceOpen === post.id && (
                    <div style={{ marginTop: 10, background: 'rgba(0,0,0,0.4)', borderRadius: 10, padding: 14 }}>
                      <p style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Script for voiceover (max 2500 chars):</p>
                      <textarea value={voiceText} onChange={e => setVoiceText(e.target.value)} rows={4}
                        style={{ ...iS, resize: 'vertical' as const, marginBottom: 8 }} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => generateVoiceover(post.id)} disabled={voiceGenerating}
                          style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: C.amber, color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: voiceGenerating ? 0.6 : 1 }}>
                          {voiceGenerating ? '⏳ Generating…' : '🎙 Create Voiceover'}
                        </button>
                        <button onClick={() => setVoiceOpen(null)} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Scheduled */}
      {scheduledPosts.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>Scheduled ({scheduledPosts.length})</h2>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            {scheduledPosts.map((post, i) => (
              <div key={post.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < scheduledPosts.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <PlatformBadge platform={post.platform} />
                <p style={{ flex: 1, fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.caption.slice(0, 80)}</p>
                <span style={{ fontSize: 11, color: C.dim, flexShrink: 0 }}>{post.scheduled_for ? new Date(post.scheduled_for).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                <button onClick={() => publish(post.id)}
                  style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: C.green, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                  Publish now
                </button>
                <button onClick={() => skip(post.id)}
                  style={{ padding: '5px 8px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.dim, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Published */}
      {publishedPosts.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>Published (last 14 days)</h2>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            {publishedPosts.map((post, i) => (
              <div key={post.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: i < publishedPosts.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <PlatformBadge platform={post.platform} />
                <p style={{ flex: 1, fontSize: 12, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.caption.slice(0, 60)}</p>
                <span style={{ fontSize: 11, color: C.dim, flexShrink: 0 }}>{post.published_at ? new Date(post.published_at).toLocaleDateString('en-AU') : '—'}</span>
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: 'rgba(34,197,94,0.1)', color: C.green }}>Published ✓</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Preferences */}
      <section>
        <button onClick={() => setPrefsOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: C.text, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginBottom: prefsOpen ? 16 : 0 }}>
          ⚙️ Preferences {prefsOpen ? '▲' : '▼'}
        </button>
        {prefsOpen && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Brand voice */}
            <div>
              <label style={S}>Brand Voice</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {['friendly','professional','casual','excited'].map(v => (
                  <button key={v} onClick={() => setPrefs(p => ({ ...p, brand_voice: v }))}
                    style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${prefs.brand_voice === v ? C.violet : C.border}`, background: prefs.brand_voice === v ? 'rgba(139,92,246,0.15)' : 'transparent', color: prefs.brand_voice === v ? C.violet : C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            {/* Frequency */}
            <div>
              <label style={S}>Post Frequency</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['daily','Daily'],['3x_week','3× week'],['weekly','Weekly'],['on_demand','Only when I ask']].map(([v, l]) => (
                  <button key={v} onClick={() => setPrefs(p => ({ ...p, post_frequency: v }))}
                    style={{ padding: '6px 12px', borderRadius: 20, border: `1px solid ${prefs.post_frequency === v ? C.violet : C.border}`, background: prefs.post_frequency === v ? 'rgba(139,92,246,0.15)' : 'transparent', color: prefs.post_frequency === v ? C.violet : C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={S}>Business Tagline</label>
                <input value={prefs.business_tagline || ''} onChange={e => setPrefs(p => ({ ...p, business_tagline: e.target.value }))} placeholder="e.g. Melbourne's best local bottle shop" style={iS} />
              </div>
              <div>
                <label style={S}>Target Audience</label>
                <input value={prefs.target_audience || ''} onChange={e => setPrefs(p => ({ ...p, target_audience: e.target.value }))} placeholder="e.g. local families, wine enthusiasts" style={iS} />
              </div>
            </div>
            <div>
              <label style={S}>Topics to Avoid</label>
              <input value={prefs.topics_to_avoid || ''} onChange={e => setPrefs(p => ({ ...p, topics_to_avoid: e.target.value }))} placeholder="e.g. competitor names, political topics" style={iS} />
            </div>
            {/* Custom hashtags */}
            <div>
              <label style={S}>Always-on Hashtags</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                {prefs.auto_hashtags.map(h => (
                  <span key={h} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 99, background: 'rgba(139,92,246,0.1)', color: C.violet, display: 'flex', alignItems: 'center', gap: 6 }}>
                    #{h}
                    <button onClick={() => setPrefs(p => ({ ...p, auto_hashtags: p.auto_hashtags.filter(x => x !== h) }))} style={{ background: 'none', border: 'none', color: C.violet, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>&times;</button>
                  </span>
                ))}
              </div>
              <input ref={tagInputRef} value={hashtagInput} onChange={e => setHashtagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && hashtagInput.trim()) { setPrefs(p => ({ ...p, auto_hashtags: [...p.auto_hashtags, hashtagInput.replace(/^#/, '').trim()] })); setHashtagInput(''); }}}
                placeholder="Type hashtag and press Enter" style={{ ...iS, width: 240 }} />
            </div>
            <button onClick={savePrefs} disabled={prefsSaving}
              style={{ alignSelf: 'flex-start', padding: '9px 22px', borderRadius: 9, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: prefsSaving ? 0.6 : 1 }}>
              {prefsSaving ? 'Saving…' : 'Save Preferences'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
