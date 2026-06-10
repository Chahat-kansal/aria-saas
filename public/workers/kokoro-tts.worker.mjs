// public/workers/kokoro-tts.worker.mjs
// Module Web Worker — static file served from public/. NOT webpack-bundled.
// kokoro-js loads dynamically from esm.sh (already in script-src CSP).
// ONNX WASM redirected to cdn.jsdelivr.net (already in connect-src CSP).
//
// Messages in:  { type: 'init' }
//               { type: 'speak', text, voice, speed }
// Messages out: { status: 'ready', device }
//               { status: 'error', message }
//               { type: 'audio', audio, sampleRate, durationMs, text }
//               { type: 'error', message }

let tts = null

async function init() {
  try {
    const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator
    const device = hasWebGPU ? 'webgpu' : 'wasm'
    const dtype = 'q8'  // q8 on both paths — reduces GPU memory contention with Three.js

    const { KokoroTTS, env } = await import('https://esm.sh/kokoro-js@1.2.1')

    // Redirect ONNX WASM files to jsdelivr (cdn.jsdelivr.net already in connect-src)
    // This prevents WASM fetch from going to esm.sh where binary hosting is unreliable.
    if (env?.backends?.onnx?.wasm) {
      env.backends.onnx.wasm.wasmPaths =
        'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/'
    }

    tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
      dtype,
      device,
    })

    postMessage({ status: 'ready', device })
  } catch (err) {
    postMessage({
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

async function speak(text, voice, speed) {
  if (!tts) {
    postMessage({ type: 'error', message: 'TTS not initialized' })
    return
  }
  try {
    const result = await tts.generate(text, { voice, speed })
    const audio =
      result.audio instanceof Float32Array ? result.audio : new Float32Array(result.audio)
    const sampleRate = result.sampling_rate
    const durationMs = (audio.length / sampleRate) * 1000
    postMessage({ type: 'audio', audio, sampleRate, durationMs, text }, [audio.buffer])
  } catch (err) {
    postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
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
      postMessage({ type: 'error', message: String(err) })
    )
  }
}
