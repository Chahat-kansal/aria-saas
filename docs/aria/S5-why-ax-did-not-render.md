# S5 PHASE 1 — why `/ax` "did not render"

## THE PREMISE IS WRONG, AND MEASURING IT CHANGED THE SPRINT

The paste says `/dashboard/ask-aria/ax` *"appears only in edge-middleware, with no serverless
render."* Queried against the live deployment over 7 days:

```
/dashboard/ask-aria/ax        requestPath count   14
   grouped by source          middleware  14
                              function    13     <- serverless renders DID happen
                              redirect     1
   grouped by statusCode      200         13
                              307          1
```

**`/ax` renders. Thirteen successful serverless renders, thirteen 200s.** It is not blocked, not
redirected away, and not a 404. The single 307 is one auth/trial redirect out of fourteen requests —
the same gate `/dashboard/ask-aria` passes through — not a systematic block.

The original reading was almost certainly a single moment: one request where the middleware line was
visible and the function line was not, or the one 307.

## SO WHY HAS THE OWNER NEVER SEEN IT

**Nothing points at it.** Every navigation entry point in the product links to
`/dashboard/ask-aria`:

| file | line |
|---|---|
| `components/AriaFloatingPanel.tsx` | 20 |
| `components/aria/AriaCommandBar.tsx` | 30, 227 |
| `components/dashboard/RetailDashboard.tsx` | 34, 279 |
| `components/dashboard/MorningCommandCentre.tsx` | 332, 567 |
| `components/dashboard/DailyBriefingModal.tsx` | 175, 191, 505 |
| `components/dashboard/AriaSays.tsx` | 180 |
| `components/dashboard/ProWidgets.tsx` | 303 |
| `components/SpotlightTour.tsx` | 262, 270 |
| `components/pos/ComingSoonPage.tsx` | 25 |

**Zero link to `/ax`.** The 14 requests it did receive are someone typing the URL.

So the two possibilities the sprint offered — *nobody navigates to it* vs *middleware redirects it* —
resolve to the **first**, and the middleware is innocent. I read `src/middleware.ts` end to end:
there is no `ask-aria` or `/ax` rule anywhere in it, and every `/dashboard/*` gate it does apply
(POS-employee, auth, trial/subscription) treats both routes identically.

### Does it affect other routes?
No. This is not a routing fault to fix — it is that **the canonical URL the whole product links to
serves the old page**. The swap is therefore still the right move, but for a different reason than
the paste assumed: not to make `/ax` reachable (it is), but to make the route everything already
points at serve the built surface.

## THE ONE-LINE FIX DOES NOT EXIST — AND ONE THING MAKES THE SWAP RISKIER THAN IT LOOKS

The decision table says: *if it is a redirect, the fix may be one line and the swap may not need to
happen*. It is not a redirect, so there is no one-line fix.

And a capability check that must land before any swap:

```
src/app/dashboard/ask-aria/page.tsx:578
  const q = new URLSearchParams(window.location.search).get('q')     <- auto-send on load
```

**The old page honours `?q=`. The AX surface reads no query parameters at all** — `useSearchParams`
and `searchParams` appear nowhere in `AskAriaTransition.tsx` or `ax/page.tsx`.

At least **eight** of the links above pass `?q=` or `?topic=`: the daily briefing's three
"full detailed briefing" actions, AriaSays, MorningCommandCentre's prompt list, ProWidgets, the
spotlight tour's Ask-Aria step, and the POS coming-soon page. **Swapping without `?q=` would
silently break every one of them** — the link would land on a blank composer and the owner's
question would vanish. That is a phase-4 migration item, not a detail.

## VERDICT

| question | answer |
|---|---|
| Why did `/ax` produce a middleware entry and no serverless render? | **It did produce serverless renders — 13 of them.** The premise was a misreading. |
| Is `/ax` reachable? | **Yes.** 200 on 13 of 14 requests. |
| Exact rule/line preventing it? | **None exists.** No `ask-aria` rule in `src/middleware.ts`. |
| Then why hasn't the owner seen it? | Every one of ~14 navigation links points to `/dashboard/ask-aria`; none points to `/ax`. |
| Is the swap still needed? | **Yes** — it is the only thing that puts the built surface on the URL the product already links to. |
