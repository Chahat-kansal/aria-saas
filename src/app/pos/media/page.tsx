'use client'
import { useState, useEffect } from 'react'

interface MediaItem { url: string; source: string; name: string }

export default function MediaPage() {
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/pos/products').then(r => r.json()).catch(() => ({ products: [] })),
      fetch('/api/social/posts').then(r => r.json()).catch(() => ({ posts: [] })),
    ]).then(([prod, social]) => {
      const media: MediaItem[] = []
      for (const p of prod.products ?? []) {
        if (p.image_url) media.push({ url: p.image_url, source: 'Product', name: p.name })
      }
      for (const p of social.posts ?? []) {
        if (p.image_url) media.push({ url: p.image_url, source: 'Social Post', name: p.caption?.slice(0, 40) ?? 'Post' })
      }
      setItems(media); setLoading(false)
    })
  }, [])

  return (
    <div style={{ padding: '24px 28px', maxWidth: 960, color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Media Centre</h1>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 24px' }}>Images from products and social posts in one place.</p>

      {loading ? <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
      : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🖼️</div>
          <p style={{ margin: 0 }}>No media yet. Add images to products or create social posts to see them here.</p>
        </div>
      ) : (
        <>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16 }}>{items.length} images</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: 12 }}>
            {items.map((item, i) => (
              <div key={i} style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--divider)', background: 'var(--bg-surface)' }}>
                <div style={{ height: 140, background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  <img src={item.url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                </div>
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>{item.source}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
