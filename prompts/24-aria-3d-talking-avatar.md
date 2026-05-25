# Prompt 24 — Aria 3D Interactive Avatar (TalkingHead + VRoid Studio, NO audio/TTS)

## What this builds
A real interactive 3D character named Aria that:
- Renders as a full 3D avatar using a VRoid Studio GLB model + Three.js via TalkingHead
- Animates her mouth silently while Aria's text response streams in (visual only, no sound)
- Has idle animations (breathing, blinking, subtle head movement) at all times
- Has emotion expressions — happy when positive, neutral normally
- Lives in the Ask Aria page, floating bottom-right of the chat area
- Starts animating the moment text begins streaming, stops when response is done
- NO audio, NO TTS, NO Google Cloud — text-only, visual animation only

## MANDATORY PRE-EDIT CHECKLIST
```
1. pwd → must be C:\Users\kansa\aria-saas-audit
2. git pull origin main
3. Read src/app/dashboard/ask-aria/page.tsx FULLY
4. npx tsc --noEmit → zero errors before starting
5. npm run build → must pass before starting
```

## STEP 1 — Install packages
```bash
npm install three @react-three/fiber @react-three/drei
npm install --save-dev @types/three
```

## STEP 2 — One environment variable needed
Add to Vercel environment variables (Production + Preview + Development):
```
NEXT_PUBLIC_ARIA_AVATAR_URL=https://your-blob-url/aria.glb
```
This is the Vercel Blob URL of the VRoid Studio GLB file.
No other env vars needed — no TTS, no Google Cloud, nothing else.

## STEP 3 — Create AriaTalkingHead component

```typescript
// src/components/aria/AriaTalkingHead.tsx
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface AriaTalkingHeadProps {
  isActive: boolean       // true while Aria's text is streaming
  responseText: string    // the text being streamed (triggers silent lip animation)
}

// TalkingHead loaded via script tag — declare global type
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TalkingHead: any
  }
}

export function AriaTalkingHead({ isActive, responseText }: AriaTalkingHeadProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headRef = useRef<any>(null)
  const [loaded, setLoaded] = useState(false)
  const [scriptReady, setScriptReady] = useState(false)
  const lastTextRef = useRef<string>('')

  const avatarUrl = process.env.NEXT_PUBLIC_ARIA_AVATAR_URL ?? ''

  // Step 1 — Load TalkingHead from jsDelivr CDN as ES module
  useEffect(() => {
    if (typeof window === 'undefined' || !avatarUrl) return
    if (window.TalkingHead) { setScriptReady(true); return }

    // TalkingHead must load as an ES module then assign to window
    const load = async () => {
      try {
        // Dynamic import from CDN
        const mod = await import(
          /* webpackIgnore: true */
          'https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@1.3/modules/talkinghead.mjs'
        )
        window.TalkingHead = mod.TalkingHead ?? mod.default
        setScriptReady(true)
      } catch (err) {
        console.error('[AriaTalkingHead] CDN load failed:', err)
      }
    }
    load()
  }, [avatarUrl])

  // Step 2 — Initialise avatar once script is ready and container mounted
  useEffect(() => {
    if (!scriptReady || !containerRef.current || headRef.current || !avatarUrl) return

    try {
      headRef.current = new window.TalkingHead(containerRef.current, {
        ttsEndpoint: null,        // No TTS — visual animation only
        ttsApikey: null,
        cameraView: 'upper',      // Upper body — face and shoulders visible
        cameraRotateX: 6,
        cameraRotateY: 0,
        cameraDistance: 0.7,
        cameraX: 0,
        cameraY: 0.07,
        backgroundColor: 'transparent',   // Blends into dark UI
        modelPixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      })

      // Load the VRoid GLB model
      headRef.current.showAvatar(
        {
          url: avatarUrl,
          body: 'F',
          avatarMood: 'neutral',
          lipsyncLang: 'en',
        },
        () => {
          setLoaded(true)
          console.log('[AriaTalkingHead] Aria loaded')
        },
        (err: Error) => {
          console.error('[AriaTalkingHead] Load error:', err)
        }
      )
    } catch (err) {
      console.error('[AriaTalkingHead] Init error:', err)
    }
  }, [scriptReady, avatarUrl])

  // Step 3 — Drive silent lip animation from response text while streaming
  // speakText() animates the mouth visually to match the words — NO audio output
  const animateSpeaking = useCallback((text: string) => {
    if (!headRef.current || !loaded || !text) return
    if (text === lastTextRef.current) return
    lastTextRef.current = text

    try {
      // speakText with volume 0 = visual lip sync only, completely silent
      headRef.current.speakText(text, {
        volumeAudio: 0,      // Silent — no audio plays
        volumeBackground: 0,
        avatarMood: 'happy', // Friendly expression while speaking
      })
    } catch (err) {
      console.warn('[AriaTalkingHead] speakText error:', err)
    }
  }, [loaded])

  // Step 4 — When active and text is streaming, animate
  useEffect(() => {
    if (!loaded) return
    if (isActive && responseText) {
      animateSpeaking(responseText)
    } else if (!isActive) {
      // Back to idle — stop animation, reset mood
      lastTextRef.current = ''
      try {
        headRef.current?.stopSpeaking?.()
        headRef.current?.setMood?.('neutral')
      } catch { /* non-fatal */ }
    }
  }, [isActive, responseText, loaded, animateSpeaking])

  // Don't render if no avatar URL configured
  if (!avatarUrl) return null

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* TalkingHead renders the Three.js canvas into this div */}
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', background: 'transparent' }}
      />

      {/* Loading spinner */}
      {!loaded && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            border: '2px solid rgba(127,184,151,0.4)',
            borderTopColor: '#7FB897',
            animation: 'ariaSpin 0.8s linear infinite',
          }} />
          <span style={{ fontSize: 10, color: 'rgba(127,184,151,0.5)' }}>Aria</span>
        </div>
      )}

      {/* Subtle "active" glow at bottom when speaking */}
      {isActive && loaded && (
        <div style={{
          position: 'absolute', bottom: 0, left: '20%', right: '20%', height: 2,
          background: 'linear-gradient(to right, transparent, #7FB897, transparent)',
          borderRadius: 1, opacity: 0.6,
          animation: 'ariaPulseBar 1s ease-in-out infinite alternate',
        }} />
      )}

      <style>{`
        @keyframes ariaSpin { to { transform: rotate(360deg); } }
        @keyframes ariaPulseBar { from { opacity: 0.3; } to { opacity: 0.8; } }
      `}</style>
    </div>
  )
}
```

## STEP 4 — Wire into ask-aria/page.tsx (ADDITIVE ONLY)

### A — Add import at top
```typescript
import { AriaTalkingHead } from '@/components/aria/AriaTalkingHead'
```

### B — Add state (after existing state declarations)
```typescript
const [ariaResponseText, setAriaResponseText] = useState<string>('')
```

### C — Capture streaming text for avatar animation
In the existing `setMessages` call where the assistant message is updated during streaming,
find where the last message content is set and add:
```typescript
// After updating the streaming message content, feed it to the avatar
setAriaResponseText(data.response ?? '')
```

When the response finishes (streaming: false), reset:
```typescript
// In the finally block, after setSending(false):
setTimeout(() => setAriaResponseText(''), 500) // small delay so last frame plays
```

### D — Add avatar panel inside the main chat div
The main chat div already has `position: 'relative'` (added in previous commit).
Add this INSIDE that div, BEFORE the header:

```tsx
{/* Aria 3D avatar — silent visual animation while she responds */}
<div style={{
  position: 'absolute',
  bottom: 80,
  right: 16,
  width: 110,
  height: 160,
  zIndex: 20,
  pointerEvents: 'none',
  opacity: isAriaActive ? 1 : 0.4,
  transition: 'opacity 0.4s ease',
  // Radial mask — dissolves edges into dark background
  WebkitMaskImage: 'radial-gradient(ellipse 78% 82% at 50% 42%, black 22%, transparent 68%)',
  maskImage: 'radial-gradient(ellipse 78% 82% at 50% 42%, black 22%, transparent 68%)',
}}>
  <AriaTalkingHead
    isActive={isAriaActive}
    responseText={ariaResponseText}
  />
</div>
```

Where `isAriaActive` is the existing const:
```typescript
const isAriaActive = messages.some(m => m.streaming && m.content && m.content.length > 0)
```

### E — Remove old video avatar code
Remove completely (these are from previous commits):
- `videoRef` and `ariaVideoUrl` state
- The video `useEffect` (play/pause on isAriaActive)
- The video `<video>` element and its wrapper div
- The old sound bars JSX blocks
- The `ariaBar` keyframe style blocks

## STEP 5 — Build gate
```bash
npx tsc --noEmit   # must be zero errors
npm run build      # must pass
```

## STEP 6 — Single commit
All files in one push.
Message: "feat(avatar): 3D Aria TalkingHead avatar — silent visual lip-sync while text streams, idle breathing/blinking, VRoid GLB from Vercel Blob, no audio no TTS, replaces video loop"

## FILES CREATED/MODIFIED
Created:
- src/components/aria/AriaTalkingHead.tsx

Modified:
- src/app/dashboard/ask-aria/page.tsx (additive — import, state, wire avatar, remove old video)

## NO OTHER FILES TOUCHED
- No new API routes
- No vercel.json changes
- No new env vars beyond NEXT_PUBLIC_ARIA_AVATAR_URL
- No Google Cloud, no TTS, no audio

## WHAT THE OWNER SEES
- Aria's 3D character sits bottom-right of chat, 40% opacity when idle (blinking, breathing)
- Owner sends a message → brains think → text starts streaming
- The moment first word appears: Aria's mouth animates silently, expression becomes friendly
- Text finishes streaming: Aria returns to idle, mouth stops, expression neutral
- Completely silent — no sound ever plays
