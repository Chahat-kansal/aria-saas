'use client';
import { useState, useEffect, useRef } from 'react';
import SocialConnections from '@/components/dashboard/social/SocialConnections';
import ContentCalendar from '@/components/dashboard/social/ContentCalendar';
import { BestTimesHeatmap } from '@/components/dashboard/social/BestTimesHeatmap';

const C = { bg: 'var(--bg-base)', card: 'var(--bg-surface)', border: 'transparent', text: '#F0F4FF', muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)', violet: '#8B5CF6', green: '#22C55E', red: '#EF4444', amber: '#F59E0B', blue: '#3B82F6' };

interface SocialPost { id: string; platform: string; status: string; caption: string; hashtags: string[]; image_url: string | null; image_prompt: string | null; image_credit: string | null; scheduled_for: string | null; published_at: string | null; aria_reasoning: string | null; industry_context: string | null; reel_concept: string | null; reel_script: string | null; content_calendar_month: string | null; created_at: string; video_url: string | null; post_type: string | null; fal_request_id: string | null; reel_cost_aud: number | null; reel_duration_seconds: number | null; reel_mode: string | null; reel_style: string | null; }
interface Providers { image: { stability_ai: boolean; dalle3: boolean; unsplash: boolean }; video: { runway: boolean; replicate: boolean }; voiceover: { elevenlabs: boolean } }
interface SocialConn { id: string; platform: string; platform_account_name: string | null; is_active: boolean; }
interface Prefs { brand_voice: string; post_frequency: string; auto_hashtags: string[]; topics_to_avoid: string | null; target_audience: string | null; business_tagline: string | null; }

const PLATFORM_ICONS: Record<string, string> = { instagram: '📸', facebook: '👤', google_business: '🏢' };
const PLATFORM_COLORS: Record<string, string> = { instagram: '#E1306C', facebook: '#1877F2', google_business: '#4285F4' };

function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: ((PLATFORM_COLORS[platform] || '#666') + '20'), color: PLATFORM_COLORS[platform] || '#aaa', fontWeight: 700, border: ('1px solid ' + (PLATFORM_COLORS[platform] || '#666') + '40') }}>
      {PLATFORM_ICONS[platform]} {platform.replace('_', ' ')}
    </span>
  );
}

// Phase 6 — Aria Community is the only channel Aria fully owns, so we always
// offer it as a "mirror" option next to social posts. Tick = also publish to
// Community when this post goes out.
function CommunityMirrorChip({ postId, value, onChange }: { postId: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={'mirror-' + postId} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px',
      borderRadius: 99, fontSize: 11, fontWeight: 700, cursor: 'pointer',
      background: value ? 'rgba(127,184,151,0.15)' : 'transparent',
      border: '1px solid ' + (value ? 'rgba(127,184,151,0.4)' : 'rgba(127,184,151,0.18)'),
      color: value ? '#7FB897' : 'rgba(255,255,255,0.55)',
      userSelect: 'none', flexShrink: 0,
    }}>
      <input id={'mirror-' + postId} type="checkbox" checked={value} onChange={e => onChange(e.target.checked)}
        style={{ width: 12, height: 12, accentColor: '#7FB897', margin: 0 }} />
      ✦ Aria Community
    </label>
  );
}

export default function SocialPage() {
  const [socialTab, setSocialTab]   = useState<'calendar' | 'best-times'>('calendar');
  const [bid, setBid]               = useState<string | null>(null);
  const [industry, setIndustry]     = useState<string>('retail');
  const [bizName, setBizName]       = useState('');
  const [connections, setConnections] = useState<SocialConn[]>([]);
  const [posts, setPosts]           = useState<SocialPost[]>([]);
  const [prefs, setPrefs]           = useState<Prefs>({ brand_voice: 'friendly', post_frequency: 'weekly', auto_hashtags: [], topics_to_avoid: null, target_audience: null, business_tagline: null });
  const [generating, setGenerating] = useState(false);

  // ── Reels addon state ─────────────────────────────────────────────────
  const [reelsEnabled, setReelsEnabled] = useState(false)
  const [reelsLoading, setReelsLoading] = useState(false)
  const [showReelsModal, setShowReelsModal] = useState(false)
  const [reelsBannerDismissed, setReelsBannerDismissed] = useState(false)
  const [reelsSection, setReelsSection] = useState<'posts' | 'reels'>('posts')

  // ── Token expiry warnings (Gap 5) ────────────────────────────────────
  const [tokenWarnings, setTokenWarnings] = useState<Array<{platform: string; expires_in_days: number | null; warning: boolean; expired: boolean}>>([])

  // ── Reel Creator Panel state (Gap 3/4) ───────────────────────────────
  const [reelCreatorPostId, setReelCreatorPostId] = useState<string | null>(null)
  const [reelMode, setReelMode] = useState<'auto'|'image'|'text'>('auto')
  const [reelStyle, setReelStyle] = useState('lifestyle')
  const [reelCustomPrompt, setReelCustomPrompt] = useState('')
  const [reelSourceImage, setReelSourceImage] = useState<string | null>(null)
  const [reelDuration, setReelDuration] = useState<number>(10)
  const [reelDurationCustom, setReelDurationCustom] = useState<string>('')
  const [ownerImageJobId, setOwnerImageJobId] = useState<string | null>(null)
  const [reelBgMusic, setReelBgMusic] = useState('none')
  const [reelGenerating, setReelGenerating] = useState(false)
  const [reelPolling, setReelPolling] = useState<Record<string, {requestId: string; modelId: string; bgMusic: string; voiceoverUrl?: string}>>({})
  const [assetLibrary, setAssetLibrary] = useState<Array<{id: string; url: string; name: string}>>([])
  const [showAssetLibrary, setShowAssetLibrary] = useState(false)
  const [reelBillingThisMonth, setReelBillingThisMonth] = useState<{total_cost_aud: number; reel_count: number} | null>(null)

  // ── AI Influencer Library state (Prompt 235) ─────────────────────────
  const [influencerLibrary, setInfluencerLibrary] = useState<Array<{
    id: string; name: string; description: string; image_url: string;
    industry_tags: string[]; style_tags: string[]; is_featured: boolean
  }>>([])
  const [selectedInfluencerId, setSelectedInfluencerId] = useState<string | null>(null)
  const [selectedInfluencerUrl, setSelectedInfluencerUrl] = useState<string | null>(null)
  const [showInfluencerPicker, setShowInfluencerPicker] = useState(false)

  useEffect(() => {
    if (!bid) return
    fetch('/api/social/reels-addon?business_id=' + bid)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setReelsEnabled(d.enabled) })
      .catch(() => {})
    fetch('/api/social/token-status?business_id=' + bid)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.connections) setTokenWarnings(d.connections.filter((c: any) => c.warning || c.expired)) })
      .catch(() => {})
    fetch('/api/social/asset-library?business_id=' + bid)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.assets) setAssetLibrary(d.assets) })
      .catch(() => {})
    fetch('/api/social/reel-billing?business_id=' + bid)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setReelBillingThisMonth(d) })
      .catch(() => {})
    fetch('/api/social/influencer-library')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.influencers) setInfluencerLibrary(d.influencers) })
      .catch(() => {})
  }, [bid])

  async function enableReels() {
    if (!bid) return
    setReelsLoading(true)
    const res = await fetch('/api/social/reels-addon', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: bid, enable: true }),
    })
    const d = await res.json()
    if (d.ok) { setReelsEnabled(true); setShowReelsModal(false) }
    setReelsLoading(false)
  }

  // ── Growth Engine state ──────────────────────────────────────────
  const [growthLoading, setGrowthLoading] = useState(false)
  const [growthMsg, setGrowthMsg] = useState<string | null>(null)
  const [reviewStats, setReviewStats] = useState<{sent: number, reviews: number} | null>(null)

  useEffect(() => {
    if (!bid) return
    // Load review request stats
    fetch(`/api/aria/review-stats?businessId=${bid}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setReviewStats(d) })
      .catch(() => {})
  }, [bid])

  async function generateGrowthPost() {
    if (!bid || connectedPlatforms.length === 0) return
    setGrowthLoading(true); setGrowthMsg(null)
    const platform = connectedPlatforms.includes('instagram') ? 'instagram'
      : connectedPlatforms.includes('facebook') ? 'facebook' : connectedPlatforms[0]
    try {
      const res = await fetch('/api/social/growth-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: bid, platform }),
      })
      const d = await res.json()
      if (d.ok) {
        setGrowthMsg(d.message)
        // Reload posts so the new draft appears
        const postsRes = await fetch(`/api/social/posts?business_id=${bid}`)
        const postsData = await postsRes.json()
        if (postsData.posts) setPosts(postsData.posts)
      } else {
        setGrowthMsg('Could not generate post: ' + (d.error || 'Unknown error'))
      }
    } catch { setGrowthMsg('Network error — try again') }
    setGrowthLoading(false)
  }

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
  const [reelDurations, setReelDurations] = useState<Record<string, number>>({});
  const [falPolling, setFalPolling] = useState<Record<string, boolean>>({});
  const [storyPosting, setStoryPosting] = useState<Record<string, boolean>>({});
  const [publishing, setPublishing] = useState<Record<string, boolean>>({});
  const [publishToast, setPublishToast] = useState<{ id: string; ok: boolean; msg: string } | null>(null);
  // Phase 6 cross-posting: per-post checkbox to also mirror to Aria Community
  const [mirrorToCommunity, setMirrorToCommunity] = useState<Record<string, boolean>>({});
  const [voiceOpen, setVoiceOpen] = useState<string | null>(null);
  const [voiceText, setVoiceText] = useState('');
  const [voiceGenerating, setVoiceGenerating] = useState(false);
  const [voiceUrls, setVoiceUrls] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'posts' | 'library' | 'calendar' | 'inbox' | 'analytics'>('posts');
  // Inbox state
  const [inboxItems, setInboxItems] = useState<Array<{ id: string; platform: string | null; message_type: string | null; author_name: string | null; author_handle: string | null; content: string; post_url: string | null; received_at: string; is_read: boolean | null; replied_at: string | null }>>([])
  const [inboxFilter, setInboxFilter] = useState<'all' | 'unread' | 'replied'>('unread')
  const [inboxLoading, setInboxLoading] = useState(false)
  // Analytics state
  const [analytics, setAnalytics] = useState<{ posts: Array<{ id: string; platform: string; caption: string | null; impressions?: number | null; likes?: number | null; comments?: number | null; shares?: number | null; created_at: string }>; summary: { totals: { impressions: number; reach: number; likes: number; comments: number; shares: number }; engagement_rate: number; top_post: { caption: string | null; engagement: number } | null; by_type: { image: number; text: number }; count: number } | null } | null>(null)
  // Library upload form
  const [libCaption, setLibCaption] = useState('')
  const [libHashtags, setLibHashtags] = useState('')
  const [savingLibAsset, setSavingLibAsset] = useState(false)
  const [savedAssets, setSavedAssets] = useState<Array<{ id: string; asset_type: string; name: string | null; content: string | null }>>([])
  // Bulk upload
  const [bulkCsv, setBulkCsv] = useState('')
  const [bulkResult, setBulkResult] = useState<string>('')
  const [mediaLibrary, setMediaLibrary] = useState<Array<{ id: string; url: string; filename: string; aria_description: string | null; tags: string[]; used_in_posts: number; uploaded_at: string }>>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [communityStats, setCommunityStats] = useState<{ by_type: Array<{type: string; avg_engagement: number; count: number}>; top_posts: Array<{id: string; caption: string; engagement: number; likes_count: number; comments_count: number; created_at: string}>; total_engagement: number; post_count: number } | null>(null)
  const [metricsModal, setMetricsModal] = useState<{ postId: string } | null>(null)
  const [metricsForm, setMetricsForm] = useState({ impressions: '', likes: '', comments: '', shares: '', saves: '' })
  const [savingMetrics, setSavingMetrics] = useState(false)
  const [savedMetrics, setSavedMetrics] = useState<Record<string, Record<string, number>>>({})
  const [socialIntelligence, setSocialIntelligence] = useState<{ insights: string[]; top_content_type: string | null; best_day: string | null; best_hour: number | null } | null>(null)
  const [loadingIntelligence, setLoadingIntelligence] = useState(false)
  const [generatingCalendar, setGeneratingCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [postsPerWeek, setPostsPerWeek] = useState(3);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    const [postsRes, prefsRes, bizRes] = await Promise.all([
      fetch(`/api/social/posts?business_id=${businessId}`).then(r => r.json()).catch(() => ({ posts: [] })),
      fetch(`/api/social/preferences?business_id=${businessId}`).then(r => r.json()).catch(() => ({ preferences: null })),
      fetch('/api/businesses/current').then(r => r.json()).catch(() => null),
    ]);
    const cleanedPosts = (postsRes.posts ?? []).map((p: any) => ({
      ...p,
      image_url: p.image_url?.includes('fbcdn.net') || p.image_url?.includes('cdninstagram.com') ? null : p.image_url
    }))
    setPosts(cleanedPosts);
    if (prefsRes.preferences) setPrefs(p => ({ ...p, ...prefsRes.preferences }));
    if (bizRes?.industry) setIndustry(bizRes.industry);
    setLoadingPosts(false);
  }

  async function loadMedia() {
    if (!bid) return;
    const r = await fetch(`/api/social/media?business_id=${bid}`);
    const d = await r.json();
    setMediaLibrary(d.media ?? []);
  }

  useEffect(() => { if (bid && activeTab === 'library') loadMedia(); }, [bid, activeTab]);

  // Load social connections so connectedPlatforms gates work correctly.
  // Without this, the parent state stays empty and the generate buttons are
  // permanently disabled, even when accounts ARE connected (loaded by the
  // SocialConnections child component, but never lifted up).
  useEffect(() => {
    if (!bid) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/social/connections?business_id=${bid}`);
        if (!r.ok) return;
        const d = await r.json();
        if (cancelled) return;
        setConnections(Array.isArray(d.connections) ? d.connections : []);
      } catch {
        // silent — the buttons stay disabled which is the safe default
      }
    })();
    return () => { cancelled = true };
  }, [bid]);

  // Inbox loader + 60s poll
  useEffect(() => {
    if (!bid) return
    async function loadInbox() {
      setInboxLoading(true)
      const r = await fetch(`/api/social/inbox?filter=${inboxFilter}`).then(r => r.json()).catch(() => ({ messages: [] }))
      setInboxItems(r.messages ?? [])
      setInboxLoading(false)
    }
    loadInbox()
    if (activeTab === 'inbox') {
      const id = setInterval(loadInbox, 60000)
      return () => clearInterval(id)
    }
  }, [bid, activeTab, inboxFilter])

  // Analytics loader
  useEffect(() => {
    if (!bid || activeTab !== 'analytics') return
    fetch('/api/social/analytics').then(r => r.json()).then(d => setAnalytics(d)).catch(() => {})
    fetch('/api/social/community-analytics?business_id=' + bid).then(r => r.json()).then(d => { if (!d.error) setCommunityStats(d) }).catch(() => {})
    if (!socialIntelligence && !loadingIntelligence) {
      setLoadingIntelligence(true)
      fetch('/api/aria/social-learning?business_id=' + bid).then(r => r.json()).then(d => { setSocialIntelligence(d); setLoadingIntelligence(false) }).catch(() => { setLoadingIntelligence(false) })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bid, activeTab])

  // Library assets loader (saved captions/hashtag sets)
  useEffect(() => {
    if (!bid || activeTab !== 'library') return
    fetch('/api/social/library').then(r => r.json()).then(d => setSavedAssets(d.assets ?? [])).catch(() => {})
  }, [bid, activeTab])

  async function markInboxRead(id: string) {
    await fetch(`/api/social/inbox?id=${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_read: true }) })
    setInboxItems(items => items.map(m => m.id === id ? { ...m, is_read: true } : m))
  }

  async function saveLibAsset(asset_type: 'caption' | 'hashtag_set') {
    if (asset_type === 'caption' && !libCaption.trim()) return
    if (asset_type === 'hashtag_set' && !libHashtags.trim()) return
    setSavingLibAsset(true)
    const content = asset_type === 'caption' ? libCaption.trim() : libHashtags.trim()
    const res = await fetch('/api/social/library', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset_type, name: content.slice(0, 40), content }),
    }).then(r => r.json()).catch(() => ({}))
    if (res.asset) {
      setSavedAssets(a => [res.asset, ...a])
      if (asset_type === 'caption') setLibCaption('')
      else setLibHashtags('')
    }
    setSavingLibAsset(false)
  }

  async function runBulkSchedule() {
    if (!bulkCsv.trim()) return
    const lines = bulkCsv.trim().split('\n').slice(1) // skip header
    const rows = lines.map(l => {
      const [date, time, platform, caption, image_url] = l.split(',').map(s => s.replace(/^"|"$/g, '').trim())
      return { date, time, platform, caption, image_url }
    }).filter(r => r.date && r.caption && r.platform)
    if (rows.length === 0) { setBulkResult('No valid rows found'); return }
    const res = await fetch('/api/social/bulk-schedule', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }),
    }).then(r => r.json()).catch(() => ({ error: 'Network error' }))
    if (res.error) setBulkResult(`Error: ${res.error}`)
    else setBulkResult(`✓ ${res.scheduled} posts scheduled across ${(res.platforms ?? []).length} platform${(res.platforms ?? []).length === 1 ? '' : 's'}`)
  }

  async function uploadMedia(files: FileList | null) {
    if (!files || !bid) return;
    setUploadingMedia(true);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append('file', file);
      form.append('business_id', bid);
      await fetch('/api/social/media', { method: 'POST', body: form });
    }
    await loadMedia();
    setUploadingMedia(false);
  }

  async function deleteMedia(id: string) {
    if (!confirm('Remove this photo from your library?')) return;
    await fetch(`/api/social/media?id=${id}`, { method: 'DELETE' });
    setMediaLibrary(prev => prev.filter(m => m.id !== id));
  }

  // Only the platforms actually connected (is_active) may generate posts — mirrors
  // the server-side guard so we don't ask for content for disconnected accounts.
  const connectedPlatforms = connections.filter(c => c.is_active).map(c => c.platform);

  async function generateCalendar() {
    if (!bid || connectedPlatforms.length === 0) return;
    setGeneratingCalendar(true);
    const r = await fetch('/api/social/calendar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: bid, month: calendarMonth, platforms: connectedPlatforms, posts_per_week: postsPerWeek }),
    });
    const d = await r.json();
    if (d.posts?.length) {
      const cleanedPosts = d.posts.map((p: any) => ({
        ...p,
        image_url: p.image_url?.includes('fbcdn.net') ? null : p.image_url
      }));
      setPosts(prev => [...cleanedPosts, ...prev.filter(p => p.content_calendar_month !== calendarMonth)]);
      setActiveTab('posts');
      alert(`✅ Generated ${d.posts.length} posts for ${calendarMonth}! ${d.has_media ? `Used ${d.media_count} of your photos.` : 'Upload your own photos for better results.'}`);
    } else {
      alert(d.error || 'Could not generate calendar. Try again.');
    }
    setGeneratingCalendar(false);
  }

  async function generate() {
    if (!bid || connectedPlatforms.length === 0) return;
    setGenerating(true);
    // Trigger intelligence fetch in background if not yet loaded
    if (!socialIntelligence && !loadingIntelligence) {
      setLoadingIntelligence(true)
      fetch('/api/aria/social-learning?business_id=' + bid).then(r => r.json()).then(d => { setSocialIntelligence(d); setLoadingIntelligence(false) }).catch(() => { setLoadingIntelligence(false) })
    }
    const generateBody: Record<string, unknown> = { business_id: bid, platforms: connectedPlatforms, count: 3 }
    if (socialIntelligence?.top_content_type) generateBody.preferred_type = socialIntelligence.top_content_type
    if (socialIntelligence?.best_day) generateBody.best_day = socialIntelligence.best_day
    if (socialIntelligence?.best_hour !== null && socialIntelligence?.best_hour !== undefined) generateBody.best_hour = socialIntelligence.best_hour
    const res = await fetch('/api/aria/social-suggest', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(generateBody),
    });
    const d = await res.json();
    if (d.posts?.length) {
      setPosts(prev => [...d.posts, ...prev.filter(p => p.status !== 'draft')]);
    } else {
      alert(d.reason === 'no_products'
        ? 'Aria needs product or sales data to generate posts. Try making a few sales in the POS first.'
        : d.error || 'Could not generate posts right now. Try again in a moment.')
    }
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
    setPublishing(p => ({ ...p, [postId]: true }));
    try {
      const res = await fetch('/api/social/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, business_id: bid }),
      });
      const d = await res.json();
      if (d.ok) {
        setPosts(prev => prev.map(p =>
          p.id === postId ? { ...p, status: 'published', published_at: new Date().toISOString() } : p
        ));
        // Aria Community mirror — if the owner ticked the "Also post to Community" chip,
        // fire a community-only cross-post with the SAME caption + image. Failures here
        // never block the social publish — Community is additive.
        if (mirrorToCommunity[postId]) {
          const post = posts.find(p => p.id === postId);
          if (post) {
            try {
              await fetch('/api/community/owner/cross-post', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  body: post.caption,
                  hashtags: post.hashtags ?? [],
                  media_urls: post.image_url ? [post.image_url] : [],
                  media_type: post.image_url ? 'image' : null,
                  post_type: 'update',
                  channels: ['community'],
                }),
              });
            } catch (e) { console.error('[non-fatal]', e) }
          }
          setMirrorToCommunity(prev => { const n = { ...prev }; delete n[postId]; return n; });
        }
        setPublishToast({ id: postId, ok: true, msg: mirrorToCommunity[postId] ? 'Posted to both!' : 'Posted successfully!' });
      } else {
        setPublishToast({ id: postId, ok: false, msg: d.error || 'Failed to post' });
      }
    } catch (e: any) {
      setPublishToast({ id: postId, ok: false, msg: 'Network error — try again' });
    } finally {
      setPublishing(p => { const n = { ...p }; delete n[postId]; return n; });
      setTimeout(() => setPublishToast(null), 5000);
    }
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

  function calcReelCostDisplay(durationSeconds: number): string {
    return calcReelCost(durationSeconds).toFixed(2);
  }

  function calcReelCost(dur: number): number {
    return Math.round(Math.ceil(dur / 10) * 0.56 * 100) / 100
  }

  async function generateVideo(postId: string, concept: string | null) {
    const post = postId === 'standalone' ? null : posts.find(p => p.id === postId)
    setReelCreatorPostId(postId)
    setReelMode('auto')
    setReelStyle('lifestyle')
    setReelCustomPrompt(concept || post?.reel_concept || post?.caption || '')
    setReelSourceImage(post?.image_url || null)
    setReelDuration(15)
    setReelBgMusic('none')
  }

  async function submitReelGeneration() {
    if (!reelCreatorPostId || !bid) return
    setReelGenerating(true)
    const originalPostId = reelCreatorPostId as string
    let actualPostId: string = reelCreatorPostId as string

    if (reelCreatorPostId === 'standalone') {
      try {
        const cr = await fetch('/api/social/posts/create', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business_id: bid }),
        })
        const cd = await cr.json()
        if (!cd.post?.id) { alert('Could not create draft post'); setReelGenerating(false); return }
        actualPostId = cd.post.id
        setPosts(prev => [...prev, cd.post])
      } catch (e: any) {
        alert('Network error: ' + e.message)
        setReelGenerating(false)
        return
      }
    }

    const post = posts.find(p => p.id === actualPostId)
    try {
      // Step 1: get HF credentials from server (Vercel IPs are blocked by Higgsfield)
      const prepRes = await fetch('/api/social/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_id: actualPostId,
          business_id: bid,
          reel_mode: reelMode,
          reel_style: reelStyle,
          reel_custom_prompt: reelCustomPrompt || null,
          reel_source_image_url: selectedInfluencerId
            ? selectedInfluencerUrl
            : reelMode === 'image' ? (reelSourceImage || post?.image_url) : null,
          influencer_id: selectedInfluencerId ?? null,
          duration_seconds: reelDuration,
          background_music: reelBgMusic,
          voiceover_url: voiceUrls[originalPostId] || null,
        }),
      })
      const prep = await prepRes.json()
      if (!prep.hf_key) {
        alert(prep.message || prep.error || 'Generation failed')
        setReelGenerating(false)
        setSelectedInfluencerId(null)
        setSelectedInfluencerUrl(null)
        return
      }

      // Step 2: browser calls Higgsfield directly (bypasses Vercel IP block)
      let jobId: string | null = null
      try {
        const hfRes = await fetch(prep.hf_endpoint, {
          method: 'POST',
          headers: { Authorization: prep.hf_key, 'Content-Type': 'application/json' },
          body: JSON.stringify(prep.payload),
        })
        const hfData = await hfRes.json()
        jobId = hfData.id ?? hfData.job_id ?? hfData.request_id ?? null
        if (!jobId) throw new Error('No job ID in response: ' + JSON.stringify(hfData))
      } catch (e: any) {
        alert('Higgsfield error: ' + e.message)
        setReelGenerating(false)
        setSelectedInfluencerId(null)
        setSelectedInfluencerUrl(null)
        return
      }

      // Step 3: save job_id back to server
      fetch('/api/social/generate-video', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: actualPostId, job_id: jobId }),
      }).catch(() => {})

      setReelPolling(prev => ({
        ...prev,
        [actualPostId]: {
          requestId: jobId!,
          modelId: prep.model_id ?? 'kling3_0',
          bgMusic: reelBgMusic,
          voiceoverUrl: voiceUrls[originalPostId],
        },
      }))
      setReelCreatorPostId(null)
    } catch (e: any) {
      alert('Network error: ' + e.message)
    }
    setReelGenerating(false)
    setSelectedInfluencerId(null)
    setSelectedInfluencerUrl(null)
  }

  // Auto-suggest prompt when influencer selected and prompt is empty
  useEffect(() => {
    if (selectedInfluencerId && !reelCustomPrompt) {
      const inf = influencerLibrary.find(i => i.id === selectedInfluencerId)
      if (inf) {
        setReelCustomPrompt(
          inf.name + ' visits this local Australian business, looks around genuinely impressed, smiles warmly at the camera, authentic UGC style'
        )
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInfluencerId])

  async function pollFalStatus(postId: string, requestId: string) {
    try {
      const res = await fetch('/api/social/generate-video?fal_request_id=' + encodeURIComponent(requestId));
      const d = await res.json();
      if (d.status === 'COMPLETED' || d.status === 'completed') {
        setFalPolling(p => { const n = { ...p }; delete n[postId]; return n; });
        if (d.video_url) setPosts(prev => prev.map(p => p.id === postId ? { ...p, video_url: d.video_url } : p));
      } else if (d.status === 'FAILED' || d.status === 'failed' || d.status === 'error' || d.status === 'ERROR') {
        setFalPolling(p => { const n = { ...p }; delete n[postId]; return n; });
      } else {
        setTimeout(() => pollFalStatus(postId, requestId), 5000);
      }
    } catch {
      setTimeout(() => pollFalStatus(postId, requestId), 5000);
    }
  }

  async function pollVideoStatus(postId: string, jobId: string) {
    const res = await fetch('/api/social/video-status?job_id=' + encodeURIComponent(jobId));
    const d = await res.json();
    setVideoStatus(p => ({ ...p, [postId]: d }));
    if (d.status === 'processing') setTimeout(() => pollVideoStatus(postId, jobId), 5000);
  }

  async function publishAsStory(postId: string) {
    if (!bid) return;
    setStoryPosting(p => ({ ...p, [postId]: true }));
    try {
      const res = await fetch('/api/social/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, business_id: bid, post_type_override: 'story' }),
      });
      const d = await res.json();
      if (d.ok) {
        setPosts(prev => prev.map(p =>
          p.id === postId ? { ...p, status: 'published', post_type: 'story', published_at: new Date().toISOString() } : p
        ));
        setPublishToast({ id: postId, ok: true, msg: 'Story posted! Expires in 24h.' });
      } else {
        setPublishToast({ id: postId, ok: false, msg: d.error || 'Failed to post story' });
      }
    } catch {
      setPublishToast({ id: postId, ok: false, msg: 'Network error posting story' });
    } finally {
      setStoryPosting(p => { const n = { ...p }; delete n[postId]; return n; });
      setTimeout(() => setPublishToast(null), 5000);
    }
  }

  // Start polling when a video job is created
  useEffect(() => {
    for (const [postId, jobId] of Object.entries(videoJobs)) {
      if (!videoStatus[postId]) pollVideoStatus(postId, jobId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoJobs]);

  // Gap 3: Reel Creator polling effect
  useEffect(() => {
    if (Object.keys(reelPolling).length === 0) return
    const interval = setInterval(async () => {
      for (const [postId, { requestId, modelId, bgMusic, voiceoverUrl }] of Object.entries(reelPolling)) {
        try {
          const params = new URLSearchParams({
            fal_request_id: requestId,
            model_id: modelId,
            post_id: postId,
            business_id: bid ?? '',
            background_music: bgMusic,
          })
          if (voiceoverUrl) params.set('voiceover_url', voiceoverUrl)
          const res = await fetch('/api/social/generate-video?' + params)
          const d = await res.json()
          if (d.status === 'COMPLETED' || d.status === 'completed') {
            setPosts(prev => prev.map(p => p.id === postId
              ? { ...p, video_url: d.video_url, post_type: 'reel' } : p))
            setReelPolling(prev => { const n = {...prev}; delete n[postId]; return n })
          } else if (d.status === 'FAILED') {
            setReelPolling(prev => { const n = {...prev}; delete n[postId]; return n })
            alert('Reel generation failed. Please try again.')
          }
        } catch (e) { console.error('[silent-catch]', e) }
      }
    }, 5000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reelPolling, bid])

  async function generateVoiceover(postId: string) {
    if (!voiceText.trim()) return;
    setVoiceGenerating(true);
    const res = await fetch('/api/social/generate-voiceover', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: voiceText, business_id: bid }),
    });
    const d = await res.json();
    if (d.audio_url) setVoiceUrls(p => ({ ...p, [postId]: d.audio_url }));
    else if (d.error) alert(d.error.includes('not_configured') ? 'ElevenLabs API key not configured.' : (d.error || 'Voiceover generation failed.'));
    setVoiceGenerating(false);
    setVoiceOpen(null);
    setVoiceText('');
  }

  const draftPosts     = posts.filter(p => p.status === 'draft');
  const scheduledPosts = posts.filter(p => p.status === 'approved' || p.status === 'scheduled').sort((a, b) => (a.scheduled_for ?? '').localeCompare(b.scheduled_for ?? ''));
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

      {/* Reels enable banner — shown until dismissed or enabled */}
      {!reelsEnabled && !reelsBannerDismissed && (
        <div style={{
          background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: 12, padding: '12px 16px', marginBottom: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 13, color: '#F59E0B', fontWeight: 600 }}>
            🎬 AI Reels available — generate short videos for your posts ($0.56–$1.68 per Reel, metered monthly)
          </span>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={enableReels} disabled={reelsLoading}
              style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#F59E0B', color: '#0f1117', fontSize: 12, fontWeight: 700, cursor: reelsLoading ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
              {reelsLoading ? 'Enabling…' : 'Enable Reels'}
            </button>
            <button onClick={() => setReelsBannerDismissed(true)}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(245,158,11,0.3)', background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
              Dismiss
            </button>
          </div>
        </div>
      )}
      {reelsEnabled && reelBillingThisMonth && reelBillingThisMonth.reel_count > 0 && (
        <div style={{
          background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)',
          borderRadius: 10, padding: '8px 14px', marginBottom: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 12, color: '#60A5FA' }}>
            🎬 Reels this month: {reelBillingThisMonth.reel_count} generated
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#60A5FA' }}>
            A${reelBillingThisMonth.total_cost_aud.toFixed(2)}
          </span>
        </div>
      )}

      {/* Gap 5 — Token expiry banners */}
      {tokenWarnings.map(w => (
        <div key={w.platform} style={{
          background: w.expired ? 'rgba(239,68,68,0.1)' : 'rgba(251,191,36,0.1)',
          border: '1px solid ' + (w.expired ? 'rgba(239,68,68,0.3)' : 'rgba(251,191,36,0.3)'),
          borderRadius: 10, padding: '10px 16px', marginBottom: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 13, color: w.expired ? '#EF4444' : '#F59E0B', fontWeight: 600 }}>
            {w.expired
              ? ('⚠ Your ' + w.platform + ' connection has expired — posts will fail until you reconnect')
              : ('⚠ Your ' + w.platform + ' connection expires in ' + w.expires_in_days + ' days — reconnect soon')}
          </span>
          <a href="/dashboard/social" style={{ fontSize: 12, color: '#7FB897', fontWeight: 700, textDecoration: 'none' }}>
            Reconnect →
          </a>
        </div>
      ))}

      {/* Phase 6 — Aria Community channel banner */}
      <div style={{ background: 'rgba(127,184,151,0.06)', border: '1px solid rgba(127,184,151,0.25)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 18 }}>✦</span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#7FB897', margin: 0 }}>Aria Community is now a posting channel</p>
          <p style={{ fontSize: 12, color: C.muted, margin: '2px 0 0', lineHeight: 1.4 }}>
            Tick &quot;✦ Aria Community&quot; on any scheduled post to also publish it to your in-store followers — the only channel Aria fully owns.
          </p>
        </div>
        <a href="/dashboard/community/marketer" style={{ fontSize: 12, fontWeight: 700, color: '#A78BFA', textDecoration: 'none', whiteSpace: 'nowrap' }}>
          Use Aria Marketer →
        </a>
      </div>

      {urlError && <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: C.red }}>⚠️ {urlError.replace(/\+/g, ' ')}</div>}
      {urlSuccess && <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: C.green }}>✓ {urlSuccess} connected successfully</div>}

      {/* Main tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 0 }}>
        {([['posts', '📝 Posts'], ['inbox', '💬 Inbox'], ['library', '🖼️ Library'], ['calendar', '📅 Calendar'], ['analytics', '📊 Analytics']] as const).map(([t, label]) => {
          const unread = t === 'inbox' ? inboxItems.filter(m => !m.is_read).length : 0
          return (
            <button key={t} onClick={() => setActiveTab(t)}
              style={{ padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: activeTab === t ? 700 : 400, color: activeTab === t ? '#8B5CF6' : C.muted, borderBottom: activeTab === t ? '2px solid #8B5CF6' : '2px solid transparent', marginBottom: -1 }}>
              {label}
              {unread > 0 && <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 99, background: '#EF4444', color: '#fff', fontWeight: 700 }}>{unread}</span>}
            </button>
          )
        })}
      </div>

      {/* PHOTO LIBRARY TAB */}
      {activeTab === 'library' && (
        <div>
          <div style={{ marginBottom: 20, padding: '16px 20px', background: 'rgba(139,92,246,0.06)', borderRadius: 14, border: '1px solid rgba(139,92,246,0.15)' }}>
            <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>📸 Your Business Photo Library</p>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>Upload your own photos — Aria will use them when generating posts and the monthly calendar. Your photos = authentic content that customers trust.</p>
            <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" style={{ display: 'none' }} onChange={e => uploadMedia(e.target.files)} />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploadingMedia}
              style={{ padding: '10px 20px', background: '#8B5CF6', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
              {uploadingMedia ? '⏳ Uploading & analysing…' : '+ Upload photos / videos'}
            </button>
            <span style={{ fontSize: 12, color: C.dim, marginLeft: 12 }}>JPG, PNG, MP4 — up to 20MB each</span>
          </div>

          {/* Saved captions + hashtag sets */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 }}>
              <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>📝 Caption templates</p>
              <textarea value={libCaption} onChange={e => setLibCaption(e.target.value)} rows={2} placeholder="Save a reusable caption…"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: 12, fontFamily: 'inherit', resize: 'vertical', marginBottom: 8 }} />
              <button onClick={() => saveLibAsset('caption')} disabled={savingLibAsset || !libCaption.trim()}
                style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#8B5CF6', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: savingLibAsset || !libCaption.trim() ? 0.5 : 1, marginBottom: 8 }}>+ Save caption</button>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {savedAssets.filter(a => a.asset_type === 'caption').slice(0, 4).map(a => (
                  <p key={a.id} style={{ fontSize: 11, color: C.muted, padding: '4px 0' }}>· {a.content?.slice(0, 80)}</p>
                ))}
              </div>
            </div>
            <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 }}>
              <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}># Hashtag sets</p>
              <input value={libHashtags} onChange={e => setLibHashtags(e.target.value)} placeholder="#cafe #melbourne #coffee"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: 12, fontFamily: 'inherit', marginBottom: 8 }} />
              <button onClick={() => saveLibAsset('hashtag_set')} disabled={savingLibAsset || !libHashtags.trim()}
                style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#8B5CF6', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: savingLibAsset || !libHashtags.trim() ? 0.5 : 1, marginBottom: 8 }}>+ Save set</button>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {savedAssets.filter(a => a.asset_type === 'hashtag_set').slice(0, 4).map(a => (
                  <p key={a.id} style={{ fontSize: 11, color: C.muted, padding: '4px 0' }}>· {a.content}</p>
                ))}
              </div>
            </div>
          </div>

          {/* Bulk scheduling */}
          <div style={{ marginBottom: 20, padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>📦 Bulk schedule</p>
            <p style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>CSV columns: date, time, platform, caption, image_url</p>
            <textarea value={bulkCsv} onChange={e => setBulkCsv(e.target.value)} rows={4}
              placeholder="date,time,platform,caption,image_url&#10;2026-06-01,09:00,instagram,Morning coffee call,https://…"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: 11, fontFamily: 'monospace', resize: 'vertical', marginBottom: 8 }} />
            <button onClick={runBulkSchedule} disabled={!bulkCsv.trim()}
              style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#7FB897', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: bulkCsv.trim() ? 1 : 0.5 }}>
              Schedule batch
            </button>
            {bulkResult && <p style={{ fontSize: 12, color: bulkResult.startsWith('✓') ? '#7FB897' : C.red, marginTop: 8 }}>{bulkResult}</p>}
          </div>

          {mediaLibrary.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: C.muted }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📷</div>
              <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>No photos yet</p>
              <p style={{ fontSize: 13 }}>Upload your food, drinks, and space photos. Aria will describe them and use them in your posts.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {mediaLibrary.map(m => (
                <div key={m.id} style={{ background: C.card, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ aspectRatio: '1', position: 'relative', overflow: 'hidden' }}>
                    <img src={m.url} alt={m.filename} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, background: 'rgba(0,0,0,0.7)', color: '#fff' }}>
                        Used {m.used_in_posts}×
                      </span>
                    </div>
                  </div>
                  <div style={{ padding: '10px 12px' }}>
                    <p style={{ fontSize: 11, color: C.muted, marginBottom: 6, lineHeight: 1.4 }}>{m.aria_description || m.filename}</p>
                    {m.tags?.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                        {m.tags.map(t => <span key={t} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: 'rgba(139,92,246,0.15)', color: '#8B5CF6' }}>{t}</span>)}
                      </div>
                    )}
                    <button onClick={() => deleteMedia(m.id)} style={{ fontSize: 11, color: C.red, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MONTHLY CALENDAR TAB */}
      {activeTab === 'calendar' && (
        <div>
          <div style={{ marginBottom: 20, padding: '20px 24px', background: 'rgba(139,92,246,0.06)', borderRadius: 14, border: '1px solid rgba(139,92,246,0.15)' }}>
            <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>✨ Generate a full month of posts</p>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
              Aria plans your entire month using your sales data, upcoming events, and {mediaLibrary.length > 0 ? `your ${mediaLibrary.length} uploaded photos` : 'your business info'}. Each post is ready to approve and schedule.
            </p>

            {mediaLibrary.length === 0 && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(245,158,11,0.08)', borderRadius: 10, border: '1px solid rgba(245,158,11,0.2)', fontSize: 13, color: '#F59E0B' }}>
                💡 <strong>Tip:</strong> Upload your own photos in the Photo Library tab first — Aria will use them in your posts for authentic, branded content.
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 4 }}>Month</label>
                <input type="month" value={calendarMonth} onChange={e => setCalendarMonth(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: C.text, fontSize: 14 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 4 }}>Posts per week</label>
                <select value={postsPerWeek} onChange={e => setPostsPerWeek(Number(e.target.value))}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: '#1a1a2e', color: C.text, fontSize: 14 }}>
                  <option value={2}>2x/week</option>
                  <option value={3}>3x/week</option>
                  <option value={4}>4x/week</option>
                  <option value={5}>5x/week (daily)</option>
                </select>
              </div>
              <button onClick={generateCalendar} disabled={generatingCalendar || connectedPlatforms.length === 0}
                style={{ padding: '10px 24px', background: (generatingCalendar || connectedPlatforms.length === 0) ? 'rgba(139,92,246,0.5)' : '#8B5CF6', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: connectedPlatforms.length === 0 ? 'not-allowed' : 'pointer', fontSize: 14 }}>
                {generatingCalendar ? '✨ Planning your month…' : connectedPlatforms.length === 0 ? 'Connect an account first' : '✨ Generate month of posts'}
              </button>
            </div>

            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              {[
                { icon: '📸', title: 'Uses your photos', desc: mediaLibrary.length > 0 ? `${mediaLibrary.length} photos in library` : 'Upload photos for best results' },
                { icon: '📊', title: 'Based on your sales', desc: 'Posts about your top products' },
                { icon: '🗓️', title: 'Timed for events', desc: 'Holidays & local events factored in' },
              ].map(({ icon, title, desc }) => (
                <div key={title} style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 10 }}>
                  <p style={{ fontSize: 16, marginBottom: 4 }}>{icon}</p>
                  <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{title}</p>
                  <p style={{ fontSize: 12, color: C.muted }}>{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* POSTS TAB */}
      {/* INBOX TAB */}
      {activeTab === 'inbox' && (
        <div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {(['unread','all','replied'] as const).map(f => (
              <button key={f} onClick={() => setInboxFilter(f)}
                style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: inboxFilter === f ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)', color: inboxFilter === f ? '#A78BFA' : C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                {f}
              </button>
            ))}
          </div>
          {inboxLoading ? <p style={{ fontSize: 13, color: C.muted, textAlign: 'center', padding: 24 }}>Loading…</p>
            : inboxItems.length === 0 ? (
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '40px 24px', textAlign: 'center' }}>
                <p style={{ fontSize: 32, marginBottom: 8 }}>💬</p>
                <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Inbox is quiet</p>
                <p style={{ fontSize: 12, color: C.muted }}>Comments, DMs, and mentions across your connected platforms will appear here.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {inboxItems.map(m => (
                  <div key={m.id} style={{ padding: '12px 16px', borderRadius: 10, background: m.is_read ? 'rgba(255,255,255,0.02)' : 'rgba(139,92,246,0.05)', border: '1px solid ' + (m.is_read ? 'rgba(255,255,255,0.05)' : 'rgba(139,92,246,0.2)'), display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(139,92,246,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>
                      {m.platform === 'instagram' ? '📷' : m.platform === 'facebook' ? '📘' : m.platform === 'linkedin' ? '💼' : '💬'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, marginBottom: 2 }}><strong style={{ color: '#fff' }}>{m.author_name ?? m.author_handle ?? 'Anonymous'}</strong> <span style={{ color: C.muted }}>· {m.message_type ?? 'comment'} · {new Date(m.received_at).toLocaleString()}</span></p>
                      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>{m.content}</p>
                      {m.replied_at && <p style={{ fontSize: 11, color: '#7FB897', marginTop: 4 }}>✓ Replied</p>}
                    </div>
                    {!m.is_read && (
                      <button onClick={() => markInboxRead(m.id)}
                        style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.06)', color: C.muted, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Mark read
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
        </div>
      )}

      {/* ANALYTICS TAB */}
      {activeTab === 'analytics' && (
        <div>
          {!analytics?.summary ? <p style={{ fontSize: 13, color: C.muted, padding: 24, textAlign: 'center' }}>Loading analytics…</p> : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
                {[
                  { label: 'Posts (30d)', value: analytics.summary.count, color: '#A78BFA' },
                  { label: 'Impressions', value: analytics.summary.totals.impressions.toLocaleString(), color: '#60A5FA' },
                  { label: 'Reach', value: analytics.summary.totals.reach.toLocaleString(), color: '#7FB897' },
                  { label: 'Engagement %', value: analytics.summary.engagement_rate.toFixed(1) + '%', color: '#F59E0B' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '14px 16px' }}>
                    <p style={{ fontSize: 10, color: C.muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</p>
                    <p style={{ fontSize: 20, fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</p>
                  </div>
                ))}
              </div>
              {analytics.summary.top_post && (
                <div style={{ background: 'rgba(127,184,151,0.06)', border: '1px solid rgba(127,184,151,0.25)', borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#7FB897', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>⭐ Top performing post</p>
                  <p style={{ fontSize: 13, color: '#fff', lineHeight: 1.5 }}>{analytics.summary.top_post.caption ?? '(no caption)'}</p>
                  <p style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>{analytics.summary.top_post.engagement} total engagements</p>
                </div>
              )}
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
                <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Engagement by content type</p>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 10, color: C.muted }}>With image</p>
                    <p style={{ fontSize: 16, fontWeight: 700, color: '#7FB897' }}>{analytics.summary.by_type.image}</p>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 10, color: C.muted }}>Text only</p>
                    <p style={{ fontSize: 16, fontWeight: 700, color: '#A78BFA' }}>{analytics.summary.by_type.text}</p>
                  </div>
                </div>
              </div>

              {/* Gap 7: Reel performance + billing */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
                <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Reel vs Image performance</p>
                <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                  {[
                    { label: 'Reels (30d)', value: posts.filter(p => (p as any).post_type === 'reel' && p.status === 'published').length, color: '#F59E0B' },
                    { label: 'Image posts', value: posts.filter(p => (p as any).post_type !== 'reel' && p.status === 'published').length, color: '#60A5FA' },
                    { label: 'Stories posted', value: posts.filter(p => (p as any).post_type === 'story').length, color: '#A78BFA' },
                  ].map(s => (
                    <div key={s.label} style={{ flex: 1, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 12px' }}>
                      <p style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>{s.label}</p>
                      <p style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</p>
                    </div>
                  ))}
                </div>
                {reelBillingThisMonth && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8 }}>
                    <span style={{ fontSize: 12, color: '#F59E0B' }}>Reel generation cost this month</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#F59E0B' }}>${reelBillingThisMonth.total_cost_aud.toFixed(2)} AUD ({reelBillingThisMonth.reel_count} reels)</span>
                  </div>
                )}
              </div>

              {bid && socialTab !== 'best-times' && (
                <div style={{ marginTop: 20 }}>
                  <p style={{ fontSize: 11, color: C.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Best times to post</p>
                  <button onClick={() => { setActiveTab('posts'); setSocialTab('best-times') }}
                    style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.08)', color: '#A78BFA', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Open best-times analysis →
                  </button>
                </div>
              )}

              {communityStats && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginBottom: 14 }}>Community Post Performance</div>
                  {communityStats.by_type.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                      {communityStats.by_type.map(t => {
                        const maxEng = Math.max(...communityStats.by_type.map(x => x.avg_engagement), 1)
                        const pct = Math.round((t.avg_engagement / maxEng) * 100)
                        return (
                          <div key={t.type} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', width: 60, textTransform: 'capitalize' }}>{t.type}</span>
                            <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: pct + '%', background: '#7FB897', borderRadius: 4 }} />
                            </div>
                            <span style={{ fontSize: 12, color: '#7FB897', fontWeight: 600, width: 40, textAlign: 'right' }}>{t.avg_engagement}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {communityStats.top_posts.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Top posts</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {communityStats.top_posts.map(p => (
                          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
                            <div style={{ flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.caption || '(no caption)'}</div>
                            <span style={{ fontSize: 11, color: '#7FB897', fontWeight: 600, flexShrink: 0 }}>{p.engagement} eng</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {communityStats.by_type.length >= 2 && communityStats.by_type[0].avg_engagement > communityStats.by_type[1].avg_engagement * 1.5 && (
                    <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(127,184,151,0.08)', border: '1px solid rgba(127,184,151,0.2)', fontSize: 12, color: '#7FB897' }}>
                      Your {communityStats.by_type[0].type} posts get {Math.round(communityStats.by_type[0].avg_engagement / Math.max(communityStats.by_type[1].avg_engagement, 0.1))}x more engagement — Aria will prioritise this format.
                    </div>
                  )}
                </div>
              )}

              {socialIntelligence && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#7FB897', marginBottom: 12 }}>✦ What Aria learned</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {socialIntelligence.insights.map((insight, i) => (
                      <div key={i} style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(127,184,151,0.08)', border: '1px solid rgba(127,184,151,0.2)', fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.55 }}>
                        {insight}
                      </div>
                    ))}
                  </div>
                  {socialIntelligence.best_day && (
                    <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                      Best time to post: {socialIntelligence.best_day}{socialIntelligence.best_hour !== null ? ' at ' + socialIntelligence.best_hour + ':00' : ''}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'posts' && (
      <div>

      {/* Posts | Reels section toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 0 }}>
        {(['posts', 'reels'] as const).map(t => (
          <button key={t} onClick={() => setReelsSection(t)}
            style={{ padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: reelsSection === t ? 700 : 400, color: reelsSection === t ? '#F59E0B' : C.muted, borderBottom: reelsSection === t ? '2px solid #F59E0B' : '2px solid transparent', marginBottom: -1, fontFamily: 'inherit' }}>
            {t === 'posts' ? '📝 Posts' : '🎬 Reels'}
          </button>
        ))}
      </div>

      {reelsSection === 'posts' && (
      <>
      {/* Creative Tools Status Bar */}
      {providers && (
        <div style={{ background: C.card, border: ('1px solid ' + C.border), borderRadius: 12, padding: '12px 16px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
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
              <span key={label} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, fontWeight: 600, border: ('1px solid ' + active ? col + '60' : C.border), background: active ? col + '15' : 'transparent', color: active ? col : C.dim }}>
                {active ? '✓' : '○'} {label}
              </span>
            );
          })}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: C.dim }}>
            {[providers.image.stability_ai, providers.image.dalle3, providers.image.unsplash, providers.video.runway, providers.video.replicate, providers.voiceover.elevenlabs].filter(Boolean).length} / 6 active
          </span>
        </div>
      )}

      {/* Connected Accounts — uses new SocialConnections component */}
      {bid && <SocialConnections businessId={bid} onChange={async () => {
        const r = await fetch(`/api/social/connections?business_id=${bid}`);
        if (r.ok) {
          const d = await r.json();
          setConnections(Array.isArray(d.connections) ? d.connections : []);
        }
      }} />}

      {/* Tab bar */}
      {bid && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          {(['calendar', 'best-times'] as const).map(t => (
            <button key={t} onClick={() => setSocialTab(t)}
              style={{
                padding: '7px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                border: 'none', fontFamily: 'inherit',
                background: socialTab === t ? 'rgba(127,184,151,0.15)' : 'rgba(255,255,255,0.04)',
                color: socialTab === t ? '#7FB897' : 'rgba(255,255,255,0.4)',
              }}>
              {t === 'calendar' ? '📅 Calendar' : '⏰ Best Times'}
            </button>
          ))}
        </div>
      )}

      {/* Content Calendar */}
      {bid && socialTab === 'calendar' && (
        <ContentCalendar
          businessId={bid}
          industry={industry}
          activePlatforms={connections.filter(c => c.is_active).map(c => c.platform)}
        />
      )}

      {/* Best Times heatmap — lazy loaded on tab click */}
      {bid && socialTab === 'best-times' && (
        <div style={{ marginTop: 8 }}>
          <BestTimesHeatmap businessId={bid} />
        </div>
      )}


      {/* ── Growth Engine Panel ─────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(127,184,151,0.08) 0%, rgba(10,20,14,0.95) 100%)',
        border: '1px solid rgba(127,184,151,0.22)',
        borderRadius: 14, padding: '18px 20px', marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7FB897', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
              ✦ Aria Growth Engine
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
              Aria reads your POS data and writes a post about your best-selling item this week.
              <br />You approve it with one tap — it goes live at the optimal time.
            </div>
            {reviewStats && (
              <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                  📩 {reviewStats.sent} review requests sent
                </span>
                <span style={{ fontSize: 11, color: '#7FB897' }}>
                  ⭐ {reviewStats.reviews} new reviews this week
                </span>
              </div>
            )}
            {growthMsg && (
              <div style={{ marginTop: 8, fontSize: 12, color: growthMsg.startsWith('Could') ? '#f87171' : '#7FB897' }}>
                {growthMsg}
              </div>
            )}
          </div>
          <button
            onClick={generateGrowthPost}
            disabled={growthLoading || !bid || connectedPlatforms.length === 0}
            style={{
              padding: '10px 20px', borderRadius: 9, fontFamily: 'inherit', fontWeight: 700,
              fontSize: 13, cursor: growthLoading ? 'wait' : 'pointer',
              background: connectedPlatforms.length === 0 ? 'rgba(127,184,151,0.08)' : 'rgba(127,184,151,0.15)',
              border: '1px solid rgba(127,184,151,0.35)', color: '#7FB897',
              opacity: (!bid || connectedPlatforms.length === 0) ? 0.5 : 1,
              flexShrink: 0, whiteSpace: 'nowrap',
            }}
          >
            {growthLoading ? '✨ Generating…' : connectedPlatforms.length === 0 ? 'Connect Instagram first' : "❖ Generate this week’s post"}
          </button>
        </div>
      </div>

      {/* Generate button */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Aria&rsquo;s Suggestions</h2>
            {generating && <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Analysing your {industry} data…</p>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <button onClick={generate} disabled={generating || !bid || connectedPlatforms.length === 0}
              style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: connectedPlatforms.length === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: (generating || connectedPlatforms.length === 0) ? 0.55 : 1 }}>
              {generating ? '✨ Generating…' : '+ Generate new'}
            </button>
            {connectedPlatforms.length === 0 && (
              <p style={{ fontSize: 11, color: C.muted, marginTop: 6, maxWidth: 260 }}>
                Connect Instagram, Facebook, or Google Business to start generating posts.
              </p>
            )}
          </div>
        </div>

        {loadingPosts ? (
          <p style={{ color: C.dim, fontSize: 13, padding: '24px 0' }}>Loading posts…</p>
        ) : draftPosts.length === 0 ? (
          <div style={{ background: C.card, border: ('1px solid ' + C.border), borderRadius: 16, padding: '40px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 32, marginBottom: 12 }}>✨</p>
            <p style={{ color: C.muted, fontSize: 14 }}>No suggestions yet</p>
            <p style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>Click "Generate new" and Aria will create posts based on your sales data</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {draftPosts.map(post => (
              <div key={post.id} style={{ background: C.card, border: ('1px solid ' + C.border), borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <PlatformBadge platform={post.platform} />
                      {post.post_type && post.post_type !== 'image' && (
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99,
                          background: post.post_type === 'reel' ? 'rgba(59,130,246,0.15)' : 'rgba(139,92,246,0.15)',
                          color: post.post_type === 'reel' ? C.blue : C.violet, fontWeight: 700 }}>
                          {post.post_type === 'reel' ? '🎬 Reel' : '⏱ Story (24h)'}
                        </span>
                      )}
                    </div>
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
                      <div style={{ width: 80, height: 80, borderRadius: 10, background: 'rgba(139,92,246,0.08)', border: ('1px dashed ' + C.border), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>📷</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>Suggested image:</p>
                      <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{post.image_prompt?.slice(0, 120)}</p>
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button onClick={() => generateImage(post.id, post.image_prompt, (post as any).image_search_query)}
                          disabled={!!imgGenerating[post.id]}
                          style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: ('1px solid ' + C.border), background: 'transparent', color: C.muted, cursor: 'pointer', fontFamily: 'inherit', opacity: imgGenerating[post.id] ? 0.6 : 1 }}>
                          {imgGenerating[post.id] ? '⏳ Generating…' : '🔄 New image'}
                        </button>
                        <button onClick={() => { setImageGridId(imageGridId === post.id ? null : post.id); if (imageGridId !== post.id) loadImages(post.id, post.image_prompt); }}
                          style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: ('1px solid ' + C.border), background: 'transparent', color: C.muted, cursor: 'pointer', fontFamily: 'inherit' }}>
                          🖼 Pick from search
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Image picker grid */}
                  {imageGridId === post.id && (
                    <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 12, marginBottom: 12 }}>
                      {loadingImages ? <p style={{ fontSize: 12, color: C.dim, textAlign: 'center' }}>Loading images…</p> : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                          {images.map(img => (
                            <div key={img.id} onClick={async () => { setImageGridId(null); const r = await fetch('/api/social/approve', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ post_id: post.id, business_id: bid, image_url: img.url, image_credit: img.photographer }) }); const d = await r.json(); if (d.post) setPosts(prev => prev.map(p => p.id === post.id ? { ...p, image_url: img.url, image_credit: img.photographer } : p)); }}
                              style={{ cursor: 'pointer', borderRadius: 8, overflow: 'hidden', aspectRatio: '1', position: 'relative' }}>
                              <img src={img.thumb || img.small} alt={img.photographer} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).src = img.url }} />
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
                        <span key={h} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'rgba(139,92,246,0.1)', color: C.violet }}>#{h.replace(/^#+/, '')}</span>
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

                  {/* Reel cost badge */}
                  {post.reel_cost_aud && (
                    <div style={{ fontSize: 12, color: C.blue, marginBottom: 8, padding: '4px 10px',
                      background: 'rgba(59,130,246,0.08)', borderRadius: 8, display: 'inline-block' }}>
                      🎬 Reel · ${post.reel_cost_aud.toFixed(2)} AUD · added to monthly bill
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
                          style={{ padding: '7px 12px', borderRadius: 8, border: ('1px solid ' + C.border), background: 'transparent', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setEditingId(post.id); setEditCaption(post.caption); setEditHashtags(post.hashtags.join(', ')); }}
                          style={{ padding: '7px 14px', borderRadius: 8, border: ('1px solid ' + C.border), background: 'transparent', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                          ✏️ Edit
                        </button>
                        <button onClick={() => approve(post.id)}
                          style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: C.violet, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          ✓ Approve & Schedule
                        </button>
                        <button onClick={() => skip(post.id)}
                          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', color: C.red, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                          ✗ Skip
                        </button>
                      </>
                    )}
                  </div>

                  {/* Creative Tools */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, paddingTop: 10, borderTop: ('1px solid ' + C.border) }}>
                    <button
                      onClick={() => generateImage(post.id, post.image_prompt, null)}
                      disabled={!!imgGenerating[post.id]}
                      style={{ padding: '5px 12px', borderRadius: 7, border: ('1px solid ' + C.violet + '40'), background: (C.violet + '10'), color: C.violet, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: imgGenerating[post.id] ? 0.6 : 1 }}>
                      {imgGenerating[post.id] ? '⏳ Generating…' : '🖼 Generate Image'}
                    </button>
                    {/* Video / Reel generation — fal.ai Kling 2.1 via Reel Creator */}
                    {reelPolling[post.id] ? (
                      <span style={{ fontSize: 11, padding: '5px 12px', borderRadius: 7,
                        background: 'rgba(59,130,246,0.1)', color: '#3B82F6', border: '1px solid rgba(59,130,246,0.3)' }}>
                        ⏳ Generating Reel... (~60s)
                      </span>
                    ) : post.video_url ? (
                      <div style={{ marginTop: 4 }}>
                        <video src={post.video_url} controls muted
                          style={{ width: '100%', maxHeight: 200, borderRadius: 10, background: '#000', display: 'block' }} />
                        {post.reel_cost_aud && (
                          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
                            {'🎬 A$' + Number(post.reel_cost_aud).toFixed(2) + ' · added to ' + new Date().toLocaleString('en-AU', {month:'long'}) + ' bill'}
                          </p>
                        )}
                      </div>
                    ) : videoJobs[post.id] ? (
                      <span style={{ fontSize: 11, padding: '5px 12px', borderRadius: 7, border: ('1px solid ' + C.blue + '40'), background: (C.blue + '10'), color: videoStatus[post.id]?.status === 'completed' ? C.green : C.blue }}>
                        {videoStatus[post.id]?.status === 'completed' ? '✓ Video ready' : videoStatus[post.id]?.status === 'failed' ? '✗ Failed' : '⏳ Processing…'}
                        {videoStatus[post.id]?.url && <a href={videoStatus[post.id]!.url} target="_blank" rel="noreferrer" style={{ marginLeft: 6, color: C.green }}>▶ Watch</a>}
                      </span>
                    ) : (
                      <a href="/dashboard/reels"
                        style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(127,184,151,0.4)',
                          background: 'rgba(127,184,151,0.1)', color: '#7FB897', fontSize: 11, fontWeight: 600,
                          cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', display: 'inline-block' }}>
                        🎬 Reel Studio →
                      </a>
                    )}
                    {/* Story button — Instagram and Facebook only */}
                    {post.image_url && post.post_type !== 'story'
                      && (post.platform === 'instagram' || post.platform === 'facebook')
                      && !storyPosting[post.id] && (
                      <button onClick={() => publishAsStory(post.id)}
                        style={{ padding: '5px 12px', borderRadius: 7, border: ('1px solid ' + C.violet + '40'),
                          background: (C.violet + '10'), color: C.violet, fontSize: 11, fontWeight: 600,
                          cursor: 'pointer', fontFamily: 'inherit' }}>
                        📤 Story (24h)
                      </button>
                    )}
                    {storyPosting[post.id] && (
                      <span style={{ fontSize: 11, color: C.violet, padding: '5px 0' }}>⏳ Posting story…</span>
                    )}
                    {providers?.voiceover.elevenlabs ? (
                      voiceUrls[post.id] ? (
                        <audio controls src={voiceUrls[post.id]} style={{ height: 28, borderRadius: 7, outline: 'none' }} />
                      ) : (
                        <button onClick={() => { setVoiceOpen(post.id); setVoiceText(post.reel_script || post.caption.slice(0, 500)); }}
                          style={{ padding: '5px 12px', borderRadius: 7, border: ('1px solid ' + C.amber + '40'), background: (C.amber + '10'), color: C.amber, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
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
                        <button onClick={() => setVoiceOpen(null)} style={{ padding: '6px 12px', borderRadius: 7, border: ('1px solid ' + C.border), background: 'transparent', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
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
          <div style={{ background: C.card, border: ('1px solid ' + C.border), borderRadius: 14, overflow: 'hidden' }}>
            {scheduledPosts.map((post, i) => (
              <div key={post.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < scheduledPosts.length - 1 ? ('1px solid ' + C.border) : 'none', flexWrap: 'wrap' }}>
                <PlatformBadge platform={post.platform} />
                <p style={{ flex: 1, minWidth: 120, fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.caption.slice(0, 80)}</p>
                <span style={{ fontSize: 11, color: C.dim, flexShrink: 0 }}>{post.scheduled_for ? new Date(post.scheduled_for).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                <CommunityMirrorChip postId={post.id} value={!!mirrorToCommunity[post.id]} onChange={v => setMirrorToCommunity(p => ({ ...p, [post.id]: v }))} />
                <button onClick={() => publish(post.id)} disabled={publishing[post.id]}
                  style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: publishing[post.id] ? 'rgba(29,158,117,0.5)' : C.green, color: '#fff', fontSize: 11, fontWeight: 700, cursor: publishing[post.id] ? 'wait' : 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                  {publishing[post.id] ? '⏳ Posting…' : 'Publish now'}
                </button>
                <button onClick={() => skip(post.id)}
                  style={{ padding: '5px 8px', borderRadius: 7, border: ('1px solid ' + C.border), background: 'transparent', color: C.dim, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
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
          <div style={{ background: C.card, border: ('1px solid ' + C.border), borderRadius: 14, overflow: 'hidden' }}>
            {publishedPosts.map((post, i) => (
              <div key={post.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: i < publishedPosts.length - 1 ? ('1px solid ' + C.border) : 'none', flexWrap: 'wrap' }}>
                <PlatformBadge platform={post.platform} />
                <p style={{ flex: 1, fontSize: 12, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 80 }}>{post.caption.slice(0, 60)}</p>
                {savedMetrics[post.id] && (
                  <span style={{ fontSize: 10, color: '#7FB897', flexShrink: 0 }}>
                    {savedMetrics[post.id].impressions ? savedMetrics[post.id].impressions + ' imp · ' : ''}{savedMetrics[post.id].likes || 0}♥
                  </span>
                )}
                <span style={{ fontSize: 11, color: C.dim, flexShrink: 0 }}>{post.published_at ? new Date(post.published_at).toLocaleDateString('en-AU') : '—'}</span>
                <button onClick={() => { setMetricsModal({ postId: post.id }); setMetricsForm({ impressions: '', likes: '', comments: '', shares: '', saves: '' }); }}
                  style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(127,184,151,0.3)', background: 'rgba(127,184,151,0.06)', color: '#7FB897', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                  Log metrics
                </button>
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: 'rgba(34,197,94,0.1)', color: C.green, flexShrink: 0 }}>Published ✓</span>
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
          <div style={{ background: C.card, border: ('1px solid ' + C.border), borderRadius: 16, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Brand voice */}
            <div>
              <label style={S}>Brand Voice</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {['friendly','professional','casual','excited'].map(v => (
                  <button key={v} onClick={() => setPrefs(p => ({ ...p, brand_voice: v }))}
                    style={{ padding: '6px 14px', borderRadius: 20, border: ('1px solid ' + prefs.brand_voice === v ? C.violet : C.border), background: prefs.brand_voice === v ? 'rgba(139,92,246,0.15)' : 'transparent', color: prefs.brand_voice === v ? C.violet : C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
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
                    style={{ padding: '6px 12px', borderRadius: 20, border: ('1px solid ' + prefs.post_frequency === v ? C.violet : C.border), background: prefs.post_frequency === v ? 'rgba(139,92,246,0.15)' : 'transparent', color: prefs.post_frequency === v ? C.violet : C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
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
      </>
      )}

      {/* Reels section (D5) */}
      {reelsSection === 'reels' && (
      <div>
        {/* Billing summary */}
        {reelBillingThisMonth ? (
          <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <p style={{ fontSize: 11, color: '#60A5FA', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, fontWeight: 700 }}>This month</p>
              <p style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{reelBillingThisMonth.reel_count} Reels</p>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>A${reelBillingThisMonth.total_cost_aud.toFixed(2)} generated</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Added to your monthly Aria invoice</p>
            </div>
          </div>
        ) : (
          <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: '#F59E0B', fontWeight: 600, marginBottom: 4 }}>🎬 AI Reels — metered billing</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>$0.56–$1.68 AUD per Reel · charged monthly · only pay when you use it</p>
          </div>
        )}

        {/* Create New Reel button → Reel Studio */}
        <div style={{ marginBottom: 24 }}>
          <a href="/dashboard/reels"
            style={{ padding: '12px 28px', borderRadius: 12, border: 'none', background: '#7FB897', color: '#0f1117', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            Open Reel Studio →
          </a>
          <span style={{ marginLeft: 14, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            Estimated A${calcReelCostDisplay(15)} per 15s Reel
          </span>
        </div>

        {/* AI Influencer library teaser */}
        {influencerLibrary.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              AI Influencers <span style={{ color: '#7FB897', fontSize: 10 }}>INCLUDED</span>
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
              {influencerLibrary.slice(0, 6).map(inf => (
                <div key={inf.id} onClick={() => generateVideo('standalone', null)}
                  style={{ borderRadius: 10, overflow: 'hidden', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                  <img src={inf.image_url} alt={inf.name}
                    style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', display: 'block' }} />
                  <div style={{ padding: '8px 10px' }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inf.name}</p>
                    {inf.is_featured && <p style={{ fontSize: 9, color: '#7FB897', marginTop: 2, fontWeight: 700 }}>FEATURED</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Reels */}
        {posts.filter(p => p.post_type === 'reel').length > 0 ? (
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recent Reels</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
              {posts.filter(p => p.post_type === 'reel').slice(0, 8).map(p => (
                <div key={p.id} style={{ borderRadius: 12, overflow: 'hidden', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  {p.video_url ? (
                    <video src={p.video_url} muted controls style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover', display: 'block', background: '#000' }} />
                  ) : reelPolling[p.id] ? (
                    <div style={{ width: '100%', aspectRatio: '9/16', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
                      <span style={{ fontSize: 24 }}>⏳</span>
                      <span style={{ fontSize: 11, color: '#60A5FA' }}>Generating…</span>
                    </div>
                  ) : (
                    <div style={{ width: '100%', aspectRatio: '9/16', background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 28 }}>🎬</span>
                    </div>
                  )}
                  <div style={{ padding: '8px 10px' }}>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.caption?.slice(0, 40) || 'Reel'}</p>
                    {p.reel_cost_aud && <p style={{ fontSize: 10, color: '#F59E0B', marginTop: 3 }}>A${Number(p.reel_cost_aud).toFixed(2)}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎬</div>
            <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>No Reels yet</p>
            <p style={{ fontSize: 13 }}>Click "Create New Reel" to generate your first AI video</p>
          </div>
        )}
      </div>
      )}

    </div>
      )}

      {/* ── Reel Creator Panel ─────────────────────────────────────────── */}
      {reelCreatorPostId && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => !reelGenerating && setReelCreatorPostId(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'relative', width: '100%', maxWidth: 600,
              maxHeight: '94vh', overflowY: 'auto',
              background: 'linear-gradient(160deg, #0f1117 0%, #111820 100%)',
              border: '1px solid rgba(127,184,151,0.18)',
              borderRadius: '24px 24px 0 0',
              boxShadow: '0 -24px 80px rgba(0,0,0,0.6)',
            }}
          >
            {/* Handle bar */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
              <div style={{ width: 40, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.15)' }} />
            </div>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px 0' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: -0.3 }}>Create Reel</div>
                <div style={{ fontSize: 12, color: 'rgba(127,184,151,0.8)', marginTop: 2 }}>AI-generated · 9:16 vertical · fal.ai</div>
              </div>
              <button
                onClick={() => !reelGenerating && setReelCreatorPostId(null)}
                style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}
                aria-label="Close"
              >×</button>
            </div>

            {!reelsEnabled ? (
              <div style={{ padding: '40px 24px 48px', textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 16px' }}>🎬</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Enable AI Reels</div>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 8, lineHeight: 1.6 }}>Create short video content for your business using AI.</p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 24 }}>$0.56–$1.12 AUD per Reel · Billed monthly · Cancel any time</p>
                <button onClick={enableReels} disabled={reelsLoading}
                  style={{ padding: '13px 32px', borderRadius: 12, border: 'none', background: '#F59E0B', color: '#0f1117', fontSize: 14, fontWeight: 800, cursor: reelsLoading ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                  {reelsLoading ? 'Enabling…' : 'Enable AI Reels'}
                </button>
              </div>
            ) : (
              <div style={{ padding: '20px 24px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Mode selector */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Generation mode</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                    {([['auto', '✦', 'Auto'], ['image', '⬡', 'From image'], ['text', '◈', 'Text only']] as const).map(([v, icon, label]) => (
                      <button key={v} onClick={() => setReelMode(v)}
                        style={{
                          padding: '11px 6px', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          background: reelMode === v ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.04)',
                          boxShadow: reelMode === v ? 'inset 0 0 0 1.5px rgba(245,158,11,0.5)' : 'inset 0 0 0 1px rgba(255,255,255,0.07)',
                          color: reelMode === v ? '#F59E0B' : 'rgba(255,255,255,0.45)',
                          transition: 'all 150ms ease',
                        }}>
                        <div style={{ fontSize: 16, marginBottom: 3 }}>{icon}</div>
                        <div style={{ fontSize: 11, fontWeight: 700 }}>{label}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Image upload — shown when mode=image OR always as optional */}
                {(reelMode === 'image' || reelMode === 'auto') && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                      {reelMode === 'image' ? 'Source image (required)' : 'Start frame (optional)'}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      {/* Upload button */}
                      <label style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 10, cursor: 'pointer',
                        border: '1.5px dashed rgba(127,184,151,0.4)', background: 'rgba(127,184,151,0.04)',
                        color: '#7FB897', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                      }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        Upload photo
                        <input type="file" accept="image/*" style={{ display: 'none' }}
                          onChange={async e => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            const reader = new FileReader()
                            reader.onload = ev => setReelSourceImage(ev.target?.result as string)
                            reader.readAsDataURL(file)
                          }} />
                      </label>
                      {/* Post image shortcut */}
                      {posts.find(p => p.id === reelCreatorPostId)?.image_url && (
                        <button onClick={() => setReelSourceImage(posts.find(p => p.id === reelCreatorPostId)?.image_url || null)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, border: 'none',
                            background: reelSourceImage === posts.find(p => p.id === reelCreatorPostId)?.image_url ? 'rgba(127,184,151,0.15)' : 'rgba(255,255,255,0.06)',
                            boxShadow: reelSourceImage === posts.find(p => p.id === reelCreatorPostId)?.image_url ? 'inset 0 0 0 1.5px rgba(127,184,151,0.5)' : 'none',
                            color: 'rgba(255,255,255,0.7)',
                          }}>
                          <img src={posts.find(p => p.id === reelCreatorPostId)?.image_url!} alt="" style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'cover' }} />
                          Post image
                        </button>
                      )}
                      {/* Asset library */}
                      {assetLibrary.slice(0, 3).map(a => (
                        <button key={a.id} onClick={() => setReelSourceImage(a.url)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, border: 'none',
                            background: reelSourceImage === a.url ? 'rgba(127,184,151,0.15)' : 'rgba(255,255,255,0.06)',
                            boxShadow: reelSourceImage === a.url ? 'inset 0 0 0 1.5px rgba(127,184,151,0.5)' : 'none',
                            color: 'rgba(255,255,255,0.7)',
                          }}>
                          <img src={a.url} alt="" style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'cover' }} />
                          {a.name.slice(0, 10)}
                        </button>
                      ))}
                    </div>
                    {/* Preview selected image */}
                    {reelSourceImage && (
                      <div style={{ marginTop: 10, position: 'relative', display: 'inline-block' }}>
                        <img src={reelSourceImage} alt="Selected frame" style={{ height: 80, width: 'auto', borderRadius: 8, objectFit: 'cover', border: '1.5px solid rgba(127,184,151,0.4)' }} />
                        <button onClick={() => setReelSourceImage(null)}
                          style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: '#EF4444', color: '#fff', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>×</button>
                      </div>
                    )}
                  </div>
                )}

                {/* AI Influencer */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      AI Influencer <span style={{ color: '#7FB897', fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 99, background: 'rgba(127,184,151,0.12)', marginLeft: 4 }}>INCLUDED</span>
                    </div>
                    {selectedInfluencerId && (
                      <button onClick={() => { setSelectedInfluencerId(null); setSelectedInfluencerUrl(null) }}
                        style={{ fontSize: 11, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
                    )}
                  </div>

                  {selectedInfluencerId ? (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 14px', background: 'rgba(127,184,151,0.06)', border: '1.5px solid rgba(127,184,151,0.25)', borderRadius: 14 }}>
                      <img src={selectedInfluencerUrl!} alt="influencer" style={{ width: 52, height: 68, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{influencerLibrary.find(i => i.id === selectedInfluencerId)?.name}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2, lineHeight: 1.5 }}>{influencerLibrary.find(i => i.id === selectedInfluencerId)?.description}</div>
                        <button onClick={() => setShowInfluencerPicker(true)} style={{ fontSize: 11, color: '#7FB897', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginTop: 6, padding: 0, fontWeight: 600 }}>Change influencer →</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setShowInfluencerPicker(true)}
                      style={{ width: '100%', padding: '14px 16px', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', border: '1.5px dashed rgba(127,184,151,0.25)', background: 'rgba(127,184,151,0.03)', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(127,184,151,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7FB897" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                      </div>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Add AI Influencer</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>Optional · Animates a person into your Reel</div>
                      </div>
                    </button>
                  )}

                  {/* Influencer picker overlay */}
                  {showInfluencerPicker && (
                    <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'linear-gradient(160deg, #0f1117 0%, #111820 100%)', borderRadius: '24px 24px 0 0', padding: '20px 20px 40px', overflowY: 'auto' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>Choose Influencer</div>
                        <button onClick={() => setShowInfluencerPicker(false)}
                          style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>×</button>
                      </div>
                      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 16, lineHeight: 1.6 }}>Their photo becomes the start frame. Aria animates them visiting your business.</p>

                      <div onClick={() => { setSelectedInfluencerId(null); setSelectedInfluencerUrl(null); setShowInfluencerPicker(false) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, marginBottom: 14, cursor: 'pointer', border: '1.5px solid ' + (!selectedInfluencerId ? 'rgba(127,184,151,0.5)' : 'rgba(255,255,255,0.07)'), background: !selectedInfluencerId ? 'rgba(127,184,151,0.06)' : 'transparent' }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🚫</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>No influencer</div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Animate your product or scene only</div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {influencerLibrary.map(inf => (
                          <div key={inf.id} onClick={() => { setSelectedInfluencerId(inf.id); setSelectedInfluencerUrl(inf.image_url); setShowInfluencerPicker(false) }}
                            style={{ borderRadius: 14, overflow: 'hidden', cursor: 'pointer', border: '2px solid ' + (selectedInfluencerId === inf.id ? '#7FB897' : 'rgba(255,255,255,0.07)'), background: selectedInfluencerId === inf.id ? 'rgba(127,184,151,0.06)' : 'rgba(255,255,255,0.02)', transition: 'border-color 150ms' }}>
                            <div style={{ position: 'relative', aspectRatio: '3/4', overflow: 'hidden' }}>
                              <img src={inf.image_url} alt={inf.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              {inf.is_featured && (<div style={{ position: 'absolute', top: 8, left: 8, background: '#7FB897', color: '#0f1117', fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 99, letterSpacing: '0.05em' }}>FEATURED</div>)}
                              {selectedInfluencerId === inf.id && (<div style={{ position: 'absolute', inset: 0, background: 'rgba(127,184,151,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 28, height: 28, borderRadius: '50%', background: '#7FB897', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#fff' }}>✓</div></div>)}
                            </div>
                            <div style={{ padding: '10px 12px' }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{inf.name}</div>
                              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2, lineHeight: 1.5 }}>{inf.description?.slice(0, 55)}</div>
                              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 6 }}>
                                {inf.industry_tags?.slice(0, 2).map(t => (<span key={t} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: 'rgba(127,184,151,0.1)', color: '#7FB897', fontWeight: 700, textTransform: 'capitalize' }}>{t}</span>))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Style presets */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Vibe</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                    {([['lifestyle','☀️','Lifestyle'],['product_showcase','📦','Product'],['behind_scenes','🎥','BTS'],['flash_sale','⚡','Flash sale'],['testimonial','💬','Testimonial'],['day_in_life','🌅','Day in life']] as const).map(([v, icon, l]) => (
                      <button key={v} onClick={() => setReelStyle(v)}
                        style={{ padding: '9px 4px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center', background: reelStyle === v ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)', boxShadow: reelStyle === v ? 'inset 0 0 0 1.5px rgba(245,158,11,0.45)' : 'inset 0 0 0 1px rgba(255,255,255,0.06)', transition: 'all 150ms' }}>
                        <div style={{ fontSize: 16, marginBottom: 3 }}>{icon}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: reelStyle === v ? '#F59E0B' : 'rgba(255,255,255,0.5)' }}>{l}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Scene prompt */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Scene / concept <span style={{ color: 'rgba(255,255,255,0.2)', textTransform: 'none', fontWeight: 400 }}>optional</span></div>
                  <textarea value={reelCustomPrompt} onChange={e => setReelCustomPrompt(e.target.value)} rows={3}
                    placeholder={selectedInfluencerId ? (influencerLibrary.find(i => i.id === selectedInfluencerId)?.name ?? 'Influencer') + ' walks into your café, looks around, smiles warmly at the camera — cozy morning light' : reelMode === 'image' ? 'e.g. Camera slowly zooms into the coffee cup as steam rises, warm morning light' : 'e.g. Busy Melbourne café at morning rush, barista making flat white, cosy warm atmosphere'}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', color: '#fff', fontSize: 13, fontFamily: 'inherit', resize: 'none', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box' }} />
                </div>

                {/* Duration + music row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Duration</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {([5, 10, 15] as const).map(d => (
                        <button key={d} onClick={() => { setReelDuration(d); setReelDurationCustom('') }}
                          style={{ flex: '1 1 28%', minWidth: 44, padding: '9px 4px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, background: reelDuration === d && !reelDurationCustom ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.04)', boxShadow: reelDuration === d && !reelDurationCustom ? 'inset 0 0 0 1.5px rgba(245,158,11,0.5)' : 'inset 0 0 0 1px rgba(255,255,255,0.07)', color: reelDuration === d && !reelDurationCustom ? '#F59E0B' : 'rgba(255,255,255,0.4)', transition: 'all 150ms' }}>
                          {d}s
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <input
                        type="number" min={3} max={10} placeholder="Custom (3–30s)"
                        value={reelDurationCustom}
                        onChange={e => { setReelDurationCustom(e.target.value); if (e.target.value) setReelDuration(Number(e.target.value)) }}
                        style={{ flex: 1, padding: '8px 10px', borderRadius: 9, background: 'rgba(255,255,255,0.04)', border: reelDurationCustom ? '1.5px solid rgba(245,158,11,0.5)' : '1px solid rgba(255,255,255,0.09)', color: reelDurationCustom ? '#F59E0B' : '#fff', fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
                      />
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', whiteSpace: 'nowrap' }}>s (max 10)</span>
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 5 }}>Up to 15s · Higgsfield Seedance / Wan 2.7 · 9:16</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Music</div>
                    <select value={reelBgMusic} onChange={e => setReelBgMusic(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', color: '#fff', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}>
                      <option value="none">None</option>
                      <option value="upbeat">Upbeat</option>
                      <option value="warm">Warm & cosy</option>
                      <option value="minimal">Minimal</option>
                      <option value="energetic">Energetic</option>
                    </select>
                  </div>
                </div>

                {/* Cost + CTA */}
                <div style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Estimated cost</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>Charged to your monthly Aria invoice</div>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#F59E0B' }}>${calcReelCostDisplay(reelDuration)} AUD</div>
                </div>

                <button onClick={submitReelGeneration} disabled={reelGenerating}
                  style={{ width: '100%', padding: '15px', borderRadius: 14, border: 'none', cursor: reelGenerating ? 'wait' : 'pointer', fontFamily: 'inherit', fontSize: 15, fontWeight: 800, letterSpacing: -0.2, background: reelGenerating ? 'rgba(245,158,11,0.35)' : 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)', color: reelGenerating ? 'rgba(255,255,255,0.5)' : '#0f1117', boxShadow: reelGenerating ? 'none' : '0 4px 20px rgba(245,158,11,0.3)', transition: 'all 200ms ease' }}>
                  {reelGenerating ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                      <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                      Generating your Reel…
                    </span>
                  ) : `Generate Reel — $${calcReelCostDisplay(reelDuration)} AUD`}
                </button>

                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}
          </div>
        </div>
      )}


      {/* ── Reels Addon Modal ──────────────────────────────────────────── */}
      {showReelsModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.75)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: 24,
        }} onClick={() => setShowReelsModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-surface)', border: '1px solid rgba(251,191,36,0.25)',
            borderRadius: 18, padding: '32px 28px', maxWidth: 460, width: '100%',
          }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>🎬</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 10px', color: 'var(--text-primary)' }}>
              AI Reels — Add-on Feature
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 20 }}>
              Aria can automatically generate short video Reels for your Instagram and Facebook using fal.ai Kling 2.1 — featuring your top products and real sales data.
            </p>
            <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)',
              borderRadius: 12, padding: '14px 16px', marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#F59E0B', marginBottom: 8 }}>
                ⚡ What this costs
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                Each AI Reel costs approximately <strong style={{ color: 'var(--text-primary)' }}>$0.56–$1.68 AUD</strong> in video generation fees.<br/>
                Charged per Reel generated — you only pay when you use it.<br/>
                Added to your monthly Aria invoice.<br/>
                You can disable this at any time in Social Settings.
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 24, lineHeight: 1.6 }}>
              By clicking Enable, you confirm you understand that AI Reel generation incurs additional charges per video generated, billed monthly.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowReelsModal(false)}
                style={{ flex: 1, padding: '11px 0', borderRadius: 10, fontFamily: 'inherit',
                  fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--text-secondary)' }}>
                Cancel
              </button>
              <button onClick={enableReels} disabled={reelsLoading}
                style={{ flex: 2, padding: '11px 0', borderRadius: 10, fontFamily: 'inherit',
                  fontWeight: 700, fontSize: 14, cursor: reelsLoading ? 'wait' : 'pointer',
                  background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.4)',
                  color: '#F59E0B' }}>
                {reelsLoading ? 'Enabling…' : '✓ Enable AI Reels — I understand the cost'}
              </button>
            </div>
          </div>
        </div>
      )}

      {metricsModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => !savingMetrics && setMetricsModal(null)}>
          <div style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400 }}
            onClick={e => e.stopPropagation()}>
            <p style={{ color: '#fff', fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Log post metrics</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {([['impressions', 'Impressions'], ['likes', 'Likes'], ['comments', 'Comments'], ['shares', 'Shares'], ['saves', 'Saves']] as [string, string][]).map(([field, label]) => (
                <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', width: 90 }}>{label}</label>
                  <input type="number" min="0"
                    value={metricsForm[field as keyof typeof metricsForm]}
                    onChange={e => setMetricsForm(prev => ({ ...prev, [field]: e.target.value }))}
                    style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '7px 12px', color: '#fff', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button disabled={savingMetrics} onClick={async () => {
                setSavingMetrics(true)
                try {
                  await fetch('/api/social/posts/' + metricsModal.postId + '/metrics', {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      impressions: metricsForm.impressions ? parseInt(metricsForm.impressions) : undefined,
                      likes: metricsForm.likes ? parseInt(metricsForm.likes) : undefined,
                      comments: metricsForm.comments ? parseInt(metricsForm.comments) : undefined,
                      shares: metricsForm.shares ? parseInt(metricsForm.shares) : undefined,
                      saves: metricsForm.saves ? parseInt(metricsForm.saves) : undefined,
                    }),
                  })
                  setSavedMetrics(prev => ({ ...prev, [metricsModal.postId]: {
                    impressions: parseInt(metricsForm.impressions) || 0,
                    likes: parseInt(metricsForm.likes) || 0,
                    comments: parseInt(metricsForm.comments) || 0,
                  }}))
                  setMetricsModal(null)
                  setMetricsForm({ impressions: '', likes: '', comments: '', shares: '', saves: '' })
                } catch (e) { console.warn('[non-fatal]', e) }
                setSavingMetrics(false)
              }} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: '#7FB897', color: '#0E1411', fontSize: 13, fontWeight: 700, cursor: savingMetrics ? 'default' : 'pointer', fontFamily: 'inherit', opacity: savingMetrics ? 0.6 : 1 }}>
                {savingMetrics ? 'Saving…' : 'Save metrics'}
              </button>
              <button onClick={() => setMetricsModal(null)} disabled={savingMetrics}
                style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
