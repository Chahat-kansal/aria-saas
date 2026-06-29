// A4 print PDF renderer for Aria menu builder.
// Reads menu_configs curation layer — never writes pos_products.
// Reuses generateReportPdf() from report-pdf.ts (puppeteer-core + @sparticuz/chromium).

type ItemOverride = { desc?: string; photo_url?: string; badge?: string; price_override?: number; hidden?: boolean }
type BrandKit  = { accent?: string; font?: string; logoEmoji?: string; showPhotos?: boolean; showDesc?: boolean; showBadges?: boolean; printCols?: number }
type MenuCfg   = { template_id: string; brand_kit: BrandKit; section_order: string[]; item_overrides: Record<string, ItemOverride>; background_id: string; is_published: boolean }
type Category  = { id: string; name: string; color: string | null }
type Product   = { id: string; name: string; description: string | null; price: number; image_url: string | null; category_id: string | null; sort_order: number | null }

const TEMPLATES = [
  { id: 'editorial', font: 'Fraunces',         fontCss: "'Fraunces',Georgia,serif",              look: { bg: '#fbf8f1', ink: '#1a1206', accent: '#BA7517', accentSoft: '#f5e6c8', line: '#e6ddc9', muted: '#7a6a52' } },
  { id: 'pipel',     font: 'Space Grotesk',     fontCss: "'Space Grotesk',system-ui,sans-serif",  look: { bg: '#0a0a0a', ink: '#fafafa', accent: '#d9f54e', accentSoft: '#2a2e10', line: '#2a2a2a', muted: '#888888' } },
  { id: 'garden',    font: 'Cormorant',         fontCss: "'Cormorant',Georgia,serif",              look: { bg: '#f4f7f3', ink: '#21372b', accent: '#7FB897', accentSoft: '#d4edda', line: '#dde8df', muted: '#4a6b58' } },
  { id: 'grand',     font: 'Playfair Display',  fontCss: "'Playfair Display',Georgia,serif",       look: { bg: '#fffdf9', ink: '#161616', accent: '#9a7b3f', accentSoft: '#f2e8d6', line: '#eceae3', muted: '#6b6050' } },
  { id: 'mono',      font: 'Inter',             fontCss: "'Inter',system-ui,sans-serif",           look: { bg: '#ffffff', ink: '#111111', accent: '#111111', accentSoft: '#e4e4e7', line: '#ededed', muted: '#71717a' } },
  { id: 'noir',      font: 'Inter',             fontCss: "'Inter',system-ui,sans-serif",           look: { bg: '#16151a', ink: '#f4f4f5', accent: '#e8a87c', accentSoft: '#2c1e10', line: '#2c2b32', muted: '#9ca3af' } },
]

const FONT_PARAMS: Record<string, string> = {
  'Fraunces':        'Fraunces:ital,wght@0,400;0,600;0,700;1,400;1,700',
  'Space Grotesk':   'Space+Grotesk:wght@400;600;700',
  'Cormorant':       'Cormorant:ital,wght@0,400;0,600;1,400;1,600',
  'Playfair Display':'Playfair+Display:ital,wght@0,400;0,700;1,400',
  'Inter':           'Inter:wght@400;600;700',
}

const LOGOS = ['☕', '🌿', '✦', 'S', '🫐', '◆']

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function renderMenuHtml(opts: {
  businessName: string
  config: MenuCfg
  categories: Category[]
  products: Product[]
}): string {
  const { businessName, config, categories, products } = opts

  const bk         = config.brand_kit ?? {}
  const printCols  = bk.printCols  ?? 1
  const showPhotos = bk.showPhotos ?? false
  const showDesc   = bk.showDesc   ?? true
  const showBadges = bk.showBadges ?? true
  const logoEmoji  = bk.logoEmoji  ?? LOGOS[0]

  const tpl     = TEMPLATES.find(t => t.id === config.template_id) ?? TEMPLATES[0]
  const accent  = bk.accent ?? tpl.look.accent
  const { bg, ink, line, muted, accentSoft } = tpl.look
  const fontCss = tpl.fontCss
  const fontUrl = FONT_PARAMS[tpl.font] ?? FONT_PARAMS['Inter']

  // Section order: pinned first, remaining in DB order
  const catMap = new Map(categories.map(c => [c.id, c]))
  const pinned = (config.section_order ?? []).filter(id => catMap.has(id))
  const rest   = categories.map(c => c.id).filter(id => !pinned.includes(id))
  const orderedCatIds = [...pinned, ...rest]

  const overrides = config.item_overrides ?? {}

  function buildItemsHtml(prods: Product[]): string {
    return prods.map(p => {
      const ov    = overrides[p.id] ?? {}
      const name  = p.name
      const desc  = ov.desc !== undefined ? ov.desc : (p.description ?? '')
      const photo = ov.photo_url !== undefined ? ov.photo_url : (p.image_url ?? '')
      const badge = ov.badge ?? ''
      const price = ov.price_override !== undefined ? ov.price_override : p.price

      const photoHtml = showPhotos && photo
        ? '<div style="width:50px;height:50px;border-radius:6px;overflow:hidden;flex-shrink:0;background:' + accentSoft + ';">' +
            '<img src="' + esc(photo) + '" style="width:100%;height:100%;object-fit:cover;" />' +
          '</div>'
        : ''

      const badgeHtml = showBadges && badge
        ? '<span style="display:inline-block;padding:1px 7px;border-radius:10px;background:' + accentSoft + ';color:' + accent + ';font-size:7.5px;font-weight:700;letter-spacing:0.4px;vertical-align:middle;margin-left:5px;">' + esc(badge) + '</span>'
        : ''

      const descHtml = showDesc && desc
        ? '<div style="font-size:8.5px;color:' + muted + ';margin-top:2px;line-height:1.45;">' + esc(desc) + '</div>'
        : ''

      return (
        '<div style="display:flex;gap:9px;align-items:flex-start;padding:5px 0;break-inside:avoid;page-break-inside:avoid;">' +
          photoHtml +
          '<div style="flex:1;min-width:0;">' +
            '<div style="display:flex;align-items:baseline;gap:0;">' +
              '<span style="font-weight:600;font-size:10px;">' + esc(name) + '</span>' +
              (showBadges && badge ? badgeHtml : '') +
              '<span style="flex:1;display:inline-block;border-bottom:1px dotted ' + line + ';margin:0 5px;min-width:12px;"></span>' +
              '<span style="font-size:10px;font-weight:700;color:' + accent + ';white-space:nowrap;">$' + price.toFixed(2) + '</span>' +
            '</div>' +
            descHtml +
          '</div>' +
        '</div>'
      )
    }).join('')
  }

  // Build item rows
  const sectionsHtml = orderedCatIds.map(catId => {
    const cat = catMap.get(catId)
    if (!cat) return ''
    const catProducts = products.filter(p => p.category_id === catId && !overrides[p.id]?.hidden)
    if (catProducts.length === 0) return ''

    return (
      '<div style="break-inside:avoid;page-break-inside:avoid;margin-bottom:16px;">' +
        '<div style="font-size:7.5px;font-weight:800;text-transform:uppercase;letter-spacing:1.6px;color:' + accent + ';padding-bottom:4px;border-bottom:1.5px solid ' + accent + ';margin-bottom:6px;">' + esc(cat.name) + '</div>' +
        buildItemsHtml(catProducts) +
      '</div>'
    )
  }).join('')

  const uncatPdfProds = products.filter(p => (!p.category_id || !catMap.has(p.category_id)) && !overrides[p.id]?.hidden)
  const uncatSectionHtml = uncatPdfProds.length === 0 ? '' : (
    '<div style="break-inside:avoid;page-break-inside:avoid;margin-bottom:16px;">' +
      '<div style="font-size:7.5px;font-weight:800;text-transform:uppercase;letter-spacing:1.6px;color:' + muted + ';padding-bottom:4px;border-bottom:1.5px solid ' + line + ';margin-bottom:6px;">Other</div>' +
      buildItemsHtml(uncatPdfProds) +
    '</div>'
  )

  const colCss = printCols === 2
    ? 'columns:2;column-gap:22px;'
    : ''

  const gFontsUrl = 'https://fonts.googleapis.com/css2?family=' + fontUrl + '&display=swap'

  return (
    '<!DOCTYPE html><html lang="en"><head>' +
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">' +
    '<link href="' + gFontsUrl + '" rel="stylesheet">' +
    '<style>' +
      '*{box-sizing:border-box;margin:0;padding:0;}' +
      'html,body{background:' + bg + ';color:' + ink + ';font-family:' + fontCss + ';-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      '.page{padding:18mm 14mm;}' +
      '.header{text-align:center;margin-bottom:26px;}' +
      '.logo{width:46px;height:46px;border-radius:50%;border:2px solid ' + accent + ';display:flex;align-items:center;justify-content:center;font-size:22px;color:' + accent + ';margin:0 auto 10px;}' +
      '.bizname{font-size:22px;font-weight:700;letter-spacing:-0.4px;margin-bottom:8px;}' +
      '.divider{width:32px;height:2px;background:' + accent + ';margin:0 auto;}' +
      '.content{' + colCss + '}' +
      '@media print{' +
        'html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
        '.page{padding:14mm 12mm;}' +
        '@page{size:A4;margin:0;}' +
      '}' +
    '</style></head><body>' +
    '<div class="page">' +
      '<div class="header">' +
        '<div class="logo">' + logoEmoji + '</div>' +
        '<div class="bizname">' + esc(businessName) + '</div>' +
        '<div class="divider"></div>' +
      '</div>' +
      '<div class="content">' + sectionsHtml + uncatSectionHtml + '</div>' +
    '</div>' +
    '</body></html>'
  )
}
