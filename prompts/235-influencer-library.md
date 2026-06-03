# Prompt 235 — AI Influencer Library for Business Owner Reels

## Rules
1. Read full file tree + every file you modify before touching anything
2. `npx tsc --noEmit` — zero errors before committing
3. ONE commit: `feat(influencer): AI influencer library — business owners pick character for Reels`
4. UPGRADE_ONLY — nothing removed or weakened
5. str_replace only — no full file rewrites

## Context

### What exists in DB (already migrated — do NOT re-create)
Table `aria_influencer_library` has 7 characters seeded:
- Aria (ai_influencer, featured) — cafe/restaurant/retail/bakery
- Nova (ai_influencer, featured) — liquor/convenience/retail  
- Mia, Jade, Zara, Cleo, Indie (nano_banana_2) — various industries

Columns: id, name, description, image_url, higgsfield_job_id, higgsfield_model,
industry_tags[], style_tags[], is_active, is_featured, usage_count, created_at

`social_posts` already has: influencer_id UUID FK, influencer_image_url TEXT

### What exists in code (read these files fully)
- `src/app/dashboard/social/page.tsx` — Reel Creator panel (reelCreatorPostId state, submitReelGeneration fn)
- `src/app/api/social/generate-video/route.ts` — accepts reel_source_image_url as start frame
- `src/app/admin/influencer/page.tsx` — admin influencer page

## PART A — API routes

### A1: GET /api/social/influencer-library
File: `src/app/api/social/influencer-library/route.ts`

```typescript
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: NextRequest) {
  // Auth required but any logged-in user can read (RLS allows SELECT on is_active=true)
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Optional: filter by industry to surface relevant characters first
  const industry = req.nextUrl.searchParams.get('industry') // e.g. 'cafe'

  const { data, error } = await supabaseAdmin
    .from('aria_influencer_library')
    .select('id, name, description, image_url, industry_tags, style_tags, is_featured, usage_count')
    .eq('is_active', true)
    .order('is_featured', { ascending: false })
    .order('usage_count', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sort: industry-matched featured first, then rest
  let influencers = data ?? []
  if (industry) {
    influencers = [
      ...influencers.filter(i => i.industry_tags?.includes(industry)),
      ...influencers.filter(i => !i.industry_tags?.includes(industry)),
    ]
    // Deduplicate (in case a character matches and is also in the non-match list somehow)
    const seen = new Set<string>()
    influencers = influencers.filter(i => { if (seen.has(i.id)) return false; seen.add(i.id); return true })
  }

  return NextResponse.json({ influencers })
}

export const GET = withErrorCapture('social/influencer-library', _GET)
```

### A2: POST /api/admin/influencer/library — admin adds new character
File: `src/app/api/admin/influencer/library/route.ts`

```typescript
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isAdminEmail } from '@/lib/admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// GET — list all (including inactive) for admin management
async function _GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data } = await supabaseAdmin
    .from('aria_influencer_library')
    .select('*')
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false })
  return NextResponse.json({ influencers: data ?? [] })
}

// POST — add new character from Higgsfield image URL
async function _POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as {
    name: string
    description?: string
    image_url: string
    higgsfield_job_id?: string
    higgsfield_model?: string
    industry_tags?: string[]
    style_tags?: string[]
    is_featured?: boolean
  }

  if (!body.name || !body.image_url) {
    return NextResponse.json({ error: 'name and image_url required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('aria_influencer_library')
    .insert({
      name: body.name,
      description: body.description ?? null,
      image_url: body.image_url,
      higgsfield_job_id: body.higgsfield_job_id ?? null,
      higgsfield_model: body.higgsfield_model ?? null,
      industry_tags: body.industry_tags ?? [],
      style_tags: body.style_tags ?? [],
      is_featured: body.is_featured ?? false,
      is_active: true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ influencer: data, ok: true })
}

// PATCH — toggle active/featured
async function _PATCH(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id, is_active, is_featured } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const updates: Record<string, unknown> = {}
  if (is_active !== undefined) updates.is_active = is_active
  if (is_featured !== undefined) updates.is_featured = is_featured
  await supabaseAdmin.from('aria_influencer_library').update(updates).eq('id', id)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('admin/influencer/library', _GET)
export const POST = withErrorCapture('admin/influencer/library', _POST)
export const PATCH = withErrorCapture('admin/influencer/library', _PATCH)
```

## PART B — Reel Creator panel upgrades
File: `src/app/dashboard/social/page.tsx`

Read the full file. Make targeted str_replace edits only.

### B1 — Add state
After existing reel state variables, add:
```typescript
const [influencerLibrary, setInfluencerLibrary] = useState<Array<{
  id: string; name: string; description: string; image_url: string;
  industry_tags: string[]; style_tags: string[]; is_featured: boolean
}>>([])
const [selectedInfluencerId, setSelectedInfluencerId] = useState<string | null>(null)
const [selectedInfluencerUrl, setSelectedInfluencerUrl] = useState<string | null>(null)
const [showInfluencerPicker, setShowInfluencerPicker] = useState(false)
```

### B2 — Load library on bid change
In existing useEffect that loads bid, add:
```typescript
// Load influencer library filtered by business industry
if (bid) {
  // Get business industry first — use the business data already loaded
  const industryParam = '' // will be set after business loads
  fetch(`/api/social/influencer-library`)
    .then(r => r.ok ? r.json() : null)
    .then(d => { if (d?.influencers) setInfluencerLibrary(d.influencers) })
    .catch(() => {})
}
```

### B3 — Pass influencer to generate call
In `submitReelGeneration`, update the fetch body to include:
```typescript
// If influencer selected, use their image as start frame (overrides reel_source_image_url)
reel_source_image_url: selectedInfluencerId
  ? selectedInfluencerUrl
  : reelMode === 'image' ? (reelSourceImage || post?.image_url) : null,
// Track which influencer was used
influencer_id: selectedInfluencerId ?? null,
```

### B4 — Update generate-video POST to save influencer_id
In `src/app/api/social/generate-video/route.ts` POST handler:
After the existing `await supabaseAdmin.from('social_posts').update({...}).eq('id', post_id)` block,
add `influencer_id` and `influencer_image_url` to the update if provided in request body.

Also increment `usage_count` on the influencer:
```typescript
if (body.influencer_id) {
  await supabaseAdmin.rpc('increment_influencer_usage', { p_id: body.influencer_id }).catch(() => {})
}
```

Add this SQL function to a new migration file `supabase/migrations/20260604000004_influencer_usage.sql`:
```sql
CREATE OR REPLACE FUNCTION increment_influencer_usage(p_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE aria_influencer_library SET usage_count = usage_count + 1 WHERE id = p_id;
END;
$$;
```

### B5 — Add influencer picker to Reel Creator panel
In the Reel Creator panel JSX, add a new section between the "Image source" section and the "Scene description" section:

```tsx
{/* AI Influencer picker */}
<div style={{ marginBottom: 20 }}>
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
      AI Influencer <span style={{ color: '#7FB897', fontSize: 10 }}>INCLUDED WITH REELS</span>
    </div>
    {selectedInfluencerId && (
      <button onClick={() => { setSelectedInfluencerId(null); setSelectedInfluencerUrl(null) }}
        style={{ fontSize: 11, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
        × Remove
      </button>
    )}
  </div>

  {selectedInfluencerId ? (
    // Show selected influencer
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 12px',
      background: 'rgba(127,184,151,0.08)', border: '1px solid rgba(127,184,151,0.3)', borderRadius: 10 }}>
      <img src={selectedInfluencerUrl!} alt="influencer"
        style={{ width: 48, height: 72, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          {influencerLibrary.find(i => i.id === selectedInfluencerId)?.name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
          {influencerLibrary.find(i => i.id === selectedInfluencerId)?.description}
        </div>
        <button onClick={() => setShowInfluencerPicker(true)}
          style={{ fontSize: 11, color: '#7FB897', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginTop: 4, padding: 0 }}>
          Change →
        </button>
      </div>
    </div>
  ) : (
    <button onClick={() => setShowInfluencerPicker(true)}
      style={{ width: '100%', padding: '12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
        border: '1px dashed rgba(127,184,151,0.3)', background: 'rgba(127,184,151,0.04)',
        color: 'var(--text-secondary)', fontSize: 13, textAlign: 'left' as const,
        display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 20 }}>✨</span>
      <div>
        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Add AI Influencer (optional)</div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
          Pick a character to appear in your Reel — included with your Reels add-on
        </div>
      </div>
    </button>
  )}
</div>

{/* Influencer picker modal — inside the Reel Creator panel */}
{showInfluencerPicker && (
  <div style={{
    position: 'absolute', inset: 0, zIndex: 10,
    background: 'var(--bg-surface)',
    borderRadius: '20px 20px 0 0',
    padding: '20px 20px 32px',
    overflowY: 'auto',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>Choose AI Influencer</div>
      <button onClick={() => setShowInfluencerPicker(false)}
        style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 20, cursor: 'pointer' }}>×</button>
    </div>
    <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16, lineHeight: 1.6 }}>
      Aria animates your chosen influencer visiting your business. Their image becomes the start frame of your Reel.
    </p>

    {/* No influencer option */}
    <div onClick={() => { setSelectedInfluencerId(null); setSelectedInfluencerUrl(null); setShowInfluencerPicker(false) }}
      style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 12, cursor: 'pointer',
        border: '1px solid ' + (!selectedInfluencerId ? 'rgba(127,184,151,0.5)' : 'rgba(255,255,255,0.08)'),
        background: !selectedInfluencerId ? 'rgba(127,184,151,0.08)' : 'transparent',
        fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 20 }}>🚫</span>
      <div>
        <div style={{ fontWeight: 600 }}>No influencer — use my own image</div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Animate your product or shop photo</div>
      </div>
    </div>

    {/* Influencer grid */}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {influencerLibrary.map(inf => (
        <div key={inf.id}
          onClick={() => { setSelectedInfluencerId(inf.id); setSelectedInfluencerUrl(inf.image_url); setShowInfluencerPicker(false) }}
          style={{ borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
            border: '2px solid ' + (selectedInfluencerId === inf.id ? '#7FB897' : 'rgba(255,255,255,0.08)'),
            background: selectedInfluencerId === inf.id ? 'rgba(127,184,151,0.08)' : 'transparent',
            transition: 'border-color 0.15s' }}>
          <div style={{ position: 'relative' }}>
            <img src={inf.image_url} alt={inf.name}
              style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', display: 'block' }} />
            {inf.is_featured && (
              <div style={{ position: 'absolute', top: 8, left: 8, background: '#7FB897',
                color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 99 }}>
                ★ FEATURED
              </div>
            )}
            {selectedInfluencerId === inf.id && (
              <div style={{ position: 'absolute', top: 8, right: 8, background: '#7FB897',
                color: '#fff', fontSize: 16, width: 24, height: 24, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ✓
              </div>
            )}
          </div>
          <div style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{inf.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3, lineHeight: 1.5 }}>
              {inf.description?.slice(0, 60)}
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const, marginTop: 6 }}>
              {inf.industry_tags?.slice(0, 2).map(t => (
                <span key={t} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99,
                  background: 'rgba(127,184,151,0.12)', color: '#7FB897', fontWeight: 600,
                  textTransform: 'capitalize' as const }}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
)}
```

Note: The influencer picker modal sits inside the Reel Creator panel div with `position: relative` on the panel container. Make sure the Reel Creator panel container has `position: 'relative'` set.

### B6 — Scene description placeholder update
When an influencer is selected, update the textarea placeholder to reference them:

```typescript
placeholder={
  selectedInfluencerId
    ? `e.g. "${influencerLibrary.find(i => i.id === selectedInfluencerId)?.name} walks into your ${industry ?? 'business'}, looks around, smiles warmly at the camera"`
    : reelMode === 'image'
    ? 'e.g. "Camera slowly zooms into the coffee cup as steam rises, warm morning light"'
    : reelMode === 'text'
    ? 'e.g. "Busy Melbourne café at morning rush, barista making flat white, cosy warm atmosphere"'
    : 'Leave blank and Aria will decide based on your post content'
}
```

Also auto-populate a sensible prompt when influencer selected and prompt is empty:
```typescript
// When influencer selected, suggest a scene prompt if none written
useEffect(() => {
  if (selectedInfluencerId && !reelCustomPrompt) {
    const inf = influencerLibrary.find(i => i.id === selectedInfluencerId)
    if (inf) {
      setReelCustomPrompt(
        `${inf.name} visits this ${industry ?? 'local Australian business'}, looks around genuinely impressed, smiles warmly at the camera, authentic UGC style`
      )
    }
  }
}, [selectedInfluencerId])
```

## PART C — Admin library management

In `src/app/admin/influencer/page.tsx`, add a "Character Library" tab.

Add to the existing tabs array (queue | history | config):
- Add `'library'` as a fourth tab option: `'queue' | 'history' | 'library' | 'config'`
- Tab label: `Library (${influencerLibrary.length})`

### Library tab content:
```tsx
{tab === 'library' && (
  <div>
    {/* Add new character form */}
    <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 14, padding: 20, marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 14 }}>Add character from Higgsfield</div>
      {/* Simple form: name, image_url (paste Higgsfield CDN URL), description, industry_tags */}
      {/* On submit: POST /api/admin/influencer/library */}
      {/* After submit: reload library */}
      <AddInfluencerForm onAdd={async (data) => {
        const res = await fetch('/api/admin/influencer/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
        const d = await res.json()
        if (d.ok) await load()
        else setMsg({ text: '❌ ' + (d.error ?? 'Failed'), ok: false })
      }} />
    </div>

    {/* Grid of all characters */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      {adminInfluencerLibrary.map(inf => (
        <div key={inf.id} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, overflow: 'hidden' }}>
          <img src={inf.image_url} alt={inf.name}
            style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover' }} />
          <div style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{inf.name}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{inf.description}</div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>Used in {inf.usage_count} Reels</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={async () => {
                await fetch('/api/admin/influencer/library', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: inf.id, is_featured: !inf.is_featured }),
                })
                await load()
              }} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                fontFamily: 'inherit', fontWeight: 600,
                background: inf.is_featured ? 'rgba(127,184,151,0.15)' : 'transparent',
                border: '1px solid ' + (inf.is_featured ? 'rgba(127,184,151,0.4)' : C.border),
                color: inf.is_featured ? C.green : C.muted }}>
                {inf.is_featured ? '★ Featured' : '☆ Feature'}
              </button>
              <button onClick={async () => {
                await fetch('/api/admin/influencer/library', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: inf.id, is_active: !inf.is_active }),
                })
                await load()
              }} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                fontFamily: 'inherit', fontWeight: 600,
                background: inf.is_active ? 'transparent' : 'rgba(239,68,68,0.1)',
                border: '1px solid ' + (inf.is_active ? C.border : 'rgba(239,68,68,0.3)'),
                color: inf.is_active ? C.muted : C.red }}>
                {inf.is_active ? 'Active' : 'Hidden'}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
)}
```

Build `AddInfluencerForm` as an inline component in the same file:
```tsx
function AddInfluencerForm({ onAdd }: { onAdd: (data: any) => Promise<void> }) {
  const [name, setName] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [description, setDescription] = useState('')
  const [industries, setIndustries] = useState('')
  const [saving, setSaving] = useState(false)
  const C = { card: 'var(--bg-surface)', border: 'rgba(0,229,255,0.08)', text: 'var(--text-primary)',
    muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)', cyan: '#00E5FF' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
      {[
        { label: 'Name', val: name, set: setName, placeholder: 'e.g. Aria, Nova, Zara' },
        { label: 'Higgsfield CDN image URL', val: imageUrl, set: setImageUrl, placeholder: 'https://d8j0ntlcm91z4.cloudfront.net/...' },
        { label: 'Description', val: description, set: setDescription, placeholder: 'Warm and approachable — suits cafes...' },
        { label: 'Industries (comma-separated)', val: industries, set: setIndustries, placeholder: 'cafe, restaurant, retail' },
      ].map(({ label, val, set, placeholder }) => (
        <div key={label}>
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>{label}</div>
          <input value={val} onChange={e => set(e.target.value)} placeholder={placeholder}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)', color: C.text, fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
        </div>
      ))}
      {imageUrl && (
        <img src={imageUrl} alt="preview"
          style={{ width: 80, height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }} />
      )}
      <button onClick={async () => {
        if (!name || !imageUrl) return
        setSaving(true)
        await onAdd({
          name, image_url: imageUrl, description,
          industry_tags: industries.split(',').map(s => s.trim()).filter(Boolean),
        })
        setName(''); setImageUrl(''); setDescription(''); setIndustries('')
        setSaving(false)
      }} disabled={saving || !name || !imageUrl}
        style={{ padding: '9px 20px', borderRadius: 9, fontFamily: 'inherit', fontWeight: 700, fontSize: 13,
          cursor: saving ? 'wait' : 'pointer',
          background: 'rgba(0,229,255,0.12)', border: '1px solid rgba(0,229,255,0.3)', color: C.cyan,
          opacity: !name || !imageUrl ? 0.5 : 1 }}>
        {saving ? 'Adding...' : '+ Add to Library'}
      </button>
    </div>
  )
}
```

Also add `adminInfluencerLibrary` state and loading in the `load()` function:
```typescript
const [adminInfluencerLibrary, setAdminInfluencerLibrary] = useState<any[]>([])

// In load():
const libRes = await fetch('/api/admin/influencer/library')
if (libRes.ok) setAdminInfluencerLibrary(await libRes.json().then(d => d.influencers ?? []))
```

## PART D — Migration file
File: `supabase/migrations/20260604000004_influencer_usage.sql`

```sql
-- Usage increment function for influencer library
CREATE OR REPLACE FUNCTION increment_influencer_usage(p_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE aria_influencer_library SET usage_count = usage_count + 1 WHERE id = p_id;
END;
$$;
```

## Final checklist
- [ ] `npx tsc --noEmit` — zero errors
- [ ] `/api/social/influencer-library` GET returns active influencers sorted by featured then usage
- [ ] `/api/admin/influencer/library` GET/POST/PATCH all work with isAdminEmail guard
- [ ] Reel Creator panel shows influencer picker section
- [ ] Picker opens as overlay inside the panel (position: absolute)
- [ ] Selecting influencer sets selectedInfluencerId + selectedInfluencerUrl
- [ ] submitReelGeneration passes influencer_image_url as reel_source_image_url when influencer selected
- [ ] generate-video route saves influencer_id + increments usage_count
- [ ] Auto-suggest prompt when influencer selected and prompt empty
- [ ] Admin Library tab shows all characters with feature/hide toggles
- [ ] AddInfluencerForm works — paste Higgsfield URL → saves to DB
- [ ] Migration file created for increment_influencer_usage function
- [ ] No Mubert references anywhere
- [ ] UPGRADE_ONLY — existing Reel creator, image upload, mode picker all still work
