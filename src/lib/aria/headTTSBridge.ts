/**
 * headTTSBridge.ts — TTS + Viseme bridge for the Aria 3D avatar
 *
 * Voice chain
 * ───────────
 * Primary (kokoro-js worker, static file in public/):
 *   WebGPU (Chrome/Edge 113+) → fp16 model, af_heart voice, ~165 MB first load
 *   WASM  (Safari, Firefox, no WebGPU) → q8 model, ~80 MB first load
 *   Model downloads from HuggingFace on first use then cached by browser forever.
 *   Audio plays via Web Audio API (AudioContext + BufferSource).
 *   Visemes: character-duration schedule (textToVisemes.ts) scaled to actual audio
 *   duration — gives accurate lip-sync timing without phoneme data.
 *
 * Fallback: window.speechSynthesis (robotic but universal).
 *   Used when kokoro worker is still loading or unavailable.
 *
 * ── Message contract (worker ↔ bridge) ──────────────────────────────────────
 * IN  { type: 'init' }
 * IN  { type: 'speak', text: string, voice: string, speed: number }
 * OUT { status: 'ready', device: 'webgpu'|'wasm' }
 * OUT { status: 'error', message: string }
 * OUT { type: 'audio', audio: Float32Array, sampleRate: number, durationMs: number, text: string }
 *     transfer: [audio.buffer]
 * OUT { type: 'error', stage: string, message: string, stack?: string }
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Public API is unchanged — AriaTalkingHead, AriaFloatingPanel, TalkToAria
 * consume initVoice / speakAriaText / stopAriaSpeech / getVoiceBackend exactly
 * as before.
 */

import { buildVisemes } from '@/components/aria/textToVisemes'

// Fcl_MTH_* (textToVisemes output) → VRoid morph names (AriaTalkingHead input)
const FCL_TO_MORPH: Record<string, string> = {
  'Fcl_MTH_A':     'aa',
  'Fcl_MTH_I':     'ih',
  'Fcl_MTH_U':     'ou',
  'Fcl_MTH_E':     'ee',
  'Fcl_MTH_O':     'oh',
  'Fcl_MTH_Close': '',
}

// ── Public types ───────────────────────────────────────────────────────────

export type VisemeEntry = {
  morph:  string   // '' | 'aa' | 'ih' | 'ou' | 'ee' | 'oh'
  start:  number   // seconds from audio start
  end:    number   // seconds from audio start
  value:  number   // blend weight (0..1)
}

export type SpeechBackend = 'kokoro-webgpu' | 'kokoro-wasm' | 'speechsynthesis' | 'none'

// ── Module singletons ──────────────────────────────────────────────────────

let _backend:      SpeechBackend = 'none'
let _worker:       Worker | null = null
let _workerReady:  boolean       = false
let _initPromise:  Promise<void> | null = null

// Web Audio
let _audioCtx:      AudioContext | null           = null
let _currentSource: AudioBufferSourceNode | null  = null

// Pending speak callback — one active utterance at a time
let _pendingCb:    ((schedule: VisemeEntry[] | null, startMs: number) => void) | null = null
let _pendingText:  string = ''

// Queued speak request that arrived before worker was ready
let _queuedCb:    ((schedule: VisemeEntry[] | null, startMs: number) => void) | null = null
let _queuedText:  string = ''

// 10-second watchdog: if the worker doesn't respond after posting speak, fall back
let _speakWatchdog: ReturnType<typeof setTimeout> | null = null

// ── Helpers ────────────────────────────────────────────────────────────────

export function cleanForSpeech(text: string): string {
  return text
    .replace(/\[(?:mood|gesture):\w+\]/g, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*_`>~|]/g, ' ')
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

/**
 * Build a VisemeEntry[] from character-duration visemes, scaled so the total
 * duration matches the actual audio length. This gives accurate lip-sync
 * timing without needing phoneme data from the TTS engine.
 */
function buildScaledVisemes(text: string, audioDurSecs: number): VisemeEntry[] {
  const raw = buildVisemes(text)
  if (!raw.length || audioDurSecs <= 0) return []
  const rawDur = raw[raw.length - 1].end || 1
  const scale  = audioDurSecs / rawDur
  return raw.map(v => ({
    morph:  FCL_TO_MORPH[v.morph as string] ?? '',
    start:  v.start * scale,
    end:    v.end   * scale,
    value:  v.value,
  }))
}

function getAudioCtx(): AudioContext {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new (
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitAudioContext
    )()
  }
  return _audioCtx
}

function clearSpeakWatchdog(): void {
  if (_speakWatchdog !== null) {
    clearTimeout(_speakWatchdog)
    _speakWatchdog = null
  }
}

/** Post speak message + arm 10 s watchdog. Always use this instead of posting directly. */
function postSpeakToWorker(
  text: string,
  cb: (schedule: VisemeEntry[] | null, startMs: number) => void,
): void {
  _pendingCb   = cb
  _pendingText = text
  clearSpeakWatchdog()
  _speakWatchdog = setTimeout(() => {
    _speakWatchdog = null
    const timedOutCb  = _pendingCb
    const timedOutTxt = _pendingText
    if (!timedOutCb) return
    _pendingCb   = null
    _pendingText = ''
    console.error('[AriaVoice] speak timeout — no worker response in 10 s; falling back to speechSynthesis')
    fallbackSpeechSynthesis(timedOutTxt, timedOutCb)
  }, 10_000)
  _worker!.postMessage({ type: 'speak', text, voice: 'af_heart', speed: 1.0 })
}

async function playKokoroAudio(
  audio:      Float32Array,
  sampleRate: number,
  durationMs: number,
  text:       string,
  onSchedule: (schedule: VisemeEntry[] | null, startMs: number) => void,
): Promise<void> {
  const ctx = getAudioCtx()
  console.log(`[AriaVoice] AudioContext state: ${ctx.state}`)
  if (ctx.state === 'suspended') {
    await ctx.resume()
  }

  // Stop any currently playing audio before starting the new one
  if (_currentSource) {
    try { _currentSource.stop() } catch { /* already stopped */ }
    _currentSource = null
  }

  const buffer = ctx.createBuffer(1, audio.length, sampleRate)
  // audio is transferred from the worker — always backed by a plain ArrayBuffer
  buffer.copyToChannel(audio as Float32Array<ArrayBuffer>, 0)

  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)
  _currentSource = source

  source.addEventListener('ended', () => {
    if (_currentSource === source) _currentSource = null
  })

  const startMs = Date.now()
  source.start()

  // Scale character-based visemes to actual audio duration for accurate lip-sync
  const schedule = buildScaledVisemes(text, durationMs / 1000)
  onSchedule(schedule.length > 0 ? schedule : null, startMs)
}

// ── Worker message handlers ────────────────────────────────────────────────

function handleAudioMsg(msg: Record<string, unknown>): void {
  clearSpeakWatchdog()
  const cb   = _pendingCb
  const txt  = _pendingText
  _pendingCb   = null
  _pendingText = ''

  const audioData = msg.audio as Float32Array
  const rate      = msg.sampleRate as number
  console.log(`[AriaVoice] worker audio: ${audioData?.length ?? 0} samples @ ${rate} Hz`)

  if (!cb) {
    // Race: approx-timer cleared _pendingCb before audio arrived — still play so user hears it
    console.warn('[AriaVoice] audio arrived but _pendingCb was cleared (timer race) — playing without viseme sync')
    if (audioData?.length && rate) {
      playKokoroAudio(audioData, rate, msg.durationMs as number, msg.text as string ?? '', () => {})
        .catch(err => console.error('[AriaVoice] playKokoroAudio (no-cb) error:', err))
    }
    return
  }

  playKokoroAudio(
    audioData,
    rate,
    msg.durationMs as number,
    txt,
    cb,
  ).catch(err => console.error('[AriaVoice] playKokoroAudio error:', err))
}

function handleSpeakError(msg: Record<string, unknown>): void {
  clearSpeakWatchdog()
  console.error('[AriaVoice] worker speak error stage=%s message=%s\n%s',
    msg.stage ?? '?', msg.message, msg.stack ?? '')
  const cb   = _pendingCb
  const txt  = _pendingText
  _pendingCb   = null
  _pendingText = ''
  if (cb) fallbackSpeechSynthesis(txt, cb)
}

// ── kokoro worker init ─────────────────────────────────────────────────────

async function tryInitKokoro(): Promise<boolean> {
  if (typeof window === 'undefined') return false

  return new Promise<boolean>((resolve) => {
    try {
      _worker = new Worker('/workers/kokoro-tts.worker.mjs?v=2', { type: 'module' })

      _worker.onmessage = (e: MessageEvent) => {
        const msg = e.data as Record<string, unknown>
        console.log('[AriaVoice] worker msg:', msg.type ?? msg.status)

        if (msg.status === 'ready') {
          _workerReady = true
          const device = msg.device as string
          _backend = device === 'webgpu' ? 'kokoro-webgpu' : 'kokoro-wasm'
          console.log(`[AriaVoice] kokoro-js ready (${device})`)
          // Flush any speak request that arrived before worker was ready
          if (_queuedCb && _queuedText) {
            const cb  = _queuedCb
            const txt = _queuedText
            _queuedCb   = null
            _queuedText = ''
            console.log('[AriaVoice] flushing queued speak:', txt.slice(0, 40))
            postSpeakToWorker(txt, cb)
          }
          return
        }

        if (msg.status === 'error') {
          console.error('[AriaVoice] kokoro init error:', msg.message)
          if (!_workerReady) {
            // Model failed to load — switch to speechSynthesis
            if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
              _backend = 'speechsynthesis'
              console.log('[AriaVoice] Fallback: window.speechSynthesis (kokoro init failed)')
            }
            // If a speak was queued, fire it via speechSynthesis now
            if (_queuedCb && _queuedText) {
              const cb  = _queuedCb
              const txt = _queuedText
              _queuedCb   = null
              _queuedText = ''
              fallbackSpeechSynthesis(txt, cb)
            }
          }
          return
        }

        if (msg.type === 'audio') { handleAudioMsg(msg); return }
        if (msg.type === 'error') { handleSpeakError(msg) }
      }

      _worker.onerror = (e: ErrorEvent) => {
        console.error('[AriaVoice] kokoro worker error:', e.message, '|', e.filename, 'L' + e.lineno)
      }

      _worker.postMessage({ type: 'init' })

      // Resolve immediately — worker is created; model download happens in background.
      // _workerReady flips to true once 'ready' arrives (may take minutes on first load).
      // speakAriaText() queues until _workerReady is true.
      resolve(true)

    } catch (err) {
      console.error('[AriaVoice] kokoro worker creation failed:', err)
      resolve(false)
    }
  })
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
 * Resolves quickly (after worker creation), not after model download.
 * Priority: kokoro-js (WebGPU → WASM) → speechSynthesis fallback.
 */
export function initVoice(): Promise<void> {
  if (_initPromise) return _initPromise
  _initPromise = (async () => {
    const ok = await tryInitKokoro()
    if (ok) return  // worker created; model downloads in background

    // Worker creation failed — use speechSynthesis immediately
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      _backend = 'speechsynthesis'
      console.log('[AriaVoice] Fallback: window.speechSynthesis')
    }
  })()
  return _initPromise
}

/**
 * Speak text and call onSchedule with a viseme timing schedule + audio start time.
 * Single ownership: ONLY the component that controls replyText/AriaTalkingHead
 * should call this — not the parent panel. Calling from two places per reply
 * causes double-audio.
 */
export function speakAriaText(
  text: string,
  onSchedule: (schedule: VisemeEntry[] | null, startMs: number) => void,
): void {
  const clean = cleanForSpeech(text)
  if (!clean) return

  const words = clean.split(' ')
  const speechText = words.length > 150
    ? words.slice(0, 150).join(' ') + '…'
    : clean

  // kokoro path: worker ready — post immediately
  if (_worker && _workerReady) {
    postSpeakToWorker(speechText, onSchedule)
    return
  }

  // kokoro path: worker created but model still loading — queue and wait
  if (_worker && !_workerReady) {
    console.log('[AriaVoice] queued until ready:', speechText.slice(0, 40))
    _queuedCb   = onSchedule
    _queuedText = speechText
    return
  }

  // Fallback: speechSynthesis (worker creation failed or unavailable)
  fallbackSpeechSynthesis(speechText, onSchedule)
}

/** Cancel any active speech (kokoro AudioContext source + speechSynthesis). */
export function stopAriaSpeech(): void {
  clearSpeakWatchdog()
  _pendingCb   = null
  _pendingText = ''
  _queuedCb    = null
  _queuedText  = ''

  if (_currentSource) {
    try { _currentSource.stop() } catch { /* already stopped */ }
    _currentSource = null
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}

/**
 * Call synchronously inside a user gesture handler (button onClick) to pre-warm
 * the AudioContext before the first async await. Browsers block ctx.resume() called
 * outside a gesture; calling it here ensures the context is unlocked in time.
 */
export function ensureAudioUnlocked(): void {
  if (typeof window === 'undefined') return
  try {
    const ctx = getAudioCtx()
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => { /* browser may still block — that's ok */ })
    }
  } catch { /* ignore */ }
}

export function getVoiceBackend(): SpeechBackend { return _backend }
