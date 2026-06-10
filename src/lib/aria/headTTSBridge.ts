/**
 * headTTSBridge.ts — TTS + Viseme bridge for the Aria 3D avatar
 *
 * Voice chain
 * ───────────
 * Primary (kokoro-js WASM worker, static file in public/):
 *   device=wasm, dtype=q8, ~80 MB first load, af_heart voice.
 *   WebGPU available as escape hatch via ?voicegpu=1 in Worker URL (not default —
 *   WebGPU fp16/q8 causes GPU contention with Three.js and slow first inference).
 *   Model downloads from HuggingFace on first use then cached by browser forever.
 *   Audio plays via Web Audio API (AudioContext + BufferSource).
 *   Streaming: TextSplitterStream + tts.stream() → sentence-level chunks → gapless
 *   AudioContext scheduling → first-chunk latency ~1-2s after WASM warmup.
 *   Visemes: character-duration schedule (textToVisemes.ts) scaled to actual audio
 *   duration — gives accurate lip-sync timing without phoneme data.
 *
 * Fallback: window.speechSynthesis (robotic but universal).
 *   Used on watchdog timeout or if worker creation fails.
 *
 * ── Message contract (worker ↔ bridge) ──────────────────────────────────────
 * IN  { type: 'init' }
 * IN  { type: 'speak', text: string, id: number }
 * OUT { status: 'ready', device: 'wasm'|'webgpu' }
 * OUT { status: 'error', message: string }
 * OUT { type: 'audio', audio: Float32Array, sampleRate, durationMs, text, id }
 *     transfer: [audio.buffer]   ← non-streaming fallback path
 * OUT { type: 'audio-chunk', id, seq, audio, sampleRate, durationMs, text, isLast: false }
 *     transfer: [audio.buffer]   ← streaming path, one chunk per sentence
 * OUT { type: 'audio-chunk', id, seq, audio: Float32Array(0), sampleRate, text: '', isLast: true }
 *     end-of-stream sentinel
 * OUT { type: 'error', stage: string, message: string, stack?: string, id?: number }
 * OUT { type: 'cancelled', id: number }
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Public API consumed by AriaTalkingHead, AriaFloatingPanel, TalkToAria:
 *   initVoice / speakAriaText / stopAriaSpeech / getVoiceBackend
 *   onSpeakStart / onSpeakEnd / ensureAudioUnlocked / cleanForSpeech
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
let _audioCtx:        AudioContext | null           = null
let _currentSource:   AudioBufferSourceNode | null  = null  // non-streaming path
let _scheduledSources: AudioBufferSourceNode[]      = []    // streaming path (all active chunks)

// Gapless streaming state (reset on each new utterance)
let _nextStartTime:    number        = 0   // AudioContext scheduled time for next chunk
let _firstChunkStartMs: number       = 0   // Date.now() when first chunk of utterance started
let _accVisemes:       VisemeEntry[] = []  // accumulated viseme schedule across chunks

// Utterance IDs — every speakAriaText() call gets a unique, monotonically
// increasing id. Any audio/error that arrives with id < _currentUtteranceId
// is stale and discarded without playing.
let _currentUtteranceId = 0
let _utteranceCount     = 0   // controls watchdog duration (first vs subsequent)

// Pending speak callback — kept alive until last streaming chunk
let _pendingCb:    ((schedule: VisemeEntry[] | null, startMs: number) => void) | null = null
let _pendingText:  string = ''

// Queued speak request that arrived before worker was ready
let _queuedCb:    ((schedule: VisemeEntry[] | null, startMs: number) => void) | null = null
let _queuedText:  string = ''

// Watchdog: fires speechSynthesis fallback if worker doesn't respond
let _speakWatchdog: ReturnType<typeof setTimeout> | null = null

// ── Filler clip cache (latency masking — Part 4) ──────────────────────────
type FillerClip = { audio: Float32Array; sampleRate: number; durationMs: number; text: string }
let _fillerCache:         FillerClip[]                = []
let _fillerPlaying:       boolean                     = false
let _fillerSource:        AudioBufferSourceNode | null = null
let _fillerPendingReal:   {                           // real audio buffered while filler plays
  audio: Float32Array; sampleRate: number; durationMs: number
  text: string; cb: (s: VisemeEntry[] | null, ms: number) => void
} | null = null

// Streaming end-of-stream flag: set when isLast sentinel arrives while sources still play.
// The last source.ended checks this to fire onSpeakEnd at the right moment.
let _streamEnded: boolean = false

// ── Listener registry (replaces the old 4-var + fire-helper pattern) ──────
// Multiple independent callers (panels, avatar) subscribe without clobbering.
const _speakStartListeners = new Set<() => void>()
const _speakEndListeners   = new Set<() => void>()

/**
 * Subscribe to speech-start events. Returns an unsubscribe function.
 * Panels use this to transition to 'speaking' phase; avatar uses it for
 * mixer crossfades.  Throws immediately if cb === fireSpeakStart/fireSpeakEnd
 * to prevent the recursive-registration bug.
 */
export function onSpeakStart(cb: () => void): () => void {
  _speakStartListeners.add(cb)
  return () => _speakStartListeners.delete(cb)
}

/**
 * Subscribe to speech-end events. Returns an unsubscribe function.
 */
export function onSpeakEnd(cb: () => void): () => void {
  _speakEndListeners.add(cb)
  return () => _speakEndListeners.delete(cb)
}

// Internal fire helpers — called by the audio paths, never registered as listeners.
function fireSpeakStart(): void {
  for (const cb of [..._speakStartListeners]) {
    try { cb() } catch (e) { console.error('[AriaVoice] speakStart listener error', e) }
  }
}
function fireSpeakEnd(): void {
  for (const cb of [..._speakEndListeners]) {
    try { cb() } catch (e) { console.error('[AriaVoice] speakEnd listener error', e) }
  }
}

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

function stopAllSources(): void {
  _scheduledSources.forEach(s => { try { s.stop() } catch { /* already stopped */ } })
  _scheduledSources = []
  if (_currentSource) {
    try { _currentSource.stop() } catch { /* already stopped */ }
    _currentSource = null
  }
  // Stop filler if playing (explicit stop = panel close or new user message)
  if (_fillerSource) {
    try { _fillerSource.stop() } catch { /* already stopped */ }
    _fillerSource = null
  }
  _fillerPlaying     = false
  _fillerPendingReal = null
}

// ── Filler playback (latency masking) ─────────────────────────────────────

async function playFillerAudio(
  filler: FillerClip,
  onSchedule: (schedule: VisemeEntry[] | null, startMs: number) => void,
): Promise<void> {
  const ctx = getAudioCtx()
  if (ctx.state === 'suspended') await ctx.resume()

  const buffer = ctx.createBuffer(1, filler.audio.length, filler.sampleRate)
  buffer.copyToChannel(filler.audio as Float32Array<ArrayBuffer>, 0)
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)
  _fillerSource  = source
  _fillerPlaying = true

  source.addEventListener('ended', () => {
    if (_fillerSource !== source) return
    _fillerSource  = null
    _fillerPlaying = false
    if (_fillerPendingReal) {
      const real = _fillerPendingReal
      _fillerPendingReal = null
      playKokoroAudio(real.audio, real.sampleRate, real.durationMs, real.text, real.cb)
        .catch(err => console.error('[AriaVoice] post-filler playback error:', err))
    }
    // Don't fire onSpeakEnd — real audio is coming; it will fire onSpeakEnd
  })

  const startMs = Date.now()
  source.start()
  // Fire start callbacks so mixer crossfades to TALK immediately
  fireSpeakStart()

  const schedule = buildScaledVisemes(filler.text, filler.durationMs / 1000)
  onSchedule(schedule.length > 0 ? schedule : null, startMs)
  console.log(`[AriaVoice] filler playing: "${filler.text}" (${Math.round(filler.durationMs)}ms)`)
}

/** Play real TTS audio; if a filler is still playing, queue it for after. */
async function playRealAudio(
  audio: Float32Array,
  sampleRate: number,
  durationMs: number,
  text: string,
  cb: (schedule: VisemeEntry[] | null, startMs: number) => void,
): Promise<void> {
  if (_fillerPlaying) {
    // Filler still playing — buffer real audio and play once filler ends
    _fillerPendingReal = { audio, sampleRate, durationMs, text, cb }
    console.log('[AriaVoice] real audio queued behind filler')
    return
  }
  await playKokoroAudio(audio, sampleRate, durationMs, text, cb)
}

/**
 * Post a speak message + arm watchdog. Resets streaming state for the new utterance.
 */
function postSpeakToWorker(
  text: string,
  cb: (schedule: VisemeEntry[] | null, startMs: number) => void,
): void {
  const id = ++_currentUtteranceId
  console.log(`[AriaVoice] bump → ${id} (new-speak)`)
  _pendingCb   = cb
  _pendingText = text
  // Reset streaming state for this utterance
  _nextStartTime     = 0
  _firstChunkStartMs = 0
  _accVisemes        = []
  _streamEnded       = false
  clearSpeakWatchdog()

  const watchdogMs = _utteranceCount === 0 ? 20_000 : 10_000
  _utteranceCount++

  _speakWatchdog = setTimeout(() => {
    _speakWatchdog = null
    if (_currentUtteranceId === id) {
      _currentUtteranceId++
      console.log(`[AriaVoice] bump → ${_currentUtteranceId} (watchdog)`)
    }
    const timedOutCb  = _pendingCb
    const timedOutTxt = _pendingText
    if (!timedOutCb) return
    _pendingCb   = null
    _pendingText = ''
    console.error(`[AriaVoice] speak timeout utterance=${id} (${watchdogMs / 1000}s) — falling back`)
    fallbackSpeechSynthesis(timedOutTxt, timedOutCb)
  }, watchdogMs)

  _worker!.postMessage({ type: 'speak', text, id })
}

// ── Non-streaming audio playback (generate() fallback path) ───────────────

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

  // Stop any still-playing audio (streaming or non-streaming)
  stopAllSources()

  const buffer = ctx.createBuffer(1, audio.length, sampleRate)
  buffer.copyToChannel(audio as Float32Array<ArrayBuffer>, 0)

  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)
  _currentSource = source

  source.addEventListener('ended', () => {
    if (_currentSource === source) _currentSource = null
    fireSpeakEnd()
  })

  const startMs = Date.now()
  source.start()
  fireSpeakStart()

  const schedule = buildScaledVisemes(text, durationMs / 1000)
  onSchedule(schedule.length > 0 ? schedule : null, startMs)
}

// ── Streaming audio chunk handler ─────────────────────────────────────────

function handleAudioChunkMsg(msg: Record<string, unknown>): void {
  const msgId    = msg.id     as number
  const seq      = msg.seq    as number
  const isLast   = msg.isLast as boolean
  const audioData = msg.audio  as Float32Array
  const rate      = msg.sampleRate as number

  if (msgId !== _currentUtteranceId) {
    console.log(`[AriaVoice] discarding stale chunk seq=${seq} (utterance ${msgId}, current ${_currentUtteranceId})`)
    return
  }

  // Disable watchdog when first chunk arrives — subsequent chunks prove the stream is live
  if (seq === 0) {
    clearSpeakWatchdog()
    console.log(`[AriaVoice] first chunk utterance=${msgId}, watchdog cleared`)
  }

  // Empty sentinel — end of stream, no audio to schedule
  if (!audioData?.length) {
    if (isLast) {
      _streamEnded = true
      if (_scheduledSources.length === 0) {
        // All sources already ended before sentinel arrived — fire immediately
        _pendingCb   = null
        _pendingText = ''
        _streamEnded = false
        fireSpeakEnd()
        console.log(`[AriaVoice] speech ended utterance=${msgId} (sentinel, no pending sources)`)
      }
      // Otherwise: last source.ended will check _streamEnded and fire onSpeakEnd
    }
    return
  }

  const ctx = getAudioCtx()
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }

  const chunkDuration  = audioData.length / rate
  // 5 ms scheduling buffer to avoid AudioContext underruns
  const chunkCtxStart  = Math.max(ctx.currentTime + 0.005, _nextStartTime)
  _nextStartTime       = chunkCtxStart + chunkDuration

  const buffer = ctx.createBuffer(1, audioData.length, rate)
  buffer.copyToChannel(audioData as Float32Array<ArrayBuffer>, 0)
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)
  source.start(chunkCtxStart)
  _scheduledSources.push(source)

  // Wall-clock time when this chunk will start playing
  const chunkStartMs = Date.now() + Math.max(0, (chunkCtxStart - ctx.currentTime)) * 1000

  console.log(`[AriaVoice] chunk seq=${seq} id=${msgId} scheduled at ctx=${chunkCtxStart.toFixed(3)}s (${audioData.length}samp@${rate}Hz offset=${((chunkStartMs - (_firstChunkStartMs || chunkStartMs)) / 1000).toFixed(2)}s)`)

  if (seq === 0) {
    _firstChunkStartMs = chunkStartMs
    _accVisemes        = []
    fireSpeakStart()
    console.log(`[AriaVoice] speech started utterance=${msgId} seq=0 startMs=${Math.round(chunkStartMs)}`)
  }

  // Build visemes for this chunk offset into the global utterance timeline
  const chunkText   = msg.text as string
  const chunkVisemes = buildScaledVisemes(chunkText, chunkDuration)
  const offsetSecs  = _firstChunkStartMs > 0
    ? (chunkStartMs - _firstChunkStartMs) / 1000
    : 0
  const offsetVisemes = chunkVisemes.map(v => ({
    morph: v.morph, start: v.start + offsetSecs, end: v.end + offsetSecs, value: v.value,
  }))
  _accVisemes.push(...offsetVisemes)

  // Fire callback with the accumulated schedule so far
  if (_pendingCb) {
    _pendingCb(_accVisemes.length > 0 ? _accVisemes : null, _firstChunkStartMs)
  }

  source.addEventListener('ended', () => {
    _scheduledSources = _scheduledSources.filter(s => s !== source)
    if (isLast) {
      // isLast=true on a real audio chunk (future: if worker marks it directly)
      _pendingCb   = null
      _pendingText = ''
      _streamEnded = false
      fireSpeakEnd()
      console.log(`[AriaVoice] speech ended utterance=${msgId} (last chunk ended)`)
    } else if (_streamEnded && _scheduledSources.length === 0) {
      // Sentinel already received and this was the last playing source
      _pendingCb   = null
      _pendingText = ''
      _streamEnded = false
      fireSpeakEnd()
      console.log(`[AriaVoice] speech ended utterance=${msgId} (last source ended after sentinel)`)
    }
  })
}

// ── Worker message handlers ────────────────────────────────────────────────

function handleAudioMsg(msg: Record<string, unknown>): void {
  const msgId = msg.id as number
  clearSpeakWatchdog()

  if (msgId !== _currentUtteranceId) {
    console.log(`[AriaVoice] discarding stale audio (utterance ${msgId}, current ${_currentUtteranceId})`)
    return
  }

  const cb   = _pendingCb
  const txt  = _pendingText
  _pendingCb   = null
  _pendingText = ''

  const audioData = msg.audio    as Float32Array
  const rate      = msg.sampleRate as number
  console.log(`[AriaVoice] worker audio utterance=${msgId}: ${audioData?.length ?? 0} samples @ ${rate} Hz`)

  if (!cb) {
    console.warn(`[AriaVoice] utterance ${msgId} audio arrived with no callback`)
    return
  }

  playRealAudio(audioData, rate, msg.durationMs as number, txt, cb)
    .catch(err => console.error('[AriaVoice] playRealAudio error:', err))
}

function handleSpeakError(msg: Record<string, unknown>): void {
  const msgId = msg.id as number | undefined
  clearSpeakWatchdog()

  if (msgId !== undefined && msgId !== _currentUtteranceId) {
    console.warn(`[AriaVoice] stale speak error utterance=${msgId} (current ${_currentUtteranceId}) — discarding`)
    return
  }

  console.error('[AriaVoice] worker speak error stage=%s utterance=%s\n%s: %s',
    msg.stage ?? '?', msgId ?? '?', msg.message, msg.stack ?? '')
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
      _worker = new Worker('/workers/kokoro-tts.worker.mjs?v=6', { type: 'module' })

      _worker.onmessage = (e: MessageEvent) => {
        const msg = e.data as Record<string, unknown>
        console.log('[AriaVoice] worker msg:', msg.type ?? msg.status)

        if (msg.status === 'ready') {
          _workerReady = true
          const device = msg.device as string
          _backend = device === 'webgpu' ? 'kokoro-webgpu' : 'kokoro-wasm'
          console.log(`[AriaVoice] kokoro-js ready (${device})`)

          // Pre-generate filler clips in the background (Part 4 latency masking)
          _worker!.postMessage({ type: 'pregen', texts: [
            'Hmm, let me check that for you.',
            'One moment.',
            'Good question — let me look.',
            'Let me pull that up.',
            'Just a sec.',
            'Looking into it now.',
          ]})

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
            if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
              _backend = 'speechsynthesis'
              console.log('[AriaVoice] fallback: window.speechSynthesis (kokoro init failed)')
            }
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

        if (msg.type === 'audio')       { handleAudioMsg(msg);       return }
        if (msg.type === 'audio-chunk') { handleAudioChunkMsg(msg);  return }
        if (msg.type === 'error')       { handleSpeakError(msg);     return }
        if (msg.type === 'cancelled') {
          console.log(`[AriaVoice] worker cancelled utterance ${msg.id}`)
          return
        }
        if (msg.type === 'pregen-ready') {
          const clips = msg.clips as Array<{ audio: Float32Array; sampleRate: number; durationMs: number; text: string }>
          _fillerCache = clips ?? []
          console.log(`[AriaVoice] ${_fillerCache.length} filler clips cached`)
          return
        }
      }

      _worker.onerror = (e: ErrorEvent) => {
        console.error('[AriaVoice] kokoro worker error:', e.message, '|', e.filename, 'L' + e.lineno)
      }

      _worker.postMessage({ type: 'init' })
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
  utt.onstart = () => {
    fireSpeakStart()
    const startMs = Date.now()
    // Estimate duration at 1.05 rate (~0.38 s/word) and build a scaled viseme schedule
    const estimatedDurSecs = Math.max(1, speechText.split(' ').length * 0.38)
    const schedule = buildScaledVisemes(speechText, estimatedDurSecs)
    onSchedule(schedule.length > 0 ? schedule : null, startMs)
  }
  utt.onend = () => { fireSpeakEnd() }
  window.speechSynthesis.speak(utt)
}

// ── Public API ─────────────────────────────────────────────────────────────

// onSpeakStart / onSpeakEnd are exported above (Set-based subscriber pattern).

/**
 * Detect the best voice backend. Idempotent — safe to call multiple times.
 * Resolves quickly (after worker creation), not after model download.
 */
export function initVoice(): Promise<void> {
  if (_initPromise) return _initPromise
  _initPromise = (async () => {
    const ok = await tryInitKokoro()
    if (ok) return
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      _backend = 'speechsynthesis'
      console.log('[AriaVoice] fallback: window.speechSynthesis')
    }
  })()
  return _initPromise
}

/**
 * Speak text and call onSchedule with viseme schedule + audio start time.
 * The callback may fire multiple times (once per streaming chunk) as the
 * accumulated viseme schedule grows. Single ownership — ONLY AriaTalkingHead
 * should call this.
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

  if (_worker && _workerReady) {
    // Part 4 — play a filler immediately to mask WASM generation latency (~9-15 s).
    // One filler per question; exempt from utterance cancellation (only stop/panel-close kills it).
    if (!_fillerPlaying && _fillerCache.length > 0) {
      const filler = _fillerCache[Math.floor(Math.random() * _fillerCache.length)]
      playFillerAudio(filler, onSchedule).catch(err =>
        console.error('[AriaVoice] filler playback error:', err))
    }
    postSpeakToWorker(speechText, onSchedule)
    return
  }

  if (_worker && !_workerReady) {
    console.log('[AriaVoice] queued until ready:', speechText.slice(0, 40))
    _queuedCb   = onSchedule
    _queuedText = speechText
    return
  }

  fallbackSpeechSynthesis(speechText, onSchedule)
}

/**
 * Cancel any active speech. Only bumps the utterance ID when something is
 * actually pending or playing — avoids spurious bumps that cause self-cancellation.
 */
export function stopAriaSpeech(): void {
  const hasPending =
    _pendingCb !== null ||
    _queuedCb  !== null ||
    _currentSource !== null ||
    _scheduledSources.length > 0 ||
    _fillerPlaying

  clearSpeakWatchdog()

  if (hasPending) {
    _currentUtteranceId++
    console.log(`[AriaVoice] bump → ${_currentUtteranceId} (stop-explicit, hasPending=${hasPending})`)
  }

  _pendingCb   = null
  _pendingText = ''
  _queuedCb    = null
  _queuedText  = ''
  _nextStartTime     = 0
  _accVisemes        = []
  _firstChunkStartMs = 0
  _streamEnded       = false

  stopAllSources()

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}

/**
 * Call synchronously in a user gesture handler to pre-warm AudioContext
 * before any async await (browser autoplay policy).
 */
export function ensureAudioUnlocked(): void {
  if (typeof window === 'undefined') return
  try {
    const ctx = getAudioCtx()
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => { /* browser may still block */ })
    }
  } catch { /* ignore */ }
}

export function getVoiceBackend(): SpeechBackend { return _backend }
