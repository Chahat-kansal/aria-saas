// FA-2.6 — optional on-device text suggestion via Chrome's built-in Prompt API (window.ai / the
// global LanguageModel). ZERO dependency. Returns null whenever the API is absent or unavailable and
// NEVER throws, so it degrades invisibly on every non-supporting browser. Autocomplete-class only —
// never use for grounded or numeric content (no DB, no anchors).

type NanoSession = { prompt: (input: string) => Promise<string>; destroy?: () => void }

/** Cheap synchronous presence check — is some form of the on-device Prompt API exposed on window? */
export function nanoSupported(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as unknown as {
    LanguageModel?: { create?: unknown }
    ai?: { languageModel?: unknown; assistant?: unknown; createTextSession?: unknown }
  }
  return (
    typeof w.LanguageModel?.create === 'function' ||
    !!w.ai?.languageModel ||
    !!w.ai?.assistant ||
    typeof w.ai?.createTextSession === 'function'
  )
}

// Defensively handles the several shapes the API has shipped in: the global LanguageModel, window.ai
// .languageModel / .assistant, and the legacy window.ai.createTextSession.
async function getSession(): Promise<NanoSession | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    if (typeof w.LanguageModel?.create === 'function') {
      const avail = await w.LanguageModel.availability?.().catch(() => undefined)
      if (avail === 'unavailable') return null
      return (await w.LanguageModel.create()) as NanoSession
    }
    const lm = w.ai?.languageModel ?? w.ai?.assistant
    if (lm && typeof lm.create === 'function') {
      const caps = await lm.capabilities?.().catch(() => undefined)
      if (caps && caps.available === 'no') return null
      return (await lm.create()) as NanoSession
    }
    if (typeof w.ai?.createTextSession === 'function') return (await w.ai.createTextSession()) as NanoSession
    return null
  } catch {
    return null
  }
}

/** A single short on-device suggestion, or null if unavailable/failed. Never throws. Capped at 200 chars. */
export async function nanoSuggest(prompt: string): Promise<string | null> {
  if (typeof window === 'undefined') return null
  try {
    const session = await getSession()
    if (!session) return null
    const out = await session.prompt(prompt)
    try { session.destroy?.() } catch { /* ignore */ }
    const text = (out ?? '').trim()
    return text ? text.slice(0, 200) : null
  } catch {
    return null
  }
}
