'use client'
import { useState, useEffect, useCallback } from 'react'

const C = {
  bg: 'var(--bg-base)', card: 'var(--bg-surface)',
  border: 'rgba(0,229,255,0.08)', text: 'var(--text-primary)',
  muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)',
  cyan: '#00E5FF', green: '#22C55E', red: '#EF4444',
  amber: '#F59E0B', purple: '#8B5CF6',
}

interface Business {
  id: string; name: string; industry: string; suburb: string | null;
  state: string | null; is_active: boolean;
}

interface InfluencerPost {
  id: string; featured_business_id: string | null; video_url: string | null;
  image_url: string | null; caption: string; hashtags: string[];
  scene_prompt: string | null; industry: string | null;
  status: string; instagram_post_id: string | null;
  published_at: string | null; created_at: string;
  business_name?: string;
}

interface Config {
  id: string; master_image_url: string; character_name: string;
  character_bio: string; ariaos_instagram_account_id: string | null;
  ariaos_page_access_token: string | null; is_active: boolean;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    draft:     { bg: 'rgba(251,191,36,0.12)',  color: C.amber },
    approved:  { bg: 'rgba(34,197,94,0.12)',   color: C.green },
    published: { bg: 'rgba(0,229,255,0.12)',   color: C.cyan  },
    failed:    { bg: 'rgba(239,68,68,0.12)',   color: C.red   },
  }
  const s = colors[status] ?? colors.draft
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
      background: s.bg, color: s.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {status}
    </span>
  )
}

export default function AdminInfluencerPage() {
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [posts, setPosts] = useState<InfluencerPost[]>([])
  const [config, setConfig] = useState<Config | null>(null)
  const [selectedBizId, setSelectedBizId] = useState<string>('')
  const [generating, setGenerating] = useState(false)
  const [publishing, setPublishing] = useState<string | null>(null)
  const [approving, setApproving] = useState<string | null>(null)
  const [tab, setTab] = useState<'queue' | 'history' | 'config'>( 'queue')
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // Config edit state
  const [editMasterUrl, setEditMasterUrl] = useState('')
  const [editIgAccountId, setEditIgAccountId] = useState('')
  const [editIgToken, setEditIgToken] = useState('')
  const [savingConfig, setSavingConfig] = useState(false)

  const load = useCallback(async () => {
    const [bizRes, postsRes, configRes] = await Promise.all([
      fetch('/api/admin/influencer/businesses'),
      fetch('/api/admin/influencer/posts'),
      fetch('/api/admin/influencer/config'),
    ])
    if (bizRes.ok) setBusinesses(await bizRes.json().then(d => d.businesses ?? []))
    if (postsRes.ok) setPosts(await postsRes.json().then(d => d.posts ?? []))
    if (configRes.ok) {
      const cfg = await configRes.json().then(d => d.config)
      setConfig(cfg)
      if (cfg) {
        setEditMasterUrl(cfg.master_image_url ?? '')
        setEditIgAccountId(cfg.ariaos_instagram_account_id ?? '')
        setEditIgToken(cfg.ariaos_page_access_token ?? '')
      }
    }
  }, [])

  useEffect(() => { load() }, [load])

  const generate = async () => {
    setGenerating(true); setMsg(null)
    const res = await fetch('/api/aria/influencer/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: selectedBizId || undefined }),
    })
    const d = await res.json()
    if (d.ok) {
      setMsg({ text: `✅ Reel generated for ${d.featured_business}. Review in queue.`, ok: true })
      await load()
      setTab('queue')
    } else {
      setMsg({ text: '❌ ' + (d.error ?? 'Generation failed'), ok: false })
    }
    setGenerating(false)
  }

  const approve = async (postId: string) => {
    setApproving(postId)
    const res = await fetch('/api/admin/influencer/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: postId }),
    })
    const d = await res.json()
    if (d.ok) await load()
    else setMsg({ text: '❌ ' + (d.error ?? 'Approve failed'), ok: false })
    setApproving(null)
  }

  const publish = async (postId: string) => {
    setPublishing(postId)
    const res = await fetch('/api/aria/influencer/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: postId }),
    })
    const d = await res.json()
    if (d.ok) {
      setMsg({ text: '✅ Published to @ariaos.au Instagram!', ok: true })
      await load()
    } else {
      setMsg({ text: '❌ ' + (d.error ?? 'Publish failed'), ok: false })
    }
    setPublishing(null)
  }

  const saveConfig = async () => {
    setSavingConfig(true)
    const res = await fetch('/api/admin/influencer/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        master_image_url: editMasterUrl,
        ariaos_instagram_account_id: editIgAccountId || null,
        ariaos_page_access_token: editIgToken || null,
      }),
    })
    const d = await res.json()
    if (d.ok) { setMsg({ text: '✅ Config saved', ok: true }); await load() }
    else setMsg({ text: '❌ ' + (d.error ?? 'Save failed'), ok: false })
    setSavingConfig(false)
  }

  const queuePosts = posts.filter(p => p.status === 'draft' || p.status === 'approved')
  const historyPosts = posts.filter(p => p.status === 'published' || p.status === 'failed')
  const isConnected = !!config?.ariaos_instagram_account_id && !!config?.ariaos_page_access_token

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 10, color: C.cyan, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
          Aria Admin
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
          AI Influencer Studio
        </h1>
        <p style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>
          Generate Reels featuring the Aria AI influencer visiting registered businesses. Posts to @ariaos.au Instagram.
        </p>
      </div>

      {/* Status bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ padding: '8px 14px', borderRadius: 10, background: C.card, border: '1px solid ' + C.border, fontSize: 12 }}>
          <span style={{ color: C.dim }}>Businesses: </span>
          <span style={{ color: C.text, fontWeight: 700 }}>{businesses.length} registered</span>
        </div>
        <div style={{ padding: '8px 14px', borderRadius: 10, background: C.card, border: '1px solid ' + C.border, fontSize: 12 }}>
          <span style={{ color: C.dim }}>Instagram: </span>
          <span style={{ color: isConnected ? C.green : C.amber, fontWeight: 700 }}>
            {isConnected ? '@ariaos.au connected' : 'Not connected — set up in Config'}
          </span>
        </div>
        <div style={{ padding: '8px 14px', borderRadius: 10, background: C.card, border: '1px solid ' + C.border, fontSize: 12 }}>
          <span style={{ color: C.dim }}>Character: </span>
          <span style={{ color: config?.master_image_url ? C.green : C.amber, fontWeight: 700 }}>
            {config?.master_image_url ? 'Master image set' : 'No master image'}
          </span>
        </div>
      </div>

      {/* Message */}
      {msg && (
        <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: msg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          border: '1px solid ' + (msg.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'),
          color: msg.ok ? C.green : C.red }}>
          {msg.text}
        </div>
      )}

      {/* Generate panel */}
      <div style={{ background: 'linear-gradient(135deg, rgba(0,229,255,0.06) 0%, rgba(10,12,20,0.95) 100%)',
        border: '1px solid rgba(0,229,255,0.15)', borderRadius: 14, padding: '20px 22px', marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.cyan, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
          ✦ Generate New Reel
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={{ fontSize: 11, color: C.dim, display: 'block', marginBottom: 6 }}>Feature a specific business (or leave blank to auto-pick most active)</label>
            <select
              value={selectedBizId}
              onChange={e => setSelectedBizId(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)', color: C.text, fontSize: 13, fontFamily: 'inherit' }}>
              <option value={''}>Auto-pick most active business this week</option>
              {businesses.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name} — {b.industry} {b.suburb ? `(${b.suburb})` : ''}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={generate}
            disabled={generating || !config?.master_image_url}
            style={{ padding: '10px 22px', borderRadius: 9, fontFamily: 'inherit', fontWeight: 700,
              fontSize: 13, cursor: generating ? 'wait' : 'pointer',
              background: 'rgba(0,229,255,0.12)', border: '1px solid rgba(0,229,255,0.3)',
              color: C.cyan, opacity: generating || !config?.master_image_url ? 0.5 : 1,
              whiteSpace: 'nowrap' }}>
            {generating ? '⏳ Generating Reel (~60s)…' : '✦ Generate Reel'}
          </button>
        </div>
        {!config?.master_image_url && (
          <p style={{ fontSize: 11, color: C.amber, marginTop: 10 }}>
            ⚠ Set master image URL in Config tab first
          </p>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {(['queue', 'history', 'config'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '7px 16px', borderRadius: 8, fontFamily: 'inherit', fontWeight: 700,
            fontSize: 12, cursor: 'pointer', border: '1px solid',
            textTransform: 'capitalize',
            background: tab === t ? 'rgba(0,229,255,0.12)' : 'transparent',
            borderColor: tab === t ? 'rgba(0,229,255,0.4)' : 'rgba(255,255,255,0.08)',
            color: tab === t ? C.cyan : C.muted,
          }}>
            {t === 'queue' ? `Queue (${queuePosts.length})` : t === 'history' ? `Published (${historyPosts.length})` : 'Config'}
          </button>
        ))}
      </div>

      {/* Queue tab */}
      {tab === 'queue' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {queuePosts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: C.dim, fontSize: 13 }}>
              No posts in queue. Generate a Reel above to get started.
            </div>
          ) : queuePosts.map(post => (
            <PostCard key={post.id} post={post} businesses={businesses}
              onApprove={() => approve(post.id)}
              onPublish={() => publish(post.id)}
              approving={approving === post.id}
              publishing={publishing === post.id} />
          ))}
        </div>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {historyPosts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: C.dim, fontSize: 13 }}>
              No published posts yet.
            </div>
          ) : historyPosts.map(post => (
            <PostCard key={post.id} post={post} businesses={businesses}
              onApprove={() => {}} onPublish={() => {}}
              approving={false} publishing={false} />
          ))}
        </div>
      )}

      {/* Config tab */}
      {tab === 'config' && (
        <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 14, padding: '24px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 20 }}>Influencer Configuration</div>

          {/* Master image preview */}
          {editMasterUrl && (
            <div style={{ marginBottom: 20 }}>
              <img src={editMasterUrl} alt="Aria influencer"
                style={{ width: 120, height: 200, objectFit: 'cover', borderRadius: 10, border: '1px solid ' + C.border }} />
              <p style={{ fontSize: 11, color: C.dim, marginTop: 6 }}>Current master image</p>
            </div>
          )}

          {[
            { label: 'Master Image URL (Higgsfield CDN URL of her character image)', val: editMasterUrl, set: setEditMasterUrl, placeholder: 'https://cdn.higgsfield.ai/...' },
            { label: '@ariaos.au Instagram Account ID', val: editIgAccountId, set: setEditIgAccountId, placeholder: '17841400000000000' },
            { label: '@ariaos.au Page Access Token', val: editIgToken, set: setEditIgToken, placeholder: 'EAAG...' },
          ].map(({ label, val, set, placeholder }) => (
            <div key={label} style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: C.dim, display: 'block', marginBottom: 6 }}>{label}</label>
              <input
                value={val} onChange={e => set(e.target.value)} placeholder={placeholder}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)', color: C.text, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
          ))}

          <div style={{ marginTop: 8, padding: '12px 14px', borderRadius: 10, background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.1)', fontSize: 12, color: C.muted, marginBottom: 16 }}>
            <strong style={{ color: C.cyan }}>How to get Instagram credentials:</strong><br/>
            1. Create @ariaos.au as a Business Instagram account linked to a Facebook Page<br/>
            2. Connect it via your existing Aria Facebook OAuth at /dashboard/social<br/>
            3. Copy the instagram_account_id and access_token from the social_connections table<br/>
            4. Paste them here
          </div>

          <button onClick={saveConfig} disabled={savingConfig}
            style={{ padding: '10px 22px', borderRadius: 9, fontFamily: 'inherit', fontWeight: 700,
              fontSize: 13, cursor: savingConfig ? 'wait' : 'pointer',
              background: 'rgba(0,229,255,0.12)', border: '1px solid rgba(0,229,255,0.3)',
              color: C.cyan }}>
            {savingConfig ? 'Saving…' : 'Save Config'}
          </button>
        </div>
      )}
    </div>
  )
}

function PostCard({ post, businesses, onApprove, onPublish, approving, publishing }: {
  post: InfluencerPost; businesses: Business[];
  onApprove: () => void; onPublish: () => void;
  approving: boolean; publishing: boolean;
}) {
  const biz = businesses.find(b => b.id === post.featured_business_id)
  const C = { card: 'var(--bg-surface)', border: 'rgba(0,229,255,0.08)', text: 'var(--text-primary)',
    muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)', cyan: '#00E5FF', green: '#22C55E', amber: '#F59E0B' }

  return (
    <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 0 }}>
        {/* Video preview */}
        <div style={{ width: 100, flexShrink: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {post.video_url ? (
            <video src={post.video_url} style={{ width: 100, height: 160, objectFit: 'cover' }} controls muted />
          ) : (
            <div style={{ fontSize: 28, padding: 16 }}>🎬</div>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <StatusBadge status={post.status} />
            {biz && (
              <span style={{ fontSize: 12, color: C.muted }}>
                featuring <strong style={{ color: C.text }}>{biz.name}</strong> — {biz.industry}
              </span>
            )}
            <span style={{ fontSize: 11, color: C.dim, marginLeft: 'auto' }}>
              {new Date(post.created_at).toLocaleDateString('en-AU')}
            </span>
          </div>

          <p style={{ fontSize: 13, color: C.text, lineHeight: 1.6, marginBottom: 8 }}>{post.caption}</p>

          {post.hashtags?.length > 0 && (
            <p style={{ fontSize: 11, color: C.cyan, marginBottom: 12 }}>
              {post.hashtags.map(h => `#${h}`).join(' ')}
            </p>
          )}

          {post.instagram_post_id && (
            <p style={{ fontSize: 11, color: C.dim, marginBottom: 12 }}>
              Instagram post ID: {post.instagram_post_id}
            </p>
          )}

          {/* Actions */}
          {post.status === 'draft' && (
            <button onClick={onApprove} disabled={approving}
              style={{ padding: '7px 16px', borderRadius: 8, fontFamily: 'inherit', fontWeight: 700, fontSize: 12,
                cursor: approving ? 'wait' : 'pointer', background: 'rgba(34,197,94,0.12)',
                border: '1px solid rgba(34,197,94,0.3)', color: C.green }}>
              {approving ? 'Approving…' : '✓ Approve'}
            </button>
          )}
          {post.status === 'approved' && (
            <button onClick={onPublish} disabled={publishing}
              style={{ padding: '7px 16px', borderRadius: 8, fontFamily: 'inherit', fontWeight: 700, fontSize: 12,
                cursor: publishing ? 'wait' : 'pointer', background: 'rgba(0,229,255,0.12)',
                border: '1px solid rgba(0,229,255,0.3)', color: C.cyan }}>
              {publishing ? 'Publishing (~60s)…' : '▶ Publish to @ariaos.au'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
