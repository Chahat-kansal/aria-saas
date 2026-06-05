# CLAUDE CODE PROMPT — Aria Reel Studio: Full Editor Rebuild

Paste this whole file to Claude Code. Build gate (`npx tsc --noEmit` + `npm run build`) before every commit. RULE 0: never remove working features. `pwd` = `C:\Users\kansa\aria-saas-audit`.

---

## 0. WHAT YOU MUST READ FIRST (all of these, fully)

- `src/app/dashboard/reels/page.tsx` (983 lines) — the page
- `src/components/reels/TimelineEditor.tsx` (1169 lines) — the Remotion editor
- `src/remotion/types.ts` — EditSpec contract
- `src/lib/reels/sanitize-edit-spec.ts` — the sanitizer (keep importing this)
- `src/app/api/reels/ai-edit/route.ts` — Ask Aria route (keep as-is)
- `src/app/api/reels/v2v/route.ts` — V2V route (keep as-is)
- `src/app/api/reels/publish-social/route.ts` — publish route (keep as-is)
- `src/app/api/reels/publish-marketer/route.ts` — marketer route (keep as-is)

---

## 1. THE TWO BUGS TO FIX BEFORE ANYTHING ELSE

### Bug 1 — Two editors overlapping

**The problem (verified from live code):**
- `reels/page.tsx` has a 3-column grid: left sidebar | center `<main>` | right `<aside>`
- When `tab === 'editor' && latestVideo`: center renders `<TimelineEditor>` AND the right `<aside>` (lines 755–854) is still visible — it has its own speed chips, filters, trim bar, captions, music, publish controls
- So the user sees `TimelineEditor`'s tabs on the left AND the old right-panel controls alongside it — two editors at once

**The fix:**
In `reels/page.tsx`, when `tab === 'editor'`, hide the right `<aside>` completely. The aside renders unconditionally right now. Add a condition:

```tsx
// Find the aside opening tag (~line 756):
<aside style={{ ... }}>

// Change to:
{tab !== 'editor' && (
  <aside style={{ ... }}>
    {/* existing aside content */}
  </aside>
)}
```

Also: when `tab === 'editor'`, make the center `<main>` take full width by changing the grid. Find the grid container (~line 520):
```tsx
// Current:
style={{ display: 'grid', gridTemplateColumns: '340px 1fr 320px', ... }}

// Change to:
style={{ display: 'grid', gridTemplateColumns: tab === 'editor' ? '340px 1fr' : '340px 1fr 320px', ... }}
```

The left sidebar (influencer/ideas) stays visible when editing — it's useful context. Only the right aside disappears.

**Commit 1:** `fix(reels): remove overlapping right panel when editor tab is active`

---

### Bug 2 — TimelineEditor is a side-by-side desktop form, not a full-screen editor

**The problem:** `TimelineEditor.tsx` renders as `display: flex; gap: 16; alignItems: flex-start` — phone preview on the left (270×480px fixed), tab panels on the right. It looks like a settings page, not a video editor.

**The fix is the full rebuild in Section 2 below.**

---

## 2. REBUILD `TimelineEditor.tsx` — CapCut-style dark canvas

**Target layout (from the verified mockup):**
- Full dark background (`#09090c`)
- Top bar: back button | clip name | undo/redo | Export button
- Large vertical 9:16 preview (phone frame, centered, ~55% of height)
- Aria insight chip floating top-left of canvas (POS data: "Flat whites #1 — post Fri 3–5pm")
- Thin timeline strip (one row, ~46px): video thumbnail frames + trim handles + playhead + sub-tracks (audio waveform, text pill, fx chip)
- AI bar above tool rail (always visible): "Tell Aria what to change…" input + send
- Quick chips row: bold hook / warm look / cut slow bit / auto-captions / cut out bg / beat sync
- AI feedback line (toast-style, disappears after 2.5s)
- Scrollable icon tool rail (bottom): icon + label, horizontal scroll, no wrapping
- Publish bar (bottom): "Publish to socials" | "→ Aria Marketer"
- Tool panels slide up from the bottom OVER the preview (not a side panel)

### 2.1 Keep all existing working logic

The following must be KEPT exactly as-is (just moved into the new layout):
- All `useState` variables (spec, tab, renderState, renderProgress, renderUrl, etc.)
- All functions: `startRender`, `suggestCaptions`, `runAiEdit`, `openV2VConfirm`, `doV2V`, `publishToMarketer`, `publishToSocials`, trim drag handlers, speed segment logic
- `RemotionPreview` component usage
- The `sanitizeEditSpec` import
- The `onPublish`, `onCaptionChosen` props
- All V2V state and polling
- The V2V confirm modal (keep as-is, just position it correctly)

### 2.2 New layout structure

Replace the entire JSX `return (...)` with this structure:

```tsx
return (
  <div style={{ background: '#09090c', display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'var(--font-sans)', overflow: 'hidden', position: 'relative' }}>

    {/* TOP BAR */}
    {/* ... see 2.3 */}

    {/* CANVAS — video preview, fills available space */}
    {/* ... see 2.4 */}

    {/* FIRST-CUT BANNER — shown after auto-suggest (conditional) */}
    {/* ... see 2.5 */}

    {/* TIMELINE STRIP */}
    {/* ... see 2.6 */}

    {/* AI BAR */}
    {/* ... see 2.7 */}

    {/* TOOL SECTION: context label + scrollable rail */}
    {/* ... see 2.8 */}

    {/* PUBLISH BAR */}
    {/* ... see 2.9 */}

    {/* SLIDING PANEL — renders over canvas when tool selected */}
    {/* ... see 2.10 */}

    {/* V2V CONFIRM MODAL — existing logic, keep */}
    {v2vConfirm && ( /* existing modal JSX */ )}

  </div>
)
```

### 2.3 Top bar

```tsx
<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', flexShrink: 0, background: '#0d0d10' }}>
  <button onClick={() => onPublish(spec.videoUrl)} aria-label="Back" style={ghostBtn}>
    <ChevronLeft size={20} />
  </button>
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <span style={{ fontSize: 14, color: '#f0f0f4', fontWeight: 500 }}>Sip Café · reel</span>
    <span style={{ fontSize: 11, color: '#7a8290', fontVariantNumeric: 'tabular-nums' }}>{durationSec}s</span>
  </div>
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <button onClick={undoAiEdit} aria-label="Undo" style={ghostBtn} disabled={!aiPrev}><RotateCcw size={18} /></button>
    <button style={{ fontSize: 13, fontWeight: 600, padding: '7px 16px', background: '#7FB897', color: '#04120a', border: 'none', borderRadius: 8, cursor: 'pointer', minHeight: 36 }} onClick={() => setTab('export' as never)}>
      Export
    </button>
  </div>
</div>
```

Note: keep `undoAiEdit` as an extracted function from `runAiEdit` logic (already in code as inline undo button — extract it).

### 2.4 Canvas (video preview)

```tsx
<div style={{ flex: 1, position: 'relative', background: '#0c0c10', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
  {/* Phone frame */}
  <div style={{ width: 172, aspectRatio: '9/16', background: '#17171d', borderRadius: 12, position: 'relative', overflow: 'hidden', boxShadow: '0 0 0 0.5px rgba(255,255,255,0.08)' }}>
    <RemotionPreview spec={spec} width={172} />
    {/* Safe zone overlay (keep existing showSafeZone logic) */}
    {showSafeZone && ( /* existing safe zone JSX */ )}
  </div>

  {/* Aria insight chip — top left of canvas */}
  <div style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(10,35,20,0.82)', border: '0.5px solid rgba(127,184,151,0.35)', borderRadius: 8, padding: '7px 10px', maxWidth: 160, backdropFilter: 'blur(6px)' }}>
    <div style={{ fontSize: 9, color: '#8fd3ab', fontWeight: 600, letterSpacing: '.5px', textTransform: 'uppercase', marginBottom: 2 }}>Aria insight</div>
    <div style={{ fontSize: 11, color: '#c4e4d4', lineHeight: 1.4 }}>
      {/* Pull from props or a simple context string — e.g. top product + best post time */}
      Best time to post: Fri 3–5pm
    </div>
  </div>

  {/* Duration badge */}
  <span style={{ position: 'absolute', top: 9, right: 10, fontSize: 10, color: '#fff', background: 'rgba(0,0,0,0.42)', padding: '2px 7px', borderRadius: 5, fontVariantNumeric: 'tabular-nums' }}>9:16</span>

  {/* Safe zone toggle */}
  <button onClick={() => setShowSafeZone(z => !z)} style={{ position: 'absolute', bottom: 10, right: 10, fontSize: 10, color: showSafeZone ? '#7FB897' : 'rgba(255,255,255,0.4)', background: 'rgba(0,0,0,0.4)', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 5, padding: '2px 8px', cursor: 'pointer' }}>
    {showSafeZone ? 'Hide safe zone' : 'Safe zone'}
  </button>
</div>
```

### 2.5 Timeline strip

```tsx
<div style={{ padding: '8px 14px 6px', flexShrink: 0, background: '#0a0a0c' }}>

  {/* Zoom row */}
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
    <span style={{ fontSize: 11, color: '#7a8290', fontVariantNumeric: 'tabular-nums' }}>0:00</span>
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button aria-label="Zoom out" style={ghostBtn}><Minus size={14} /></button>
      <button aria-label="Zoom in" style={ghostBtn}><Plus size={14} /></button>
    </div>
    <span style={{ fontSize: 11, color: '#7a8290', fontVariantNumeric: 'tabular-nums' }}>{durationSec}s</span>
  </div>

  {/* Main track — video thumbnails + trim handles + playhead */}
  <div style={{ position: 'relative', paddingTop: 5 }}>
    <div style={{ position: 'absolute', left: '34%', top: 0, bottom: 0, width: 2, background: '#fff', zIndex: 7, borderRadius: 1 }} />
    <div style={{ position: 'absolute', left: 'calc(34% - 6px)', top: -3, width: 14, height: 13, background: '#fff', borderRadius: 4, zIndex: 8 }} />

    {/* Video track — thumbnail frames */}
    <div
      ref={trimBarRef}
      onPointerMove={onTrimPointerMove}
      onPointerUp={onTrimPointerUp}
      style={{ height: 42, borderRadius: 6, background: '#1e1e25', display: 'flex', alignItems: 'center', gap: 2, padding: 2, position: 'relative', overflow: 'hidden', marginBottom: 5 }}
    >
      {/* Trim selection overlay */}
      <div style={{ position: 'absolute', left: trimStartPct + '%', right: (100 - trimEndPct) + '%', top: -1, bottom: -1, border: '2px solid #7FB897', borderRadius: 7, zIndex: 5, pointerEvents: 'none' }} />
      {/* Trim start handle */}
      <div onPointerDown={e => onTrimPointerDown(e, 'start')} style={{ position: 'absolute', left: 'calc(' + trimStartPct + '% - 5px)', top: 0, bottom: 0, width: 10, background: '#7FB897', borderRadius: '5px 0 0 5px', zIndex: 6, cursor: 'ew-resize', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 2, height: 14, background: '#04120a', borderRadius: 1 }} />
      </div>
      {/* Trim end handle */}
      <div onPointerDown={e => onTrimPointerDown(e, 'end')} style={{ position: 'absolute', left: 'calc(' + trimEndPct + '% - 5px)', top: 0, bottom: 0, width: 10, background: '#7FB897', borderRadius: '0 5px 5px 0', zIndex: 6, cursor: 'ew-resize', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 2, height: 14, background: '#04120a', borderRadius: 1 }} />
      </div>
      {/* Thumbnail frames — 7 placeholder frames */}
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} style={{ width: 38, height: 38, borderRadius: 4, background: i % 2 === 0 ? '#2a2a35' : '#303040', flexShrink: 0 }} />
      ))}
    </div>

    {/* Sub-tracks row */}
    <div style={{ display: 'flex', gap: 4, height: 10, marginBottom: 2 }}>
      {/* Text pill */}
      <div style={{ background: '#7FB897', borderRadius: 3, width: '38%', display: 'flex', alignItems: 'center', paddingLeft: 5, overflow: 'hidden' }}>
        <span style={{ fontSize: 8, color: '#04120a', fontWeight: 600, whiteSpace: 'nowrap' }}>{spec.textLayers.length > 0 ? spec.textLayers[0].text.slice(0, 20) : 'no text'}</span>
      </div>
      {/* Audio waveform */}
      <div style={{ flex: 1, background: '#172118', borderRadius: 3, overflow: 'hidden', display: 'flex', alignItems: 'center', padding: '0 6px', gap: 1 }}>
        {Array.from({ length: 30 }).map((_, i) => (
          <div key={i} style={{ width: 2, borderRadius: 1, background: '#3d6b50', height: (Math.sin(i * 0.7) * 4 + 5) + 'px', flexShrink: 0 }} />
        ))}
      </div>
      {/* Speed chip — only if speed segments exist */}
      {spec.speedSegments.length > 0 && (
        <div style={{ background: 'rgba(224,159,62,0.5)', borderRadius: 3, width: '15%' }} />
      )}
    </div>
  </div>
</div>
```

### 2.6 AI bar

```tsx
<div style={{ margin: '10px 13px 9px', display: 'flex', gap: 8, alignItems: 'center', background: '#111118', border: '0.5px solid rgba(127,184,151,0.35)', borderRadius: 11, padding: '7px 7px 7px 12px', flexShrink: 0 }}>
  <MessageSquare size={18} color="#8fd3ab" aria-hidden />
  <input
    id="ai-instr"
    type="text"
    value={aiInstruction}
    onChange={e => setAiInstruction(e.target.value)}
    onKeyDown={e => e.key === 'Enter' && runAiEdit()}
    placeholder="Tell Aria what to change — e.g. bold hook, warm filter, speed up slow bit…"
    aria-label="Describe the edit you want"
    disabled={aiLoading}
    style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#f0f0f4', fontSize: 13, fontFamily: 'inherit', minHeight: 32 }}
  />
  <button
    onClick={runAiEdit}
    aria-label="Send to Aria"
    disabled={aiLoading || !aiInstruction.trim()}
    style={{ background: aiLoading ? 'rgba(127,184,151,0.4)' : '#7FB897', border: 'none', borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'background .15s' }}
  >
    <ArrowUp size={17} color="#04120a" />
  </button>
</div>

{/* Quick chips */}
<div style={{ display: 'flex', gap: 7, padding: '0 13px 9px', flexWrap: 'wrap', flexShrink: 0 }}>
  {['bold hook', 'warm look', 'cut slow bit', 'auto-captions', 'cut out bg', 'beat sync'].map(chip => (
    <button key={chip} onClick={() => { setAiInstruction(chip); runAiEdit() }} disabled={aiLoading}
      style={{ background: '#141419', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#b8bcc4', fontSize: 11, padding: '7px 12px', cursor: 'pointer', fontFamily: 'inherit', minHeight: 34, transition: 'background .15s' }}>
      {chip}
    </button>
  ))}
</div>

{/* AI feedback — auto-dismiss toast */}
{aiMessage && (
  <div role="status" style={{ margin: '0 13px 9px', padding: '9px 12px', background: 'rgba(127,184,151,0.11)', borderRadius: 9, fontSize: 12, color: '#b4e0cb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
    <span>{aiMessage}</span>
    {aiPrev && <button onClick={undoAiEdit} style={{ background: 'none', border: 'none', color: '#8fd3ab', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', textDecoration: 'underline' }}>undo</button>}
  </div>
)}
```

Auto-dismiss `aiMessage` after 2500ms:
```tsx
useEffect(() => {
  if (!aiMessage) return
  const t = setTimeout(() => setAiMessage(null), 2500)
  return () => clearTimeout(t)
}, [aiMessage])
```

### 2.7 Tool rail

The rail is scrollable, icon + small label, no wrapping. Active tool gets `#7FB897` color. AI tools (Restyle, Cut out) get a green circle background.

```tsx
const TOOLS = [
  { id: 'trim',       label: 'Trim',       icon: Scissors },
  { id: 'text',       label: 'Text',       icon: Type },
  { id: 'audio',      label: 'Audio',      icon: Music },
  { id: 'filter',     label: 'Filters',    icon: SlidersHorizontal },
  { id: 'speed',      label: 'Speed',      icon: Gauge },
  { id: 'caption',    label: 'Captions',   icon: Captions },
  { id: 'effect',     label: 'Effects',    icon: Sparkles },
  { id: 'transition', label: 'Transition', icon: Layers },
  { id: 'export',     label: 'Export',     icon: Download },
]
const AI_TOOLS = [
  { id: 'restyle',    label: 'Restyle',    icon: Palette,  action: () => openV2VConfirm('restyle') },
  { id: 'bgremove',   label: 'Cut out',    icon: Eraser,   action: () => openV2VConfirm('bg-remove') },
]
```

```tsx
{/* Tool context label */}
{activeTool && activeTool !== 'none' && (
  <div style={{ padding: '6px 14px 2px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
    <span style={{ fontSize: 12, color: '#8fd3ab', fontWeight: 500 }}>
      {TOOLS.find(t => t.id === activeTool)?.label ?? activeTool}
    </span>
    <button onClick={() => setActiveTool(null)} style={{ fontSize: 11, color: '#7a8290', cursor: 'pointer', padding: '2px 6px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 5, fontFamily: 'inherit' }}>Done</button>
  </div>
)}

{/* Tool rail */}
<div role="toolbar" aria-label="Editing tools" style={{ display: 'flex', gap: 2, padding: '9px 8px 12px', borderTop: '0.5px solid rgba(255,255,255,0.07)', overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0 }}>
  {TOOLS.map(({ id, label, icon: Icon }) => (
    <button key={id} onClick={() => setActiveTool(activeTool === id ? null : id)} aria-label={label}
      style={{ flexShrink: 0, minWidth: 60, minHeight: 54, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px 4px', borderRadius: 10, cursor: 'pointer', background: 'transparent', border: 'none', fontFamily: 'inherit', transition: 'background .15s' }}>
      <Icon size={22} color={activeTool === id ? '#7FB897' : '#c4c8d0'} aria-hidden />
      <span style={{ fontSize: 10, color: activeTool === id ? '#7FB897' : '#8a8e96' }}>{label}</span>
    </button>
  ))}
  {/* AI tools — green circle treatment */}
  {AI_TOOLS.map(({ id, label, icon: Icon, action }) => (
    <button key={id} onClick={action} aria-label={label}
      style={{ flexShrink: 0, minWidth: 60, minHeight: 54, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '6px 4px', borderRadius: 10, cursor: 'pointer', background: 'transparent', border: 'none', fontFamily: 'inherit' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(127,184,151,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={17} color="#8fd3ab" aria-hidden />
      </div>
      <span style={{ fontSize: 10, color: '#8fd3ab' }}>{label}</span>
    </button>
  ))}
</div>
```

State needed: `const [activeTool, setActiveTool] = useState<string|null>(null)`

### 2.8 Sliding panel (renders over canvas)

When `activeTool` is set, a panel slides up from the bottom. Use `position: absolute; bottom: 0; left: 0; right: 0` inside the root `div` with `transform: translateY(100%)` → `translateY(0)` transition.

```tsx
{activeTool && (
  <>
    {/* Scrim */}
    <div onClick={() => setActiveTool(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0)', zIndex: 20 }} />
    {/* Panel */}
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: '#111116', borderRadius: '14px 14px 0 0', borderTop: '0.5px solid rgba(255,255,255,0.1)', zIndex: 21, transform: 'translateY(0)', transition: 'transform .28s cubic-bezier(.22,.8,.36,1)', maxHeight: '72%', overflowY: 'auto' }}>
      <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2, margin: '10px auto 0' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 6px' }}>
        <span style={{ fontSize: 14, color: '#e8ecf4', fontWeight: 500 }}>{TOOLS.find(t => t.id === activeTool)?.label}</span>
        <button onClick={() => setActiveTool(null)} style={{ fontSize: 12, color: '#7FB897', cursor: 'pointer', fontWeight: 500, padding: '4px 8px', border: 'none', background: 'none', fontFamily: 'inherit' }}>Done</button>
      </div>
      <div style={{ padding: '8px 14px 16px' }}>
        {activeTool === 'filter' && <FilterPanel spec={spec} setSpec={setSpec} />}
        {activeTool === 'speed' && <SpeedPanel spec={spec} setSpec={setSpec} selectedSegment={selectedSegment} setSelectedSegment={setSelectedSegment} onInit={initSpeedSegments} onReset={resetSegments} onSetSegmentSpeed={setSegmentSpeed} onSplitSegment={splitSegment} />}
        {activeTool === 'text' && <TextPanel spec={spec} setSpec={setSpec} nanoid={nanoid} />}
        {activeTool === 'caption' && <CaptionPanel spec={spec} setSpec={setSpec} businessId={businessId} onSuggest={suggestCaptions} captionSuggestions={captionSuggestions} captionLoading={captionLoading} onCaptionChosen={onCaptionChosen} />}
        {activeTool === 'audio' && <AudioPanel spec={spec} setSpec={setSpec} />}
        {activeTool === 'effect' && <EffectPanel spec={spec} setSpec={setSpec} />}
        {activeTool === 'transition' && <TransitionPanel spec={spec} setSpec={setSpec} />}
        {activeTool === 'trim' && <TrimPanel spec={spec} setSpec={setSpec} trimBarRef={trimBarRef} onTrimPointerMove={onTrimPointerMove} onTrimPointerUp={onTrimPointerUp} onTrimPointerDown={onTrimPointerDown} trimStartPct={trimStartPct} trimEndPct={trimEndPct} durationSec={durationSec} />}
        {activeTool === 'export' && <ExportPanel spec={spec} setSpec={setSpec} renderState={renderState} renderProgress={renderProgress} renderUrl={renderUrl} renderError={renderError} onRender={startRender} publishState={publishState} selectedPlatforms={selectedPlatforms} setSelectedPlatforms={setSelectedPlatforms} publishCaption={publishCaption} setPublishCaption={setPublishCaption} showPublishPanel={showPublishPanel} setShowPublishPanel={setShowPublishPanel} onPublishSocial={publishToSocials} onPublishMarketer={publishToMarketer} captionSuggestions={captionSuggestions} onSuggest={suggestCaptions} captionLoading={captionLoading} onCaptionChosen={onCaptionChosen} />}
      </div>
    </div>
  </>
)}
```

### 2.9 Panel components (extract from existing tab content)

Extract each existing tab's JSX into a named sub-component. This keeps the file manageable. Each component receives only what it needs via props.

- **`FilterPanel`** — existing filter tab (filter chips, intensity slider). Add visual filter swatches: each chip shows a small coloured square preview of the filter.
- **`SpeedPanel`** — existing speed tab (global chips, variable segments, segment controls).
- **`TextPanel`** — existing text tab (presets, add layer, layer editing).
- **`CaptionPanel`** — existing caption suggestions + style picker from the Export tab.
- **`AudioPanel`** — NEW. Add: "No audio" option, upload audio file button (`/api/reels/upload` with `type=audio`), and a voiceover text-to-speech option (use an existing TTS endpoint or flag as TODO if none exists).
- **`EffectPanel`** — NEW. Grid of effect buttons: Zoom in, Shake, Glitch, Flash, Blur in, Bounce, VHS, Film grain, Lens flare. Each writes an `effect` field to spec (add `effects?: string[]` to EditSpec if not present — optional field).
- **`TransitionPanel`** — NEW. Grid: Fade, Slide, Zoom, Spin, Glitch, Wipe, Flash, Bounce, Ripple. Writes `transition` to spec (add `transition?: string` to EditSpec — optional).
- **`TrimPanel`** — existing trim + speed bar from the Trim & Speed tab.
- **`ExportPanel`** — existing Export tab content (resolution, watermark, render button, progress, download, publish buttons).

### 2.10 Publish bar (always visible at bottom, below tool rail)

```tsx
<div style={{ display: 'flex', gap: 8, padding: '8px 13px 12px', background: '#0a0a0c', borderTop: '0.5px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
  <button onClick={() => setActiveTool('export')} aria-label="Publish to social media"
    style={{ flex: 1.2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 10px', background: '#161620', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', transition: 'background .15s', minHeight: 42 }}>
    <Instagram size={18} color="#e06070" aria-hidden />
    <TikTok size={18} color="#a0c8ff" aria-hidden />
    <Facebook size={18} color="#6090e0" aria-hidden />
    <span style={{ fontSize: 12, fontWeight: 500, color: '#d0d4dc', marginLeft: 3 }}>Publish</span>
  </button>
  <button onClick={() => setActiveTool('export')} aria-label="Send to Aria Marketer"
    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 10px', background: 'rgba(127,184,151,0.12)', border: '0.5px solid rgba(127,184,151,0.28)', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', minHeight: 42 }}>
    <Bot size={18} color="#8fd3ab" aria-hidden />
    <span style={{ fontSize: 12, fontWeight: 500, color: '#8fd3ab' }}>Aria Marketer</span>
  </button>
</div>
```

Note: both publish buttons open the Export panel (activeTool = 'export') where the full publish controls live. Don't duplicate the publish form here.

---

## 3. ICON IMPORTS

The new layout uses icons from `lucide-react`. Add to the import at the top of `TimelineEditor.tsx`:

```tsx
import {
  ChevronLeft, RotateCcw, Minus, Plus, Scissors, Type, Music,
  SlidersHorizontal, Gauge, Captions, Sparkles, Layers, Download,
  Palette, Eraser, MessageSquare, ArrowUp, Bot, Instagram, Facebook
} from 'lucide-react'
```

For TikTok (not in Lucide): use a simple SVG inline or a text label. Do not add a new package.

---

## 4. GHOST BUTTON STYLE (reuse)

```tsx
const ghostBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', color: '#9da3aa', cursor: 'pointer',
  padding: 6, borderRadius: 7, display: 'inline-flex', alignItems: 'center',
  justifyContent: 'center', minWidth: 36, minHeight: 36, transition: 'background .15s',
}
```

---

## 5. KEEP IN `reels/page.tsx` — nothing removed

Keep all the create tab functionality exactly as-is. The only changes to `page.tsx` are:
1. Fix the grid to hide the right `<aside>` when `tab === 'editor'` (Bug 1 fix)
2. Make `<main>` span full width when `tab === 'editor'`

The left sidebar (ideas, influencer, upload) stays. The right aside (speed, filter, trim, captions, music, brand, publish) only hides during editing. When user goes back to create tab, it reappears.

---

## 6. COMMITS

1. `fix(reels): hide overlapping right panel during editor tab`
2. `feat(reels): rebuild TimelineEditor — CapCut dark canvas, sliding panels, all tool rail features`
3. `feat(reels): AudioPanel + EffectPanel + TransitionPanel (new tools)`

---

## 7. VERIFICATION

1. `npx tsc --noEmit` + `npm run build` pass.
2. On the editor tab with a video: right panel is gone, editor takes full width.
3. Timeline shows thumbnail frames + trim handles + audio waveform sub-track.
4. Tapping each tool icon opens a sliding panel from the bottom over the preview.
5. AI bar works — type "warm filter", preview updates, undo works.
6. Quick chips trigger edits.
7. Restyle + Cut out open cost confirm (keep existing V2V logic).
8. Publish bar at bottom opens Export panel.
9. Export panel renders/downloads correctly (existing logic preserved).
10. Returning to create tab: right panel reappears.
11. No existing feature (music, captions, influencer, speed, filter, text, publish, V2V, Ask Aria) is missing or broken.

## HARD RULES
- Never remove the `sanitizeEditSpec` call in `runAiEdit`
- Never remove the V2V cost confirm gate
- Never remove the `aria_autopilot_actions` write in `publishToMarketer`
- Keep all route calls exactly as-is (`/api/reels/ai-edit`, `/api/reels/v2v`, `/api/reels/publish-social`, `/api/reels/publish-marketer`, `/api/reels/render`, `/api/reels/captions`)
- Protected files: `AnimatedBg`, `FlyToCart`, `CursorGlow`, `pos-sfx.ts`, `aria-voice-guide.ts` — never touch
- No new npm packages without flagging
- Build gate before every commit
