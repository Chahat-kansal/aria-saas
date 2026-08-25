import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readDraft, writeDraft, clearDraft, adoptDraft, draftKeys } from './draft-store'

const root = join(__dirname, '..', '..', '..')
const SURFACE = readFileSync(join(root, 'src/components/ask-aria-ax/AskAriaTransition.tsx'), 'utf8')

/** A minimal localStorage, because this runs in node. */
function installStorage() {
  const map = new Map<string, string>()
  const store = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v) },
    removeItem: (k: string) => { map.delete(k) },
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size },
  }
  vi.stubGlobal('localStorage', store)
  return map
}

describe('S2 phase 5 · a draft survives leaving and coming back', () => {
  beforeEach(() => { installStorage() })

  it('round-trips per thread', () => {
    writeDraft('t1', 'ask about the oat milk order')
    expect(readDraft('t1')).toBe('ask about the oat milk order')
  })

  it('KEEPS THREADS SEPARATE — a draft cannot surface in another conversation', () => {
    writeDraft('t1', 'note to Kirkwood')
    writeDraft('t2', 'roster question')
    expect(readDraft('t1')).toBe('note to Kirkwood')
    expect(readDraft('t2')).toBe('roster question')
    expect(readDraft('t3')).toBe('')
  })

  it('sending clears it', () => {
    writeDraft('t1', 'half a thought')
    clearDraft('t1')
    expect(readDraft('t1')).toBe('')
  })

  it('an emptied composer clears rather than storing whitespace', () => {
    writeDraft('t1', 'something')
    writeDraft('t1', '   ')
    expect(readDraft('t1')).toBe('')
    expect(draftKeys()).toEqual([])
  })

  it('a draft typed before the thread existed is adopted by the thread it produced', () => {
    // Without this the FIRST message of every conversation loses its draft the moment the server
    // assigns an id — the most common case of all.
    writeDraft(null, 'my very first question')
    adoptDraft('new-thread-id')
    expect(readDraft('new-thread-id')).toBe('my very first question')
    expect(readDraft(null)).toBe('')
  })

  it('adopting never overwrites a draft the thread already had', () => {
    writeDraft(null, 'pending')
    writeDraft('t1', 'already here')
    adoptDraft('t1')
    expect(readDraft('t1')).toBe('already here')
  })

  it('survives storage being unavailable — a draft is a convenience, not a requirement', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('SecurityError') },
      setItem: () => { throw new Error('SecurityError') },
      removeItem: () => { throw new Error('SecurityError') },
      key: () => null, length: 0,
    })
    expect(() => writeDraft('t1', 'x')).not.toThrow()
    expect(readDraft('t1')).toBe('')
    expect(draftKeys()).toEqual([])
  })

  it('caps a runaway draft rather than filling the quota', () => {
    installStorage()
    writeDraft('t1', 'x'.repeat(50_000))
    expect(readDraft('t1').length).toBe(20_000)
  })
})

describe('S2 phase 5 · the surface actually reaches it', () => {
  // Carried from S1: a capability nothing calls is as broken as a button that does nothing.
  it('restores on every thread change', () => {
    expect(SURFACE).toMatch(/setInput\(readDraft\(conversationId\)\)/)
    expect(SURFACE).toMatch(/\}, \[conversationId\]\)/)
  })

  it('persists on every keystroke', () => {
    expect(SURFACE).toMatch(/writeDraft\(conversationId, e\.target\.value\)/)
  })

  it('clears on send, and adopts on thread creation', () => {
    expect(SURFACE).toMatch(/clearDraft\(conversationId\)/)
    expect(SURFACE).toMatch(/adoptDraft\(result\.conversation_id\)/)
  })

  it('MUTATION PROBE — clearing the draft on unmount is detectable', () => {
    const mutated = SURFACE.replace('setInput(readDraft(conversationId))', "setInput('')")
    expect(mutated).not.toBe(SURFACE)
    expect(mutated).not.toMatch(/setInput\(readDraft\(conversationId\)\)/)
  })
})
