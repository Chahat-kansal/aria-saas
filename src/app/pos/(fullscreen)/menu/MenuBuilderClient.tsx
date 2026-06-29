'use client'
import { useState, useEffect, useRef, useCallback, ChangeEvent } from 'react'

// ── Constants ──────────────────────────────────────────────────────────────

const TEMPLATES = [
  { id: 'editorial', name: 'Editorial',       font: 'Fraunces',         look: { bg: '#fbf8f1', card: '#fff',     ink: '#1a1206', accent: '#BA7517', accentSoft: '#f5e6c8', line: '#e6ddc9', muted: '#7a6a52' } },
  { id: 'pipel',     name: 'Pipel',           font: 'Space Grotesk',    look: { bg: '#0a0a0a', card: '#1a1a1a', ink: '#fafafa', accent: '#d9f54e', accentSoft: '#d9f54e', line: '#262626', muted: '#a0a0a0' } },
  { id: 'garden',    name: 'Garden',          font: 'Cormorant',        look: { bg: '#f4f7f3', card: '#fff',     ink: '#21372b', accent: '#7FB897', accentSoft: '#d4edda', line: '#dde8df', muted: '#4a6b58' } },
  { id: 'grand',     name: 'Grand',           font: 'Playfair Display', look: { bg: '#fffdf9', card: '#fff',     ink: '#161616', accent: '#9a7b3f', accentSoft: '#f2e8d6', line: '#eceae3', muted: '#6b6050' } },
  { id: 'mono',      name: 'Mono',            font: 'Inter',            look: { bg: '#ffffff', card: '#f4f4f5', ink: '#111',    accent: '#111',    accentSoft: '#e4e4e7', line: '#ededed', muted: '#71717a' } },
  { id: 'noir',      name: 'Noir',            font: 'Inter',            look: { bg: '#16151a', card: '#1f1e24', ink: '#f4f4f5', accent: '#e8a87c', accentSoft: '#e8a87c', line: '#2c2b32', muted: '#9ca3af' } },
]

const FONTS = [
  { id: 'Fraunces',         label: 'Serif',   css: "'Fraunces',Georgia,serif" },
  { id: 'Space Grotesk',    label: 'Grotesk', css: "'Space Grotesk',system-ui,sans-serif" },
  { id: 'Cormorant',        label: 'Elegant', css: "'Cormorant',Georgia,serif" },
  { id: 'Playfair Display', label: 'Classic', css: "'Playfair Display',Georgia,serif" },
  { id: 'Inter',            label: 'Clean',   css: "'Inter',system-ui,sans-serif" },
]

const BGS = [
  { id: 'none',    label: 'None',    e: '∅',  css: '' },
  { id: 'flowers', label: 'Flowers', e: '🌸', css: 'radial-gradient(circle at 18% 12%,#f6d7e4cc,transparent 36%),radial-gradient(circle at 82% 78%,#e9c6dccc,transparent 38%)' },
  { id: 'coffee',  label: 'Coffee',  e: '☕', css: 'radial-gradient(circle at 75% 18%,#caa98266,transparent 42%),radial-gradient(circle at 22% 82%,#a87f4f66,transparent 45%)' },
  { id: 'linen',   label: 'Linen',   e: '🧵', css: 'repeating-linear-gradient(45deg,#00000008 0 2px,transparent 2px 7px),repeating-linear-gradient(-45deg,#00000008 0 2px,transparent 2px 7px)' },
  { id: 'marble',  label: 'Marble',  e: '◜',  css: 'radial-gradient(circle at 28% 30%,#ececef,transparent 52%),radial-gradient(circle at 72% 70%,#dededf,transparent 55%)' },
  { id: 'botanic', label: 'Botanic', e: '🌿', css: 'radial-gradient(circle at 12% 88%,#7FB89744,transparent 40%),radial-gradient(circle at 88% 12%,#2D524033,transparent 42%)' },
  { id: 'warm',    label: 'Warm',    e: '🌅', css: 'linear-gradient(135deg,#ffe9d0bb,#ffd9b388)' },
]

const ACCENTS = ['#BA7517','#16a34a','#d9f54e','#7FB897','#E24B4A','#0a0a0a','#C9A37A','#e8a87c','#6C5CE7','#1d9bf0']
const BADGE_OPTS = ['Best seller','New','Vegan','Caffeine-free','Fresh batch','GF']
const LOGOS = ['☕','🌿','✦','S','🫐','◆']

// ── Types ──────────────────────────────────────────────────────────────────

type ItemOverride = { desc?: string; photo_url?: string; badge?: string; price_override?: number; hidden?: boolean }
type BrandKit = { accent?: string; font?: string; logoEmoji?: string; showPhotos?: boolean; showDesc?: boolean; showBadges?: boolean; printCols?: number }
type MenuCfg = {
  id?: string
  template_id: string
  brand_kit: BrandKit
  section_order: string[]
  item_overrides: Record<string, ItemOverride>
  background_id: string
  is_published: boolean
}
type Category = { id: string; name: string; color: string | null }
type Product = { id: string; name: string; description: string | null; price: number; image_url: string | null; category_id: string | null; sort_order: number | null }
type Theme = { bg: string; card: string; ink: string; accent: string; accentSoft: string; line: string; muted: string; fontCss: string; bgCss: string }

interface Props {
  businessId: string
  slug: string
  businessName: string
  logoUrl: string | null
  menuUrl: string
  initialConfig: MenuCfg
  initialCats: Category[]
  initialProducts: Product[]
}

// ── Theme derivation ───────────────────────────────────────────────────────

function deriveTheme(cfg: MenuCfg): Theme {
  const tpl = TEMPLATES.find(t => t.id === cfg.template_id) ?? TEMPLATES[0]
  const bk = cfg.brand_kit
  const accent = bk.accent ?? tpl.look.accent
  const fontId = bk.font ?? tpl.font
  const fontCss = FONTS.find(f => f.id === fontId)?.css ?? "'Inter',system-ui,sans-serif"
  const bgCss = BGS.find(b => b.id === cfg.background_id)?.css ?? ''
  return { bg: tpl.look.bg, card: tpl.look.card, ink: tpl.look.ink, accent, accentSoft: tpl.look.accentSoft, line: tpl.look.line, muted: tpl.look.muted, fontCss, bgCss }
}

// ── Mini-menu preview ──────────────────────────────────────────────────────

function MiniMenu({ cats, products, cfg, businessName, theme }: {
  cats: Category[]; products: Product[]; cfg: MenuCfg; businessName: string; theme: Theme
}) {
  const bk = cfg.brand_kit
  const logoEmoji = bk.logoEmoji ?? LOGOS[0]
  const showPhotos = bk.showPhotos ?? true
  const showDesc = bk.showDesc ?? true
  const showBadges = bk.showBadges ?? true

  let orderedCats = cats
  if (cfg.section_order.length > 0) {
    const pos: Record<string, number> = {}
    cfg.section_order.forEach((id, i) => { pos[id] = i })
    orderedCats = [...cats].sort((a, b) => (pos[a.id] ?? 9999) - (pos[b.id] ?? 9999) || a.name.localeCompare(b.name))
  }

  const visProds = products
    .filter(p => !cfg.item_overrides[p.id]?.hidden)
    .map(p => {
      const ov = cfg.item_overrides[p.id]
      if (!ov) return p
      return { ...p, description: ov.desc !== undefined ? ov.desc : p.description, image_url: ov.photo_url !== undefined ? ov.photo_url : p.image_url, price: ov.price_override !== undefined ? ov.price_override : p.price }
    })

  return (
    <div style={{ background: theme.bg, color: theme.ink, fontFamily: theme.fontCss, minHeight: '100%', fontSize: 12 }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: theme.card, borderBottom: '1px solid ' + theme.line, padding: '9px 11px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, border: '1.5px solid ' + theme.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: theme.accent, flexShrink: 0 }}>{logoEmoji}</div>
          <span style={{ fontFamily: theme.fontCss, fontWeight: 700, fontSize: 13, color: theme.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{businessName}</span>
        </div>
        {orderedCats.length > 0 && (
          <div style={{ display: 'flex', gap: 5, overflowX: 'auto' as const, paddingBottom: 8, scrollbarWidth: 'none' as const }}>
            {orderedCats.map((c, i) => (
              <button key={c.id} style={{ flexShrink: 0, padding: '3px 9px', borderRadius: 20, border: '1.5px solid ' + (i === 0 ? theme.accent : theme.line), background: i === 0 ? theme.accent : 'transparent', color: i === 0 ? theme.bg : theme.muted, fontSize: 10, fontWeight: 600, cursor: 'default', fontFamily: theme.fontCss }}>{c.name}</button>
            ))}
          </div>
        )}
      </div>
      <div style={{ padding: '0 11px 20px' }}>
        {orderedCats.map(cat => {
          const cp = visProds.filter(p => p.category_id === cat.id)
          if (cp.length === 0) return null
          return (
            <div key={cat.id} style={{ marginTop: 16 }}>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: theme.accent, marginBottom: 7, fontFamily: theme.fontCss }}>{cat.name}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                {cp.map(p => {
                  const badge = cfg.item_overrides[p.id]?.badge
                  return (
                    <div key={p.id} style={{ background: theme.card, borderRadius: 9, overflow: 'hidden', border: '1px solid ' + theme.line, display: 'flex', flexDirection: 'column' }}>
                      {showPhotos && (
                        p.image_url
                          ? <img src={p.image_url} alt="" style={{ width: '100%', height: 62, objectFit: 'cover' }} loading="lazy" />
                          : <div style={{ height: 62, background: theme.accentSoft + '44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: theme.accent }}>☕</div>
                      )}
                      <div style={{ padding: '6px 7px 7px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                        {showBadges && badge && (
                          <span style={{ fontSize: 8, fontWeight: 700, color: theme.accent, border: '1px solid ' + theme.accent, borderRadius: 8, padding: '1px 4px', alignSelf: 'flex-start' as const, marginBottom: 2 }}>{badge}</span>
                        )}
                        <div style={{ fontSize: 10, fontWeight: 700, color: theme.ink, lineHeight: 1.3, marginBottom: 2 }}>{p.name}</div>
                        {showDesc && p.description && (
                          <div style={{ fontSize: 8.5, color: theme.muted, lineHeight: 1.4, overflow: 'hidden', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, display: '-webkit-box', marginBottom: 3 }}>{p.description}</div>
                        )}
                        <div style={{ marginTop: 'auto', fontSize: 11, fontWeight: 800, color: theme.accent, fontFamily: theme.fontCss }}>{'$' + p.price.toFixed(2)}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
        {visProds.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 12px', color: theme.muted }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>☕</div>
            <p style={{ fontSize: 11, fontWeight: 600, margin: '0 0 3px' }}>No visible items</p>
            <p style={{ fontSize: 9.5, margin: 0 }}>Enable items in the Items panel</p>
          </div>
        )}
      </div>
      <div style={{ textAlign: 'center', fontSize: 8.5, color: theme.muted, padding: '0 0 10px', letterSpacing: '0.04em' }}>Powered by Aria</div>
    </div>
  )
}

// ── Shared design-panel content (desktop right + mobile sheets) ─────────────

function TemplatesSection({ cfg, onSelect }: { cfg: MenuCfg; onSelect: (id: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
      {TEMPLATES.map(t => {
        const fc = FONTS.find(f => f.id === t.font)?.css ?? "'Inter',sans-serif"
        const sel = cfg.template_id === t.id
        return (
          <div key={t.id} onClick={() => onSelect(t.id)} style={{ border: '2px solid ' + (sel ? '#18181b' : '#e4e4e7'), borderRadius: 10, cursor: 'pointer', overflow: 'hidden', position: 'relative' }}>
            <div style={{ background: t.look.bg, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <span style={{ fontFamily: fc, fontSize: 17, color: t.look.ink }}>Aa</span>
              <div style={{ width: 10, height: 3, background: t.look.accent, borderRadius: 2 }} />
            </div>
            <div style={{ padding: '3px 6px 5px', fontSize: 9.5, fontWeight: 600, color: '#18181b', background: '#fff' }}>{t.name}</div>
            {sel && <div style={{ position: 'absolute', top: 4, right: 4, width: 14, height: 14, borderRadius: '50%', background: '#18181b', color: '#fff', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>}
          </div>
        )
      })}
    </div>
  )
}

function BrandSection({ cfg, businessName, onUpdateBk }: { cfg: MenuCfg; businessName: string; onUpdateBk: (p: Partial<BrandKit>) => void }) {
  const bk = cfg.brand_kit
  const logoIdx = LOGOS.indexOf(bk.logoEmoji ?? LOGOS[0])
  const curLogo = bk.logoEmoji ?? LOGOS[0]
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: '#71717a', marginBottom: 6 }}>Logo</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, border: '2px solid #e4e4e7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, cursor: 'pointer' }} onClick={() => onUpdateBk({ logoEmoji: LOGOS[(logoIdx + 1) % LOGOS.length] })}>{curLogo}</div>
          <span style={{ fontSize: 11, color: '#71717a' }}>Tap to cycle · <b style={{ color: '#18181b' }}>{businessName}</b></span>
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: '#71717a', marginBottom: 6 }}>Accent colour</div>
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
          {ACCENTS.map(a => (
            <button key={a} onClick={() => onUpdateBk({ accent: a })} style={{ width: 24, height: 24, borderRadius: '50%', background: a, border: '2.5px solid ' + ((bk.accent ?? '') === a ? '#18181b' : 'transparent'), cursor: 'pointer', boxSizing: 'border-box' as const }} />
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: '#71717a', marginBottom: 6 }}>Typeface</div>
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 5 }}>
          {FONTS.map(f => {
            const sel = (bk.font ?? TEMPLATES.find(t => t.id === cfg.template_id)?.font ?? 'Fraunces') === f.id
            return (
              <button key={f.id} onClick={() => onUpdateBk({ font: f.id })} style={{ padding: '4px 10px', borderRadius: 20, border: '1.5px solid ' + (sel ? '#18181b' : '#e4e4e7'), background: sel ? '#18181b' : '#fff', color: sel ? '#fff' : '#18181b', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: f.css }}>{f.label}</button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function BackgroundSection({ cfg, onSet }: { cfg: MenuCfg; onSet: (id: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 7 }}>
      {BGS.map(b => {
        const sel = cfg.background_id === b.id
        return (
          <div key={b.id} onClick={() => onSet(b.id)} style={{ border: '2px solid ' + (sel ? '#18181b' : '#e4e4e7'), borderRadius: 8, cursor: 'pointer', aspectRatio: '1', background: b.css || '#fafafa', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <span style={{ fontSize: 13 }}>{b.e}</span>
            <span style={{ fontSize: 8.5, fontWeight: 600, color: '#71717a' }}>{b.label}</span>
          </div>
        )
      })}
      <div style={{ border: '2px dashed #e4e4e7', borderRadius: 8, cursor: 'not-allowed', aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, opacity: 0.6 }}>
        <span style={{ fontSize: 13, color: '#aaa' }}>⬆</span>
        <span style={{ fontSize: 8.5, fontWeight: 600, color: '#aaa' }}>Upload</span>
      </div>
    </div>
  )
}

function LayoutSection({ cfg, onUpdateBk }: { cfg: MenuCfg; onUpdateBk: (p: Partial<BrandKit>) => void }) {
  const bk = cfg.brand_kit
  const cols = bk.printCols ?? 2
  const row = (label: string, key: keyof BrandKit, dflt: boolean) => {
    const val = (bk[key] as boolean | undefined) ?? dflt
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #f4f4f5' }}>
        <span style={{ fontSize: 12, color: '#18181b' }}>{label}</span>
        <button onClick={() => onUpdateBk({ [key]: !val })} style={{ width: 32, height: 18, borderRadius: 9, background: val ? '#18181b' : '#e4e4e7', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
          <div style={{ position: 'absolute', top: 2, left: val ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
        </button>
      </div>
    )
  }
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: '#71717a', marginBottom: 6 }}>Columns · A4 print</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {[1, 2].map(n => (
          <button key={n} onClick={() => onUpdateBk({ printCols: n })} style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: '1.5px solid ' + (cols === n ? '#18181b' : '#e4e4e7'), background: cols === n ? '#18181b' : '#fff', color: cols === n ? '#fff' : '#18181b', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{n} col</button>
        ))}
      </div>
      {row('Item photos', 'showPhotos', true)}
      {row('Descriptions', 'showDesc', true)}
      {row('Badges', 'showBadges', true)}
    </div>
  )
}

function ShareSection({ menuUrl }: { menuUrl: string }) {
  const [copied, setCopied] = useState(false)
  function copyUrl() {
    navigator.clipboard.writeText(menuUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }
  return (
    <div style={{ border: '1px solid #e4e4e7', borderRadius: 12, padding: 14 }}>
      <div style={{ width: 80, height: 80, background: '#f4f4f5', borderRadius: 8, margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#aaa', textAlign: 'center' }}>QR code<br />visible after<br />publish</div>
      <div style={{ fontSize: 10.5, color: '#71717a', wordBreak: 'break-all' as const, background: '#f4f4f5', borderRadius: 6, padding: '6px 8px', marginBottom: 8, fontFamily: 'monospace' }}>{menuUrl}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={copyUrl} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: '1.5px solid #e4e4e7', background: copied ? '#f0fdf4' : '#fff', color: copied ? '#16a34a' : '#18181b', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>{copied ? '✓ Copied' : 'Copy link'}</button>
      </div>
      <div style={{ marginTop: 10, background: '#f0fdf4', borderRadius: 8, padding: '8px 10px' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: '#16a34a', marginBottom: 3 }}>✦ Aria can share it</div>
        <div style={{ fontSize: 10, color: '#4b7a5a', lineHeight: 1.5 }}>"Post your menu to Google Business + tomorrow's SMS?"</div>
      </div>
    </div>
  )
}

// ── Item editor ────────────────────────────────────────────────────────────

function ItemEditor({ product, override, onUpdate, onClose, onUploadPhoto, imgBusy }: {
  product: Product; override: ItemOverride; onUpdate: (p: Partial<ItemOverride>) => void; onClose: () => void; onUploadPhoto: (file: File) => void; imgBusy: boolean
}) {
  const isHidden = override.hidden ?? false
  const fileRef = useRef<HTMLInputElement>(null)
  const curBadge = override.badge ?? ''

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) onUploadPhoto(f)
    e.target.value = ''
  }

  const photoSrc = override.photo_url ?? product.image_url

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#71717a', padding: 0 }}>←</button>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#18181b' }}>Edit item</span>
      </div>

      {/* Available toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f4f4f5', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#18181b' }}>Available now</div>
          <div style={{ fontSize: 10.5, color: '#71717a', marginTop: 2 }}>Same flag as your POS · greys the live menu</div>
        </div>
        <button onClick={() => onUpdate({ hidden: !isHidden })} style={{ width: 36, height: 20, borderRadius: 10, background: isHidden ? '#e4e4e7' : '#18181b', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
          <div style={{ position: 'absolute', top: 3, left: isHidden ? 3 : 17, width: 14, height: 14, borderRadius: '50%', background: '#fff' }} />
        </button>
      </div>

      {/* Description override */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10.5, fontWeight: 600, color: '#71717a', display: 'block', marginBottom: 4 }}>Description</label>
        <textarea
          value={override.desc !== undefined ? override.desc : (product.description ?? '')}
          onChange={e => onUpdate({ desc: e.target.value })}
          placeholder={product.description ?? 'No description'}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e4e4e7', fontSize: 12, resize: 'vertical' as const, minHeight: 60, boxSizing: 'border-box' as const, fontFamily: 'inherit', color: '#18181b', outline: 'none' }}
        />
      </div>

      {/* Photo */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10.5, fontWeight: 600, color: '#71717a', display: 'block', marginBottom: 4 }}>Photo override</label>
        {photoSrc && <img src={photoSrc} alt="" style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 8, marginBottom: 6 }} />}
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => fileRef.current?.click()} disabled={imgBusy} style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: '1.5px solid #e4e4e7', background: '#fff', color: '#18181b', fontSize: 11, fontWeight: 600, cursor: imgBusy ? 'wait' : 'pointer' }}>{imgBusy ? 'Uploading…' : '⬆ Upload photo'}</button>
          {override.photo_url && <button onClick={() => onUpdate({ photo_url: undefined })} style={{ padding: '7px 10px', borderRadius: 8, border: '1.5px solid #fca5a5', background: '#fff', color: '#dc2626', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Remove</button>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
      </div>

      {/* Display price (override only) */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10.5, fontWeight: 600, color: '#71717a', display: 'block', marginBottom: 2 }}>Display price</label>
        <div style={{ fontSize: 9.5, color: '#f59e0b', marginBottom: 5 }}>⚠ Display-only — does not change your POS price</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#71717a' }}>$</span>
          <input
            type="number" min="0" step="0.01"
            value={override.price_override !== undefined ? override.price_override : product.price}
            onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) onUpdate({ price_override: v }) }}
            style={{ width: 80, padding: '6px 8px', borderRadius: 8, border: '1.5px solid #e4e4e7', fontSize: 12, outline: 'none', color: '#18181b' }}
          />
          {override.price_override !== undefined && (
            <button onClick={() => onUpdate({ price_override: undefined })} style={{ fontSize: 10.5, color: '#71717a', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Reset</button>
          )}
        </div>
      </div>

      {/* Badge */}
      <div>
        <label style={{ fontSize: 10.5, fontWeight: 600, color: '#71717a', display: 'block', marginBottom: 6 }}>Badge</label>
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 5 }}>
          {[...BADGE_OPTS, 'None'].map(b => {
            const isNone = b === 'None'
            const sel = isNone ? !curBadge : curBadge === b
            return (
              <button key={b} onClick={() => onUpdate({ badge: isNone ? '' : b })} style={{ padding: '4px 9px', borderRadius: 20, border: '1.5px solid ' + (sel ? '#18181b' : '#e4e4e7'), background: sel ? '#18181b' : '#fff', color: sel ? '#fff' : '#18181b', fontSize: 10.5, fontWeight: 600, cursor: 'pointer' }}>{b}</button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function MenuBuilderClient({ businessId: _bid, slug, businessName, logoUrl: _logoUrl, menuUrl, initialConfig, initialCats, initialProducts }: Props) {
  const [cfg, setCfg] = useState<MenuCfg>(initialConfig)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [sheetContent, setSheetContent] = useState<string | null>(null)
  const [outputMode, setOutputMode] = useState<'digital' | 'a4'>('digital')
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [isMobile, setIsMobile] = useState(false)
  const [imgBusy, setImgBusy] = useState(false)
  const [publishBusy, setPublishBusy] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 1000)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const save = useCallback(async (c: MenuCfg) => {
    setSaveState('saving')
    try {
      await fetch('/api/pos/menu-config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) })
      setSaveState('saved')
    } catch {
      setSaveState('unsaved')
    }
  }, [])

  function updateCfg(partial: Partial<MenuCfg>) {
    const next = { ...cfg, ...partial }
    setCfg(next)
    setSaveState('unsaved')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { void save(next) }, 1500)
  }

  function updateBk(partial: Partial<BrandKit>) {
    updateCfg({ brand_kit: { ...cfg.brand_kit, ...partial } })
  }

  function updateItemOv(id: string, partial: Partial<ItemOverride>) {
    updateCfg({ item_overrides: { ...cfg.item_overrides, [id]: { ...(cfg.item_overrides[id] ?? {}), ...partial } } })
  }

  function selectTemplate(templateId: string) {
    const tpl = TEMPLATES.find(t => t.id === templateId) ?? TEMPLATES[0]
    updateCfg({ template_id: templateId, brand_kit: { ...cfg.brand_kit, accent: tpl.look.accent, font: tpl.font } })
  }

  async function uploadItemPhoto(id: string, file: File) {
    setImgBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/pos/products/upload-image', { method: 'POST', body: fd })
      if (res.ok) {
        const data = await res.json() as { image_url: string }
        updateItemOv(id, { photo_url: data.image_url })
      }
    } finally {
      setImgBusy(false)
    }
  }

  async function handlePublish() {
    setPublishBusy(true)
    try {
      const next = { ...cfg, is_published: true }
      setCfg(next)
      await fetch('/api/pos/menu-config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) })
      setSaveState('saved')
      showToast('✓ Published — your menu is live')
    } finally {
      setPublishBusy(false)
    }
  }

  async function handleDownloadPdf() {
    setPdfBusy(true)
    try {
      const res = await fetch('/api/pos/menu-pdf')
      if (!res.ok) throw new Error('PDF generation failed (' + res.status + ')')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'menu.pdf'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      showToast('PDF generation failed — try again.')
    } finally {
      setPdfBusy(false)
    }
  }

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  function openItemEditor(id: string) {
    setSelectedItemId(id)
    if (isMobile) setSheetContent('editor')
  }

  function closeItemEditor() {
    setSelectedItemId(null)
    if (isMobile) setSheetContent(null)
  }

  const theme = deriveTheme(cfg)

  // Ordered cats per section_order
  let orderedCats = initialCats
  if (cfg.section_order.length > 0) {
    const pos: Record<string, number> = {}
    cfg.section_order.forEach((id, i) => { pos[id] = i })
    orderedCats = [...initialCats].sort((a, b) => (pos[a.id] ?? 9999) - (pos[b.id] ?? 9999) || a.name.localeCompare(b.name))
  }

  // C — colours for builder chrome (not the menu theme)
  const C = { bg: '#f4f4f5', card: '#fff', border: '#e4e4e7', ink: '#18181b', muted: '#71717a', accent: '#2D5240' }

  // ── Design panel content (shared desktop + mobile sheets) ──────────────

  function renderDesignPanelContent(scope?: string) {
    const s = scope ?? 'all'
    return (
      <div style={{ padding: 14 }}>
        {(s === 'all' || s === 'template') && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.ink, marginBottom: 8 }}>Template</div>
            <TemplatesSection cfg={cfg} onSelect={selectTemplate} />
          </div>
        )}
        {(s === 'all' || s === 'brand') && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.ink, marginBottom: 8 }}>Brand kit <span style={{ background: '#dcfce7', color: '#16a34a', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 10 }}>FREE</span></div>
            <BrandSection cfg={cfg} businessName={businessName} onUpdateBk={updateBk} />
          </div>
        )}
        {(s === 'all' || s === 'bg') && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.ink, marginBottom: 8 }}>Background <span style={{ background: '#dcfce7', color: '#16a34a', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 10 }}>FREE LIBRARY</span></div>
            <BackgroundSection cfg={cfg} onSet={bgId => updateCfg({ background_id: bgId })} />
          </div>
        )}
        {(s === 'all' || s === 'layout') && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.ink, marginBottom: 8 }}>Layout</div>
            <LayoutSection cfg={cfg} onUpdateBk={updateBk} />
          </div>
        )}
        {(s === 'all' || s === 'share') && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.ink, marginBottom: 8 }}>Share</div>
            <ShareSection menuUrl={menuUrl} />
          </div>
        )}
      </div>
    )
  }

  // ── Right panel (desktop only) ─────────────────────────────────────────

  const selectedProduct = selectedItemId ? initialProducts.find(p => p.id === selectedItemId) ?? null : null
  const selectedOverride = selectedItemId ? (cfg.item_overrides[selectedItemId] ?? {}) : {}

  function renderRightPanel() {
    if (selectedProduct && !isMobile) {
      return (
        <div style={{ padding: 14 }}>
          <ItemEditor
            product={selectedProduct}
            override={selectedOverride}
            onUpdate={partial => updateItemOv(selectedItemId!, partial)}
            onClose={closeItemEditor}
            onUploadPhoto={f => { void uploadItemPhoto(selectedItemId!, f) }}
            imgBusy={imgBusy}
          />
        </div>
      )
    }
    if (!isMobile) {
      return renderDesignPanelContent('all')
    }
    return null
  }

  // ── Items panel content ────────────────────────────────────────────────

  function renderItemsPanel() {
    return (
      <div style={{ flex: 1, overflowY: 'auto' as const }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid ' + C.border, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: C.card, zIndex: 5 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Menu items</div>
            <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', display: 'inline-block', marginRight: 4 }} />
              Live from your POS · {initialProducts.length} products
            </div>
          </div>
        </div>
        {orderedCats.map(cat => {
          const catProds = initialProducts.filter(p => p.category_id === cat.id)
          if (catProds.length === 0) return null
          const visCount = catProds.filter(p => !cfg.item_overrides[p.id]?.hidden).length
          return (
            <div key={cat.id}>
              <div style={{ padding: '8px 12px', background: C.bg, display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid ' + C.border }}>
                <span style={{ fontSize: 18, color: C.muted, cursor: 'grab' }}>⠿</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: C.ink, flex: 1 }}>{cat.name}</span>
                <span style={{ fontSize: 10.5, color: C.muted }}>{visCount}/{catProds.length}</span>
              </div>
              {catProds.map(p => {
                const isHidden = cfg.item_overrides[p.id]?.hidden ?? false
                const sel = selectedItemId === p.id
                return (
                  <div key={p.id} onClick={() => openItemEditor(p.id)} style={{ padding: '8px 12px', borderBottom: '1px solid ' + C.border, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: sel ? '#f0fdf4' : (isHidden ? '#fafafa' : C.card), opacity: isHidden ? 0.5 : 1 }}>
                    <span style={{ fontSize: 14, color: C.muted, cursor: 'grab' }}>⠿</span>
                    {p.image_url
                      ? <img src={p.image_url} alt="" style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                      : <div style={{ width: 34, height: 34, borderRadius: 6, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>☕</div>
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{p.name}</div>
                      {p.description && <div style={{ fontSize: 10, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{p.description}</div>}
                    </div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: C.ink, flexShrink: 0 }}>{'$' + p.price.toFixed(2)}</div>
                    <button
                      onClick={e => { e.stopPropagation(); const cur = cfg.item_overrides[p.id]?.hidden ?? false; updateItemOv(p.id, { hidden: !cur }) }}
                      title={isHidden ? 'Show on menu' : 'Hide from menu'}
                      style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid ' + (isHidden ? C.border : C.accent), background: isHidden ? 'transparent' : C.accent, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      {!isHidden && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
                    </button>
                  </div>
                )
              })}
            </div>
          )
        })}
        {orderedCats.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: C.muted }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>☕</div>
            <p style={{ fontSize: 12, fontWeight: 600, margin: 0 }}>No categories yet</p>
            <p style={{ fontSize: 11, marginTop: 4 }}>Add categories and products in your POS to see them here.</p>
          </div>
        )}
      </div>
    )
  }

  // ── Mobile tabs & sheet ────────────────────────────────────────────────

  const MOBILE_TABS = [
    { id: 'items',    icon: '≣', label: 'Items' },
    { id: 'template', icon: '◳', label: 'Template' },
    { id: 'brand',    icon: '✦', label: 'Brand' },
    { id: 'bg',       icon: '▦', label: 'Bg' },
    { id: 'layout',   icon: '▤', label: 'Layout' },
    { id: 'share',    icon: '↗', label: 'Share' },
  ]

  const saveLabel = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : '•'

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.bg, overflow: 'hidden', fontFamily: "'Inter',system-ui,sans-serif" }}>

      {/* Topbar */}
      <div style={{ height: 48, display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', background: C.card, borderBottom: '1px solid ' + C.border, flexShrink: 0, zIndex: 20 }}>
        <span style={{ fontWeight: 800, fontSize: 14, color: C.accent, letterSpacing: '-0.5px', fontFamily: "'Fraunces',Georgia,serif", fontStyle: 'italic' }}>aria</span>
        <span style={{ fontSize: 12, color: C.muted }}>Menu ·</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{businessName}</span>
        <div style={{ flex: 1 }} />
        {/* Digital / A4 toggle */}
        {!isMobile && (
          <div style={{ display: 'flex', background: C.bg, borderRadius: 8, padding: 2, gap: 2 }}>
            {(['digital', 'a4'] as const).map(m => (
              <button key={m} onClick={() => setOutputMode(m)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: outputMode === m ? C.card : 'transparent', color: outputMode === m ? C.ink : C.muted, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', boxShadow: outputMode === m ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                {m === 'digital' ? '📱 Digital' : '📄 A4'}
              </button>
            ))}
          </div>
        )}
        <span style={{ fontSize: 11, color: C.muted, marginLeft: 4 }}>{saveLabel}</span>
        <button onClick={() => window.open(menuUrl, '_blank')} style={{ padding: '5px 10px', borderRadius: 7, border: '1.5px solid ' + C.border, background: C.card, color: C.ink, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>Preview ↗</button>
        <button onClick={() => { void handlePublish() }} disabled={publishBusy} style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: cfg.is_published ? '#16a34a' : C.accent, color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: publishBusy ? 'wait' : 'pointer', opacity: publishBusy ? 0.7 : 1 }}>
          {publishBusy ? 'Publishing…' : cfg.is_published ? '✓ Published' : 'Publish'}
        </button>
      </div>

      {/* 3-pane layout */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '340px 1fr 300px', overflow: 'hidden', minHeight: 0 }}>

        {/* Left: Items panel */}
        {!isMobile && (
          <div style={{ borderRight: '1px solid ' + C.border, background: C.card, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {renderItemsPanel()}
          </div>
        )}

        {/* Center: Preview */}
        <div style={{ overflow: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: isMobile ? 12 : 20, background: '#dde3e0', backgroundImage: 'repeating-linear-gradient(0deg,#00000008 0 1px,transparent 1px 20px),repeating-linear-gradient(90deg,#00000008 0 1px,transparent 1px 20px)', gap: 12 }}>
          {/* Preview toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.card, borderRadius: 10, padding: '6px 12px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', width: '100%', maxWidth: 400, boxSizing: 'border-box' as const }}>
            <span style={{ fontSize: 10.5, color: C.muted, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1 }}>{menuUrl.replace('https://', '')}</span>
            {outputMode === 'a4' && (
              <button
                onClick={() => { void handleDownloadPdf() }}
                disabled={pdfBusy}
                style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: C.accent, color: '#fff', fontSize: 10.5, fontWeight: 700, cursor: pdfBusy ? 'wait' : 'pointer', opacity: pdfBusy ? 0.7 : 1, whiteSpace: 'nowrap' as const, flexShrink: 0 }}
              >
                {pdfBusy ? 'Generating…' : '⬇ PDF'}
              </button>
            )}
          </div>

          {/* Phone frame */}
          {outputMode === 'digital' && (
            <div style={{ width: 360, maxWidth: '100%', borderRadius: 32, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.25), 0 0 0 8px #1a1a1a, 0 0 0 9px #333', background: '#fff', flexShrink: 0 }}>
              {/* Notch */}
              <div style={{ height: 28, background: '#1a1a1a', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <div style={{ width: 80, height: 6, borderRadius: 3, background: '#333' }} />
              </div>
              <div style={{ height: 580, overflowY: 'auto' as const, overflowX: 'hidden' as const }}>
                <MiniMenu cats={initialCats} products={initialProducts} cfg={cfg} businessName={businessName} theme={theme} />
              </div>
            </div>
          )}

          {/* A4 frame */}
          {outputMode === 'a4' && (
            <div style={{ width: 360, background: theme.bg, boxShadow: '0 4px 24px rgba(0,0,0,0.15)', borderRadius: 4, padding: '28px 24px', flexShrink: 0, color: theme.ink, fontFamily: theme.fontCss }}>
              <div style={{ textAlign: 'center', marginBottom: 18 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid ' + theme.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: theme.accent, margin: '0 auto 6px' }}>{cfg.brand_kit.logoEmoji ?? LOGOS[0]}</div>
                <div style={{ fontWeight: 700, fontSize: 20, letterSpacing: '-0.5px' }}>{businessName}</div>
                <div style={{ width: 28, height: 2, background: theme.accent, margin: '8px auto' }} />
              </div>
              {orderedCats.map(cat => {
                const cp = initialProducts.filter(p => p.category_id === cat.id && !cfg.item_overrides[p.id]?.hidden)
                if (cp.length === 0) return null
                return (
                  <div key={cat.id} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '1.2px', color: theme.accent, marginBottom: 5 }}>{cat.name}</div>
                    {cp.map(p => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 4, marginBottom: 4 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 600 }}>{p.name}</span>
                        <div style={{ flex: 1, borderBottom: '1.5px dotted ' + theme.line, marginBottom: 2, opacity: 0.4 }} />
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: theme.accent }}>{'$' + p.price.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )
              })}
              <div style={{ textAlign: 'center', fontSize: 8, opacity: 0.4, marginTop: 12, letterSpacing: '1.5px', textTransform: 'uppercase' as const }}>Powered by Aria</div>
            </div>
          )}
        </div>

        {/* Right: Design panel / item editor (desktop only) */}
        {!isMobile && (
          <div style={{ borderLeft: '1px solid ' + C.border, background: C.card, overflowY: 'auto' as const }}>
            {renderRightPanel()}
          </div>
        )}
      </div>

      {/* Mobile tab bar */}
      {isMobile && (
        <div style={{ display: 'flex', background: C.card, borderTop: '1px solid ' + C.border, padding: '6px 6px', gap: 4, overflowX: 'auto' as const, flexShrink: 0, zIndex: 20 }}>
          {MOBILE_TABS.map(tab => (
            <button key={tab.id} onClick={() => setSheetContent(sheetContent === tab.id ? null : tab.id)} style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '6px 10px', borderRadius: 10, background: sheetContent === tab.id ? C.bg : 'transparent', border: 'none', cursor: 'pointer', minWidth: 52 }}>
              <span style={{ fontSize: 17 }}>{tab.icon}</span>
              <span style={{ fontSize: 9.5, fontWeight: 600, color: C.muted }}>{tab.label}</span>
            </button>
          ))}
          <button onClick={() => { void handlePublish() }} disabled={publishBusy} style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 20, background: cfg.is_published ? '#16a34a' : C.accent, border: 'none', cursor: 'pointer', color: '#fff', fontWeight: 700, fontSize: 12 }}>
            {publishBusy ? '…' : cfg.is_published ? '✓ Live' : 'Publish'}
          </button>
        </div>
      )}

      {/* Mobile sheet scrim */}
      {isMobile && sheetContent && (
        <div onClick={() => setSheetContent(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
      )}

      {/* Mobile sheet */}
      {isMobile && sheetContent && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: C.card, borderRadius: '18px 18px 0 0', zIndex: 50, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div onClick={() => setSheetContent(null)} style={{ width: 36, height: 4, borderRadius: 2, background: '#d4d4d8', margin: '10px auto 0', cursor: 'pointer', flexShrink: 0 }} />
          <div style={{ overflowY: 'auto' as const, flex: 1, padding: '4px 0 32px' }}>
            {sheetContent === 'items' && (
              <div style={{ padding: '10px 0' }}>
                <div style={{ fontSize: 14, fontWeight: 700, padding: '0 14px 10px', color: C.ink }}>Menu items</div>
                {renderItemsPanel()}
              </div>
            )}
            {sheetContent === 'editor' && selectedProduct && (
              <div style={{ padding: 14 }}>
                <ItemEditor
                  product={selectedProduct}
                  override={selectedOverride}
                  onUpdate={partial => updateItemOv(selectedItemId!, partial)}
                  onClose={closeItemEditor}
                  onUploadPhoto={f => { void uploadItemPhoto(selectedItemId!, f) }}
                  imgBusy={imgBusy}
                />
                <button onClick={closeItemEditor} style={{ width: '100%', marginTop: 12, padding: 13, borderRadius: 12, border: 'none', background: C.ink, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Done</button>
              </div>
            )}
            {sheetContent !== 'items' && sheetContent !== 'editor' && (
              <div style={{ padding: '10px 0' }}>
                {renderDesignPanelContent(sheetContent)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', background: '#18181b', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 12, fontWeight: 600, zIndex: 100, whiteSpace: 'nowrap' as const, boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
