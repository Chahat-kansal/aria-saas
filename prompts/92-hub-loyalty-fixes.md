# Prompt 92 - Fix the customer hub: missing cards + dead loyalty link

## What's broken (verified against live deployment + DB)

The customer hub at `ariaos.site/{slug}` is supposed to show 5 cards (loyalty,
booking, community, review, website). On the live site it shows 3, and the
loyalty card goes to a page that says "Loading..." forever.

Root causes (all confirmed):

1. **Booking card hidden** - `/{slug}/page.tsx` only renders the booking card
   when `businesses.booking_link_slug` is non-null. Sip's column is NULL. The
   card is silently filtered out. There's no UI for the owner to set this value.

2. **Review card hidden** - Same pattern. The card only renders when
   `businesses.google_review_link` OR `google_business_url` is set. Both are
   NULL for Sip. No UI to set them.

3. **Loyalty page dead** - The hub passes the slug (e.g. `sip-ff5055`) to
   `/loyalty/{business_id}`. The page's client fetch hits
   `/api/public/loyalty/{slug}` which then runs `.eq('id', business_id)` against
   the businesses table - but `id` is a UUID and `business_id` is now a slug.
   The lookup returns nothing, the route returns 404, the page stays on
   "Loading..." forever. Compounding: `pos_loyalty_config` has zero rows for
   Sip, so even with the UUID lookup fixed, the route would still return 404
   on the `public_enrol_enabled` check.

4. **No owner UI for any of this** - There's no place in the dashboard where
   Sip's owner can set their booking link, Google review link, or seed a
   default loyalty config.

## TASK 1 - Fix loyalty API + page to accept either slug or UUID

In every file matching `src/app/api/public/loyalty/[business_id]/**/route.ts`
(there are 3 - the GET, /enrol POST, /balance GET):

Replace the existing `.eq('id', business_id)` lookup with a helper that
resolves either UUID OR slug to the actual business ID:

```typescript
// Add to a shared helper file e.g. src/lib/aria/resolve-business.ts
export async function resolveBusinessId(db: SupabaseClient, idOrSlug: string): Promise<string | null> {
  // UUID check
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug)) {
    return idOrSlug
  }
  // Slug lookup
  const { data } = await db.from('businesses').select('id').eq('slug', idOrSlug).maybeSingle()
  return data?.id ?? null
}
```

Then in each loyalty route:
```typescript
const realId = await resolveBusinessId(db, business_id)
if (!realId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
// ... use realId everywhere instead of business_id
```

Same fix in the customer-facing page `/loyalty/[business_id]/page.tsx` if it
also queries by ID anywhere on the client.

ALSO apply this same helper to /api/public/bookings/[business_id]/route.ts
and any other public route that accepts a business id in the URL. Bookings has
the exact same bug waiting to happen.

## TASK 2 - Seed default loyalty config when a business is created

Right now no business has a row in `pos_loyalty_config`, so the loyalty page
404s even with a valid id. Two parts:

1. **Backfill existing businesses**: insert a default row for every business
   that doesn't have one yet:
   ```sql
   INSERT INTO pos_loyalty_config (business_id, program_type, points_per_dollar, stamps_to_reward, stamp_reward_text, public_enrol_enabled)
   SELECT id, 'points', 1, 10, 'Free item', false
   FROM businesses
   WHERE id NOT IN (SELECT business_id FROM pos_loyalty_config WHERE business_id IS NOT NULL);
   ```
   
   Note `public_enrol_enabled: false` - so customers can't enrol until the
   owner explicitly enables the program. This is correct: a business without
   a configured program shouldn't accept signups silently.

2. **Add a trigger** so future businesses auto-get a default config:
   ```sql
   CREATE OR REPLACE FUNCTION create_default_loyalty_config()
   RETURNS TRIGGER LANGUAGE plpgsql AS $$
   BEGIN
     INSERT INTO pos_loyalty_config (business_id, program_type, points_per_dollar, stamps_to_reward, stamp_reward_text, public_enrol_enabled)
     VALUES (NEW.id, 'points', 1, 10, 'Free item', false)
     ON CONFLICT (business_id) DO NOTHING;
     RETURN NEW;
   END $$;
   
   DROP TRIGGER IF EXISTS trg_default_loyalty_config ON businesses;
   CREATE TRIGGER trg_default_loyalty_config
     AFTER INSERT ON businesses
     FOR EACH ROW EXECUTE FUNCTION create_default_loyalty_config();
   ```

## TASK 3 - Update the loyalty page empty state

When the customer lands on `/loyalty/{slug}` and `public_enrol_enabled` is
false (program exists but owner hasn't switched it on), show a friendly
"Loyalty rewards coming soon - check back later" message instead of 404.
Right now the page either 404s or loops on Loading.

## TASK 4 - Hub UI surfaces what's missing, not just hides it

The current hub at `/{slug}/page.tsx` silently filters out cards that have no
backing data (no `booking_link_slug` -> no booking card). That's correct for
customer UX but the OWNER can't see what they're missing from `/dashboard/share`.

In `/dashboard/share/page.tsx`:
- Below the hub-link card, add a checklist showing what's enabled on the hub:
  - "Loyalty - configured" (green tick if pos_loyalty_config.public_enrol_enabled=true, else "not yet configured - set up loyalty")
  - "Bookings - link set" (green tick if booking_link_slug is set, else "no booking link yet - set it up")
  - "Reviews - link set" (green tick if google_review_link is set, else "add your Google review link")
  - "Website" - green tick if set
  - "Community" - green tick if business profile exists

Each unchecked item is a button that takes the owner to the right setup page.

## TASK 5 - Owner setup pages for the missing fields

Add a new section to `/dashboard/settings/business` (or wherever business info
lives - find it):
- Input for Google review link (with paste-validation: must include
  `google.com/maps` or `g.page/r`)
- Input for booking link slug (defaults to the business slug - explanation:
  "your booking page will be ariaos.site/{slug}/book")
- Save button updates `businesses.google_review_link` and `booking_link_slug`

For Sip specifically (and any business needing one), also surface the loyalty
config page from `/dashboard/loyalty` if it exists, else flag it as a separate
to-build for prompt 89's loyalty config task.

## TASK 6 - Backfill Sip specifically so YOU can test

Run these against the live DB so Sip's hub actually works for testing:

```sql
-- Set Sip's booking slug to match its main slug
UPDATE businesses SET booking_link_slug = slug WHERE id = 'ff5055a0-c351-4ada-817a-1804961035f3' AND booking_link_slug IS NULL;
```

Don't auto-set google_review_link - the owner has to paste their real link.
Instead, after the fix, the hub will show 4 cards (loyalty, booking, community,
website) and the review card stays hidden until you (the owner) paste the link.

## Rules
- Run DB migrations via Supabase MCP - the helper + trigger + backfill must all run before the route changes deploy, otherwise existing loyalty links still 404
- npx tsc --noEmit + npm run build pass before each commit
- The slug-or-UUID resolver helper is reusable - put it in a shared lib file, don't duplicate it across routes
- Apply the helper to bookings + ALL public-by-id routes, not just loyalty
- After all commits: git push origin main

## Commits
- "fix(loyalty): accept slug or UUID in /api/public/loyalty/* routes"
- "feat(loyalty): default config row + auto-seed trigger + Sip backfill"  
- "feat(loyalty-public): friendly 'coming soon' empty state when program not enabled"
- "feat(share-page): checklist showing which hub cards are configured + setup links"
- "feat(business-settings): inputs for Google review link + booking link slug"
- Then: git push origin main

## Priority if limit runs low
1. TASK 1 (loyalty slug-vs-UUID) - this is the actual launch-blocker, the loyalty card goes nowhere right now
2. TASK 2 (seed default config + trigger) - without this, even fixed URLs 404
3. TASK 6 (backfill Sip) - smallest, can be done via SQL even outside Claude Code
4. TASK 3 (empty state)
5. TASK 4 + 5 (owner UI) - lowest priority, owner can paste links via Supabase admin in the meantime
