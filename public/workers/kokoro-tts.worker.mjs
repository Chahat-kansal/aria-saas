// public/workers/kokoro-tts.worker.mjs
// Module Web Worker — static file served from public/. NOT webpack-bundled.
// kokoro-js loads dynamically from esm.sh (already in script-src CSP).
// ONNX WASM redirected to cdn.jsdelivr.net (already in connect-src CSP).
//
// ── Message contract ──────────────────────────────────────────────────────
// IN  { type: 'init' }
// IN  { type: 'speak', text: string, id: number }
// OUT { status: 'ready', device: 'wasm'|'webgpu' }
// OUT { status: 'error', message: string }
// OUT { type: 'audio', audio: Float32Array, sampleRate, durationMs, text, id }
//     transfer: [audio.buffer]   ← generate() fallback path
// OUT { type: 'audio-chunk', id, seq, audio: Float32Array, sampleRate, durationMs, text, isLast: false }
//     transfer: [audio.buffer]   ← streaming path, one per sentence
// OUT { type: 'audio-chunk', id, seq, audio: null, sampleRate: 0, text: '', isLast: true }
//     end-of-stream sentinel (no transfer)
// OUT { type: 'error', stage, message, stack?, id? }
// OUT { type: 'cancelled', id }  — utterance superseded before audio posted
//
// ── Streaming usage note ──────────────────────────────────────────────────
// CRITICAL: consumer must be created BEFORE splitter.push/close.
// tts.stream() returns a readable that yields { text, audio } where
// audio is RawAudio { audio: Float32Array, sampling_rate: number }.
// Without close() the splitter never flushes and the stream hangs forever.
// ─────────────────────────────────────────────────────────────────────────

let tts = null
let TextSplitterStream = null  // populated in init() if kokoro-js supports streaming
let currentSpeakId = 0     // id of the most recently received speak message
let generating     = false  // true while speak() is in progress
let pendingSpeakMsg = null  // { id, text } — latest speak that arrived before/during generation

async function init() {
  try {
    const forceGPU = new URLSearchParams(self.location.search).get('voicegpu') === '1'
    const hasGPU   = forceGPU && typeof navigator !== 'undefined' && 'gpu' in navigator
    const device   = hasGPU ? 'webgpu' : 'wasm'
    const dtype    = device === 'webgpu' ? 'fp16' : 'q8'

    console.log(`[KokoroWorker] init device=${device} dtype=${dtype}`)
    const mod = await import('https://esm.sh/kokoro-js@1.2.1')
    const { KokoroTTS, env } = mod
    TextSplitterStream = mod.TextSplitterStream ?? null

    if (env?.backends?.onnx?.wasm) {
      env.backends.onnx.wasm.wasmPaths =
        'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/'
    }

    tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype, device })

    const streamNote = TextSplitterStream && typeof tts.stream === 'function'
      ? ' (streaming available)'
      : ' (generate-only: TextSplitterStream not exported)'
    console.log('[KokoroWorker] ready' + streamNote)
    postMessage({ status: 'ready', device })

    if (pendingSpeakMsg) {
      const { id, text } = pendingSpeakMsg
      pendingSpeakMsg = null
      runSpeak(id, text).catch(err =>
        postMessage({ type: 'error', stage: 'runSpeak-init', message: String(err), id }))
    }
  } catch (err) {
    console.error('[KokoroWorker] init error:', err)
    postMessage({ status: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}

// ── Streaming path ────────────────────────────────────────────────────────
// Returns 'done' | 'cancelled' | 'stall' | 'error:<msg>'
async function speakStreaming(id, safe) {
  // stallFired: set when the 12s stall timer fires, suppresses late stream chunks
  let stallFired = false

  const streamAttempt = (async () => {
    try {
      const splitter = new TextSplitterStream()
      const stream   = tts.stream(splitter, { voice: 'af_heart', speed: 1.0 })

      // Consumer MUST be created before push/close — otherwise the readable has
      // no consumer when items are pushed and the stream deadlocks forever.
      const consumer = (async () => {
        let seq = 0
        for await (const { text: chunkText, audio } of stream) {
          if (stallFired || id !== currentSpeakId) {
            if (!stallFired) {
              console.log(`[KokoroWorker] utterance ${id} superseded during stream — cancelling`)
              postMessage({ type: 'cancelled', id })
            }
            return 'cancelled'
          }
          // stream yields { text, phonemes, audio: RawAudio } — RawAudio is
          // { audio: Float32Array, sampling_rate }, one level deeper than generate()
          const raw = audio
          const audioData =
            raw instanceof Float32Array ? raw
            : raw?.audio instanceof Float32Array ? raw.audio
            : null
          const sampleRate = raw?.sampling_rate ?? 24000
          if (!audioData || !audioData.length) {
            console.warn(`[KokoroWorker] invalid chunk id=${id} seq=${seq} raw=${Object.prototype.toString.call(raw)}`)
            seq++; continue
          }

          const durationMs = (audioData.length / sampleRate) * 1000
          const ct         = typeof chunkText === 'string' ? chunkText : ''
          console.log(`[KokoroWorker] chunk ${seq} id=${id} ${audioData.length}samp "${ct.slice(0, 50)}"`)
          const out = audioData.slice()   // standalone copy — safe to transfer, won't detach ONNX memory
          postMessage(
            { type: 'audio-chunk', id, seq, audio: out, sampleRate, durationMs, text: ct, isLast: false },
            [out.buffer]
          )
          seq++
        }
        if (!stallFired && id === currentSpeakId) {
          postMessage({ type: 'audio-chunk', id, seq, audio: null, sampleRate: 0, text: '', isLast: true })
          console.log(`[KokoroWorker] stream complete id=${id}`)
        }
        return 'done'
      })()

      // Push + close AFTER the consumer is already listening
      splitter.push(safe)
      splitter.close()

      return await consumer
    } catch (err) {
      if (stallFired) return 'stall'
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[KokoroWorker] stream error:', msg)
      return 'error:' + msg
    }
  })()

  // Stall guard: if no chunk arrives in 12s, fall back to generate()
  const STALL_MS   = 12_000
  const stallTimer = new Promise(resolve => setTimeout(() => resolve('stalled'), STALL_MS))

  const winner = await Promise.race([
    streamAttempt.then(r => ({ from: 'stream',   r })),
    stallTimer.then(()  => ({ from: 'timeout',  r: 'stalled' })),
  ])

  if (winner.from === 'stream') {
    const r = winner.r
    if (r === 'done' || r === 'cancelled' || r === 'stall') return r
    // error fallthrough
    console.warn('[KokoroWorker] stream errored before first chunk — falling back to generate:', winner.r)
    return 'stall'  // treat as stall so caller runs generate()
  }

  // Timeout — stream produced no first chunk in STALL_MS
  stallFired = true
  console.warn(`[KokoroWorker] stream stalled (${STALL_MS/1000}s no first chunk) — falling back to non-streaming generate`)
  return 'stall'
}

// ── Generate path (single-shot fallback) ─────────────────────────────────
async function speakGenerate(id, safe) {
  let result
  try {
    result = await tts.generate(safe, { voice: 'af_heart', speed: 1.0 })
  } catch (err) {
    console.error('[KokoroWorker] generate error:', err)
    postMessage({
      type: 'error', stage: 'generate',
      message: err instanceof Error ? err.message : String(err),
      stack:   err instanceof Error ? err.stack   : undefined,
      id,
    })
    return
  }

  if (id !== currentSpeakId) {
    console.log(`[KokoroWorker] utterance ${id} superseded after generate — cancelling`)
    postMessage({ type: 'cancelled', id })
    return
  }

  const audio      = result.audio instanceof Float32Array ? result.audio : new Float32Array(result.audio)
  const sampleRate = result.sampling_rate
  const durationMs = (audio.length / sampleRate) * 1000

  console.log(`[KokoroWorker] generated id=${id} ${audio.length}samp @ ${sampleRate}Hz (${Math.round(durationMs)}ms)`)

  if (!audio.length || !sampleRate) {
    postMessage({ type: 'error', stage: 'generate', message: `empty audio: ${audio.length}samp ${sampleRate}Hz`, id })
    return
  }

  postMessage({ type: 'audio', audio, sampleRate, durationMs, text: safe, id }, [audio.buffer])
}

async function speak(id, text) {
  const safe = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim()
  if (!safe) { postMessage({ type: 'cancelled', id }); return }

  console.log(`[KokoroWorker] speak start id=${id} ${safe.length} chars (was ${text.length})`)

  // Default: generate() (single-shot). WASM Kokoro is ~0.2–1× real-time, so
  // streaming produces sentence gaps of 9–44 s on low-core machines — worse
  // than waiting for the full clip. Enable streaming only with ?voicestream=1.
  const streamingEnabled =
    TextSplitterStream &&
    typeof tts.stream === 'function' &&
    new URLSearchParams(self.location.search).get('voicestream') === '1'

  if (streamingEnabled) {
    const outcome = await speakStreaming(id, safe)
    if (outcome !== 'stall') return  // 'done' or 'cancelled' — no further action
    // 'stall' → fall through to generate()
  }

  await speakGenerate(id, safe)
}

async function runSpeak(id, text) {
  generating = true
  try {
    await speak(id, text)
  } catch (err) {
    console.error('[KokoroWorker] runSpeak error:', err)
    postMessage({ type: 'error', stage: 'speak-outer', message: String(err), stack: err?.stack, id })
  } finally {
    generating = false
    if (pendingSpeakMsg) {
      const next = pendingSpeakMsg
      pendingSpeakMsg = null
      runSpeak(next.id, next.text).catch(err =>
        postMessage({ type: 'error', stage: 'runSpeak-queued', message: String(err), id: next.id }))
    }
  }
}

// ── Filler pre-generation ─────────────────────────────────────────────────
// Runs after init(), respects generating flag, yields to real speak requests.
async function pregenFillers(texts) {
  const clips = []
  for (const text of texts) {
    // Wait if a real speak is running
    while (generating) {
      await new Promise(r => setTimeout(r, 150))
    }
    // Stop if a real speak just queued up
    if (pendingSpeakMsg) {
      console.log('[KokoroWorker] pregen interrupted by pending speak')
      break
    }
    generating = true
    try {
      const safe = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim()
      const result = await tts.generate(safe, { voice: 'af_heart', speed: 1.05 })
      const audio = result.audio instanceof Float32Array ? result.audio : new Float32Array(result.audio)
      const sampleRate = result.sampling_rate
      const durationMs = (audio.length / sampleRate) * 1000
      clips.push({ audio: audio.slice(), sampleRate, durationMs, text: safe })
      console.log(`[KokoroWorker] filler ready: "${safe}" (${Math.round(durationMs)}ms)`)
    } catch (err) {
      console.warn('[KokoroWorker] filler pregen failed:', err)
    } finally {
      generating = false
      if (pendingSpeakMsg) {
        const next = pendingSpeakMsg
        pendingSpeakMsg = null
        runSpeak(next.id, next.text)
        break
      }
    }
  }
  if (clips.length > 0) {
    const transfers = clips.map(c => c.audio.buffer)
    postMessage({ type: 'pregen-ready', clips }, transfers)
    console.log(`[KokoroWorker] pregen complete: ${clips.length} fillers cached`)
  }
}

self.onmessage = (e) => {
  console.log('[KokoroWorker] msg received:', e.data?.type)
  const { type, text, id, texts } = e.data

  if (type === 'init') {
    init().catch(err => postMessage({ status: 'error', message: String(err) }))
    return
  }

  if (type === 'speak' && text !== undefined) {
    currentSpeakId = id
    if (!tts || generating) {
      pendingSpeakMsg = { id, text }
      console.log(`[KokoroWorker] speak ${id} queued (${!tts ? 'tts not ready' : 'generating'})`)
      return
    }
    runSpeak(id, text).catch(err =>
      postMessage({ type: 'error', stage: 'runSpeak-dispatch', message: String(err), id }))
    return
  }

  if (type === 'pregen' && Array.isArray(texts)) {
    if (!tts) {
      console.warn('[KokoroWorker] pregen received before tts ready — ignoring')
      return
    }
    pregenFillers(texts).catch(err =>
      console.error('[KokoroWorker] pregenFillers error:', err))
  }
}
