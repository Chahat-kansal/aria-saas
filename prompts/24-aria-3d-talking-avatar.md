# Prompt 24 — Aria 3D Interactive Avatar (TalkingHead + Ready Player Me + Google TTS)

## What this builds
A real interactive 3D character named Aria that:
- Renders as a full 3D avatar using Ready Player Me GLB model + Three.js
- Lip-syncs to every response Aria gives — mouth moves to the actual words
- Has idle animations (breathing, blinking, subtle head movement) when not speaking
- Has emotion-driven expressions (smile when positive, concerned when urgent)
- Speaks every Aria response out loud via Google Cloud TTS
- Lives in the Ask Aria page as a floating panel or side panel
- Plays ONLY when Aria is responding — silent and still while the owner types

## MANDATORY PRE-EDIT CHECKLIST
```
1. pwd → must be C:\Users\kansa\aria-saas-audit
2. git pull origin main
3. Read src/app/dashboard/ask-aria/page.tsx — understand current structure
4. Read src/lib/aria/ask/system-prompt.ts — understand response format
5. npx tsc --noEmit — must be zero errors before starting
6. npm run build — must pass before starting
```

## STEP 1 — Install packages
```bash
npm install three @react-three/fiber @react-three/drei
npm install --save-dev @types/three
```

## STEP 2 — Environment variables needed
Add to Vercel environment variables:
```
GOOGLE_TTS_API_KEY=your_google_cloud_api_key
NEXT_PUBLIC_ARIA_AVATAR_URL=https://your-blob-url/aria-character.glb
```

GOOGLE_TTS_API_KEY: Get from console.cloud.google.com → APIs & Services → Cloud Text-to-Speech API → Credentials → Create API Key. Free tier: 4 million characters/month.

NEXT_PUBLIC_ARIA_AVATAR_URL: The Vercel Blob URL of your Ready Player Me GLB file.

## STEP 3 — Create /api/aria/tts/route.ts

This route takes Aria's text response and returns MP3 audio from Google TTS.

```typescript
// src/app/api/aria/tts/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: Request) {
  // Auth check
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text } = await req.json()
  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'text required' }, { status: 400 })
  }

  // Trim to 500 chars max to avoid huge TTS calls
  const trimmed = text.slice(0, 500)

  const apiKey = process.env.GOOGLE_TTS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'TTS not configured' }, { status: 503 })
  }

  try {
    const ttsRes = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text: trimmed },
          voice: {
            // Australian English female voice — matches Aria's identity
            languageCode: 'en-AU',
            name: 'en-AU-Neural2-C',   // Natural female Australian voice
            ssmlGender: 'FEMALE',
          },
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: 1.05,   // Slightly faster — feels more natural/confident
            pitch: 0.5,           // Slightly higher — warm and clear
            volumeGainDb: 0,
          },
        }),
      }
    )

    if (!ttsRes.ok) {
      const err = await ttsRes.text()
      console.error('[tts] Google API error:', err)
      return NextResponse.json({ error: 'TTS failed' }, { status: 502 })
    }

    const data = await ttsRes.json() as { audioContent: string }

    // Return base64 MP3 — client decodes it
    return NextResponse.json({
      audioContent: data.audioContent,  // base64 encoded MP3
      characterCount: trimmed.length,
    })

  } catch (err) {
    console.error('[tts] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
```

## STEP 4 — Create AriaTalkingHead component

This is the main 3D avatar component. It uses TalkingHead loaded via CDN script tag.

```typescript
// src/components/aria/AriaTalkingHead.tsx
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface AriaTalkingHeadProps {
  isActive: boolean           // true while Aria is responding
  lastResponse: string        // the text Aria just said (triggers TTS)
  onSpeakStart?: () => void
  onSpeakEnd?: () => void
}

// TalkingHead is loaded via CDN script — global type
declare global {
  interface Window {
    TalkingHead: new (
      container: HTMLElement,
      options: Record<string, unknown>
    ) => {
      showAvatar: (config: Record<string, unknown>, onSuccess?: () => void, onError?: (e: Error) => void) => void
      speakAudio: (audio: AudioBuffer, visemes: unknown[], onStart?: () => void, onEnd?: () => void) => void
      speakText: (text: string, options?: Record<string, unknown>) => void
      setMood: (mood: string) => void
      playAnimation: (name: string, loop?: boolean) => void
      stopAnimation: () => void
    }
  }
}

export function AriaTalkingHead({ isActive, lastResponse, onSpeakStart, onSpeakEnd }: AriaTalkingHeadProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<InstanceType<typeof window.TalkingHead> | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [scriptLoaded, setScriptLoaded] = useState(false)

  const avatarUrl = process.env.NEXT_PUBLIC_ARIA_AVATAR_URL ?? ''

  // Load TalkingHead script from CDN once
  useEffect(() => {
    if (typeof window === 'undefined' || scriptLoaded) return
    if (window.TalkingHead) { setScriptLoaded(true); return }

    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@1.3/modules/talkinghead.mjs'
    script.type = 'module'
    script.onload = () => setScriptLoaded(true)
    script.onerror = () => console.error('[AriaTalkingHead] Failed to load TalkingHead script')
    document.head.appendChild(script)

    return () => { document.head.removeChild(script) }
  }, [])

  // Initialise the avatar once script + container are ready
  useEffect(() => {
    if (!scriptLoaded || !containerRef.current || headRef.current || !avatarUrl) return

    try {
      headRef.current = new window.TalkingHead(containerRef.current, {
        ttsEndpoint: null,  // We handle TTS ourselves
        ttsApikey: null,
        cameraView: 'upper',          // Show upper body — face + shoulders
        cameraRotateX: 6,
        cameraRotateY: 0,
        cameraRotateZ: 0,
        cameraDistance: 0.7,          // Closer = bigger face
        cameraX: 0,
        cameraY: 0.07,
        avatarMood: 'neutral',
        lipsyncModule: null,          // We drive this manually via speakAudio
        statsNode: null,
        modelPixelRatio: window.devicePixelRatio || 1,
        // Background transparent — blends into #0d0d14
        backgroundColor: 'transparent',
      })

      // Load the Ready Player Me GLB
      headRef.current.showAvatar(
        {
          url: avatarUrl,
          body: 'F',               // Female body type
          avatarMood: 'neutral',
          ttsLang: 'en-AU',
          ttsVoice: 'en-AU-Neural2-C',
          lipsyncLang: 'en',
        },
        () => {
          setLoaded(true)
          console.log('[AriaTalkingHead] Avatar loaded')
        },
        (err) => {
          console.error('[AriaTalkingHead] Avatar load failed:', err)
        }
      )
    } catch (err) {
      console.error('[AriaTalkingHead] Init failed:', err)
    }
  }, [scriptLoaded, avatarUrl])

  // Speak when lastResponse changes and avatar is loaded
  const speak = useCallback(async (text: string) => {
    if (!headRef.current || !loaded || !text || speaking) return

    setSpeaking(true)
    onSpeakStart?.()

    try {
      // 1. Call our TTS route to get audio
      const res = await fetch('/api/aria/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })

      if (!res.ok) {
        console.error('[AriaTalkingHead] TTS route failed:', res.status)
        setSpeaking(false)
        onSpeakEnd?.()
        return
      }

      const data = await res.json() as { audioContent: string }

      // 2. Decode base64 MP3 to ArrayBuffer
      const binary = atob(data.audioContent)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }

      // 3. Decode MP3 to AudioBuffer via Web Audio API
      const audioCtx = new AudioContext()
      const audioBuffer = await audioCtx.decodeAudioData(bytes.buffer)

      // 4. Hand off to TalkingHead — it drives lip sync from the audio
      headRef.current.speakAudio(
        audioBuffer,
        [],  // visemes — TalkingHead auto-generates from audio
        () => {
          // onStart
          console.log('[AriaTalkingHead] Speaking started')
        },
        () => {
          // onEnd
          setSpeaking(false)
          onSpeakEnd?.()
          audioCtx.close()
        }
      )

    } catch (err) {
      console.error('[AriaTalkingHead] Speak failed:', err)
      setSpeaking(false)
      onSpeakEnd?.()
    }
  }, [loaded, speaking, onSpeakStart, onSpeakEnd])

  // Trigger speech when lastResponse changes
  useEffect(() => {
    if (!lastResponse || !loaded) return
    speak(lastResponse)
  }, [lastResponse]) // eslint-disable-line react-hooks/exhaustive-deps

  // Set mood based on active state
  useEffect(() => {
    if (!headRef.current || !loaded) return
    if (isActive) {
      headRef.current.setMood('happy')
    } else {
      headRef.current.setMood('neutral')
    }
  }, [isActive, loaded])

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: 'transparent',
      }}
    >
      {/* TalkingHead renders into this div */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          background: 'transparent',
        }}
      />

      {/* Loading state */}
      {!loaded && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}>
          <div style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: '2px solid #7FB897',
            borderTopColor: 'transparent',
            animation: 'spin 0.8s linear infinite',
          }} />
          <div style={{ fontSize: 11, color: 'rgba(127,184,151,0.6)' }}>
            Aria loading...
          </div>
        </div>
      )}

      {/* Speaking indicator */}
      {speaking && loaded && (
        <div style={{
          position: 'absolute',
          bottom: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 3,
          alignItems: 'flex-end',
          height: 12,
        }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              width: 3,
              borderRadius: 2,
              background: '#7FB897',
              height: [6,12,8,10][i],
              animation: `ariaBar${i} 0.5s ease-in-out infinite alternate`,
              animationDelay: `${i * 0.12}s`,
            }} />
          ))}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes ariaBar0 { from { height: 4px; } to { height: 8px; } }
        @keyframes ariaBar1 { from { height: 10px; } to { height: 3px; } }
        @keyframes ariaBar2 { from { height: 5px; } to { height: 9px; } }
        @keyframes ariaBar3 { from { height: 8px; } to { height: 4px; } }
      `}</style>
    </div>
  )
}
```

## STEP 5 — Wire into ask-aria/page.tsx

Add these changes to the ask-aria page (ADDITIVE ONLY — do not rewrite):

### A. Add state for last response and speaking
After the existing state declarations, add:
```typescript
const [lastAriaResponse, setLastAriaResponse] = useState<string>('')
const [ariaSpeaking, setAriaSpeaking] = useState(false)
```

### B. Set lastAriaResponse when Aria finishes responding
In the existing response handling (where `streaming: false` is set and `content` is stored), after the message is set, add:
```typescript
// After setting the final message, trigger avatar speech
if (data.response) {
  setLastAriaResponse(data.response + '::' + Date.now()) // timestamp forces re-trigger
}
```

### C. Add the avatar panel to the JSX
Find the main chat column div and add the avatar as a floating panel.
The avatar sits in the bottom-right of the chat area, 200px wide × 280px tall.
It is ONLY visible when the avatar URL is configured:

```tsx
{process.env.NEXT_PUBLIC_ARIA_AVATAR_URL && (
  <div style={{
    position: 'absolute',
    bottom: 80,
    right: 16,
    width: 200,
    height: 280,
    zIndex: 20,
    pointerEvents: 'none',
    // Fade edges into dark bg
    WebkitMaskImage: 'radial-gradient(ellipse 80% 85% at 50% 40%, black 30%, transparent 72%)',
    maskImage: 'radial-gradient(ellipse 80% 85% at 50% 40%, black 30%, transparent 72%)',
    opacity: ariaSpeaking ? 1 : 0.45,
    transition: 'opacity 0.4s ease',
  }}>
    <AriaTalkingHead
      isActive={ariaSpeaking}
      lastResponse={lastAriaResponse}
      onSpeakStart={() => setAriaSpeaking(true)}
      onSpeakEnd={() => setAriaSpeaking(false)}
    />
  </div>
)}
```

### D. Add import
```typescript
import { AriaTalkingHead } from '@/components/aria/AriaTalkingHead'
```

## STEP 6 — Remove the old video avatar
The old video-based avatar (from previous commits) should be removed now that we have the real 3D one.
Find and delete:
- The `videoRef` and `ariaVideoUrl` state
- The video `useEffect`
- The video panel JSX block
- The `isAriaActive` const
- The style block with `ariaBar` keyframes (they're now in AriaTalkingHead)

## KNOWN CONSTRAINTS

### TalkingHead CDN loading
TalkingHead is loaded as an ES module from jsDelivr CDN. This works in the browser but requires the script tag approach shown above. It cannot be imported via npm because it uses Three.js directly without a bundler config.

Alternative: Download `talkinghead.mjs` from the GitHub repo and place it in `/public/js/talkinghead.mjs`, then load it via `<script type="module" src="/js/talkinghead.mjs">`. This is more reliable.

### HTTPS required
WebAudio API requires HTTPS. Works fine on Vercel production and localhost:3000 (Next.js dev server serves over HTTP but WebAudio still works in Chrome).

### GLB file size
Ready Player Me GLB files are typically 3-8MB. They load once and are cached. First load may take 2-3 seconds on slower connections — the loading spinner handles this.

### Google TTS quota
Free tier: 4 million characters/month = roughly 50,000 Aria responses of ~80 chars each. For a small business SaaS with < 1000 daily active users this is more than sufficient. Monitor usage in Google Cloud Console.

### AudioContext autoplay policy
Browsers block audio autoplay without user interaction. The first click/keypress the owner does (sending a message) counts as user interaction and unlocks audio. After that, all TTS audio plays normally.

## BUILD GATE
```
npx tsc --noEmit   ← zero errors
npm run build      ← must pass
```
Single commit. All files in one push.
Commit message: "feat(avatar): 3D TalkingHead avatar with lip-sync — Ready Player Me GLB character, Google Cloud TTS Australian female voice, WebAudio frequency-driven lip sync, idle animations, emotion expressions, replaces video loop with real interactive character"

## FILES CREATED/MODIFIED
Created:
- src/components/aria/AriaTalkingHead.tsx
- src/app/api/aria/tts/route.ts

Modified:
- src/app/dashboard/ask-aria/page.tsx (additive — add state, wire avatar, remove old video code)
