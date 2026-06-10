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
// OUT { type: 'audio', audio: Float32Array, sampleRate: number, durationMs: number, text: string, id: number }
//     transfer: [audio.buffer]   ← non-streaming fallback path
// OUT { type: 'audio-chunk', id, seq, audio, sampleRate, durationMs, text, isLast: false }
//     transfer: [audio.buffer]   ← streaming path, one per sentence
// OUT { type: 'audio-chunk', id, seq, audio: Float32Array(0), sampleRate, text: '', isLast: true }
//     end-of-stream sentinel (no transfer needed)
// OUT { type: 'error', stage: string, message: string, stack?: string, id?: number }
// OUT { type: 'cancelled', id: number }   — utterance was superseded before audio was posted
// ─────────────────────────────────────────────────────────────────────────

let tts = null
let TextSplitterStream = null  // populated in init() if kokoro-js supports streaming
let currentSpeakId = 0     // id of the most recently received speak message
let generating     = false  // true while speak() is in progress
let pendingSpeakMsg = null  // { id, text } — latest speak that arrived before/during generation

async function init() {
  try {
    // Default: WASM/q8 (reliable, no GPU contention with Three.js).
    // Escape hatch: add ?voicegpu=1 to the Worker URL for WebGPU/fp16.
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
      ? ' (streaming supported)'
      : ' (generate-only fallback)'
    console.log('[KokoroWorker] ready' + streamNote)
    postMessage({ status: 'ready', device })

    // Process any speak that arrived before init completed
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

async function speak(id, text) {
  // Strip emoji — confuse phonemizer, can stall generation
  const safe = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim()
  if (!safe) {
    postMessage({ type: 'cancelled', id })
    return
  }

  console.log(`[KokoroWorker] speak start id=${id} ${safe.length} chars (was ${text.length})`)

  // ── Streaming path (preferred — sentence-level latency) ─────────────────
  if (TextSplitterStream && typeof tts.stream === 'function') {
    let streamed = false
    try {
      const splitter = new TextSplitterStream()
      const stream = tts.stream(splitter, { voice: 'af_heart', speed: 1.0 })
      splitter.push(safe)
      // Signal end of text input (API varies by version)
      if (typeof splitter.close === 'function') splitter.close()
      else if (typeof splitter.flush === 'function') await splitter.flush()

      let seq = 0
      for await (const chunk of stream) {
        if (id !== currentSpeakId) {
          console.log(`[KokoroWorker] utterance ${id} superseded by ${currentSpeakId} — cancelling (stream)`)
          postMessage({ type: 'cancelled', id })
          return
        }
        const audio = chunk.audio instanceof Float32Array
          ? chunk.audio
          : new Float32Array(chunk.audio)
        const sampleRate = chunk.sampling_rate ?? 24000
        if (!audio.length) { seq++; continue }  // skip empty chunks from splitter
        const durationMs = (audio.length / sampleRate) * 1000
        const chunkText  = typeof chunk.text === 'string' ? chunk.text : ''
        console.log(`[KokoroWorker] chunk id=${id} seq=${seq} ${audio.length}samp "${chunkText.slice(0, 40)}"`)
        postMessage(
          { type: 'audio-chunk', id, seq, audio, sampleRate, durationMs, text: chunkText, isLast: false },
          [audio.buffer]
        )
        seq++
        streamed = true
      }

      // End-of-stream sentinel (only if supersession hasn't occurred)
      if (id === currentSpeakId) {
        postMessage({
          type: 'audio-chunk', id, seq,
          audio: new Float32Array(0), sampleRate: 24000, text: '', isLast: true,
        })
      }
      return
    } catch (streamErr) {
      if (streamed) {
        // Partial stream completed — error mid-stream, report it
        console.error('[KokoroWorker] stream error mid-flight:', streamErr instanceof Error ? streamErr.message : String(streamErr))
        postMessage({ type: 'error', stage: 'stream', message: String(streamErr), id })
        return
      }
      // No chunks yet — fall back to generate()
      console.warn('[KokoroWorker] stream failed (pre-first-chunk), falling back to generate:',
        streamErr instanceof Error ? streamErr.message : String(streamErr))
    }
  }

  // ── Generate path (fallback / no streaming API) ──────────────────────────
  let result
  try {
    result = await tts.generate(safe, { voice: 'af_heart', speed: 1.0 })
  } catch (err) {
    console.error('[KokoroWorker] generate error:', err)
    postMessage({
      type: 'error',
      stage: 'generate',
      message: err instanceof Error ? err.message : String(err),
      stack:   err instanceof Error ? err.stack   : undefined,
      id,
    })
    return
  }

  // After awaiting: check if a newer speak arrived during generation
  if (id !== currentSpeakId) {
    console.log(`[KokoroWorker] utterance ${id} superseded by ${currentSpeakId} — cancelling`)
    postMessage({ type: 'cancelled', id })
    return
  }

  // kokoro-js 1.2.x: RawAudio { audio: Float32Array, sampling_rate: number }
  const audio      = result.audio instanceof Float32Array ? result.audio : new Float32Array(result.audio)
  const sampleRate = result.sampling_rate
  const durationMs = (audio.length / sampleRate) * 1000

  console.log(`[KokoroWorker] generated id=${id} ${audio.length}samp @ ${sampleRate}Hz (${Math.round(durationMs)}ms)`)

  if (!audio.length || !sampleRate) {
    postMessage({
      type: 'error', stage: 'generate',
      message: `empty audio: length=${audio.length} sampleRate=${sampleRate}`,
      id,
    })
    return
  }

  console.log(`[KokoroWorker] posting audio id=${id}`)
  postMessage({ type: 'audio', audio, sampleRate, durationMs, text: safe, id }, [audio.buffer])
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
    // Drain the queue: run the latest pending speak, if any
    if (pendingSpeakMsg) {
      const next = pendingSpeakMsg
      pendingSpeakMsg = null
      runSpeak(next.id, next.text).catch(err =>
        postMessage({ type: 'error', stage: 'runSpeak-queued', message: String(err), id: next.id }))
    }
  }
}

self.onmessage = (e) => {
  console.log('[KokoroWorker] msg received:', e.data?.type)
  const { type, text, id } = e.data

  if (type === 'init') {
    init().catch(err => postMessage({ status: 'error', message: String(err) }))
    return
  }

  if (type === 'speak' && text !== undefined) {
    currentSpeakId = id  // always update so post-generate check detects supersession
    if (!tts || generating) {
      // Queue for when init/current generation completes — only keep latest
      pendingSpeakMsg = { id, text }
      console.log(`[KokoroWorker] speak ${id} queued (${!tts ? 'tts not ready' : 'generating'})`)
      return
    }
    runSpeak(id, text).catch(err =>
      postMessage({ type: 'error', stage: 'runSpeak-dispatch', message: String(err), id }))
  }
}
