/* eslint-disable @typescript-eslint/no-explicit-any */
// FA-2.5 (CDN rewrite) — client-side NSFW gate with ZERO npm dependency.
// The npm build failed: @tensorflow/tfjs's type surface OOM'd `tsc --noEmit`. FIX: load tfjs + nsfwjs
// from a CDN via injected <script> tags and read the window globals — no types imported, no bundling,
// no OOM. FAIL-OPEN: any load/classify error returns {flagged:false} so a flaky CDN never blocks a real
// upload. No DB, no logging table — purely a client gate.

declare global {
  interface Window { nsfwjs?: any; tf?: any }
}

const TF_CDN = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4/dist/tf.min.js'
const NSFW_CDN = 'https://cdn.jsdelivr.net/npm/nsfwjs@4/dist/nsfwjs.min.js'

function loadScript(src: string): Promise<void> {
  return new Promise((res, rej) => {
    if (typeof document === 'undefined') { rej(new Error('no document')); return }
    if ([...document.scripts].some(s => s.src === src)) { res(); return }
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => res()
    s.onerror = () => rej(new Error('script load failed: ' + src))
    document.head.appendChild(s)
  })
}

let modelPromise: Promise<any> | null = null
async function getModel(): Promise<any> {
  if (!modelPromise) {
    modelPromise = (async () => {
      await loadScript(TF_CDN)
      await loadScript(NSFW_CDN)
      if (!window.nsfwjs?.load) throw new Error('nsfwjs global unavailable')
      return window.nsfwjs.load() // default model from jsDelivr
    })()
  }
  return modelPromise
}

function toImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image decode failed')) }
    img.src = url
  })
}

export interface NsfwResult { flagged: boolean; score: number }

/** Returns {flagged,score}. flagged when combined Porn+Hentai+Sexy probability > 0.6. Fails OPEN. */
export async function isLikelyNSFW(input: Blob | HTMLImageElement): Promise<NsfwResult> {
  try {
    const img = input instanceof HTMLImageElement ? input : await toImage(input)
    const model = await getModel()
    const preds: Array<{ className: string; probability: number }> = await model.classify(img)
    const bad = preds
      .filter(p => ['Porn', 'Hentai', 'Sexy'].includes(p.className))
      .reduce((s, p) => s + p.probability, 0)
    return { flagged: bad > 0.6, score: +bad.toFixed(3) }
  } catch (e) {
    console.warn('[nsfw-check] unavailable — failing open (upload allowed):', e)
    return { flagged: false, score: 0 }
  }
}
