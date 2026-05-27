# Prompt 79 — Restore Scroll-Pin Effect on Landing Pages

## What happened
Commit 2d05c603 ("landing page — full pro marketing page, 13 sections") rewrote
src/components/marketing/landing/LandingShell.tsx and REMOVED the scroll-pinned
hero + crossfade effect that existed before.

The old scroll-pin logic is preserved in commit 1da076f7:
- A pinned hero that fades out as you scroll (--hero-progress CSS variable)
- A crossfade act that transitions through scenes as you scroll
- A progress bar driven directly by scroll position
- requestAnimationFrame-throttled scroll handler
- prefers-reduced-motion support
- Arrow/PageUp/PageDown keyboard navigation

## Goal
Restore the scroll-pin / pinned-hero / crossfade effect — and apply it to
EVERY landing/marketing page, not just the main one.

## Step 1 — recover the old logic
`git show 1da076f7:src/components/marketing/landing/LandingShell.tsx`
Read it fully. Note the scroll mechanics:
- scrollY tracking with rAF throttle
- heroEndPx = window.innerHeight * 2 — hero is pinned for 2 viewport heights
- --hero-progress CSS var drives the hero fade
- crossfade act after the hero, stepping through SCENES
- ProgressBar component, reduced-motion guard, keyboard nav

## Step 2 — decide the integration approach
The CURRENT LandingShell (commit 2d05c603) has 13 good marketing sections.
Do NOT throw those away. Instead:
- Keep the 13 sections
- Re-add the scroll-pinned HERO at the top — the hero pins and fades on scroll
  exactly like the old version
- The 13 sections then scroll normally below the pinned hero
- Re-add the scroll progress bar
- Keep reduced-motion support and keyboard nav
The result: pinned animated hero on top, the full 13-section page below it.

## Step 3 — apply to EVERY landing page
Find all marketing/landing pages in the repo:
- src/app/page.tsx (main landing)
- any other marketing pages (comparison pages, industry landing pages,
  /for-cafes, /for-liquor, pricing, etc. — search src/app for marketing routes)
Each landing-style page should get the same scroll-pin hero treatment for
consistency. Build a reusable ScrollPinHero component so every page uses the
same effect — do not copy-paste the logic per page.

## Rules
- Build ONE reusable ScrollPinHero component — all landing pages import it
- Keep the existing 13 sections — this is additive, restore the hero effect on top
- prefers-reduced-motion MUST be respected — pinned effect disabled for those users
- rAF-throttle the scroll handler — never a raw scroll listener doing heavy work
- npx tsc --noEmit + npm run build — must pass
- Single commit: "feat: restore scroll-pin hero effect across all landing pages"

## Pre-edit checklist
1. git show 1da076f7:src/components/marketing/landing/LandingShell.tsx — old logic
2. Read current src/components/marketing/landing/LandingShell.tsx — the 13 sections
3. Read HeroAct, StickyOverlay, ProgressBar, scene-data if they still exist
4. Search src/app for all marketing/landing routes
