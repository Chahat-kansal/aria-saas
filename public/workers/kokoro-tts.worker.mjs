// public/workers/kokoro-tts.worker.mjs
// Module Web Worker — static file served from public/. NOT webpack-bundled.
// kokoro-js loads dynamically from esm.sh (already in script-src CSP).
// ONNX WASM redirected to cdn.jsdelivr.net (already in connect-src CSP).
//
// ── Message contract ──────────────────────────────────────────────────────
// IN  { type: 'init' }
// IN  { type: 'speak', text: string, voice: string, speed: number }
// OUT { status: 'ready', device: 'webgpu'|'wasm' }
// OUT { status: 'error', message: string }
// OUT { type: 'audio', audio: Float32Array, sampleRate: number, durationMs: number, text: string }
//     transfer: [audio.buffer]
// OUT { type: 'error', stage: string, message: string, stack?: string }
// ─────────────────────────────────────────────────────────────────────────

let tts = null

async function init() {
  try {
    const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator
    const device = hasWebGPU ? 'webgpu' : 'wasm'
    // fp16 on WebGPU: ~165 MB, properly supported by onnxruntime-web WebGPU backend.
    // q8  on WASM:    ~80 MB, good for CPU execution.
    // q8+webgpu is NOT used — WebGPU inference with q8 can silently hang on first generate().
    const dtype = device === 'webgpu' ? 'fp16' : 'q8'

    console.log(`[KokoroWorker] init device=${device} dtype=${dtype}`)
    const { KokoroTTS, env } = await import('https://esm.sh/kokoro-js@1.2.1')

    // Redirect ONNX WASM files to jsdelivr (cdn.jsdelivr.net already in connect-src)
    if (env?.backends?.onnx?.wasm) {
      env.backends.onnx.wasm.wasmPaths =
        'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/'
    }

    tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
      dtype,
      device,
    })

    console.log('[KokoroWorker] ready')
    postMessage({ status: 'ready', device })
  } catch (err) {
    console.error('[KokoroWorker] init error:', err)
    postMessage({
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

async function speak(text, voice, speed) {
  if (!tts) {
    postMessage({ type: 'error', stage: 'speak', message: 'TTS not initialized' })
    return
  }
  try {
    console.log(`[KokoroWorker] speak start ${text.length} chars voice=${voice}`)

    const result = await tts.generate(text, { voice, speed })

    // kokoro-js 1.2.x returns RawAudio { audio: Float32Array, sampling_rate: number }
    const audio = result.audio instanceof Float32Array
      ? result.audio
      : new Float32Array(result.audio)
    const sampleRate = result.sampling_rate
    const durationMs = (audio.length / sampleRate) * 1000

    console.log(`[KokoroWorker] generated ${audio.length} samples @ ${sampleRate} Hz (${Math.round(durationMs)}ms)`)

    if (!audio.length || !sampleRate) {
      postMessage({
        type: 'error',
        stage: 'speak',
        message: `generate() returned empty audio: length=${audio.length} sampleRate=${sampleRate}`,
      })
      return
    }

    console.log('[KokoroWorker] posting audio')
    postMessage({ type: 'audio', audio, sampleRate, durationMs, text }, [audio.buffer])
  } catch (err) {
    console.error('[KokoroWorker] speak error:', err)
    postMessage({
      type: 'error',
      stage: 'speak',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
  }
}

self.onmessage = (e) => {
  const { type, text, voice, speed } = e.data
  if (type === 'init') {
    init().catch((err) =>
      postMessage({ status: 'error', message: String(err) })
    )
  } else if (type === 'speak' && text) {
    speak(text, voice ?? 'af_heart', speed ?? 1.0).catch((err) =>
      postMessage({ type: 'error', stage: 'speak-outer', message: String(err), stack: err?.stack })
    )
  }
}
