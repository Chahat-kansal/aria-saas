// A4 print PDF renderer — mirrors rA4() from the mockup exactly.
// NO photos; dotted-leader rows (.a4row); CSS grid columns (not CSS columns:);
// categories split first-half/second-half across cols; .a4h inline header (no cover page).
// Reuses generateReportPdf() from report-pdf.ts (puppeteer-core + @sparticuz/chromium).

type ItemOverride = { desc?: string; photo_url?: string; badge?: string; price_override?: number; hidden?: boolean }
type BrandKit  = { accent?: string; font?: string; logoEmoji?: string; showDesc?: boolean; printCols?: number }
type MenuCfg   = { template_id: string; brand_kit: BrandKit; section_order: string[]; item_overrides: Record<string, ItemOverride>; background_id: string; is_published: boolean }
type Category  = { id: string; name: string; color: string | null }
type Product   = { id: string; name: string; description: string | null; price: number; image_url: string | null; category_id: string | null; sort_order: number | null }

const TEMPLATES = [
  { id: 'editorial', font: 'Fraunces',         fontCss: "'Fraunces',Georgia,serif",             look: { bg: '#fbf8f1', ink: '#1a1206', accent: '#BA7517', muted: '#7a6a52' } },
  { id: 'pipel',     font: 'Space Grotesk',     fontCss: "'Space Grotesk',system-ui,sans-serif", look: { bg: '#0a0a0a', ink: '#fafafa', accent: '#d9f54e', muted: '#888888' } },
  { id: 'garden',    font: 'Cormorant',         fontCss: "'Cormorant',Georgia,serif",             look: { bg: '#f4f7f3', ink: '#21372b', accent: '#7FB897', muted: '#4a6b58' } },
  { id: 'grand',     font: 'Playfair Display',  fontCss: "'Playfair Display',Georgia,serif",      look: { bg: '#fffdf9', ink: '#161616', accent: '#9a7b3f', muted: '#6b6050' } },
  { id: 'mono',      font: 'Inter',             fontCss: "'Inter',system-ui,sans-serif",          look: { bg: '#ffffff', ink: '#111111', accent: '#111111', muted: '#71717a' } },
  { id: 'noir',      font: 'Inter',             fontCss: "'Inter',system-ui,sans-serif",          look: { bg: '#16151a', ink: '#f4f4f5', accent: '#e8a87c', muted: '#9ca3af' } },
]

const FONT_PARAMS: Record<string, string> = {
  'Fraunces':         'Fraunces:ital,wght@0,400;0,600;0,700;1,400;1,700',
  'Space Grotesk':    'Space+Grotesk:wght@400;600;700',
  'Cormorant':        'Cormorant:ital,wght@0,400;0,600;1,400;1,600',
  'Playfair Display': 'Playfair+Display:ital,wght@0,400;0,700;1,400',
  'Inter':            'Inter:wght@400;600;700',
}

const BGS: Record<string, string> = {
  flowers: 'radial-gradient(circle at 18% 12%,#f6d7e4cc,transparent 36%),radial-gradient(circle at 82% 78%,#e9c6dccc,transparent 38%)',
  coffee:  'radial-gradient(circle at 75% 18%,#caa98266,transparent 42%),radial-gradient(circle at 22% 82%,#a87f4f66,transparent 45%)',
  linen:   'repeating-linear-gradient(45deg,#00000008 0 2px,transparent 2px 7px),repeating-linear-gradient(-45deg,#00000008 0 2px,transparent 2px 7px)',
  marble:  'radial-gradient(circle at 28% 30%,#ececef,transparent 52%),radial-gradient(circle at 72% 70%,#dededf,transparent 55%)',
  botanic: 'radial-gradient(circle at 12% 88%,#7FB89744,transparent 40%),radial-gradient(circle at 88% 12%,#2D524033,transparent 42%)',
  warm:    'linear-gradient(135deg,#ffe9d0bb,#ffd9b388)',
}

const LOGOS = ['☕', '🌿', '✦', 'S', '🫐', '◆']

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function renderMenuHtml(opts: {
  businessName: string
  locationSubtitle?: string | null
  config: MenuCfg
  categories: Category[]
  products: Product[]
}): string {
  const { businessName, locationSubtitle, config, categories, products } = opts

  const bk        = config.brand_kit ?? {}
  const printCols = bk.printCols ?? 1
  const showDesc  = bk.showDesc  ?? true
  const logoEmoji = bk.logoEmoji ?? LOGOS[0]

  const tpl    = TEMPLATES.find(t => t.id === config.template_id) ?? TEMPLATES[0]
  const accent = bk.accent ?? tpl.look.accent
  const { bg, ink, muted } = tpl.look
  const fontCss = tpl.fontCss
  const fontUrl = FONT_PARAMS[tpl.font] ?? FONT_PARAMS['Inter']

  const bgCss = BGS[config.background_id ?? 'none'] ?? ''
  // Scrim mirrors mockup scrim(): dark templates → dark overlay, light → white veil
  const scrim = bgCss
    ? (bg === '#0a0a0a' || bg === '#16151a' ? 'rgba(15,15,18,.55)' : 'rgba(255,255,255,.6)')
    : 'transparent'

  // Section order: pinned first, remaining in DB order
  const catMap        = new Map(categories.map(c => [c.id, c]))
  const pinned        = (config.section_order ?? []).filter(id => catMap.has(id))
  const restIds       = categories.map(c => c.id).filter(id => !pinned.includes(id))
  const orderedCatIds = [...pinned, ...restIds]

  const overrides = config.item_overrides ?? {}

  // One dotted-leader item row + optional description sub-row (.a4row spec)
  function itemRow(p: Product): string {
    const ov    = overrides[p.id] ?? {}
    const name  = p.name
    const desc  = ov.desc !== undefined ? ov.desc : (p.description ?? '')
    const price = ov.price_override !== undefined ? ov.price_override : p.price

    const row =
      `<div style="display:flex;justify-content:space-between;gap:6px;align-items:baseline;margin:6px 0;">` +
        `<span style="font-weight:600;font-size:11.5px;">${esc(name)}</span>` +
        `<span style="flex:1;border-bottom:1.5px dotted ${ink};opacity:0.3;margin:0 4px;display:inline-block;position:relative;top:-3px;"></span>` +
        `<span style="font-weight:700;font-size:11.5px;color:${accent};white-space:nowrap;">A$${price.toFixed(2)}</span>` +
      `</div>`

    const descRow = showDesc && desc
      ? `<div style="margin-top:-4px;margin-bottom:2px;"><span style="font-size:8.5px;opacity:0.55;display:block;">${esc(desc)}</span></div>`
      : ''

    return row + descRow
  }

  // One category block: .a4cat heading (with inline rule-line) + item rows
  function catSection(catId: string, headingColor: string): string {
    const cat   = catMap.get(catId)
    if (!cat) return ''
    const prods = products.filter(p => p.category_id === catId && !overrides[p.id]?.hidden)
    if (prods.length === 0) return ''

    return (
      `<div style="margin-bottom:16px;">` +
        `<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;` +
             `margin:10px 0 7px;display:flex;gap:7px;align-items:center;color:${headingColor};">` +
          esc(cat.name) +
          `<span style="flex:1;height:1px;opacity:0.3;background:currentColor;display:inline-block;"></span>` +
        `</div>` +
        prods.map(itemRow).join('') +
      `</div>`
    )
  }

  // Uncategorised → "Other" section (only items with no matching category)
  function uncatSection(): string {
    const prods = products.filter(p => (!p.category_id || !catMap.has(p.category_id)) && !overrides[p.id]?.hidden)
    if (prods.length === 0) return ''
    return (
      `<div style="margin-bottom:16px;">` +
        `<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;` +
             `margin:10px 0 7px;display:flex;gap:7px;align-items:center;color:${muted};">` +
          'Other' +
          `<span style="flex:1;height:1px;opacity:0.3;background:currentColor;display:inline-block;"></span>` +
        `</div>` +
        prods.map(itemRow).join('') +
      `</div>`
    )
  }

  // Split categories: first half → col A, second half → col B (mirrors mockup rA4 half/slice)
  const half      = Math.ceil(orderedCatIds.length / 2)
  const colAIds   = printCols === 2 ? orderedCatIds.slice(0, half) : orderedCatIds
  const colBIds   = printCols === 2 ? orderedCatIds.slice(half)    : []

  const colAHtml  = colAIds.map(id => catSection(id, accent)).join('')
  const colBHtml  = colBIds.map(id => catSection(id, accent)).join('')

  // Uncat: goes below col A in 1-col, below col B in 2-col
  const colAExtra = printCols === 1 ? uncatSection() : ''
  const colBExtra = printCols === 2 ? uncatSection() : ''

  const colsTemplate = printCols === 2 ? '1fr 1fr' : '1fr'

  // .a4sub: hidden when suburb+city both empty
  const subtitleHtml = locationSubtitle
    ? `<div style="font-size:8px;letter-spacing:2.5px;text-transform:uppercase;opacity:0.6;margin-top:4px;">${esc(locationSubtitle)}</div>`
    : ''

  // .a4f footer text: "Business · suburb, city" or just "Business"
  const footerText = locationSubtitle
    ? `${esc(businessName)} · ${esc(locationSubtitle)}`
    : esc(businessName)

  const gFontsUrl = `https://fonts.googleapis.com/css2?family=${fontUrl}&display=swap`

  return (
    `<!DOCTYPE html><html lang="en"><head>` +
    `<meta charset="utf-8">` +
    `<link rel="preconnect" href="https://fonts.googleapis.com">` +
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">` +
    `<link href="${gFontsUrl}" rel="stylesheet">` +
    `<style>` +
      `*{box-sizing:border-box;margin:0;padding:0;}` +
      `html,body{` +
        `background:${bg};color:${ink};font-family:${fontCss};` +
        `-webkit-print-color-adjust:exact;print-color-adjust:exact;` +
        `word-break:normal;overflow-wrap:break-word;white-space:normal;` +
      `}` +
      `@media print{` +
        `html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}` +
        `@page{size:A4 portrait;margin:0;}` +
      `}` +
    `</style>` +
    `</head><body>` +

    // .a4in: padding:34px 32px, background gradient
    `<div style="padding:34px 32px;position:relative;min-height:297mm;${bgCss ? 'background-image:' + bgCss + ';' : ''}">` +
      // Scrim overlay for contrast over background gradients
      (scrim !== 'transparent' ? `<div style="position:absolute;inset:0;background:${scrim};pointer-events:none;"></div>` : '') +
      `<div style="position:relative;z-index:2;">` +

        // .a4h: centered header — inline on same sheet, no separate page
        `<div style="text-align:center;">` +
          // .a4logo: 42px circle, 19px emoji, accent border
          `<div style="width:42px;height:42px;border-radius:50%;border:2px solid ${accent};display:flex;align-items:center;justify-content:center;font-size:19px;color:${accent};margin:0 auto 8px;">${logoEmoji}</div>` +
          // .a4name: 27px/700/-0.5px
          `<div style="font-size:27px;font-weight:700;letter-spacing:-0.5px;">${esc(businessName)}</div>` +
          // .a4sub: 8px uppercase spaced subtitle (hidden if no location)
          subtitleHtml +
          // .a4div: 34px/2px accent bar, margin 11px auto 18px
          `<div style="width:34px;height:2px;background:${accent};margin:11px auto 18px;"></div>` +
        `</div>` +

        // .a4cols: CSS grid (NOT css columns — grid avoids chromium word-break bugs)
        `<div style="display:grid;grid-template-columns:${colsTemplate};gap:24px;">` +
          `<div>${colAHtml}${colAExtra}</div>` +
          (printCols === 2 ? `<div>${colBHtml}${colBExtra}</div>` : '') +
        `</div>` +

        // .a4f: footer
        `<div style="text-align:center;font-size:8px;letter-spacing:1.5px;text-transform:uppercase;opacity:0.5;margin-top:32px;padding-bottom:8px;">${footerText}</div>` +

      `</div>` +
    `</div>` +
    `</body></html>`
  )
}
