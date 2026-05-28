# Prompt 93 - Social-suggest only generates posts for connected platforms

## What's broken (verified)

Sip has Facebook + Instagram connected. NOT Google Business. But every time
the owner taps "Generate post with Aria":

1. Frontend `src/app/dashboard/social/page.tsx` line 257 hardcodes:
   `platforms: ['instagram', 'facebook', 'google_business']`
2. Same hardcode on line 235 in `/api/social/calendar` call.
3. API route `/api/aria/social-suggest/route.ts` line 117 trusts whatever
   the frontend sends and falls back to `['instagram', 'facebook']` if empty.
   No check against actual connections.

Result: Aria generates 3 posts per request, one for an account that doesn't
exist. ~33% tokens wasted on Sip. ~66% wasted if owner only has one platform.

The `social_connections` table is the source of truth - rows with
`is_active = true` for the business_id are the connected platforms. Simple
lookup.

## Fix - one focused change, two files

### TASK 1 - API route enforces connected-only

In `src/app/api/aria/social-suggest/route.ts`:

After parsing the body (around line 73), query connected platforms:

```typescript
const { data: connections } = await supabaseAdmin
  .from('social_connections')
  .select('platform')
  .eq('business_id', business_id)
  .eq('is_active', true)

const connectedPlatforms: string[] = (connections ?? [])
  .map(c => c.platform)
  .filter(Boolean)

if (connectedPlatforms.length === 0) {
  return NextResponse.json({
    error: 'no_connections',
    message: 'Connect at least one social account before generating posts.',
    posts: []
  }, { status: 400 })
}

// Replace the existing fallback at line 117:
// const requestedPlatforms: string[] = platforms || ['instagram', 'facebook'];
// With:
const requestedPlatforms: string[] = (Array.isArray(platforms) && platforms.length > 0)
  ? platforms.filter((p: string) => connectedPlatforms.includes(p))
  : connectedPlatforms

// Hard guard: if filtering left nothing, abort cheap
if (requestedPlatforms.length === 0) {
  return NextResponse.json({
    error: 'no_matching_connections',
    message: 'None of the requested platforms are connected.',
    posts: []
  }, { status: 400 })
}
```

This is server-side enforcement. Even if a stale frontend sends junk,
the route refuses to call Anthropic for disconnected platforms.

Apply the SAME pattern to `/api/social/calendar/route.ts` (the monthly
calendar generator referenced on dashboard line 235). Same bug, same fix.

### TASK 2 - Frontend reads connections and only requests what's connected

In `src/app/dashboard/social/page.tsx`:

Add a `connectedPlatforms` state and load it on mount:

```typescript
const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([])

useEffect(() => {
  if (!bid) return
  fetch(`/api/social/connections?business_id=${bid}`)
    .then(r => r.json())
    .then(d => setConnectedPlatforms(d.platforms ?? []))
}, [bid])
```

If `/api/social/connections` doesn't exist, build it - it's a 10-line route
that returns `{ platforms: string[] }` from `social_connections` filtered to
`is_active = true`.

Then update the two hardcoded calls:

Line 235:
```typescript
body: JSON.stringify({ business_id: bid, month: calendarMonth, platforms: connectedPlatforms, posts_per_week: postsPerWeek })
```

Line 257:
```typescript
body: JSON.stringify({ business_id: bid, platforms: connectedPlatforms, count: 3 })
```

### TASK 3 - UI affordance: disable button if nothing connected

If `connectedPlatforms.length === 0`:
- "Generate post with Aria" button is disabled
- Show a helper text near it: "Connect Instagram, Facebook, or Google Business to start generating posts"
- The connector setup is already visible elsewhere on the page (line 718 shows "Connected Accounts" section) - link to that as a target

### TASK 4 - Cost telemetry

In the aria_ai_calls insert from social-suggest (it already logs costs), add
the `metadata` jsonb with `{platforms: connectedPlatforms, count: requestedPlatforms.length}`.
This lets us audit later whether the fix actually reduced spend.

## Rules

- npx tsc --noEmit + npm run build pass before each commit
- The API route's connection check is the AUTHORITATIVE guard. The frontend
  read is for UX (disable button, show helper). Both layers, not one.
- If `/api/social/connections` doesn't already exist, create it. Don't pile
  more logic into the existing social-suggest route.
- After all commits: git push origin main

## Commits

- "feat(api/social/connections): GET endpoint listing platforms with is_active=true"
- "fix(social-suggest): enforce server-side that only connected platforms generate posts (token-spend protection)"
- "fix(social-calendar): same enforcement on monthly calendar generator"
- "fix(dashboard/social): frontend reads connected platforms, only requests those, disables button when none connected"
- Then: git push origin main

## Expected impact

Real numbers, conservatively:
- Sip with 2 connected (FB+IG): cost drops from 3 platforms → 2. 33% saving on every "generate post" tap.
- Owner with 1 connected: 66% saving.
- Owner with 0 connected: 100% saving (no API call at all - fast 400 from the guard).

At ~$0.05 per generated post and dozens of generations per active business
per month, this adds up. Multiplied across the user base it's a measurable
line on your Anthropic bill.

## Priority if limit runs low

1. TASK 1 (API enforcement) - server-side guard is the actual fix
2. TASK 2 (frontend reads connections) - completes the loop
3. TASK 3 (button affordance) - nice UX polish, not blocking
4. TASK 4 (telemetry) - launch with or without

Tasks 1+2 must ship together - otherwise the frontend keeps asking for 3
platforms and the API silently filters them, which is fine but masks errors.
