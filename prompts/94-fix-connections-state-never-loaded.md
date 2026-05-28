# Prompt 94 - Fix: connections state never loaded on /dashboard/social

## What's broken (verified)

In `src/app/dashboard/social/page.tsx`:
- Line 50 declares `const [connections, setConnections] = useState<SocialConn[]>([])`
- `setConnections` is NEVER called anywhere in the file (verified by global search - only 1 hit = the declaration itself)
- Line 232 computes `connectedPlatforms` from this perpetually-empty state
- Lines 235 and 257 bail out with `return` if `connectedPlatforms.length === 0`
- Line 575 disables the generate button on the same check

Net effect: user has Instagram + Facebook ACTUALLY connected in social_connections (verified in DB), but the social dashboard's parent component has no idea, so:
- "Generate post with Aria" button is disabled
- "Generate monthly calendar" button is disabled
- Click handlers bail out immediately
- The user gets a "connect at least one account" UX even though they have two connected

The `<SocialConnections>` child component (line 723) loads its own connections state internally for display, but does NOT lift it up to the parent. So the parent stays empty.

The `/api/social/connections` endpoint already exists and works correctly - just nothing calls it from this page.

## The fix - one focused change

Add a useEffect in `src/app/dashboard/social/page.tsx` that loads connections on mount:

```tsx
// Load social connections so connectedPlatforms gates work correctly.
// Without this, the parent state stays empty and the generate buttons are
// permanently disabled, even when accounts ARE connected (loaded by the
// SocialConnections child component, but never lifted up).
useEffect(() => {
  if (!bid) return
  let cancelled = false
  ;(async () => {
    try {
      const r = await fetch(`/api/social/connections?business_id=${bid}`)
      if (!r.ok) return
      const d = await r.json()
      if (cancelled) return
      setConnections(Array.isArray(d.connections) ? d.connections : [])
    } catch {
      // silent - the buttons stay disabled which is the safe default
    }
  })()
  return () => { cancelled = true }
}, [bid])
```

Place this near the other useEffect hooks (probably below the existing mount/load logic).

ALSO - to keep the parent's state fresh when the user connects/disconnects an account via the SocialConnections child:

Pass a callback `onChange` prop to `<SocialConnections>` so when its internal state changes (account connected/disconnected/rotated), the parent re-fetches:

```tsx
{bid && <SocialConnections businessId={bid} onChange={async () => {
  const r = await fetch(`/api/social/connections?business_id=${bid}`)
  if (r.ok) {
    const d = await r.json()
    setConnections(Array.isArray(d.connections) ? d.connections : [])
  }
}} />}
```

Then in `src/components/dashboard/social/SocialConnections.tsx`:
- Add an optional `onChange?: () => void` prop
- Call `onChange?.()` after successful connect / disconnect / refresh actions

If the child component doesn't have those mutation handlers, the connect/disconnect flow probably redirects through OAuth which triggers a full page reload - the new useEffect on mount handles that case automatically. The onChange prop is only needed for in-page state changes.

## Don't do
- Don't change /api/social/connections (it works correctly, verified by Sip's DB query returning IG + FB rows)
- Don't change /api/aria/social-suggest (it works correctly, verified by Vercel logs showing 200 responses)
- Don't add a "manual connections list" hack - the fix is loading the state properly, not bypassing it

## Rules
- npx tsc --noEmit + npm run build pass
- Single commit
- After commit: git push origin main

## Commit
"fix(dashboard/social): load connections state on mount so generate buttons see connected accounts (was always empty, gating buttons incorrectly)"

## After this lands - quick test
1. Refresh /dashboard/social
2. Generate buttons should be enabled (because you have IG + FB connected)
3. Tap "Generate post with Aria"
4. Should generate 2 posts (one IG, one FB) - not 3, not 0
5. Network tab should show POST to /api/aria/social-suggest with body `{ business_id, platforms: ['instagram','facebook'], count: 3 }`
