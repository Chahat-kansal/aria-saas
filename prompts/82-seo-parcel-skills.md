# Prompt 82 — Three Fixes: SEO Audit Bug, Parcel UI Refresh, Ask Aria Skill Picker

Three focused tasks. Commit per task. Push at the end.

## TASK 1 — Fix the SEO "Failed to create audit" bug

### What's wrong
The dashboard at /dashboard/seo shows "Tracking www.globalliquor.com.au"
but clicking "Run crawl now" returns "Failed to create audit" (HTTP 500).

Root cause: the dashboard loads `businesses.website` for the ACTIVE business,
but the user has multiple businesses on one account. The website URL is saved
on ONE business (e.g. Sip — id ff5055a0...), while the user may be running the
audit while a different `business_id` is active. The audit route then hits:
- src/app/api/seo/crawl/route.ts L87: ownership check passes (right user)
- L88: `if (!biz)` — passes
- L89: `if (!biz.website)` — FAILS but returns "No website URL configured"
- OR L108: the insert fails for some other reason and returns the misleading
  "Failed to create audit" message

### Fix
In src/app/api/seo/crawl/route.ts around L104-L108:
1. Replace the misleading "Failed to create audit" error with the real one:
   ```ts
   if (createErr || !created) {
     console.error('[seo/crawl] insert failed', createErr)
     return NextResponse.json({
       error: createErr?.message ?? 'Database insert failed',
       hint: 'Check seo_audits table schema and RLS policies',
     }, { status: 500 })
   }
   ```
2. Also check `biz.website` is a valid URL before insert — if it's empty or
   invalid, return 400 "Website URL is missing or invalid — set it in business settings".
3. In src/app/dashboard/seo/page.tsx L552-L556 — when loading website, also
   show the user clearly which business the URL belongs to. If `business.id`
   in context doesn't match where the website is stored, show "This business
   has no website URL — add one in Settings → Business" instead of silently
   tracking a different business's URL.

### Commit
"fix: SEO audit — surface real DB error instead of misleading 'Failed to create audit', validate website URL before insert"

## TASK 2 — Modernise the Parcel Tracking UI

### What's wrong
src/app/dashboard/parcel-tracking/page.tsx is 31KB of dated UI:
- Emoji icons everywhere (⏳🚚📦✅⚠️⏸️🏪✕✗❓) — feels 2020
- Hardcoded inline styles, no design tokens
- Dense data tables, no breathing room
- No visual hierarchy between active/delivered, inbound/outbound

### Fix — modernise to match Financial Trust design language
1. Read /mnt/skills/user/ui-ux-pro-max/SKILL.md before touching the UI
2. Read the existing page fully — preserve all functionality (list, filters,
   add, bulk import, analytics view, prediction). DO NOT remove features.
3. Replace emoji icons with proper Lucide/Tabler icons matching the rest of the dashboard
4. Use the existing CSS variables (--bg-base, --bg-surface, --text-primary, etc.)
5. Layout: hero strip with key stats (X in transit, Y delivered today, Z exceptions),
   then filter chips, then a clean card-based list — each parcel a card not a row
6. Parcel detail panel: timeline of events on the left, recipient/notes/actions
   on the right — split layout, breathing room
7. Add subtle micro-interactions (hover lift, status colour transitions)
8. Mobile-responsive — stack cleanly under 768px

### Rules
- Keep ALL existing functionality — search, filters, add form, bulk import,
  analytics, prediction, manual status overrides, refresh
- Match the look of /dashboard/customers or /dashboard/orders — same design language
- No emoji status icons — use Tabler/Lucide
- Use the Financial Trust palette already defined in CSS vars

### Commit
"feat: parcel-tracking — refreshed UI matching dashboard design language, no emoji icons"

## TASK 3 — Ask Aria Skill Picker (chat panel addition)

### What's wrong
Ask Aria is a chat panel that answers questions. Users want to give it
specific "skills" or focused modes — e.g. "act as my accountant", "be my
marketing strategist", "focus on inventory" — instead of typing the role
context each time.

### Build
1. New table:
```sql
CREATE TABLE IF NOT EXISTS aria_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  name text NOT NULL,
  icon text,
  description text,
  system_prompt_addition text NOT NULL,
  built_in boolean DEFAULT false,
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE aria_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aria_skills_owner" ON aria_skills FOR ALL TO authenticated
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
```

2. Seed 6 built-in skills per business on first load:
   - Accountant — "Focus on cash flow, expenses, GST, profitability. Australian SMB context."
   - Marketing strategist — "Focus on customer acquisition, win-back, SEO, social media, campaigns."
   - Inventory expert — "Focus on stock levels, reorder timing, supplier performance, waste."
   - Compliance officer — "Focus on Australian SMB compliance — BAS, super, awards, insurance, licences."
   - HR coach — "Focus on staff scheduling, rosters, training, retention, awards."
   - Growth advisor — "Focus on long-term strategy, expansion, new revenue streams, benchmarking."

3. UI in the Ask Aria chat panel:
   - Above the input box: a horizontal chip strip showing active skills (max 8 visible)
   - Tapping a chip toggles it on/off (multiple can be active — they stack)
   - A "+" chip at the end opens a modal:
     - List of all skills (built-in first, then custom)
     - Each row: icon, name, description, toggle
     - "Create custom skill" button → form (name, icon emoji or Tabler icon, description, system prompt addition)
     - Delete custom skills only (built-in are read-only)

4. Wire into the chat:
   - When user sends a message, fetch their active skills from aria_skills
     WHERE enabled = true AND business_id = X
   - Concatenate their system_prompt_addition into the existing Ask Aria
     system prompt, before the message history
   - Skills are PER-business — switching business shows that business's active skills

### Files to create/edit
- DB migration via Supabase MCP
- src/app/api/aria/skills/route.ts — GET (list), POST (create), PUT (update), DELETE
- src/components/aria/SkillPicker.tsx — chip strip + modal
- Wire into existing Ask Aria chat component — find it first, do not break it

### Rules
- Don't redesign the chat panel — only ADD the skill chip strip and modal
- Built-in skills cannot be deleted, only toggled
- Custom skills cap at 20 per business (prevent runaway)
- System prompt addition text length cap 1000 chars
- Read /mnt/skills/user/ui-ux-pro-max/SKILL.md before building UI

### CRITICAL — owner-only creation (prompt injection defence)
Custom skill text gets injected directly into Aria's system prompt, so it is a
prompt-injection surface. Staff must NOT be able to create or edit custom skills.
- Add `created_by_user_id uuid` column to aria_skills
- Add `role` check: only users where `businesses.user_id = auth.uid()` (the owner)
  can create, edit, or delete custom skills. Toggling existing skills on/off is
  fine for any authenticated user on that business.
- RLS policies must enforce this — SELECT and UPDATE-toggle-only for staff,
  full CRUD only for the owner.
- The UI must hide the "Create custom skill" button + form for non-owners.
  Check the user role before rendering — do not just rely on the API rejecting.
- Reject any custom skill text matching obvious injection patterns:
  /ignore (all|previous|prior) (instructions|prompts)|disregard|reveal (your )?system|admin (mode|access|override)/i
  → return 400 "This skill text contains restricted instructions"
- Log every custom skill creation to audit_logs with user_id, business_id, skill text

### Commit
"feat: Ask Aria — skill picker with 6 built-in skills + custom skill creation"

## Final
After all 3 tasks committed:
```
git push origin main
```
