# CLAUDE CODE PROMPT — AG-4: Complete Competitor Gap Closure

Paste this whole file to Claude Code. Depends on AG-1 + AG-2 + AG-3 being deployed. Build gate before every commit. RULE 0 always. `pwd` = `C:\Users\kansa\aria-saas-audit`.

---

## WHAT THIS SPRINT CLOSES (verified gap analysis)

Every gap identified vs Perplexity Labs, Manus, and NotebookLM that isn't covered by AG-1/2/3:

1. **Interactive outputs** — live_render HTML is static. Competitors build apps with filters, date pickers, sortable tables that work IN the iframe without re-calling Aria.
2. **Spreadsheet block is dead code** — type exists in ask-types.ts and BlockRenderer.tsx but system prompt never instructs Aria to emit it.
3. **Slide deck output** — NotebookLM's signature. Aria has zero slide capability.
4. **Infographic block** — visual one-pager output. NotebookLM does this. Aria has no infographic block type.
5. **Task planning visibility** — Perplexity Labs shows the plan before executing. Aria returns complete or nothing.
6. **Background task mode** — Manus works while you're away. Aria has no user-initiated background task UX.
7. **Shareable output links** — all three competitors let you share a link. Aria has no public share for outputs.
8. **Editable outputs** — Perplexity Labs and NotebookLM let you edit. Aria outputs are read-only.
9. **Web research integration** — native web_search_20250305 is wired but Aria doesn't use it aggressively for research tasks that need it.

## READ FIRST (all of these, fully, before writing anything)
- `src/lib/aria/ask-types.ts` (134 lines) — current block types
- `src/lib/aria/ask/system-prompt.ts` (131 lines) — current system prompt
- `src/components/aria/BlockRenderer.tsx` (500 lines) — current block renderers
- `src/app/api/aria/ask/route.ts` — main Ask Aria route
- `src/lib/aria/deliverables.ts` — AG-2's deliverable generator (must exist first)
- `src/app/api/cron/send-scheduled-reports/route.ts` — existing cron (verify vercel.json stays at 22)
- `package.json` — confirm which libraries are available (recharts confirmed, do NOT add new ones)
- `vercel.json` — count functions before starting, stay at exactly 22

## VERIFIED SCHEMA

```
aria_task_outputs (created in AG-2):
  id, business_id, conversation_id, title, task_prompt, output_kind,
  render_html, data_snapshot(jsonb), pdf_url, status, error_message, created_at

aria_batch_jobs: id, batch_id, job_type, business_count, status,
  submitted_at, completed_at, results_processed, error_message
  → NOT for user background tasks — admin-only. New table needed for user tasks.
```

---

## DB MIGRATIONS — apply ALL of these before writing any code

### Migration 1: Add share_token to aria_task_outputs

```sql
ALTER TABLE public.aria_task_outputs
  ADD COLUMN IF NOT EXISTS share_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS shared_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS aria_task_outputs_share_token_idx
  ON public.aria_task_outputs(share_token) WHERE share_token IS NOT NULL;
```

### Migration 2: aria_user_tasks (background task mode)

```sql
CREATE TABLE IF NOT EXISTS public.aria_user_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  title text NOT NULL,
  task_prompt text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','done','failed')),
  output_id uuid REFERENCES public.aria_task_outputs(id),
  error_message text,
  notify_email boolean NOT NULL DEFAULT true,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.aria_user_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner" ON public.aria_user_tasks
  FOR ALL USING (
    business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())
  );
CREATE INDEX aria_user_tasks_biz_status_idx
  ON public.aria_user_tasks(business_id, status, created_at DESC);
```

**Do NOT add hard-delete trigger** to either table — both are regenerable derived content.

After both migrations: confirm cross-business RLS on aria_user_tasks (`SELECT COUNT(*) FROM aria_user_tasks WHERE business_id != '[sip cafe id]'` returns 0).

---

## PHASE 1 — Interactive live_render outputs

### 1.1 System prompt upgrade for interactive HTML

**File:** `src/lib/aria/ask/system-prompt.ts`

Find the `## File exports` section near the bottom of `buildSystemPrompt`. Add BEFORE it:

```
## INTERACTIVE OUTPUT RULES
When generating a \`live_render\` block, the HTML MUST be interactive — not static cards.
Mandatory for every live_render:

1. INLINE DATA: all chart/table data embedded as a JS const at top of <script> — never fetch external URLs
2. DATE FILTER: a row of filter buttons (Today / 7 days / 30 days / This month) that re-render charts from the inline data
3. SORTABLE TABLE: every data table must have clickable column headers that sort the rows in place
4. HOVER TOOLTIPS: chart bars/lines must show a tooltip on hover with the exact value
5. DOWNLOAD BUTTON: always include a "Download CSV" button that exports the table data using a Blob

Structure every live_render HTML as:
<script>
const DATA = { /* inline data object with all time periods pre-computed */ }
let currentPeriod = '7d'
function render() { /* update chart and table from DATA[currentPeriod] */ }
</script>
<div id="filters"><!-- filter buttons that call render() --></div>
<div id="chart"><!-- SVG or canvas chart --></div>
<div id="table"><!-- sortable table --></div>

GOOD live_render: has JS filter buttons, sortable columns, hover tooltips, download CSV.
BAD live_render: static HTML cards with no interactivity.

Height for live_render blocks: use 480 for dashboards, 360 for charts, 280 for tables.
```

### 1.2 Upgrade live_render HTML generators in `src/lib/aria/deliverables.ts`

Update `generateDashboardHTML`, `generateRankedListHTML`, `generateScorecardHTML`, `generateComparisonHTML` to use the interactive pattern:

For `generateDashboardHTML` — add:
- Inline JS `const DATA = { today: {...}, '7d': {...}, '30d': {...} }` using the `data` parameter
- 4 filter buttons (Today / 7 days / 30 days / 30 days) that update the bar chart and top products table
- Bar chart drawn with inline SVG (not canvas) — bars update via JS DOM manipulation
- Sortable top products table — click "Product" or "Revenue" header to re-sort
- Hover state: bars get a lighter fill on mouseover with a tooltip div showing exact value
- "Download CSV" button that exports the top products table as CSV

For `generateRankedListHTML` — add:
- Sort toggle: by Revenue (default) / by Quantity / by Name
- Click any row to highlight it (background: rgba(127,184,151,0.1))

For `generateScorecardHTML` — add:
- Click any KPI card to expand it with a sparkline showing the last 7 data points (use inline SVG path)
- "Share" button that calls `window.parent.postMessage({type:'aria_share'}, '*')` — the BlockRenderer catches this

For `generateComparisonHTML` — add:
- Toggle: This week vs Last week / This week vs Monthly average / This month vs Last month
- The comparison updates from inline data when toggle changes

### 1.3 BlockRenderer — catch share message from iframe

**File:** `src/components/aria/BlockRenderer.tsx`

In the `live_render` case, add a `useEffect` that listens for the postMessage from the iframe:

```tsx
// Add inside the live_render case component (extract to a named function):
useEffect(() => {
  const handler = (e: MessageEvent) => {
    if (e.data?.type === 'aria_share') {
      onAction?.('Share this output')
    }
  }
  window.addEventListener('message', handler)
  return () => window.removeEventListener('message', handler)
}, [onAction])
```

---

## PHASE 2 — Activate the dead spreadsheet block

### 2.1 System prompt instruction

**File:** `src/lib/aria/ask/system-prompt.ts`

Find `## File exports`. Replace the current minimal export comment with:

```
## SPREADSHEET OUTPUTS
For any question asking for data, a list, or a report — ALWAYS emit a \`spreadsheet\` block after the analysis blocks.
The spreadsheet block auto-downloads a CSV and shows a preview table.

TRIGGER PHRASES: "show me", "give me a list", "export", "download", "all my", "report on", "product list", "sales data", "customer list", "inventory", "staff hours"

Example:
{"type":"spreadsheet","filename":"top-products-7d.csv","auto_download":false,"headers":["Product","Revenue","Units","Avg Price"],"rows":[["Flat White","$892.00","245","$3.64"],["Latte","$720.00","180","$4.00"]]}

Set auto_download: false always (user clicks to download — never force it).
Filename must be descriptive: "sales-report-{period}.csv", "products-by-margin.csv", "customer-list.csv"
```

### 2.2 BlockRenderer spreadsheet improvements

**File:** `src/components/aria/BlockRenderer.tsx`

The `SpreadsheetBlock` exists but is minimal. Upgrade it:

```tsx
function SpreadsheetBlock({ block }: { block: SpreadsheetBlock }) {
  const triggered = useRef(false)
  const [expanded, setExpanded] = useState(false)
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortAsc, setSortAsc] = useState(true)

  useEffect(() => {
    if (block.auto_download && !triggered.current) {
      triggered.current = true
      downloadCSV(block.filename, block.headers, block.rows)
    }
  }, [block.auto_download, block.filename, block.headers, block.rows])

  const sorted = sortCol !== null
    ? [...block.rows].sort((a, b) => {
        const va = a[sortCol] ?? '', vb = b[sortCol] ?? ''
        const numA = parseFloat(String(va).replace(/[$,%]/g, ''))
        const numB = parseFloat(String(vb).replace(/[$,%]/g, ''))
        const cmp = !isNaN(numA) && !isNaN(numB) ? numA - numB : String(va).localeCompare(String(vb))
        return sortAsc ? cmp : -cmp
      })
    : block.rows

  const preview = expanded ? sorted : sorted.slice(0, 6)

  return (
    <div style={{ background: 'var(--bg-elevated)', borderRadius: 12, border: '1px solid var(--divider)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--divider)', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>📊</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{block.filename}</span>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{block.rows.length} rows × {block.headers.length} cols</span>
        </div>
        <button
          onClick={() => downloadCSV(block.filename, block.headers, block.rows)}
          style={{ fontSize: 11, padding: '5px 14px', borderRadius: 8, border: '1px solid var(--divider)', background: '#7FB897', color: '#04120a', cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit', flexShrink: 0 }}
        >
          ⬇ Download CSV
        </button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {block.headers.map((h, i) => (
                <th
                  key={h}
                  onClick={() => { setSortCol(i); setSortAsc(sortCol === i ? !sortAsc : true) }}
                  style={{ padding: '7px 12px', textAlign: 'left', color: 'var(--text-tertiary)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--divider)', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}
                >
                  {h}{sortCol === i ? (sortAsc ? ' ↑' : ' ↓') : ' ↕'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--divider)' }}>
                {row.map((cell, j) => (
                  <td key={j} style={{ padding: '7px 12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.rows.length > 6 && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ width: '100%', padding: '8px', fontSize: 11, color: 'var(--text-tertiary)', background: 'transparent', border: 'none', borderTop: '1px solid var(--divider)', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {expanded ? `Show less ↑` : `Show all ${block.rows.length} rows ↓`}
        </button>
      )}
    </div>
  )
}
```

**Commits 1-2:** `feat(ag4): interactive live_render HTML + system prompt upgrade` and `feat(ag4): activate spreadsheet block — sortable, expandable, download`

---

## PHASE 3 — Slide deck output

### 3.1 Add `slides` to AskBlock types

**File:** `src/lib/aria/ask-types.ts`

Add to `AskBlock` union:

```ts
| {
    type: 'slides'
    title: string
    slides: Array<{
      heading: string
      subheading?: string
      body: string           // 2-3 bullet points as plain text, newline-separated
      layout: 'title' | 'content' | 'metric' | 'chart' | 'split'
      metrics?: Array<{ label: string; value: string; color?: string }>
      chart_data?: Array<{ name: string; value: number }>
      accent_color?: string
    }>
    theme?: 'dark' | 'light'
    downloadable?: boolean
  }
```

### 3.2 Add slides renderer to BlockRenderer

**File:** `src/components/aria/BlockRenderer.tsx`

Add `case 'slides':` — renders a navigable slide viewer inline:

```tsx
case 'slides': {
  // Inline slide viewer — prev/next navigation, slide counter, fullscreen button
  // Each slide is a fixed-aspect-ratio (16:9) card rendered with the Financial Trust palette
  // Keyboard: ArrowLeft/ArrowRight to navigate
  // Fullscreen: opens the same viewer in a modal overlay
  // Download: generates an HTML file of all slides for offline use
  
  // ... full implementation below
}
```

Full slide implementation:

```tsx
case 'slides': {
  const SlidesBlock = ({ block }: { block: Extract<AskBlock, { type: 'slides' }> }) => {
    const [current, setCurrent] = useState(0)
    const [fullscreen, setFullscreen] = useState(false)
    const slide = block.slides[current]
    const accent = slide.accent_color ?? '#7FB897'
    const bg = block.theme === 'light' ? '#fff' : '#0d1117'
    const text = block.theme === 'light' ? '#111' : '#f0f0f4'
    const sub = block.theme === 'light' ? '#555' : '#9da3aa'

    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'ArrowRight') setCurrent(c => Math.min(c + 1, block.slides.length - 1))
        if (e.key === 'ArrowLeft') setCurrent(c => Math.max(c - 1, 0))
        if (e.key === 'Escape') setFullscreen(false)
      }
      window.addEventListener('keydown', handler)
      return () => window.removeEventListener('keydown', handler)
    }, [block.slides.length])

    function downloadSlides() {
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${block.title}</title>
<style>*{box-sizing:border-box;margin:0;padding:0;font-family:Inter,sans-serif}
.slide{width:960px;height:540px;background:${bg};color:${text};display:flex;flex-direction:column;justify-content:center;padding:64px;page-break-after:always}
.heading{font-size:36px;font-weight:800;margin-bottom:12px}
.body{font-size:18px;color:${sub};line-height:1.7}
@media print{.slide{page-break-after:always}}
</style></head><body>
${block.slides.map(s => `<div class="slide"><div class="heading">${s.heading}</div><div class="body">${s.body.replace(/\n/g, '<br>')}</div></div>`).join('')}
</body></html>`
      const blob = new Blob([html], { type: 'text/html' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${block.title.toLowerCase().replace(/\s+/g, '-')}-slides.html`
      a.click()
    }

    const SlideContent = () => (
      <div style={{ background: bg, borderRadius: fullscreen ? 0 : 12, aspectRatio: '16/9', width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '8%', position: 'relative', border: fullscreen ? 'none' : '1px solid rgba(255,255,255,0.08)' }}>
        {/* Accent bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: accent, borderRadius: '12px 12px 0 0' }} />
        {/* Slide number */}
        <div style={{ position: 'absolute', top: 16, right: 20, fontSize: 11, color: sub }}>{current + 1} / {block.slides.length}</div>
        {/* Content */}
        {slide.layout === 'title' ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 'clamp(24px,4vw,42px)', fontWeight: 800, color: text, lineHeight: 1.2, marginBottom: 16 }}>{slide.heading}</div>
            {slide.subheading && <div style={{ fontSize: 'clamp(14px,2vw,20px)', color: sub }}>{slide.subheading}</div>}
          </div>
        ) : slide.layout === 'metric' && slide.metrics ? (
          <>
            <div style={{ fontSize: 'clamp(16px,2.5vw,24px)', fontWeight: 700, color: text, marginBottom: 24 }}>{slide.heading}</div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(slide.metrics.length, 3)}, 1fr)`, gap: 16 }}>
              {slide.metrics.map((m, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '20px 16px', border: `1px solid rgba(255,255,255,0.08)`, textAlign: 'center' }}>
                  <div style={{ fontSize: 'clamp(20px,3vw,32px)', fontWeight: 800, color: m.color ?? accent }}>{m.value}</div>
                  <div style={{ fontSize: 11, color: sub, marginTop: 4, textTransform: 'uppercase', letterSpacing: '.5px' }}>{m.label}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 'clamp(16px,2.5vw,26px)', fontWeight: 700, color: text, marginBottom: 16, lineHeight: 1.3 }}>{slide.heading}</div>
            {slide.subheading && <div style={{ fontSize: 'clamp(12px,1.5vw,16px)', color: accent, marginBottom: 12, fontWeight: 500 }}>{slide.subheading}</div>}
            <div style={{ fontSize: 'clamp(12px,1.8vw,16px)', color: sub, lineHeight: 1.8 }}>
              {slide.body.split('\n').map((line, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <span style={{ color: accent, flexShrink: 0 }}>•</span>
                  <span>{line}</span>
                </div>
              ))}
            </div>
          </>
        )}
        {/* Aria branding */}
        <div style={{ position: 'absolute', bottom: 14, left: 20, fontSize: 9, color: sub, opacity: .5 }}>Aria OS for {block.title}</div>
      </div>
    )

    return (
      <>
        {fullscreen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setFullscreen(false)}>
            <div style={{ width: '100%', maxWidth: 960 }} onClick={e => e.stopPropagation()}>
              <SlideContent />
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16 }}>
                <button onClick={() => setCurrent(c => Math.max(c - 1, 0))} disabled={current === 0} style={navBtn}>← Prev</button>
                <button onClick={() => setCurrent(c => Math.min(c + 1, block.slides.length - 1))} disabled={current === block.slides.length - 1} style={navBtn}>Next →</button>
                <button onClick={() => setFullscreen(false)} style={{ ...navBtn, background: 'rgba(255,255,255,0.1)' }}>✕ Close</button>
              </div>
            </div>
          </div>
        )}
        <div style={{ margin: '8px 0' }}>
          {block.title && <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{block.title} · {block.slides.length} slides</div>}
          <SlideContent />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button onClick={() => setCurrent(c => Math.max(c - 1, 0))} disabled={current === 0} style={navBtn}>← Prev</button>
            <button onClick={() => setCurrent(c => Math.min(c + 1, block.slides.length - 1))} disabled={current === block.slides.length - 1} style={navBtn}>Next →</button>
            <button onClick={() => setFullscreen(true)} style={navBtn}>⛶ Fullscreen</button>
            {block.downloadable !== false && <button onClick={downloadSlides} style={{ ...navBtn, background: '#7FB897', color: '#04120a', fontWeight: 700 }}>⬇ Download</button>}
          </div>
          {/* Slide dots */}
          <div style={{ display: 'flex', gap: 5, marginTop: 8, justifyContent: 'center' }}>
            {block.slides.map((_, i) => (
              <button key={i} onClick={() => setCurrent(i)} style={{ width: i === current ? 20 : 7, height: 7, borderRadius: 99, background: i === current ? '#7FB897' : 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', padding: 0, transition: 'all .2s' }} />
            ))}
          </div>
        </div>
      </>
    )
  }
  return <SlidesBlock block={block} />
}
```

Add `const navBtn: React.CSSProperties = { padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', fontWeight: 500 }` near the top of the file (alongside the existing style constants).

### 3.3 System prompt — slide deck instruction

Add to `buildSystemPrompt` in the HOW YOU RESPOND section:

```
## SLIDE DECK OUTPUTS
For questions asking for: "make me a presentation", "create slides", "summarise as a deck", "slide deck", "present this":
Emit a \`slides\` block. Structure:
- Slide 1: layout='title' — business name + period
- Slides 2-4: layout='metric' — key KPIs with real numbers from context
- Slide 5-7: layout='content' — insights, root causes, bullet recommendations
- Slide 8: layout='content' — one clear call to action

Minimum 6 slides, maximum 12. All numbers from actual business context data — never fabricate.

Example slide:
{"type":"slides","title":"Sip Café Weekly Review","downloadable":true,"slides":[
  {"heading":"Sip Café — Week Ending 5 June","layout":"title","subheading":"AI-generated by Aria OS","body":""},
  {"heading":"This Week's Numbers","layout":"metric","body":"","metrics":[
    {"label":"Revenue","value":"$2,340","color":"#7FB897"},
    {"label":"Transactions","value":"187","color":"#7FB897"},
    {"label":"Avg Ticket","value":"$12.51","color":"#e09f3e"}
  ]},
  {"heading":"What's Working","layout":"content","body":"Flat whites leading at $892 revenue\nFriday peak: $640 — your strongest day\nLoyalty retention up 12% vs last month"},
  {"heading":"What Needs Attention","layout":"content","body":"Tuesdays averaging only $82 — 3 consecutive weeks\nStock: Oat milk at reorder point — order today\nLabour ratio 44% on Monday — exceeds 35% target"},
  {"heading":"Recommended Action","layout":"content","body":"Cut Monday staffing by 1 person — saves $120/week\nOrder oat milk today — 2 days of stock remaining\nRun a Tuesday promotion — need $200+ to break even on that day"}
]}
```

**Commit 3:** `feat(ag4): slides block type — navigable deck viewer with fullscreen + download`

---

## PHASE 4 — Infographic block

### 4.1 Add `infographic` to AskBlock types

```ts
| {
    type: 'infographic'
    title: string
    subtitle?: string
    sections: Array<{
      heading: string
      icon: string         // emoji
      stat?: string        // big number/value
      stat_label?: string
      body: string
      color?: string       // accent hex
    }>
    footer?: string
  }
```

### 4.2 Infographic renderer

```tsx
case 'infographic': {
  return (
    <div style={{ background: 'linear-gradient(135deg, #0d1117 0%, #111820 100%)', borderRadius: 14, border: '0.5px solid rgba(127,184,151,0.25)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 22px 14px', borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#f0f0f4', lineHeight: 1.2 }}>{block.title}</div>
        {block.subtitle && <div style={{ fontSize: 13, color: '#8fd3ab', marginTop: 4 }}>{block.subtitle}</div>}
      </div>
      {/* Sections */}
      <div style={{ display: 'grid', gridTemplateColumns: block.sections.length > 2 ? 'repeat(auto-fit, minmax(180px, 1fr))' : '1fr 1fr', gap: 0 }}>
        {block.sections.map((s, i) => (
          <div key={i} style={{ padding: '18px 22px', borderBottom: '0.5px solid rgba(255,255,255,0.05)', borderRight: (i + 1) % 2 === 1 ? '0.5px solid rgba(255,255,255,0.05)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 22 }}>{s.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: s.color ?? '#7FB897', textTransform: 'uppercase', letterSpacing: '.5px' }}>{s.heading}</span>
            </div>
            {s.stat && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: s.color ?? '#7FB897', lineHeight: 1 }}>{s.stat}</div>
                {s.stat_label && <div style={{ fontSize: 11, color: '#7a8290', marginTop: 2 }}>{s.stat_label}</div>}
              </div>
            )}
            <div style={{ fontSize: 13, color: '#9da3aa', lineHeight: 1.6 }}>{s.body}</div>
          </div>
        ))}
      </div>
      {block.footer && (
        <div style={{ padding: '10px 22px', borderTop: '0.5px solid rgba(255,255,255,0.07)', fontSize: 11, color: '#4a5568', textAlign: 'right' }}>
          {block.footer}
        </div>
      )}
    </div>
  )
}
```

### 4.3 System prompt — infographic instruction

```
## INFOGRAPHIC OUTPUTS
For questions asking for: "summarise", "overview", "give me a snapshot", "one page summary", "quick view":
Emit an \`infographic\` block with 4-6 sections. Each section needs: icon, heading, stat (big number), body (1-2 sentences).
All stats from real business context data.

Example:
{"type":"infographic","title":"Sip Café — Business Snapshot","subtitle":"Week ending 5 June 2026",
"sections":[
  {"heading":"Revenue","icon":"💰","stat":"$2,340","stat_label":"this week","body":"Up 12% vs last week. Friday was the peak at $640.","color":"#7FB897"},
  {"heading":"Transactions","icon":"🧾","stat":"187","stat_label":"sales","body":"Avg $12.51 per transaction. Flat white dominates at 245 units.","color":"#7FB897"},
  {"heading":"Stock Alert","icon":"⚠","stat":"2 items","stat_label":"at reorder point","body":"Oat milk and sparkling water need ordering today.","color":"#e09f3e"},
  {"heading":"Top Action","icon":"🎯","stat":"Tuesday","stat_label":"problem day","body":"3rd consecutive week under $100. Run a promotion or cut hours.","color":"#e09f3e"}
],"footer":"Generated by Aria OS · ariaos.site"}
```

**Commit 4:** `feat(ag4): infographic block type — visual business snapshot`

---

## PHASE 5 — Task planning visibility

### 5.1 Add `task_plan` to AskBlock types

```ts
| {
    type: 'task_plan'
    title: string
    steps: Array<{
      label: string
      status: 'pending' | 'running' | 'done' | 'failed'
      detail?: string
    }>
    estimated_seconds?: number
  }
```

### 5.2 Task plan renderer

```tsx
case 'task_plan': {
  const STATUS_ICON = { pending: '○', running: '⟳', done: '✓', failed: '✗' }
  const STATUS_COLOR = { pending: '#4a5568', running: '#7FB897', done: '#7FB897', failed: '#F87171' }
  return (
    <div style={{ background: 'var(--bg-elevated)', borderRadius: 12, border: '1px solid rgba(127,184,151,0.2)', padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 14 }}>🔄</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{block.title}</span>
        {block.estimated_seconds && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>~{block.estimated_seconds}s</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {block.steps.map((step, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: 13, color: STATUS_COLOR[step.status], flexShrink: 0, fontFamily: 'monospace', marginTop: 1 }}>
              {STATUS_ICON[step.status]}
            </span>
            <div>
              <span style={{ fontSize: 13, color: step.status === 'pending' ? 'var(--text-tertiary)' : 'var(--text-primary)', fontWeight: step.status === 'running' ? 600 : 400 }}>{step.label}</span>
              {step.detail && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{step.detail}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

### 5.3 Wire task_plan into complex Ask Aria responses

**File:** `src/app/api/aria/ask/route.ts`

For complex multi-step questions (intent.complexity === 'complex' or isMultiDomain from AG-1), emit a `task_plan` block FIRST in the streaming response before the main analysis:

```ts
// At the start of a complex response, stream a task_plan block showing what Aria is doing:
if (intent.complexity === 'complex' || isMultiDomain) {
  const planBlock: AskBlock = {
    type: 'task_plan',
    title: 'Aria is analysing your business',
    estimated_seconds: isMultiDomain ? 4 : 2,
    steps: isMultiDomain
      ? [
          { label: 'Pulling sales data', status: 'done' },
          { label: 'Checking stock levels', status: 'done' },
          { label: 'Analysing staff costs', status: 'done' },
          { label: 'Reviewing customer signals', status: 'done' },
          { label: 'Synthesising insights', status: 'running' },
        ]
      : [
          { label: 'Reading your business data', status: 'done' },
          { label: 'Identifying patterns', status: 'done' },
          { label: 'Building recommendations', status: 'running' },
        ],
  }
  // Prepend to blocks array before the AI response blocks
  // Insert this as the first block in the response
}
```

**Commit 5:** `feat(ag4): task_plan block — shows Aria's work steps before delivering analysis`

---

## PHASE 6 — Background task mode

### 6.1 Background task detection in Ask Aria

**File:** `src/app/api/aria/ask/route.ts`

Add after intent classification:

```ts
const BACKGROUND_TRIGGERS = /\b(analyse (all|every|my entire|my full)|research (all|every)|when (you'?re|you are) done|let me know when|notify me|work on this|run in the background|come back to me|I'll check later)\b/i

const isBackgroundTask = intent.complexity === 'complex' && BACKGROUND_TRIGGERS.test(message)

if (isBackgroundTask) {
  // Write to aria_user_tasks
  const { data: task } = await supabaseAdmin.from('aria_user_tasks').insert({
    business_id: bid,
    title: message.slice(0, 80),
    task_prompt: message,
    status: 'queued',
    notify_email: true,
  }).select('id').single()

  // Return immediately with a task_plan block showing "queued"
  // The actual work happens via the background processor (Phase 6.2)
  const queuedResponse: AskResponse = {
    blocks: [
      {
        type: 'task_plan',
        title: 'Task queued — working on it',
        steps: [
          { label: 'Task received', status: 'done' },
          { label: 'Analysing your data', status: 'pending', detail: 'Running in background' },
          { label: 'Preparing your report', status: 'pending' },
          { label: "You'll be notified when done", status: 'pending' },
        ],
        estimated_seconds: 30,
      },
      {
        type: 'text',
        content: `I'm working on "${message.slice(0, 60)}..." in the background. I'll notify you by email when it's ready — usually within 30 seconds.`,
      },
    ],
    followups: ['Check my task status', 'Cancel this task'],
    used_council: false,
    conversation_id: conversationId,
  }

  // Save conversation turn
  await supabaseAdmin.from('aria_conversations').update({ last_intent: 'background_task' }).eq('id', conversationId)

  return NextResponse.json(queuedResponse)
}
```

### 6.2 Background task processor: `/api/aria/process-user-task/route.ts`

```ts
// POST { task_id: string }
// Called by a lightweight polling mechanism or Vercel cron
// Auth: service role only (not user-facing)

// 1. Fetch task from aria_user_tasks WHERE status='queued' ORDER BY created_at LIMIT 1
// 2. Update status='running', started_at=now()
// 3. Run the task: call generateDeliverable() from AG-2 with the task_prompt
// 4. If success: update status='done', output_id=result.outputId, completed_at=now()
// 5. If error: update status='failed', error_message=...
// 6. If notify_email=true: send SendGrid email with link to the output

// Check vercel.json function count before adding this route
```

### 6.3 Task status in Ask Aria UI

When user asks "check my task status" or "check my tasks":
- Aria queries `aria_user_tasks WHERE business_id=? ORDER BY created_at DESC LIMIT 5`
- Returns a `data_table` block showing: Task / Status / Started / Completed / Link
- If `status='done'`: action_single block with "Open your report" prompt

### 6.4 Add a `/api/cron/process-user-tasks/route.ts` entry

Check vercel.json current function count. If at 22, discuss with user. If room exists, add a daily cron that processes any queued tasks that have been waiting > 5 minutes (safety net for tasks that didn't get processed via the direct call).

**Commit 6:** `feat(ag4): background task mode — queue long tasks, notify when done`

---

## PHASE 7 — Shareable output links

### 7.1 Share route: `/api/aria/share/[token]/route.ts`

```ts
// GET — no auth required (public)
// 1. Fetch aria_task_outputs WHERE share_token=token AND is_public=true
// 2. If not found or not public: 404
// 3. Return the render_html with a wrapper page (Aria branding header, "View in Aria" CTA)
// No Supabase auth — public route. Rate limit: check x-forwarded-for, allow 60/hour per IP.
```

### 7.2 Share page: `src/app/share/[token]/page.tsx`

```tsx
// Server component — fetch render_html from aria_task_outputs via service role
// Render in a clean page: Aria OS header (logo + "Powered by Aria OS"), iframe with the HTML,
// footer with "Get Aria for your business" CTA linking to ariaos.site
// OpenGraph meta tags: title=output.title, description="Business intelligence by Aria OS"
// No auth. Works as a public shareable link.
```

### 7.3 Generate share link: `/api/aria/task-outputs/[id]/share/route.ts`

```ts
// POST — requires auth (business owner only)
// 1. Verify output belongs to this business
// 2. Generate share_token = nanoid(12)
// 3. Update aria_task_outputs: share_token, shared_at=now(), is_public=true
// 4. Return: { share_url: `https://www.ariaos.site/share/${token}` }
```

### 7.4 Share button in BlockRenderer

In the `live_render` case, add a "Share" button alongside the existing "Download" button:

```tsx
{block.outputId && (
  <button
    onClick={async () => {
      const res = await fetch(`/api/aria/task-outputs/${block.outputId}/share`, { method: 'POST' })
      const { share_url } = await res.json()
      await navigator.clipboard.writeText(share_url)
      // Show a toast: "Link copied to clipboard"
    }}
    style={{ marginTop: 8, padding: '5px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.07)', fontWeight: 600, fontSize: 11, cursor: 'pointer', color: 'rgba(255,255,255,0.7)', fontFamily: 'inherit' }}
  >
    🔗 Share link
  </button>
)}
```

**Note:** The `live_render` block type needs `outputId?: string` added to ask-types.ts for the AG-2 deliverables that pass their ID through.

**Commit 7:** `feat(ag4): shareable output links — /share/[token] public page + share button`

---

## PHASE 8 — Editable outputs

### 8.1 Edit mode for live_render blocks

Add an "Edit" button to the live_render renderer in BlockRenderer. Clicking it opens an edit panel below the iframe showing the raw HTML in a `<textarea>`. The user can tweak it and click "Apply" to update the preview.

```tsx
// In the live_render case, add state:
const [editMode, setEditMode] = useState(false)
const [editHtml, setEditHtml] = useState(block.html)

// Below the iframe chips row, add:
<button onClick={() => setEditMode(e => !e)} style={...}>
  {editMode ? 'Done editing' : '✏ Edit'}
</button>

{editMode && (
  <div style={{ marginTop: 10 }}>
    <textarea
      value={editHtml}
      onChange={e => setEditHtml(e.target.value)}
      style={{ width: '100%', height: 200, background: 'rgba(0,0,0,0.3)', color: '#f0f0f4', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: 10, fontSize: 11, fontFamily: 'monospace', resize: 'vertical' }}
    />
    <button
      onClick={() => { /* update the srcDoc with editHtml */ setEditMode(false) }}
      style={{ marginTop: 6, padding: '5px 14px', borderRadius: 8, background: '#7FB897', color: '#04120a', fontWeight: 700, fontSize: 11, cursor: 'pointer', border: 'none', fontFamily: 'inherit' }}
    >
      Apply changes
    </button>
  </div>
)}
```

**Note:** This requires converting the live_render case to a proper named component with local state — refactor accordingly.

### 8.2 Slides edit mode

For the slides block, add a simple "Edit slide" button per slide that lets the user modify the body text inline:

```tsx
// Each slide body renders as a contentEditable div when edit mode is active
// Changes save to local state — "Download" reflects the edited content
```

**Commit 8:** `feat(ag4): editable outputs — live_render HTML editor + slides inline editing`

---

## PHASE 9 — Web research integration

### 9.1 Research intent detection

**File:** `src/app/api/aria/ask/route.ts`

Add after intent classification:

```ts
const RESEARCH_TRIGGERS = /\b(what are (the latest|current|recent)|research|look up|find out|what is the (current|going|average|market)|industry (average|benchmark|standard)|how do (other|competitors|similar)|trends? in|best practice|what (should|do) (cafes?|restaurants?|retailers?|businesses?) (typically|usually|normally)|Australian (award|minimum wage|super rate|gst))\b/i

const needsWebResearch = RESEARCH_TRIGGERS.test(message)

// When needsWebResearch is true, add the web search tool to the tools array
// The native web_search_20250305 tool is already in allTools (line 882-886 of route)
// But enforce it with an instruction in the system prompt addendum:
if (needsWebResearch) {
  systemPrompt += `\n\n## WEB RESEARCH REQUIRED FOR THIS QUESTION
The owner is asking about current external information. You MUST use the web_search tool before answering.
Search for: the specific rates, benchmarks, or trends they asked about.
After searching: cite what you found ("According to current ATO guidelines..." / "Industry benchmark for cafés is...") then compare to their actual data.
Do NOT answer from memory for questions about: tax rates, super rates, minimum wages, industry averages, competitor pricing, current trends.`
}
```

**Commit 9:** `feat(ag4): web research integration — force web_search for external knowledge questions`

---

## VERIFICATION — all 9 phases must pass before declaring done

1. `npx tsc --noEmit` + `npm run build` pass
2. `vercel.json` function count unchanged (verify before and after)
3. **Interactive outputs:** Ask "show me a revenue dashboard" → live_render iframe has working date filter buttons and a sortable table
4. **Spreadsheet:** Ask "give me my product list" → `spreadsheet` block appears with download button and sortable columns
5. **Slides:** Ask "make me a presentation of this week" → slides block renders with prev/next nav, fullscreen, and download
6. **Infographic:** Ask "give me a business snapshot" → infographic block renders with emoji sections and stat callouts
7. **Task plan:** Ask a complex question → task_plan block appears first showing completed steps
8. **Background task:** Ask "analyse my entire product range and come back to me" → `aria_user_tasks` row created with status='queued', immediate response returned
9. **Share link:** Click share on a deliverable → `aria_task_outputs.share_token` set, URL copied → visiting `/share/[token]` shows the output without auth
10. **Edit:** Click edit on a live_render block → textarea appears with HTML → apply changes updates the iframe
11. **Web research:** Ask "what's the current super guarantee rate?" → Aria uses web_search and cites the result
12. Cross-business data check: no cross-business data leaks in aria_user_tasks or share tokens

## COMMIT ORDER
1-2: Interactive + spreadsheet (system prompt + BlockRenderer) — lowest risk, highest impact
3: Slides block
4: Infographic block  
5: Task plan block
6: Background tasks (new table + routes)
7: Share links (new routes + page)
8: Editable outputs
9: Web research forcing

Stop and flag any TypeScript error, schema mismatch, or vercel.json function count issue before continuing.
