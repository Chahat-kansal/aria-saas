/**
 * headTTSBridge.ts — TTS + Viseme bridge for the Aria 3D avatar
 *
 * Strategy
 * ─────────
 * WebGPU available (Chrome/Edge 113+)
 *   → HeadTTS (github.com/met4citizen/HeadTTS) loaded from /public/headtts/
 *   → Provides Oculus phoneme-level viseme timing for accurate lip-sync
 *   → window.speechSynthesis handles audio (no AudioContext in our code)
 *
 * No WebGPU (Firefox, Safari, older Chrome)
 *   → window.speechSynthesis for audio
 *   → Caller uses character-based visemes (textToVisemes.ts fallback)
 *
 * HeadTTS static assets live in public/headtts/ (copied from npm package at build).
 * The worker is loaded via a Blob URL so webpack never tries to bundle it.
 */

// ── Oculus viseme IDs → VRoid blendshape morph names ──────────────────────
const OCULUS_TO_VROID: Record<string, string> = {
  sil: '',    // silence   — close (empty = no morph set)
  PP:  '',    // p/b       — bilabial close
  FF:  '',    // f/v       — labiodental close
  TH:  'ih',  // th        — tongue forward → ih
  DD:  '',    // d/t       — alveolar close
  kk:  '',    // k/g       — velar close
  CH:  'ih',  // ch        — palatal → ih
  SS:  'ih',  // s/z       — sibilant → ih
  nn:  '',    // n/m       — nasal close
  RR:  'ou',  // r         — rhotic → ou
  aa:  'aa',  // a         — open vowel → aa
  E:   'ee',  // e         — front mid → ee
  I:   'ih',  // i         — front high → ih
  O:   'oh',  // o         — back mid → oh
  U:   'ou',  // u         — back high → ou
}

export type VisemeEntry = {
  morph: string   // '' | 'aa' | 'ih' | 'ou' | 'ee' | 'oh'
  start: number   // seconds from speech start
  end:   number   // seconds from speech start
  value: number   // blend weight (0..1)
}

export type SpeechBackend = 'elevenlabs' | 'webgpu-headtts' | 'speechsynthesis' | 'none'

// ── Singletons ─────────────────────────────────────────────────────────────

let _backend: SpeechBackend = 'none'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _tts: any = null
let _audioEl: HTMLAudioElement | null = null  // current ElevenLabs audio element
let _initPromise: Promise<void> | null = null
let _pendingVisemes: VisemeEntry[] = []

// ── Helpers ────────────────────────────────────────────────────────────────

function toVisemeEntry(
  oculusId: string,
  vtimeMs: number,
  vdurMs: number,
): VisemeEntry {
  const morph = OCULUS_TO_VROID[oculusId] ?? ''
  return {
    morph,
    value: morph ? 0.75 : 0,
    start: vtimeMs / 1000,
    end:   (vtimeMs + vdurMs) / 1000,
  }
}

function batchToEntries(data: Record<string, unknown>): VisemeEntry[] {
  const visemes   = (data.visemes   as string[] | undefined) ?? []
  const vtimes    = (data.vtimes    as number[] | undefined) ?? []
  const vdurs     = (data.vdurations as number[] | undefined) ?? []
  return visemes.map((v, i) => toVisemeEntry(v, vtimes[i] ?? 0, vdurs[i] ?? 80))
}

function cleanForSpeech(text: string): string {
  return text
    .replace(/\[(?:mood|gesture):\w+\]/g, '')     // strip [mood:X] [gesture:Y] tags
    .replace(/!\[.*?\]\(.*?\)/g, '')              // remove markdown images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')      // unwrap links → text
    .replace(/[#*_`>~|]/g, ' ')                   // strip markdown syntax
    .replace(/\s+/g, ' ')
    .trim()
}

function preferredVoice(): SpeechSynthesisVoice | null {
  const voices = typeof window !== 'undefined' ? window.speechSynthesis?.getVoices() : []
  if (!voices.length) return null
  return (
    voices.find(v => v.lang.startsWith('en') && (
      v.name.includes('Samantha') || v.name.includes('Karen') ||
      v.name.includes('Google UK') || v.name.includes('Google US')
    )) ??
    voices.find(v => v.lang.startsWith('en')) ??
    null
  )
}

// ── HeadTTS WebGPU init ────────────────────────────────────────────────────

const HEADTTS_MAX_ATTEMPTS = 3
const HEADTTS_RETRY_MS     = 600

async function tryInitHeadTTS(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) return false

  // Guard: ensure the WebGPU adapter is actually available before attempting
  // to connect. On some browsers the GPU process starts asynchronously —
  // requesting the adapter here forces the browser to initialise it now so
  // the worker spawned by HeadTTS finds a working context.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adapter = await (navigator as any).gpu.requestAdapter()
    if (!adapter) return false
  } catch {
    return false
  }

  try {
    // Load HeadTTS from public/ via a webpack-ignored dynamic import.
    // Using /* webpackIgnore: true */ so the bundler doesn't attempt to
    // resolve the URL — it is served as a static asset from Next.js.
    const mod = await import(/* webpackIgnore: true */ '/headtts/modules/headtts.mjs' as string)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const HeadTTS = (mod as any).HeadTTS
    if (typeof HeadTTS !== 'function') throw new Error('HeadTTS class not found in module')

    for (let attempt = 1; attempt <= HEADTTS_MAX_ATTEMPTS; attempt++) {
      // ── Fresh instance per attempt so no stale worker state carries over ──
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tts: any = new HeadTTS({
        // workerModule → HeadTTS spawns the Web Worker from a Blob URL that
        // imports this path; blob:-origin workers are allowed by the CSP.
        workerModule:  '/headtts/modules/worker-tts.mjs',
        dictionaryURL: '/headtts/dictionaries',
        languages:     ['en-us'],
        defaultVoice:  'af_bella',
        defaultSpeed:  1.05,
      })

      // Track whether a connection-level error fired during this attempt.
      // connect() may resolve even after an internal worker failure if HeadTTS
      // retries internally — we need to detect this to avoid handing a broken
      // instance to synthesize().
      let hadConnectionError = false

      tts.onmessage = (msg: { type: string; data?: Record<string, unknown> }) => {
        if (msg.type === 'audio' && msg.data) {
          _pendingVisemes.push(...batchToEntries(msg.data))
        }
      }

      tts.onerror = (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('connection failed') || msg.includes('Failed to start')) {
          // Swallow during init — we'll retry below
          hadConnectionError = true
        } else {
          console.warn('[AriaVoice] HeadTTS error:', err)
        }
      }

      try {
        await tts.connect()
      } catch (connectErr) {
        // connect() threw — treat same as a connection error
        hadConnectionError = true
      }

      if (hadConnectionError) {
        if (attempt < HEADTTS_MAX_ATTEMPTS) {
          // Wait for the GPU process / worker to stabilise, then retry
          await new Promise<void>(r => setTimeout(r, HEADTTS_RETRY_MS))
          continue
        }
        // Exhausted retries
        console.warn('[AriaVoice] HeadTTS connect failed after', HEADTTS_MAX_ATTEMPTS, 'attempts — falling back to speechSynthesis')
        return false
      }

      // ── Clean connect: no connection errors fired ──────────────────────────
      // Restore normal runtime onerror and mark the instance as ready.
      tts.onerror = (err: unknown) => {
        console.warn('[AriaVoice] HeadTTS error:', err)
      }
      _tts = tts
      _backend = 'webgpu-headtts'
      console.log('[AriaVoice] HeadTTS WebGPU ready — phoneme-level lip-sync enabled')
      return true
    }

    return false
  } catch (e) {
    console.warn('[AriaVoice] HeadTTS init failed, falling back to speechSynthesis:', e)
    return false
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

// ── ElevenLabs availability check ─────────────────────────────────────────

async function tryInitElevenLabs(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  try {
    const res = await fetch('/api/aria/tts?check=1')
    if (res.ok) {
      _backend = 'elevenlabs'
      console.log('[AriaVoice] ElevenLabs ready — human-quality voice enabled')
      return true
    }
  } catch { /* network error or not configured */ }
  return false
}

// ── Shared speechSynthesis fallback (used when ElevenLabs/HeadTTS fail) ───

function fallbackSpeechSynthesis(
  speechText: string,
  onSchedule: (schedule: VisemeEntry[] | null, startMs: number) => void,
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utt = new SpeechSynthesisUtterance(speechText)
  utt.rate = 1.05
  const v = preferredVoice()
  if (v) utt.voice = v
  window.speechSynthesis.speak(utt)
  onSchedule(null, Date.now())
}

/**
 * Detect the best voice backend. Idempotent — safe to call multiple times.
 * Call once inside a useEffect (browser-only).
 * Priority: ElevenLabs → HeadTTS (WebGPU) → speechSynthesis
 */
export function initVoice(): Promise<void> {
  if (_initPromise) return _initPromise
  _initPromise = (async () => {
    // 1. Try ElevenLabs first (human-quality, server-proxied)
    const elOk = await tryInitElevenLabs()
    if (elOk) return

    // 2. Try HeadTTS WebGPU (phoneme-level lip-sync)
    const htOk = await tryInitHeadTTS()
    if (htOk) return

    // 3. Fallback: browser speechSynthesis
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      _backend = 'speechsynthesis'
      console.log('[AriaVoice] speechSynthesis fallback ready (no WebGPU/ElevenLabs)')
    }
  })()
  return _initPromise
}

/**
 * Speak text aloud and call `onSchedule` with viseme timing once ready.
 *
 * WebGPU path  — HeadTTS synthesises first (visemes collected), then
 *                speechSynthesis starts audio + onSchedule fires together
 *                so lip-sync and audio are in sync.
 *
 * Fallback     — speechSynthesis starts immediately; onSchedule(null) is
 *                called so the caller can use character-based visemes.
 *
 * @param text        Plain prose to speak (markdown stripped internally).
 * @param onSchedule  Receives (schedule | null, wallClockStartMs).
 */
export function speakAriaText(
  text: string,
  onSchedule: (schedule: VisemeEntry[] | null, startMs: number) => void,
): void {
  const clean = cleanForSpeech(text)
  if (!clean) return

  // Limit to ~150 words so speech isn't excessively long
  const words = clean.split(' ')
  const speechText = words.length > 150
    ? words.slice(0, 150).join(' ') + '…'
    : clean

  _pendingVisemes = []

  // ── ElevenLabs path (primary when key is configured) ────────────────────
  if (_backend === 'elevenlabs') {
    fetch('/api/aria/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: speechText }),
    }).then(async res => {
      if (!res.ok || res.headers.get('Content-Type')?.includes('application/json')) {
        // Proxy returned error or stub → graceful fallback
        fallbackSpeechSynthesis(speechText, onSchedule)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      _audioEl = audio
      audio.onended = () => { URL.revokeObjectURL(url); _audioEl = null }
      audio.play()
        .then(() => onSchedule(null, Date.now()))
        .catch(() => {
          URL.revokeObjectURL(url)
          fallbackSpeechSynthesis(speechText, onSchedule)
        })
    }).catch(() => {
      fallbackSpeechSynthesis(speechText, onSchedule)
    })
    return
  }

  // ── WebGPU + HeadTTS path ────────────────────────────────────────────────
  if (_backend === 'webgpu-headtts' && _tts) {
    _tts.clear?.()

    _tts.onend = () => {
      // Both speech and lip-sync start together so they stay in sync
      const schedule = _pendingVisemes.length > 0 ? [..._pendingVisemes] : null

      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
        const utt = new SpeechSynthesisUtterance(speechText)
        utt.rate = 1.05
        const v = preferredVoice()
        if (v) utt.voice = v
        window.speechSynthesis.speak(utt)
      }

      onSchedule(schedule, Date.now())
    }

    _tts.synthesize(speechText)
    return
  }

  // ── speechSynthesis fallback ─────────────────────────────────────────────
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(speechText)
    utt.rate = 1.05
    const v = preferredVoice()
    if (v) utt.voice = v

    const startMs = Date.now()
    window.speechSynthesis.speak(utt)
    // Return null schedule → caller uses its own character-based viseme system
    onSchedule(null, startMs)
  }
}

/** Cancel any active speech. */
export function stopAriaSpeech(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
  if (_tts?.clear) _tts.clear()
  if (_audioEl) { _audioEl.pause(); _audioEl.src = ''; _audioEl = null }
  _pendingVisemes = []
}

export function getVoiceBackend(): SpeechBackend { return _backend }
