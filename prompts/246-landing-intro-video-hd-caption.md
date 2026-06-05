# CLAUDE CODE PROMPT — 246: High-Res Landing Intro Video + Caption

Paste this whole file to Claude Code. Run in autonomous mode — do not ask for permissions. Build gate (`npx tsc --noEmit` + `npm run build`) before commit. RULE 0: never remove or weaken anything existing. `pwd` = `C:\Users\kansa\aria-saas-audit`.

## WHY
The current landing intro video `public/videos/aria-intro.mp4` is only 784×470 (~480p). The `VideoIntro.tsx` component stretches it fullscreen with `objectFit: cover`, so on laptop/desktop it looks soft and low-quality. We generated a new high-resolution Veo 3.1 video (same aesthetic: friendly character waves → walks to door → green light floods out) and need to swap it in + add a readable caption (no audio, so the user needs on-screen text).

## STEP 1 — Download the new assets (do this FIRST — URLs are time-limited)

The new video and a poster frame are hosted on Higgsfield CloudFront. Download both immediately:

```bash
# New high-res intro video (Veo 3.1, 16:9, 8 seconds)
curl -L "https://d8j0ntlcm91z4.cloudfront.net/user_3Eal6Oeags0ToQcfhefc19bpPVl/hf_20260605_084221_a516107c-0528-4e3f-a4fd-3502640cc057.mp4" -o public/videos/aria-intro-hd.mp4

# Poster frame (4K still, shown before video loads / as fallback)
curl -L "https://d8j0ntlcm91z4.cloudfront.net/user_3Eal6Oeags0ToQcfhefc19bpPVl/hf_20260605_081958_9844d5e7-901e-4a55-8612-ec25dc506529.png" -o public/videos/aria-intro-poster.png
```

Verify both downloaded correctly:
```bash
ls -la public/videos/aria-intro-hd.mp4 public/videos/aria-intro-poster.png
# The mp4 should be several MB (not 21 bytes). If it failed, the URL expired — STOP and tell the user to re-share the video URL.
```

## STEP 2 — Compress the video for web (keep it crisp, keep it fast)

The raw Veo output may be large. Compress with ffmpeg to a web-optimized MP4 that stays sharp on desktop but loads fast. If ffmpeg is available:

```bash
ffmpeg -i public/videos/aria-intro-hd.mp4 -vcodec libx264 -crf 23 -preset slow -movflags +faststart -pix_fmt yuv420p -an public/videos/aria-intro.mp4 -y
```

Notes:
- `-crf 23` keeps high visual quality (lower = better; 23 is the sweet spot for web hero video)
- `-movflags +faststart` lets the video start playing before fully downloaded
- `-an` strips audio (the intro is muted anyway)
- This OVERWRITES the old low-res `aria-intro.mp4` with the new compressed high-res one — keeping the same filename means no other code references break

If ffmpeg is NOT available: just rename the downloaded HD file to replace the old one:
```bash
mv public/videos/aria-intro-hd.mp4 public/videos/aria-intro.mp4
```

Also convert the poster to optimized JPG if ffmpeg/imagemagick available (smaller than PNG):
```bash
ffmpeg -i public/videos/aria-intro-poster.png -q:v 3 public/videos/aria-intro-poster.jpg -y
# then remove the PNG: rm public/videos/aria-intro-poster.png
# if conversion fails, keep the PNG and reference .png in step 3
```

Clean up the temp HD file if you compressed (not renamed):
```bash
rm -f public/videos/aria-intro-hd.mp4
```

## STEP 3 — Update `VideoIntro.tsx`

File: `src/components/marketing/landing/VideoIntro.tsx`

Read the full file first. It currently has two phases: `'video'` and `'text'`. The `'text'` phase fires ~0.9s before the video ends, showing the "Your AI co-owner / Running the back office" headline with a green flash.

Make these changes — ALL additive, nothing removed:

### 3a. Add a `poster` to the video element
Find the `<video>` tag. Add a `poster` attribute so a crisp frame shows before the video loads:
```tsx
poster="/videos/aria-intro-poster.jpg"
```
(use `.png` if you kept the PNG in step 2)

### 3b. Add a third phase: `'caption'`
Change the phase state type from `'video' | 'text'` to `'video' | 'caption' | 'text'`.

The caption "Running a business is hard. Meet Aria." should appear early (during the wave/walk, ~0.6s in) and fade out before the character reaches the door (~5s), so it never overlaps the final headline.

Add this timing logic inside the existing `useEffect`, after the `play()` setup:
```tsx
// Show the intro caption shortly after the video starts (during the wave)
const captionIn = setTimeout(() => {
  setPhase(p => (p === 'video' ? 'caption' : p))
}, 600)
// Hide the caption before the door-open / headline moment
const captionOut = setTimeout(() => {
  setPhase(p => (p === 'caption' ? 'video' : p))
}, 5000)
```
Add `clearTimeout(captionIn); clearTimeout(captionOut)` to BOTH the `dismiss()` cleanup and the effect's return cleanup, so they never fire after unmount or after the headline takes over. The existing `onTimeUpdate` that sets `phase='text'` near the end MUST still win — since it sets `'text'` directly, and captionOut only changes `'caption'→'video'`, they won't conflict. But to be safe, guard captionOut so it doesn't override `'text'`.

### 3c. Render the caption overlay
Add this JSX block inside the overlay div, BEFORE the existing "Hero text" block (so the headline renders on top if they ever coincide):
```tsx
{/* Intro caption — readable since there's no audio */}
<div style={{
  position: 'absolute', zIndex: 3, left: 0, right: 0, bottom: '14%',
  textAlign: 'center', padding: '0 32px',
  opacity: phase === 'caption' ? 1 : 0,
  transform: phase === 'caption' ? 'translateY(0)' : 'translateY(16px)',
  transition: 'opacity 0.6s ease, transform 0.6s ease',
  pointerEvents: 'none',
}}>
  <p style={{
    display: 'inline-block',
    fontFamily: 'var(--font-display, serif)',
    fontWeight: 300,
    fontSize: 'clamp(1.5rem, 3.6vw, 3rem)',
    letterSpacing: '-0.02em',
    lineHeight: 1.15,
    color: '#fff',
    margin: 0,
    textShadow: '0 2px 24px rgba(0,0,0,0.55)',
  }}>
    Running a business is hard.{' '}
    <em style={{ color: '#7FB897', fontStyle: 'italic' }}>Meet Aria.</em>
  </p>
</div>
```

The caption uses the same display font and sage-green accent as the hero headline, with a soft text shadow so it stays readable over any frame of the video. It sits at `bottom: 14%` (lower third, clear of the character's face), and fades out at 5s before the green-door headline appears.

## STEP 4 — Build gate + commit

```bash
npx tsc --noEmit   # must pass
npm run build      # must pass
```

Commit everything as ONE batched commit:
- `public/videos/aria-intro.mp4` (replaced — high res)
- `public/videos/aria-intro-poster.jpg` (new)
- `src/components/marketing/landing/VideoIntro.tsx` (caption + poster)

Commit message: `feat(landing): high-res intro video + readable caption (no-audio)`

## STEP 5 — Verify

1. `npm run build` passed
2. `public/videos/aria-intro.mp4` is the new file and is meaningfully larger than the old 0.49 MB / 784×470 version. Confirm with: `ffprobe public/videos/aria-intro.mp4` — width should be ≥1280 (Veo outputs 1280×720 or higher).
3. The poster file exists and is referenced in VideoIntro.tsx
4. The caption text "Running a business is hard. Meet Aria." is in VideoIntro.tsx with the three-phase logic
5. The existing end headline ("Your AI co-owner / Running the back office") is UNCHANGED and still fires near the end
6. `sessionStorage` once-per-session logic in LandingShell.tsx is untouched

## HARD RULES
- Do NOT change `LandingShell.tsx` — only `VideoIntro.tsx` + the video/poster files
- Do NOT remove the existing 'text' phase or the green-flash or the end headline
- Keep the filename `aria-intro.mp4` so no other references break
- If the video download returns a tiny file (URL expired), STOP and ask the user to re-share the URL — do not commit a broken file
