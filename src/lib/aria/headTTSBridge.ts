/**
 * headTTSBridge.ts — TTS + Viseme bridge for the Aria 3D avatar
 *
 * Voice chain
 * ───────────
 * WebGPU available (Chrome/Edge 113+)
 *   → HeadTTS + Kokoro af_heart voice (warm, natural-sounding AI TTS)
 *   → HeadTTS handles audio via Web Audio API internally
 *   → Provides Oculus phoneme-level viseme timing for accurate lip-sync
 *   → Visemes are anchored to HeadTTS audio start time (onend)
 *
 * No WebGPU (Firefox, Safari, older Chrome)
 *   → window.speechSynthesis fallback (robotic but functional)
 *   → Caller uses character-based visemes (textToVisemes.ts)
 *
 * HeadTTS static assets live in public/headtts/ (copied from npm package at build).
 * The worker is loaded via a Blob URL so webpack never tries to bundle it.
 */

// ── Oculus viseme IDs → VRoid blendshape morph names ──────────────────────
const OCULUS_TO_VROID: Record<string, string> = {
  sil: '',    // silence   — close
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
  morph:  string   // '' | 'aa' | 'ih' | 'ou' | 'ee' | 'oh'
  start:  number   // seconds from audio start
  end:    number   // seconds from audio start
  value:  number   // blend weight (0..1)
}

export type SpeechBackend = 'webgpu-headtts' | 'speechsynthesis' | 'none'

// ── Singletons ─────────────────────────────────────────────────────────────
let _backend:      SpeechBackend   = 'none'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _tts:          any             = null
let _headTTSReady: boolean         = false   // true only after clean connect()
let _initPromise:  Promise<void> | null = null
let _pendingVisemes: VisemeEntry[] = []

// ── Helpers ────────────────────────────────────────────────────────────────

function toVisemeEntry(oculusId: string, vtimeMs: number, vdurMs: number): VisemeEntry {
  const morph = OCULUS_TO_VROID[oculusId] ?? ''
  return {
    morph,
    value: morph ? 0.75 : 0,
    start: vtimeMs / 1000,
    end:   (vtimeMs + vdurMs) / 1000,
  }
}

function batchToEntries(data: Record<string, unknown>): VisemeEntry[] {
  const visemes = (data.visemes    as string[] | undefined) ?? []
  const vtimes  = (data.vtimes     as number[] | undefined) ?? []
  const vdurs   = (data.vdurations as number[] | undefined) ?? []
  return visemes.map((v, i) => toVisemeEntry(v, vtimes[i] ?? 0, vdurs[i] ?? 80))
}

export function cleanForSpeech(text: string): string {
  return text
    .replace(/\[(?:mood|gesture):\w+\]/g, '')     // strip [mood:X] [gesture:Y]
    .replace(/!\[.*?\]\(.*?\)/g, '')              // markdown images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')      // links → text
    .replace(/[#*_`>~|]/g, ' ')                   // markdown syntax
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

  // Force the GPU process to initialise before the worker spawned by HeadTTS
  // requests it — prevents a timing race on first load.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adapter = await (navigator as any).gpu.requestAdapter()
    if (!adapter) return false
  } catch {
    return false
  }

  try {
    const mod = await import(/* webpackIgnore: true */ '/headtts/modules/headtts.mjs' as string)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const HeadTTS = (mod as any).HeadTTS
    if (typeof HeadTTS !== 'function') throw new Error('HeadTTS class not found in module')

    for (let attempt = 1; attempt <= HEADTTS_MAX_ATTEMPTS; attempt++) {
      // Fresh instance per attempt — no stale worker state carries over
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tts: any = new HeadTTS({
        workerModule:  '/headtts/modules/worker-tts.mjs',
        dictionaryURL: '/headtts/dictionaries',
        languages:     ['en-us'],
        defaultVoice:  'af_heart',
        defaultSpeed:  1.0,
      })

      let hadConnectionError = false

      tts.onmessage = (msg: { type: string; data?: Record<string, unknown> }) => {
        if (msg.type === 'audio' && msg.data) {
          _pendingVisemes.push(...batchToEntries(msg.data))
        }
      }

      tts.onerror = (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('connection failed') || msg.includes('Failed to start')) {
          hadConnectionError = true
        } else {
          console.warn('[AriaVoice] HeadTTS error:', err)
        }
      }

      try {
        await tts.connect({ voice: 'af_heart', rate: 1.0 })
      } catch {
        hadConnectionError = true
      }

      if (hadConnectionError) {
        if (attempt < HEADTTS_MAX_ATTEMPTS) {
          await new Promise<void>(r => setTimeout(r, HEADTTS_RETRY_MS))
          continue
        }
        console.error('[AriaVoice] HeadTTS failed: connect failed after', HEADTTS_MAX_ATTEMPTS, 'attempts')
        return false
      }

      // Clean connect — set runtime error handler, mark ready
      tts.onerror = (err: unknown) => {
        console.error('[AriaVoice] HeadTTS failed:', err)
      }
      _tts = tts
      _headTTSReady = true
      _backend = 'webgpu-headtts'
      console.log('[AriaVoice] HeadTTS Kokoro af_heart ready')
      return true
    }

    return false
  } catch (e) {
    console.error('[AriaVoice] HeadTTS failed:', e)
    return false
  }
}

// ── speechSynthesis fallback ───────────────────────────────────────────────

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

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Detect the best voice backend. Idempotent — safe to call multiple times.
 * Priority: HeadTTS (Kokoro af_heart, WebGPU) → speechSynthesis fallback
 */
export function initVoice(): Promise<void> {
  if (_initPromise) return _initPromise
  _initPromise = (async () => {
    // 1. HeadTTS Kokoro af_heart (WebGPU — phoneme-level lip-sync, warm voice)
    const htOk = await tryInitHeadTTS()
    if (htOk) return

    // 2. Fallback: browser speechSynthesis
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      _backend = 'speechsynthesis'
      console.log('[AriaVoice] Fallback: window.speechSynthesis')
    }
  })()
  return _initPromise
}

/**
 * Speak text aloud and call `onSchedule` with viseme timing once ready.
 *
 * WebGPU path  — HeadTTS synthesises text; Kokoro af_heart audio plays
 *                via Web Audio API internally. On `onend`, viseme schedule
 *                is handed to the caller (anchored to HeadTTS audio start).
 *                Do NOT call speechSynthesis — HeadTTS handles audio.
 *
 * Fallback     — speechSynthesis starts immediately; onSchedule(null) is
 *                called so the caller falls back to character-based visemes.
 */
export function speakAriaText(
  text: string,
  onSchedule: (schedule: VisemeEntry[] | null, startMs: number) => void,
): void {
  const clean = cleanForSpeech(text)
  if (!clean) return

  // Cap at 150 words so speech isn't excessively long
  const words = clean.split(' ')
  const speechText = words.length > 150
    ? words.slice(0, 150).join(' ') + '…'
    : clean

  _pendingVisemes = []

  // ── HeadTTS + Kokoro af_heart (WebGPU) ───────────────────────────────────
  // _headTTSReady is only true after a confirmed clean connect() with voice config.
  if (_backend === 'webgpu-headtts' && _tts && _headTTSReady) {
    _tts.clear?.()
    _pendingVisemes = []

    _tts.onend = () => {
      // HeadTTS Kokoro af_heart audio is playing via Web Audio API.
      // Do NOT call window.speechSynthesis — that produces the robotic voice.
      // Visemes are anchored to onend time (= when HeadTTS starts audio playback).
      const schedule = _pendingVisemes.length > 0 ? [..._pendingVisemes] : null
      onSchedule(schedule, Date.now())
    }

    _tts.synthesize(speechText)
    return
  }

  // ── speechSynthesis fallback (no WebGPU) ─────────────────────────────────
  fallbackSpeechSynthesis(speechText, onSchedule)
}

/** Cancel any active speech (both HeadTTS and speechSynthesis). */
export function stopAriaSpeech(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
  if (_tts?.clear) _tts.clear()
  _pendingVisemes = []
}

export function getVoiceBackend(): SpeechBackend { return _backend }
