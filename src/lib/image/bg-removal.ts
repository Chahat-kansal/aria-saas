// FA-2.4 (CDN rewrite) — in-browser product-photo background removal with ZERO npm dependency.
// The npm build of @imgly/background-removal failed (it bundles onnxruntime-web → webpack parse error).
// FIX: load the library AND its wasm/onnx assets from jsDelivr at RUNTIME so nothing enters the webpack
// build graph. The `/* webpackIgnore: true */` on the dynamic import is REQUIRED — it tells webpack to
// leave the import as a native runtime import instead of trying to resolve/parse the URL.
// Any failure (CDN unreachable, wasm load error) returns the ORIGINAL blob — never throws, never blocks.

const CDN_BASE = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@latest/dist/'

type ImglyModule = { removeBackground: (src: Blob | string, config?: Record<string, unknown>) => Promise<Blob> }

let imglyPromise: Promise<ImglyModule | null> | null = null

/** Lazy-load the CDN module once. Returns null if it can't be loaded (caller keeps the original image). */
export async function getImgly(): Promise<ImglyModule | null> {
  if (typeof window === 'undefined') return null
  if (!imglyPromise) {
    imglyPromise = (async () => {
      try {
        const url = CDN_BASE + 'index.mjs'
        // variable specifier + webpackIgnore → TS doesn't resolve it, webpack leaves it native.
        const mod = (await import(/* webpackIgnore: true */ url)) as unknown as ImglyModule
        return mod && typeof mod.removeBackground === 'function' ? mod : null
      } catch (e) {
        console.warn('[bg-removal] CDN module load failed — feature unavailable:', e)
        return null
      }
    })()
  }
  return imglyPromise
}

/** Remove the background. Returns a new (transparent PNG) Blob on success, or the ORIGINAL blob on any failure. */
export async function removeBackground(blob: Blob): Promise<Blob> {
  try {
    const imgly = await getImgly()
    if (!imgly) return blob
    const out = await imgly.removeBackground(blob, { publicPath: CDN_BASE })
    return out instanceof Blob ? out : blob
  } catch (e) {
    console.warn('[bg-removal] failed — keeping original image:', e)
    return blob
  }
}
