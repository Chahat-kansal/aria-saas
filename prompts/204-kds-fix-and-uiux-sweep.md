# Prompt 204 — KDS Timer/Bump Fix + Full UI/UX Sweep (ui-ux-pro-max skill)

Two parts: (A) fix the broken Kitchen Display timer + bump, (B) systematic UI/UX audit and
fixes across the app using the ui-ux-pro-max skill.

## Pre-flight
```
git pull origin main
```
Read CLAUDE.md (RULE 0 — upgrade only, fix not remove). Push + verify after every commit.

---

## PART A — Fix Kitchen Display (KDS) timer + bump (URGENT — functional bug)

### Observed bugs (from production screenshot)
- Timers show absurd values (22427:32 hours), AVG WAIT 9517:54
- Timer counts from created_at forever, never stops on BUMP
- Bumped orders still visible on the board (should disappear)
- Stale orders from previous days still showing
- Files: src/app/pos/kitchen/page.tsx, src/app/api/pos/kds/route.ts, src/app/api/pos/kds/[id]/route.ts

### Fix 1 — Timer must freeze on bump
In src/app/pos/kitchen/page.tsx, elapsedSeconds currently always uses created_at to now.
Change so that once an order is bumped/ready/delivered, elapsed is frozen at the bump time:
```typescript
function elapsedSeconds(order: KDSOrder) {
  const end = order.bumped_at ? new Date(order.bumped_at).getTime() : Date.now()
  return Math.max(0, Math.floor((end - new Date(order.created_at).getTime()) / 1000))
}
```
Update all call sites to pass the order, not just created_at.

### Fix 2 — Bump must set status + bumped_at in DB
In src/app/api/pos/kds/[id]/route.ts (the PATCH handler):
When status becomes 'delivered' (bump from ready) OR any bump action:
- Set bumped_at = now() if not already set
- Persist the status change
Verify the update actually writes (check error, confirm row updated — Check 10 pattern).

### Fix 3 — Active board must exclude completed + stale orders
In src/app/api/pos/kds/route.ts (GET):
- Only return orders with status IN ('new', 'in_progress', 'ready')
- AND created_at >= start of today (or last 24h) — exclude stale multi-day orders
- Order by created_at ascending (oldest first = make first)
The frontend filter (line ~129) already excludes delivered/void — but the API should ALSO
filter so stale data never even loads.

### Fix 4 — Clean up existing stale orders (one-time)
Via Supabase migration or admin query: mark all KDS orders older than 24h with status
new/in_progress/ready as 'delivered' (they're long done — this clears the backlog of 49 fake active orders).
```sql
UPDATE pos_kds_orders SET status = 'delivered', bumped_at = COALESCE(bumped_at, now())
WHERE status IN ('new','in_progress','ready') AND created_at < now() - interval '24 hours';
```
Run via Supabase MCP.

### Fix 5 — AVG WAIT sanity
avgWait should only average genuinely active (today's) orders. After Fix 3 + 4 this self-corrects,
but cap the display: if an order somehow exceeds 24h, show "24h+" not a raw huge number.

Commit each fix separately:
"fix(kds): freeze timer on bump", "fix(kds): persist bumped_at + status on bump",
"fix(kds): API excludes completed + stale orders", "fix(kds): clear stale order backlog",
"fix(kds): cap avg wait display"

RULE 0: do not remove the timer or bump feature — make them correct.

---

## PART B — Full UI/UX sweep using ui-ux-pro-max skill

### Use the skill
Read and apply /mnt/skills/user/ui-ux-pro-max/SKILL.md. Use its guidelines for:
accessibility, contrast, spacing, typography, interaction states, responsive layout,
color systems, and the 99 UX guidelines it contains.

### Scope — audit these high-traffic surfaces first
1. POS Terminal (src/app/pos/page.tsx or terminal) — the most-used screen
2. Kitchen Display (just fixed functionally — now polish UX)
3. Dashboard home (src/app/dashboard/page.tsx)
4. Ask Aria (src/app/dashboard/ask-aria/page.tsx)
5. Community feed + reels (src/app/community/)
6. Mobile scanner (src/app/pos/mobile/page.tsx)
7. Checkout/payment flow
8. Onboarding (src/app/onboarding/)

### For each surface, check against the skill's guidelines:
- **Contrast**: text on backgrounds meets WCAG AA (4.5:1 body, 3:1 large). Flag any low-contrast text (the dark-on-dark issues noted before).
- **Touch targets**: min 44x44px for anything tappable (POS is used on tablets/phones)
- **Spacing rhythm**: consistent padding/margins per the skill's spacing system
- **Typography**: consistent scale, line-height, no orphaned tiny text
- **Interaction states**: hover, active, disabled, loading all present and clear
- **Empty states**: every list/grid has a proper empty state (not blank)
- **Error states**: visible, helpful, not silent
- **Loading states**: skeletons or spinners, no layout shift
- **Responsive**: works at 390px (mobile), 768px (tablet), 1280px (desktop)
- **Consistency**: Financial Trust palette (#2D5240 forest, #7FB897 sage), Fraunces italic
  branding/totals, Inter body — applied consistently
- **Visual hierarchy**: primary actions obvious, destructive actions (void/delete) clearly marked

### Fix rules (RULE 0)
- Improve styling, contrast, spacing, states — never remove a feature or element
- Do not touch: AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts
- Keep the locked design system (forest/sage, Fraunces/Inter)
- One commit per surface: "fix(ui/[surface]): [improvements] per ui-ux-pro-max"

### Output per surface
```
[Surface] — UI/UX issues found: N
  - issue → fix
Fixed + committed + pushed.
```

---

## Exit checklist
- [ ] KDS timer freezes on bump
- [ ] Bumped orders leave the board + persist to DB
- [ ] Stale order backlog cleared (49 fake actives gone)
- [ ] AVG WAIT shows sane values
- [ ] ui-ux-pro-max applied to all 8 high-traffic surfaces
- [ ] Contrast/touch-target/state issues fixed
- [ ] Locked design system intact, no features removed
- [ ] npx tsc --noEmit + npm run build pass
- [ ] All pushed (git log origin/main..HEAD empty)
- [ ] Deploy green

Update AUDIT_STATE.md / PRODUCTION_READINESS.md.

## Start
PART A first (KDS is a live functional bug). Begin with Fix 4 (clear the stale backlog via
Supabase) so the board is usable immediately, then Fixes 1-3, 5. Then PART B UI sweep.
