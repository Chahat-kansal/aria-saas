'use client'
import { useState, useEffect, useRef, useCallback, ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'

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
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

// ── Types ──────────────────────────────────────────────────────────────────

type ItemOverride = { desc?: string; photo_url?: string; badge?: string; price_override?: number; hidden?: boolean }
type BrandKit = { accent?: string; font?: string; logoEmoji?: string; showPhotos?: boolean; showDesc?: boolean; showBadges?: boolean; printCols?: number }
type MenuCfg = {
  id?: string
  menu_key: string
  menu_label: string
  is_default: boolean
  active_from: string | null
  active_to: string | null
  days_of_week: number[] | null
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
type ExtractedItem = { _id: string; name: string; price: number; category: string; description: string; removed: boolean }

interface Props {
  businessId: string
  slug: string
  businessName: string
  logoUrl: string | null
  menuUrl: string
  initialConfigs: MenuCfg[]
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

  const miniCatIds = new Set(orderedCats.map(c => c.id))
  const uncatMini = visProds.filter(p => !p.category_id || !miniCatIds.has(p.category_id))

  return (
    <div style={{ background: theme.bg, backgroundImage: theme.bgCss, color: theme.ink, fontFamily: theme.fontCss, minHeight: '100%', fontSize: 12 }}>

      {/* CENTERED HEADER — exact mockup .mh / .mlogo / .mname / .msub / .mstat */}
      <div style={{ padding: '26px 22px 16px', textAlign: 'center' }}>
        {/* 56px circle logo — exact mockup .mlogo */}
        <div style={{ width: 56, height: 56, borderRadius: '50%', border: '2px solid ' + theme.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: theme.accent, margin: '0 auto 10px' }}>{logoEmoji}</div>
        {/* Business name — mockup .mname: 26px */}
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.5px', color: theme.ink, fontFamily: theme.fontCss }}>{businessName}</div>
        {/* Subtitle — mockup .msub: 11px, opacity .7 */}
        <div style={{ fontSize: 11, color: theme.muted, marginTop: 5, opacity: 0.7 }}>Location · your hours</div>
        {/* Open-now pill — mockup .mstat: 1.5px accent border, green dot, uppercase */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 11, fontSize: 9.5, fontWeight: 700, borderRadius: 20, padding: '5px 10px', border: '1.5px solid ' + theme.accent, color: theme.ink, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', display: 'inline-block', flexShrink: 0 }} />
          Open now · til 5pm
        </div>
      </div>

      {/* STICKY CATEGORY NAV — mockup .mnav: gap:6, padding:11px 18px */}
      {orderedCats.length > 0 && (
        <div style={{ position: 'sticky', top: 0, zIndex: 10, background: theme.bg, borderBottom: '1px solid ' + theme.line }}>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto' as const, padding: '11px 18px', scrollbarWidth: 'none' as const }}>
            {orderedCats.map((c, i) => (
              <button key={c.id} style={{ flexShrink: 0, padding: '6px 13px', borderRadius: 20, border: '1.5px solid ' + (i === 0 ? theme.accent : theme.line), background: i === 0 ? theme.accent : 'transparent', color: i === 0 ? theme.bg : theme.ink, fontSize: 10.5, fontWeight: 700, cursor: 'default', fontFamily: theme.fontCss, whiteSpace: 'nowrap' as const }}>{c.name}</button>
            ))}
          </div>
        </div>
      )}

      {/* PRODUCT LIST — exact mockup .mi rows */}
      <div style={{ padding: '0 20px 20px' }}>
        {orderedCats.map(cat => {
          const cp = visProds.filter(p => p.category_id === cat.id)
          if (cp.length === 0) return null
          return (
            <div key={cat.id} style={{ marginTop: 16 }}>
              {/* Category heading — mockup .mcat-h: 10.5px/800/uppercase/1.6px tracking + ::after line */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '1.6px', padding: '16px 0 4px', color: theme.accent, fontFamily: theme.fontCss }}>
                {cat.name}
                <span style={{ flex: 1, height: 1.5, background: 'currentColor', opacity: 0.18, display: 'inline-block' }} />
              </div>
              {/* Item rows — exact mockup .mi: gap:12, padding:13px 0, flex-start */}
              {cp.map((p, idx) => {
                const badge = cfg.item_overrides[p.id]?.badge
                return (
                  <div key={p.id} style={{ display: 'flex', gap: 12, padding: '13px 0', borderBottom: idx < cp.length - 1 ? '1px solid ' + theme.line : 'none', alignItems: 'flex-start' }}>
                    {/* Thumb — exact mockup .ph: 52×52, border-radius:12, flex-shrink:0 */}
                    {showPhotos && (p.image_url
                      ? <img src={p.image_url} alt="" loading="lazy" style={{ width: 52, height: 52, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
                      : <div style={{ width: 52, height: 52, borderRadius: 12, background: theme.accentSoft + '44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 23, color: theme.accent, flexShrink: 0 }}>☕</div>
                    )}
                    {/* Content — exact mockup .nf: flex:1, min-width:0 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Name + price — exact mockup .t: space-between, gap:9, baseline */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 9, alignItems: 'baseline' }}>
                        {/* Name — exact mockup .nm: 14.5px, 700, letter-spacing:-.2px */}
                        <div style={{ fontSize: 14.5, fontWeight: 700, color: theme.ink, letterSpacing: '-0.2px' }}>{p.name}</div>
                        {/* Price — exact mockup .pr: 14px, 800, nowrap */}
                        <div style={{ fontSize: 14, fontWeight: 800, color: theme.accent, fontFamily: theme.fontCss, whiteSpace: 'nowrap' as const, flexShrink: 0 }}>{'A$' + p.price.toFixed(2)}</div>
                      </div>
                      {/* Desc — exact mockup .ds: 11.5px, opacity .6, line-height 1.4 */}
                      {showDesc && p.description && <div style={{ fontSize: 11.5, color: theme.muted, lineHeight: 1.4, marginTop: 2, overflow: 'hidden', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, display: '-webkit-box', opacity: 0.6 }}>{p.description}</div>}
                      {/* Badge — exact mockup .b: 8.5px, 800, uppercase, border 1.2px */}
                      {showBadges && badge && <span style={{ fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.03em', borderRadius: 20, padding: '2px 7px', border: '1.2px solid ' + theme.accent, color: theme.accent, display: 'inline-block', marginTop: 6 }}>{badge}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
        {uncatMini.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '1.6px', padding: '16px 0 4px', color: theme.muted, fontFamily: theme.fontCss }}>
              Other
              <span style={{ flex: 1, height: 1.5, background: 'currentColor', opacity: 0.18, display: 'inline-block' }} />
            </div>
            {uncatMini.map((p, idx) => {
              const badge = cfg.item_overrides[p.id]?.badge
              return (
                <div key={p.id} style={{ display: 'flex', gap: 12, padding: '13px 0', borderBottom: idx < uncatMini.length - 1 ? '1px solid ' + theme.line : 'none', alignItems: 'flex-start' }}>
                  {showPhotos && (p.image_url
                    ? <img src={p.image_url} alt="" loading="lazy" style={{ width: 52, height: 52, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
                    : <div style={{ width: 52, height: 52, borderRadius: 12, background: theme.accentSoft + '44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 23, color: theme.accent, flexShrink: 0 }}>☕</div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 9, alignItems: 'baseline' }}>
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: theme.ink, letterSpacing: '-0.2px' }}>{p.name}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: theme.accent, fontFamily: theme.fontCss, whiteSpace: 'nowrap' as const, flexShrink: 0 }}>{'A$' + p.price.toFixed(2)}</div>
                    </div>
                    {showDesc && p.description && <div style={{ fontSize: 11.5, color: theme.muted, lineHeight: 1.4, marginTop: 2, overflow: 'hidden', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, display: '-webkit-box', opacity: 0.6 }}>{p.description}</div>}
                    {showBadges && badge && <span style={{ fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.03em', borderRadius: 20, padding: '2px 7px', border: '1.2px solid ' + theme.accent, color: theme.accent, display: 'inline-block', marginTop: 6 }}>{badge}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {visProds.length === 0 && uncatMini.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 12px', color: theme.muted }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>☕</div>
            <p style={{ fontSize: 11, fontWeight: 600, margin: '0 0 3px' }}>No visible items</p>
            <p style={{ fontSize: 9.5, margin: 0 }}>Enable items in the Items panel</p>
          </div>
        )}
      </div>
      <div style={{ textAlign: 'center', fontSize: 9.5, color: theme.muted, padding: '20px 0 10px', opacity: 0.5, fontWeight: 600 }}>Powered by Aria · updates live</div>
    </div>
  )
}

// ── Design panel sections ──────────────────────────────────────────────────

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
        <div style={{ fontSize: 10, color: '#4b7a5a', lineHeight: 1.5 }}>"Post your menu to Google Business + tomorrow&apos;s SMS?"</div>
      </div>
    </div>
  )
}

// ── Schedule section ───────────────────────────────────────────────────────

function ScheduleSection({ cfg, onUpdate }: {
  cfg: MenuCfg
  onUpdate: (patch: Partial<MenuCfg>) => void
}) {
  const hasSchedule = !!(cfg.active_from && cfg.active_to && cfg.days_of_week && cfg.days_of_week.length > 0)

  function toggleDay(d: number) {
    const cur = cfg.days_of_week ?? []
    const next = cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d].sort()
    onUpdate({ days_of_week: next.length > 0 ? next : null })
  }

  function clearSchedule() {
    onUpdate({ active_from: null, active_to: null, days_of_week: null })
  }

  return (
    <div>
      <div style={{ fontSize: 10, color: '#71717a', marginBottom: 10, lineHeight: 1.5 }}>
        Optional · AEST. When scheduled, this menu replaces the default during the set window.
      </div>

      {hasSchedule && (
        <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '6px 10px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10.5, color: '#16a34a', fontWeight: 600 }}>
            {'Active: ' + cfg.active_from!.slice(0, 5) + ' – ' + cfg.active_to!.slice(0, 5) + ' AEST'}
          </span>
          <button onClick={clearSchedule} style={{ fontSize: 10, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Clear</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#71717a', marginBottom: 3 }}>From (AEST)</div>
          <input
            type="time"
            value={cfg.active_from?.slice(0, 5) ?? ''}
            onChange={e => onUpdate({ active_from: e.target.value ? e.target.value + ':00' : null })}
            style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1.5px solid #e4e4e7', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#71717a', marginBottom: 3 }}>To (AEST)</div>
          <input
            type="time"
            value={cfg.active_to?.slice(0, 5) ?? ''}
            onChange={e => onUpdate({ active_to: e.target.value ? e.target.value + ':00' : null })}
            style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1.5px solid #e4e4e7', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const }}
          />
        </div>
      </div>

      <div style={{ fontSize: 10, fontWeight: 600, color: '#71717a', marginBottom: 5 }}>Days active</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
        {DAYS.map((d, i) => {
          const on = (cfg.days_of_week ?? []).includes(i)
          return (
            <button key={d} onClick={() => toggleDay(i)} style={{ padding: '4px 8px', borderRadius: 20, border: '1.5px solid ' + (on ? '#18181b' : '#e4e4e7'), background: on ? '#18181b' : '#fff', color: on ? '#fff' : '#71717a', fontSize: 10.5, fontWeight: 600, cursor: 'pointer' }}>{d}</button>
          )
        })}
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f4f4f5', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#18181b' }}>Available now</div>
          <div style={{ fontSize: 10.5, color: '#71717a', marginTop: 2 }}>Same flag as your POS · greys the live menu</div>
        </div>
        <button onClick={() => onUpdate({ hidden: !isHidden })} style={{ width: 36, height: 20, borderRadius: 10, background: isHidden ? '#e4e4e7' : '#18181b', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
          <div style={{ position: 'absolute', top: 3, left: isHidden ? 3 : 17, width: 14, height: 14, borderRadius: '50%', background: '#fff' }} />
        </button>
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10.5, fontWeight: 600, color: '#71717a', display: 'block', marginBottom: 4 }}>Description</label>
        <textarea
          value={override.desc !== undefined ? override.desc : (product.description ?? '')}
          onChange={e => onUpdate({ desc: e.target.value })}
          placeholder={product.description ?? 'No description'}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e4e4e7', fontSize: 12, resize: 'vertical' as const, minHeight: 60, boxSizing: 'border-box' as const, fontFamily: 'inherit', color: '#18181b', outline: 'none' }}
        />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10.5, fontWeight: 600, color: '#71717a', display: 'block', marginBottom: 4 }}>Photo override</label>
        {photoSrc && <img src={photoSrc} alt="" style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 8, marginBottom: 6 }} />}
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => fileRef.current?.click()} disabled={imgBusy} style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: '1.5px solid #e4e4e7', background: '#fff', color: '#18181b', fontSize: 11, fontWeight: 600, cursor: imgBusy ? 'wait' : 'pointer' }}>{imgBusy ? 'Uploading…' : '⬆ Upload photo'}</button>
          {override.photo_url && <button onClick={() => onUpdate({ photo_url: undefined })} style={{ padding: '7px 10px', borderRadius: 8, border: '1.5px solid #fca5a5', background: '#fff', color: '#dc2626', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Remove</button>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
      </div>
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

export default function MenuBuilderClient({ businessId: _bid, slug, businessName, logoUrl: _logoUrl, menuUrl, initialConfigs, initialCats, initialProducts }: Props) {
  const defaultConfigs = initialConfigs.length > 0 ? initialConfigs : [{
    id: undefined, menu_key: 'main', menu_label: 'Main Menu', is_default: true,
    active_from: null, active_to: null, days_of_week: null,
    template_id: 'editorial', brand_kit: {}, section_order: [], item_overrides: {}, background_id: 'none', is_published: false,
  }]

  const [configs, setConfigs] = useState<MenuCfg[]>(defaultConfigs)
  const [activeMenuId, setActiveMenuId] = useState<string | undefined>(
    (defaultConfigs.find(c => c.is_default) ?? defaultConfigs[0])?.id
  )
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [sheetContent, setSheetContent] = useState<string | null>(null)
  const [outputMode, setOutputMode] = useState<'digital' | 'a4'>('digital')
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [isMobile, setIsMobile] = useState(false)
  const [imgBusy, setImgBusy] = useState(false)
  const [publishBusy, setPublishBusy] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [importStep, setImportStep] = useState<'idle' | 'analysing' | 'review' | 'creating'>('idle')
  const [importItems, setImportItems] = useState<ExtractedItem[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const [newMenuLabel, setNewMenuLabel] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const importFileRef = useRef<HTMLInputElement | null>(null)
  const router = useRouter()
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 1000)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Derive the active config
  const cfg = configs.find(c => c.id === activeMenuId) ?? configs[0]

  // Per-menu public URL: default uses /menu/<slug>, others use /menu/<slug>/<menu_key>
  const activeMenuUrl = cfg?.is_default ? menuUrl : menuUrl + '/' + (cfg?.menu_key ?? '')

  const save = useCallback(async (c: MenuCfg) => {
    if (!c.menu_key) return
    setSaveState('saving')
    try {
      const res = await fetch('/api/pos/menu-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, ...c }),
      })
      if (!res.ok) { setSaveState('unsaved'); return }
      setSaveState('saved')
    } catch {
      setSaveState('unsaved')
    }
  }, [])

  function updateCfg(partial: Partial<MenuCfg>) {
    setConfigs(prev => {
      const idx = prev.findIndex(c => c.id === activeMenuId)
      if (idx < 0) return prev
      const next = { ...prev[idx], ...partial }
      const updated = [...prev]
      updated[idx] = next
      setSaveState('unsaved')
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => { void save(next) }, 1500)
      return updated
    })
  }

  function updateBk(partial: Partial<BrandKit>) {
    updateCfg({ brand_kit: { ...(cfg?.brand_kit ?? {}), ...partial } })
  }

  function updateItemOv(id: string, partial: Partial<ItemOverride>) {
    updateCfg({ item_overrides: { ...(cfg?.item_overrides ?? {}), [id]: { ...((cfg?.item_overrides ?? {})[id] ?? {}), ...partial } } })
  }

  function selectTemplate(templateId: string) {
    const tpl = TEMPLATES.find(t => t.id === templateId) ?? TEMPLATES[0]
    updateCfg({ template_id: templateId, brand_kit: { ...(cfg?.brand_kit ?? {}), accent: tpl.look.accent, font: tpl.font } })
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
    if (!cfg) return
    setPublishBusy(true)
    try {
      const next = { ...cfg, is_published: true }
      setConfigs(prev => prev.map(c => c.id === next.id ? next : c))
      await fetch('/api/pos/menu-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: next.id, is_published: true }),
      })
      setSaveState('saved')
      showToast('✓ Published — your menu is live')
    } finally {
      setPublishBusy(false)
    }
  }

  async function handleDownloadPdf() {
    if (!cfg) return
    setPdfBusy(true)
    try {
      const url = '/api/pos/menu-pdf' + (cfg.is_default ? '' : '?menu_key=' + encodeURIComponent(cfg.menu_key))
      const res = await fetch(url)
      if (!res.ok) throw new Error('PDF failed (' + res.status + ')')
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = cfg.menu_key + '-menu.pdf'
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(a.href)
    } catch {
      showToast('PDF generation failed — try again.')
    } finally {
      setPdfBusy(false)
    }
  }

  async function createMenu() {
    if (!newMenuLabel.trim()) return
    setCreateBusy(true)
    try {
      const res = await fetch('/api/pos/menu-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menu_label: newMenuLabel.trim() }),
      })
      const data = await res.json() as { config?: MenuCfg; error?: string }
      if (data.config) {
        setConfigs(prev => [...prev, data.config!])
        setActiveMenuId(data.config.id)
        showToast('Menu "' + newMenuLabel.trim() + '" created')
      }
      setShowCreateMenu(false)
      setNewMenuLabel('')
    } catch {
      showToast('Failed to create menu')
    } finally {
      setCreateBusy(false)
    }
  }

  async function setAsDefault(id: string) {
    const res = await fetch('/api/pos/menu-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_default: true }),
    })
    const data = await res.json() as { configs?: MenuCfg[] }
    if (data.configs) {
      setConfigs(data.configs)
      showToast('Default menu updated')
    }
  }

  async function deleteMenu(id: string) {
    setDeleteBusy(true)
    try {
      const res = await fetch('/api/pos/menu-config?id=' + encodeURIComponent(id), { method: 'DELETE' })
      if (res.ok) {
        setConfigs(prev => {
          const next = prev.filter(c => c.id !== id)
          if (activeMenuId === id) setActiveMenuId(next[0]?.id)
          return next
        })
        showToast('Menu deleted')
      } else {
        const d = await res.json() as { error?: string }
        showToast(d.error ?? 'Delete failed')
      }
    } finally {
      setDeleteBusy(false)
    }
  }

  async function handleImportFile(file: File) {
    setImportStep('analysing')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/pos/menu-extract', { method: 'POST', body: fd })
      const data = await res.json() as { items?: ExtractedItem[]; error?: string }
      if (!res.ok || data.error) { setImportStep('idle'); showToast(data.error ?? 'Extraction failed'); return }
      setImportItems(data.items ?? [])
      setImportStep('review')
    } catch {
      setImportStep('idle')
      showToast('Network error — check your connection and try again.')
    }
  }

  function updateImportItem(id: string, patch: Partial<ExtractedItem>) {
    setImportItems(prev => prev.map(it => it._id === id ? { ...it, ...patch } : it))
  }

  async function handleApproveImport() {
    setImportStep('creating')
    const active = importItems.filter(it => !it.removed && it.name.trim().length > 0 && it.price > 0)
    const catMap = new Map<string, string>(initialCats.map(c => [c.name.toLowerCase(), c.id]))
    const existingKeys = new Set(initialProducts.map(p => p.name.trim().toLowerCase() + '|' + (p.category_id ?? '')))
    let created = 0, skipped = 0, nextSort = initialProducts.length
    for (const item of active) {
      const catKey = item.category.trim().toLowerCase()
      if (!catMap.has(catKey)) {
        try {
          const catRes = await fetch('/api/pos/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: item.category.trim(), is_active: true }) })
          if (catRes.ok) { const cd = await catRes.json() as { category?: { id: string } }; if (cd.category?.id) catMap.set(catKey, cd.category.id) }
        } catch { /* non-fatal */ }
      }
      const catId = catMap.get(catKey) ?? null
      const dk = item.name.trim().toLowerCase() + '|' + (catId ?? '')
      if (existingKeys.has(dk)) { skipped++; continue }
      existingKeys.add(dk)
      try {
        const pr = await fetch('/api/pos/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: item.name.trim(), price: item.price, description: item.description.trim() || null, category_id: catId, is_active: true, sort_order: nextSort++, image_source: 'pending' }) })
        if (pr.ok) created++
      } catch { /* non-fatal */ }
    }
    setImportStep('idle'); setImportItems([])
    const msg = created > 0 ? '✓ ' + created + ' product' + (created !== 1 ? 's' : '') + ' added' + (skipped > 0 ? ' · ' + skipped + ' skipped' : '') : skipped > 0 ? 'All items already exist.' : 'No items were added.'
    showToast(msg)
    if (created > 0) router.refresh()
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

  if (!cfg) return null

  const theme = deriveTheme(cfg)

  let orderedCats = initialCats
  if (cfg.section_order.length > 0) {
    const pos: Record<string, number> = {}
    cfg.section_order.forEach((id, i) => { pos[id] = i })
    orderedCats = [...initialCats].sort((a, b) => (pos[a.id] ?? 9999) - (pos[b.id] ?? 9999) || a.name.localeCompare(b.name))
  }

  const C = { bg: '#f4f4f5', card: '#fff', border: '#e4e4e7', ink: '#18181b', muted: '#71717a', accent: '#2D5240' }

  // ── Design panel content ───────────────────────────────────────────────

  function renderDesignPanelContent(scope?: string) {
    const s = scope ?? 'all'
    return (
      <div style={{ padding: 14 }}>
        {(s === 'all' || s === 'menus') && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.ink, marginBottom: 8 }}>Schedule</div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: '#71717a', marginBottom: 4 }}>Menu name</div>
              <input
                value={cfg.menu_label}
                onChange={e => updateCfg({ menu_label: e.target.value })}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1.5px solid #e4e4e7', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const, color: C.ink }}
              />
            </div>
            {!cfg.is_default && (
              <div style={{ marginBottom: 10 }}>
                <button onClick={() => { if (cfg.id) void setAsDefault(cfg.id) }} style={{ width: '100%', padding: '7px 0', borderRadius: 8, border: '1.5px solid ' + C.accent, background: 'transparent', color: C.accent, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                  Set as default menu
                </button>
              </div>
            )}
            {cfg.is_default && <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 600, marginBottom: 8 }}>✓ This is the default menu</div>}
            {!cfg.is_default && (
              <ScheduleSection cfg={cfg} onUpdate={updateCfg} />
            )}
            {!cfg.is_default && configs.length > 1 && (
              <button onClick={() => { if (cfg.id && window.confirm('Delete "' + cfg.menu_label + '"? This cannot be undone.')) void deleteMenu(cfg.id) }} disabled={deleteBusy} style={{ width: '100%', marginTop: 14, padding: '7px 0', borderRadius: 8, border: '1.5px solid #fca5a5', background: 'transparent', color: '#dc2626', fontSize: 11, fontWeight: 600, cursor: deleteBusy ? 'wait' : 'pointer' }}>
                Delete this menu
              </button>
            )}
          </div>
        )}
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
            <ShareSection menuUrl={activeMenuUrl} />
          </div>
        )}
      </div>
    )
  }

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
    if (!isMobile) return renderDesignPanelContent('all')
    return null
  }

  function renderItemsPanel() {
    const knownCatIds = new Set(orderedCats.map(c => c.id))
    const uncatProds = initialProducts.filter(p => !p.category_id || !knownCatIds.has(p.category_id))
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
          <button onClick={() => importFileRef.current?.click()} title="Upload a photo of your existing menu — AI extracts items for review" style={{ padding: '5px 9px', borderRadius: 7, border: '1.5px solid ' + C.border, background: C.card, color: C.ink, fontSize: 10.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0 }}>⬆ Import</button>
          <input ref={importFileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { void handleImportFile(f) } e.target.value = '' }} />
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
                    {p.image_url ? <img src={p.image_url} alt="" style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} /> : <div style={{ width: 34, height: 34, borderRadius: 6, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>☕</div>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{p.name}</div>
                      {p.description && <div style={{ fontSize: 10, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{p.description}</div>}
                    </div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: C.ink, flexShrink: 0 }}>{'A$' + p.price.toFixed(2)}</div>
                    <button onClick={e => { e.stopPropagation(); const cur = cfg.item_overrides[p.id]?.hidden ?? false; updateItemOv(p.id, { hidden: !cur }) }} title={isHidden ? 'Show on menu' : 'Hide from menu'} style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid ' + (isHidden ? C.border : C.accent), background: isHidden ? 'transparent' : C.accent, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {!isHidden && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
                    </button>
                  </div>
                )
              })}
            </div>
          )
        })}
        {uncatProds.length > 0 && (
          <div>
            <div style={{ padding: '8px 12px', background: '#fef3c7', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid ' + C.border }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#92400e', flex: 1 }}>Uncategorised</span>
              <span style={{ fontSize: 10.5, color: '#92400e' }}>{uncatProds.filter(p => !cfg.item_overrides[p.id]?.hidden).length}/{uncatProds.length}</span>
            </div>
            {uncatProds.map(p => {
              const isHidden = cfg.item_overrides[p.id]?.hidden ?? false
              const sel = selectedItemId === p.id
              return (
                <div key={p.id} onClick={() => openItemEditor(p.id)} style={{ padding: '8px 12px', borderBottom: '1px solid ' + C.border, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: sel ? '#f0fdf4' : (isHidden ? '#fafafa' : C.card), opacity: isHidden ? 0.5 : 1 }}>
                  <span style={{ fontSize: 14, color: C.muted, cursor: 'grab' }}>⠿</span>
                  {p.image_url ? <img src={p.image_url} alt="" style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} /> : <div style={{ width: 34, height: 34, borderRadius: 6, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>☕</div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{p.name}</div>
                    {p.description && <div style={{ fontSize: 10, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{p.description}</div>}
                  </div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: C.ink, flexShrink: 0 }}>{'A$' + p.price.toFixed(2)}</div>
                  <button onClick={e => { e.stopPropagation(); const cur = cfg.item_overrides[p.id]?.hidden ?? false; updateItemOv(p.id, { hidden: !cur }) }} title={isHidden ? 'Show on menu' : 'Hide from menu'} style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid ' + (isHidden ? C.border : C.accent), background: isHidden ? 'transparent' : C.accent, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {!isHidden && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
                  </button>
                </div>
              )
            })}
          </div>
        )}
        {orderedCats.length === 0 && uncatProds.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: C.muted }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>☕</div>
            <p style={{ fontSize: 12, fontWeight: 600, margin: 0 }}>No categories yet</p>
            <p style={{ fontSize: 11, marginTop: 4 }}>Add categories and products in your POS to see them here.</p>
          </div>
        )}
      </div>
    )
  }

  const MOBILE_TABS = [
    { id: 'items',    icon: '≣', label: 'Items' },
    { id: 'menus',   icon: '☰', label: 'Menus' },
    { id: 'template', icon: '◳', label: 'Template' },
    { id: 'brand',    icon: '✦', label: 'Brand' },
    { id: 'bg',       icon: '▦', label: 'Bg' },
    { id: 'layout',   icon: '▤', label: 'Layout' },
    { id: 'share',    icon: '↗', label: 'Share' },
  ]

  const saveLabel = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : '•'
  const activeImportCount = importItems.filter(it => !it.removed).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.bg, overflow: 'hidden', fontFamily: "'Inter',system-ui,sans-serif" }}>

      {/* Topbar */}
      <div style={{ height: 48, display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', background: C.card, borderBottom: '1px solid ' + C.border, flexShrink: 0, zIndex: 20 }}>
        <span style={{ fontWeight: 800, fontSize: 14, color: C.accent, letterSpacing: '-0.5px', fontFamily: "'Fraunces',Georgia,serif", fontStyle: 'italic' }}>aria</span>
        <span style={{ fontSize: 12, color: C.muted }}>Menu ·</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{businessName}</span>
        <div style={{ flex: 1 }} />
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
        <button onClick={() => window.open(activeMenuUrl, '_blank')} style={{ padding: '5px 10px', borderRadius: 7, border: '1.5px solid ' + C.border, background: C.card, color: C.ink, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>Preview ↗</button>
        <button onClick={() => { void handlePublish() }} disabled={publishBusy} style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: cfg.is_published ? '#16a34a' : C.accent, color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: publishBusy ? 'wait' : 'pointer', opacity: publishBusy ? 0.7 : 1 }}>
          {publishBusy ? 'Publishing…' : cfg.is_published ? '✓ Published' : 'Publish'}
        </button>
      </div>

      {/* Multi-menu switcher bar */}
      <div style={{ height: 40, display: 'flex', alignItems: 'center', gap: 0, background: C.card, borderBottom: '1px solid ' + C.border, flexShrink: 0, overflowX: 'auto' as const, paddingLeft: 8, zIndex: 15 }}>
        {configs.map(m => {
          const isActive = m.id === activeMenuId
          const hasSchedule = !!(m.active_from && m.active_to && m.days_of_week && m.days_of_week.length > 0)
          return (
            <button
              key={m.id ?? m.menu_key}
              onClick={() => { setActiveMenuId(m.id); setSelectedItemId(null) }}
              style={{ flexShrink: 0, height: '100%', padding: '0 14px', border: 'none', borderBottom: '2px solid ' + (isActive ? C.accent : 'transparent'), background: 'transparent', color: isActive ? C.accent : C.muted, fontSize: 12, fontWeight: isActive ? 700 : 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, transition: 'color 0.15s' }}
            >
              {m.menu_label}
              {m.is_default && <span style={{ fontSize: 9, background: '#f0fdf4', color: '#16a34a', borderRadius: 8, padding: '1px 5px', fontWeight: 700 }}>Default</span>}
              {hasSchedule && !m.is_default && <span style={{ fontSize: 9 }}>🕐</span>}
            </button>
          )
        })}
        <button
          onClick={() => setShowCreateMenu(true)}
          style={{ flexShrink: 0, height: '100%', padding: '0 12px', border: 'none', background: 'transparent', color: C.muted, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          title="Add a new menu"
        >+</button>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.card, borderRadius: 10, padding: '6px 12px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', width: '100%', maxWidth: 400, boxSizing: 'border-box' as const }}>
            <span style={{ fontSize: 10.5, color: C.muted, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1 }}>{activeMenuUrl.replace('https://', '')}</span>
            {outputMode === 'a4' && (
              <button onClick={() => { void handleDownloadPdf() }} disabled={pdfBusy} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: C.accent, color: '#fff', fontSize: 10.5, fontWeight: 700, cursor: pdfBusy ? 'wait' : 'pointer', opacity: pdfBusy ? 0.7 : 1, whiteSpace: 'nowrap' as const, flexShrink: 0 }}>
                {pdfBusy ? 'Generating…' : '⬇ PDF'}
              </button>
            )}
          </div>

          {outputMode === 'digital' && (
            <div style={{ width: 360, maxWidth: '100%', borderRadius: 32, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.25), 0 0 0 8px #1a1a1a, 0 0 0 9px #333', background: '#fff', flexShrink: 0 }}>
              <div style={{ height: 28, background: '#1a1a1a', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <div style={{ width: 80, height: 6, borderRadius: 3, background: '#333' }} />
              </div>
              <div style={{ height: 580, overflowY: 'auto' as const, overflowX: 'hidden' as const }}>
                <MiniMenu cats={initialCats} products={initialProducts} cfg={cfg} businessName={businessName} theme={theme} />
              </div>
            </div>
          )}

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
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: theme.accent }}>{'A$' + p.price.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )
              })}
              {(() => {
                const a4CatIds = new Set(orderedCats.map(c => c.id))
                const a4Uncat = initialProducts.filter(p => (!p.category_id || !a4CatIds.has(p.category_id)) && !cfg.item_overrides[p.id]?.hidden)
                if (a4Uncat.length === 0) return null
                return (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '1.2px', color: theme.muted, marginBottom: 5 }}>Other</div>
                    {a4Uncat.map(p => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 4, marginBottom: 4 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 600 }}>{p.name}</span>
                        <div style={{ flex: 1, borderBottom: '1.5px dotted ' + theme.line, marginBottom: 2, opacity: 0.4 }} />
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: theme.accent }}>{'A$' + p.price.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}
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

      {isMobile && sheetContent && <div onClick={() => setSheetContent(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }} />}

      {isMobile && sheetContent && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: C.card, borderRadius: '18px 18px 0 0', zIndex: 50, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div onClick={() => setSheetContent(null)} style={{ width: 36, height: 4, borderRadius: 2, background: '#d4d4d8', margin: '10px auto 0', cursor: 'pointer', flexShrink: 0 }} />
          <div style={{ overflowY: 'auto' as const, flex: 1, padding: '4px 0 32px' }}>
            {sheetContent === 'items' && <div style={{ padding: '10px 0' }}><div style={{ fontSize: 14, fontWeight: 700, padding: '0 14px 10px', color: C.ink }}>Menu items</div>{renderItemsPanel()}</div>}
            {sheetContent === 'editor' && selectedProduct && (
              <div style={{ padding: 14 }}>
                <ItemEditor product={selectedProduct} override={selectedOverride} onUpdate={partial => updateItemOv(selectedItemId!, partial)} onClose={closeItemEditor} onUploadPhoto={f => { void uploadItemPhoto(selectedItemId!, f) }} imgBusy={imgBusy} />
                <button onClick={closeItemEditor} style={{ width: '100%', marginTop: 12, padding: 13, borderRadius: 12, border: 'none', background: C.ink, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Done</button>
              </div>
            )}
            {sheetContent !== 'items' && sheetContent !== 'editor' && <div style={{ padding: '10px 0' }}>{renderDesignPanelContent(sheetContent)}</div>}
          </div>
        </div>
      )}

      {/* Create menu modal */}
      {showCreateMenu && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.ink, marginBottom: 4 }}>New menu</div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 16 }}>e.g. Breakfast, Lunch, Dinner, Weekend</div>
            <input
              autoFocus
              value={newMenuLabel}
              onChange={e => setNewMenuLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void createMenu() }}
              placeholder="Menu name"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e4e4e7', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, marginBottom: 14, color: C.ink }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowCreateMenu(false); setNewMenuLabel('') }} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1.5px solid #e4e4e7', background: '#fff', color: C.ink, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => { void createMenu() }} disabled={createBusy || !newMenuLabel.trim()} style={{ flex: 2, padding: 11, borderRadius: 10, border: 'none', background: newMenuLabel.trim() ? C.accent : '#e4e4e7', color: newMenuLabel.trim() ? '#fff' : '#a1a1aa', fontSize: 13, fontWeight: 700, cursor: createBusy || !newMenuLabel.trim() ? 'not-allowed' : 'pointer' }}>
                {createBusy ? 'Creating…' : 'Create menu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {importStep === 'analysing' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' as const, gap: 14 }}>
          <div style={{ fontSize: 36 }}>🔍</div>
          <div style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>Analysing your menu…</div>
          <div style={{ color: '#a1a1aa', fontSize: 12 }}>AI is reading item names and prices</div>
        </div>
      )}

      {importStep === 'creating' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' as const, gap: 14 }}>
          <div style={{ fontSize: 36 }}>✨</div>
          <div style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>Creating products…</div>
          <div style={{ color: '#a1a1aa', fontSize: 12 }}>Adding items to your catalog</div>
        </div>
      )}

      {importStep === 'review' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: '18px 18px 0 0', width: '100%', maxWidth: 680, maxHeight: '92vh', display: 'flex', flexDirection: 'column' as const, boxShadow: '0 -8px 40px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '16px 20px 10px', borderBottom: '1px solid #e4e4e7', flexShrink: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#18181b' }}>Review extracted items</div>
              <div style={{ fontSize: 11, color: '#d97706', marginTop: 3, fontWeight: 600 }}>⚠ AI may misread prices — verify every price before adding</div>
              <div style={{ fontSize: 10.5, color: '#71717a', marginTop: 2 }}>{activeImportCount + ' item' + (activeImportCount !== 1 ? 's' : '') + ' across ' + new Set(importItems.filter(it => !it.removed).map(it => it.category)).size + ' section' + (new Set(importItems.filter(it => !it.removed).map(it => it.category)).size !== 1 ? 's' : '') + ' will be added to your products'}</div>
            </div>
            <div style={{ overflowY: 'auto' as const, flex: 1 }}>
              {Object.entries(importItems.reduce((acc: Record<string, ExtractedItem[]>, item) => { const cat = item.category || 'General'; if (!acc[cat]) acc[cat] = []; acc[cat].push(item); return acc }, {})).map(([cat, catItems]) => (
                <div key={cat}>
                  <div style={{ padding: '7px 20px', background: '#f4f4f5', fontSize: 10, fontWeight: 700, color: '#71717a', textTransform: 'uppercase' as const, letterSpacing: '0.8px', borderBottom: '1px solid #e4e4e7', borderTop: '1px solid #e4e4e7' }}>{cat}</div>
                  {(catItems as ExtractedItem[]).map(item => (
                    <div key={item._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px', borderBottom: '1px solid #f4f4f5', opacity: item.removed ? 0.4 : 1, background: item.removed ? '#fafafa' : '#fff' }}>
                      <button onClick={() => updateImportItem(item._id, { removed: !item.removed })} style={{ width: 22, height: 22, borderRadius: 5, border: '1.5px solid ' + (item.removed ? '#e4e4e7' : '#fca5a5'), background: item.removed ? '#f4f4f5' : '#fee2e2', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: item.removed ? '#a1a1aa' : '#dc2626' }}>{item.removed ? '+' : '✕'}</button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <input value={item.name} onChange={e => updateImportItem(item._id, { name: e.target.value })} style={{ width: '100%', fontSize: 12, fontWeight: 600, color: '#18181b', border: 'none', outline: 'none', background: 'transparent', padding: 0, marginBottom: 1 }} placeholder="Item name" />
                        <input value={item.description} onChange={e => updateImportItem(item._id, { description: e.target.value })} style={{ width: '100%', fontSize: 10.5, color: '#71717a', border: 'none', outline: 'none', background: 'transparent', padding: 0 }} placeholder="Description (optional)" />
                      </div>
                      <input value={item.category} onChange={e => updateImportItem(item._id, { category: e.target.value })} style={{ width: 78, fontSize: 9.5, color: '#71717a', border: '1.5px solid #e4e4e7', borderRadius: 20, padding: '2px 7px', outline: 'none', background: '#f4f4f5', textAlign: 'center' as const }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                        <span style={{ fontSize: 11, color: '#71717a' }}>$</span>
                        <input type="number" min="0.01" step="0.01" value={item.price} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) updateImportItem(item._id, { price: v }) }} style={{ width: 58, fontSize: 12, fontWeight: 700, color: '#18181b', border: '1.5px solid #e4e4e7', borderRadius: 6, padding: '3px 5px', outline: 'none', textAlign: 'right' as const }} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #e4e4e7', display: 'flex', gap: 8, flexShrink: 0 }}>
              <button onClick={() => { setImportStep('idle'); setImportItems([]) }} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1.5px solid #e4e4e7', background: '#fff', color: '#18181b', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => { void handleApproveImport() }} disabled={activeImportCount === 0} style={{ flex: 2, padding: 11, borderRadius: 10, border: 'none', background: activeImportCount === 0 ? '#e4e4e7' : C.accent, color: activeImportCount === 0 ? '#a1a1aa' : '#fff', fontSize: 13, fontWeight: 700, cursor: activeImportCount === 0 ? 'not-allowed' : 'pointer' }}>
                {'Add ' + activeImportCount + ' item' + (activeImportCount !== 1 ? 's' : '') + ' to products →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', background: '#18181b', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 12, fontWeight: 600, zIndex: 100, whiteSpace: 'nowrap' as const, boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
