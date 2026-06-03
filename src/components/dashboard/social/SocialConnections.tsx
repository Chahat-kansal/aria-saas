'use client'
import { useEffect, useState } from 'react'

interface Connection {
  id: string
  platform: 'instagram' | 'facebook' | 'tiktok' | 'google_business'
  platform_account_name: string | null
  account_handle?: string | null
  profile_picture?: string | null
  follower_count?: number | null
  is_active: boolean
  last_synced_at?: string | null
  connected_at?: string | null
}

const PLATFORM_META = {
  instagram: {
    name: 'Instagram',
    icon: '📸',
    color: '#E4405F',
    description: 'Post photos, reels, and stories',
  },
  facebook: {
    name: 'Facebook',
    icon: '👍',
    color: '#1877F2',
    description: 'Post to your Facebook Page',
  },
  tiktok: {
    name: 'TikTok',
    icon: '🎵',
    color: '#010101',
    description: 'Post Reels and short videos',
  },
  google_business: {
    name: 'Google Business',
    icon: '🌐',
    color: '#4285F4',
    description: 'Manage reviews and posts',
  },
} as const

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export default function SocialConnections({ businessId, onChange }: { businessId: string; onChange?: () => void }) {
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading]         = useState(true)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  useEffect(() => {
    if (!businessId) return
    fetch(`/api/social/connections?business_id=${businessId}`)
      .then(r => r.json())
      .then(d => setConnections(d.connections ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [businessId])

  const handleConnect = (platform: string) => {
    if (platform === 'google_business') {
      window.location.href = `/api/social/google/connect?business_id=${businessId}`
    } else if (platform === 'tiktok') {
      window.location.href = `/api/social/connect/tiktok?business_id=${businessId}`
    } else {
      window.location.href = `/api/integrations/connect/${platform}?business_id=${businessId}`
    }
  }

  const handleDisconnect = async (id: string, platformName: string) => {
    if (!confirm(`Disconnect ${platformName}? This will stop Aria from posting to this account.`)) return
    setDisconnecting(id)
    try {
      await fetch(`/api/social/connections/${id}`, { method: 'DELETE' })
      setConnections(prev => prev.filter(c => c.id !== id))
      onChange?.()
    } finally {
      setDisconnecting(null)
    }
  }

  const platforms = ['instagram', 'facebook', 'tiktok', 'google_business'] as const

  return (
    <div style={{
      background: '#13131a',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 16, padding: 24, marginBottom: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h3 style={{ color: 'white', fontSize: 18, fontWeight: 600, margin: '0 0 4px' }}>
            Connected Accounts
          </h3>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: 0 }}>
            Connect your social media accounts so Aria can post and monitor on your behalf
          </p>
        </div>
        <span style={{
          fontSize: 12, padding: '4px 10px', borderRadius: 99,
          background: connections.length > 0 ? 'rgba(127,184,151,0.15)' : 'rgba(255,255,255,0.06)',
          color: connections.length > 0 ? '#7FB897' : 'rgba(255,255,255,0.4)',
          fontWeight: 600,
        }}>
          {connections.length}/4 connected
        </span>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ height: 120, borderRadius: 12, background: 'rgba(255,255,255,0.03)', animation: 'pulse 2s infinite' }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {platforms.map(platform => {
            const conn = connections.find(c => c.platform === platform)
            const meta = PLATFORM_META[platform]
            const isDisconnecting = conn && disconnecting === conn.id

            return (
              <div key={platform} style={{
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${conn ? 'rgba(127,184,151,0.2)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 12, padding: 16,
                transition: 'border-color 0.2s',
              }}>
                {/* Platform header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10,
                    background: meta.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, flexShrink: 0,
                  }}>{meta.icon}</div>
                  <div>
                    <p style={{ color: 'white', fontWeight: 600, margin: 0, fontSize: 14 }}>
                      {meta.name}
                    </p>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, margin: 0 }}>
                      {meta.description}
                    </p>
                  </div>
                  {conn && (
                    <div style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: '#7FB897', flexShrink: 0 }} />
                  )}
                </div>

                {conn ? (
                  <>
                    {/* Connected account info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)' }}>
                      {conn.profile_picture ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={conn.profile_picture} alt=""
                          style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: meta.color + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                          {meta.icon}
                        </div>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <p style={{ color: 'white', fontSize: 13, fontWeight: 500, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {conn.account_handle ?? conn.platform_account_name ?? 'Connected'}
                        </p>
                        {(conn.follower_count ?? 0) > 0 && (
                          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, margin: 0 }}>
                            {fmt(conn.follower_count!)} followers
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDisconnect(conn.id, meta.name)}
                      disabled={!!isDisconnecting}
                      style={{
                        width: '100%', padding: '7px', borderRadius: 8,
                        background: 'transparent',
                        border: '1px solid rgba(239,68,68,0.2)',
                        color: '#f87171', fontSize: 12, cursor: isDisconnecting ? 'not-allowed' : 'pointer',
                        opacity: isDisconnecting ? 0.5 : 1,
                        fontFamily: 'inherit',
                      }}>
                      {isDisconnecting ? 'Disconnecting…' : `Disconnect ${meta.name}`}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleConnect(platform)}
                    style={{
                      width: '100%', padding: '10px', borderRadius: 8,
                      background: meta.color, color: 'white',
                      border: 'none', fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                    Connect {meta.name}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}