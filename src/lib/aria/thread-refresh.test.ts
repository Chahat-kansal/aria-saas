import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  THREAD_PARAM, readThreadId, threadSearch, syncThreadUrl, restoreThread,
  rememberScroll, recallScroll, forgetScroll,
} from './thread-session'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const AX = read('src/components/ask-aria-ax/AskAriaTransition.tsx')

const ID = '2c98fef3-1b0e-4a3e-9f2f-7d8c1a4b5e60'
const OTHER = 'aa11bb22-cc33-dd44-ee55-ff6677889900'

/**
 * M11 PHASE 1 — A REFRESH MUST NOT LOSE THE CONVERSATION.
 *
 * OBSERVED, on the deployed build: reloading /dashboard/ask-aria returned to the welcome screen
 * with the open conversation gone from view. It survived in Threads — `aria_conversations` had it
 * and `/api/aria/ask/history?id=&messages=true` could hand it back — so nothing was ever lost. What
 * was missing was the THREAD'S IDENTITY: `conversationId` lived in `useState` and nowhere else, so
 * the page had no way of knowing what it had been showing a second earlier.
 *
 * This blocks the rest of M11: a delegated job that runs for minutes is unusable if a refresh
 * strands the owner on the welcome screen with no route back to the work.
 *
 * ⚠️ WHAT THESE TESTS DO AND DO NOT PROVE. They drive the restore mechanism directly — a real
 * fetch shape, a real query string, a real storage round trip — and they hold the surface's wiring
 * with a source rail. They do NOT press F5 in a browser: this repo's vitest runner is `environment:
 * 'node'` with no testing-library, and the Playwright suite that could do it needs a login the
 * sprint may not perform. The browser half is stated as unverified in the run log rather than
 * implied by a green tick here.
 */
describe('M11 phase 1 · the thread id is in the URL, and it is a UUID or nothing', () => {
  it('reads a valid id', () => {
    expect(readThreadId('?c=' + ID)).toBe(ID)
    expect(readThreadId('c=' + ID)).toBe(ID)
    expect(THREAD_PARAM).toBe('c')
  })

  it('a missing, empty, or non-UUID c is ABSENT, not an error', () => {
    // A junk id must open the welcome screen, never put a junk value on the wire.
    expect(readThreadId('')).toBeNull()
    expect(readThreadId('?q=hello')).toBeNull()
    expect(readThreadId('?c=')).toBeNull()
    expect(readThreadId('?c=undefined')).toBeNull()
    expect(readThreadId('?c=null')).toBeNull()
    expect(readThreadId('?c=../../etc/passwd')).toBeNull()
    expect(readThreadId("?c=' or 1=1--")).toBeNull()
  })

  it('it uses the codebase EXISTING uuid helper, not a fifth copy of the regex', () => {
    // Failure pattern #4, N copies drift: resolve-business, resolve-code, notice-context and
    // uuid-helpers each already carry this regex. A fifth would be the one that goes stale.
    const src = code(read('src/lib/aria/thread-session.ts'))
    expect(src).toContain("from '@/lib/utils/uuid-helpers'")
    expect(src).not.toMatch(/\[0-9a-f\]\{8\}-/)
  })
})

describe('M11 phase 1 · writing the thread into the URL REMOVES the one-shot question', () => {
  it('?q= is dropped when ?c= is set — a reload must never re-ask', () => {
    // The bug this forecloses: a briefing link is /dashboard/ask-aria?q=Give+me+the+full+briefing.
    // If the thread id were merely appended, every refresh would re-send that question into the
    // conversation and bill for it. Same class as M4's double-send on the send path.
    const out = threadSearch(ID, '?q=Give+me+the+full+detailed+daily+briefing')
    expect(out).toBe('?c=' + ID)
    expect(out).not.toContain('q=')
  })

  it('other parameters survive — this is not a URL reset', () => {
    const out = threadSearch(ID, '?utm_source=email&topic=roster')
    expect(out).toContain('utm_source=email')
    expect(out).toContain('topic=roster')
    expect(out).toContain('c=' + ID)
  })

  it('a null id clears c, which is what leaving a thread means', () => {
    expect(threadSearch(null, '?c=' + ID)).toBe('')
    expect(threadSearch(null, '?c=' + ID + '&topic=roster')).toBe('?topic=roster')
  })

  it('replacing an open thread with another one replaces the value, never appends a second', () => {
    const out = threadSearch(OTHER, '?c=' + ID)
    expect(out).toBe('?c=' + OTHER)
    expect(out.match(/c=/g)?.length).toBe(1)
  })
})

describe('M11 phase 1 · syncThreadUrl replaces, never navigates and never pushes', () => {
  function installHistory(search: string) {
    const calls: Array<[unknown, string, string]> = []
    vi.stubGlobal('window', {
      location: { pathname: '/dashboard/ask-aria', search, hash: '' },
      history: {
        replaceState: (a: unknown, b: string, c: string) => { calls.push([a, b, c]) },
        pushState: () => { throw new Error('pushState must never be used here') },
      },
    })
    return calls
  }

  it('writes pathname + the new search', () => {
    const calls = installHistory('')
    syncThreadUrl(ID)
    expect(calls.length).toBe(1)
    expect(calls[0][2]).toBe('/dashboard/ask-aria?c=' + ID)
  })

  it('is a NO-OP when the URL already says that — no history churn per send', () => {
    const calls = installHistory('?c=' + ID)
    syncThreadUrl(ID)
    expect(calls.length).toBe(0)
  })

  it('never uses pushState — Back must not walk backwards through a conversation', () => {
    const calls = installHistory('?q=hello')
    // installHistory throws from pushState; reaching here at all proves replaceState was used.
    expect(() => syncThreadUrl(ID)).not.toThrow()
    expect(calls[0][2]).toBe('/dashboard/ask-aria?c=' + ID)
  })

  it('survives an environment with no history API', () => {
    vi.stubGlobal('window', { location: { pathname: '/x', search: '', hash: '' } })
    expect(() => syncThreadUrl(ID)).not.toThrow()
  })
})

describe('M11 phase 1 · restoreThread reuses the ONE route, and every miss lands on welcome', () => {
  const msgs = [{ role: 'user', content: 'what did we take yesterday' }, { role: 'assistant', content: 'A$1,204.50' }]
  const ok = (body: unknown) => async () => ({ ok: true, json: async () => body })

  it('restores messages, and asks the route the Threads panel already asks', async () => {
    const seen: string[] = []
    const out = await restoreThread(ID, async (u) => { seen.push(u); return { ok: true, json: async () => ({ conversation: { id: ID, messages: msgs } }) } })
    expect(out).toEqual({ id: ID, messages: msgs })
    // The SAME endpoint ThreadsPanel:99 calls. A second endpoint is how a URL restore and a click
    // restore start showing different things.
    expect(seen).toEqual(['/api/aria/ask/history?id=' + ID + '&messages=true'])
  })

  it('provenance rides along — the tier must not be lost on the way to the screen', async () => {
    const withProv = [{ role: 'assistant', content: 'A$1,204.50', provenance: { anchors: [1204.5], anchorLabels: { '1204.5': 'pos_sales' } } }]
    const out = await restoreThread(ID, ok({ conversation: { messages: withProv } }))
    expect(out?.messages[0].provenance?.anchors).toEqual([1204.5])
  })

  it("conversation: null — another business's thread, or a deleted one — restores nothing", async () => {
    // The route answers 200 + {conversation:null} for both. Neither is an error the owner caused.
    expect(await restoreThread(ID, ok({ conversation: null }))).toBeNull()
    expect(await restoreThread(ID, ok({}))).toBeNull()
  })

  it('an EMPTY thread restores nothing — an empty working screen is worse than welcome', async () => {
    expect(await restoreThread(ID, ok({ conversation: { messages: [] } }))).toBeNull()
    expect(await restoreThread(ID, ok({ conversation: { messages: 'not-an-array' } }))).toBeNull()
  })

  it('401, 500 and a thrown fetch all land on welcome rather than an error screen', async () => {
    expect(await restoreThread(ID, async () => ({ ok: false, json: async () => ({}) }))).toBeNull()
    expect(await restoreThread(ID, async () => { throw new Error('offline') })).toBeNull()
    expect(await restoreThread(ID, ok(undefined))).toBeNull()
  })

  it('a non-UUID id never reaches the network at all', async () => {
    let called = 0
    const out = await restoreThread('not-an-id', async () => { called++; return { ok: true, json: async () => ({}) } })
    expect(out).toBeNull()
    expect(called).toBe(0)
  })
})

describe('M11 phase 1 · where the owner was reading', () => {
  beforeEach(() => {
    const map = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => { map.set(k, v) },
      removeItem: (k: string) => { map.delete(k) },
    })
  })

  it('round-trips per thread', () => {
    rememberScroll(ID, 840)
    rememberScroll(OTHER, 120)
    expect(recallScroll(ID)).toBe(840)
    expect(recallScroll(OTHER)).toBe(120)
  })

  it('no memory means null, so the caller falls back to the bottom', () => {
    expect(recallScroll(ID)).toBeNull()
    expect(recallScroll(null)).toBeNull()
    forgetScroll(ID)
    expect(recallScroll(ID)).toBeNull()
  })

  it('a not-yet-created thread has nowhere to store a position, and does not try', () => {
    rememberScroll(null, 300)
    expect(recallScroll(null)).toBeNull()
  })

  it('junk and negatives are refused rather than restored', () => {
    rememberScroll(ID, Number.NaN)
    expect(recallScroll(ID)).toBeNull()
    rememberScroll(ID, -5)
    expect(recallScroll(ID)).toBeNull()
  })

  it('unavailable storage is not an exception — private mode still gets a conversation', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
      removeItem: () => { throw new Error('denied') },
    })
    expect(() => rememberScroll(ID, 100)).not.toThrow()
    expect(recallScroll(ID)).toBeNull()
  })
})

describe('M11 phase 1 · THE RAIL — the surface actually carries the identity', () => {
  const c = code(AX)

  it('ANTI-VACUITY — the surface was read and is the file it claims to be', () => {
    expect(AX.length).toBeGreaterThan(20_000)
    expect(c).toContain('const [conversationId, setConversationId] = useState<string | null>(null)')
  })

  it('all THREE places a thread starts or stops being open write the URL', () => {
    // Miss any one and the defect comes back on that path only — the shape that makes a fix look
    // like it worked. openThread (clicking a thread), the first answer (a NEW thread), newChat.
    expect((c.match(/syncThreadUrl\(/g) ?? []).length).toBeGreaterThanOrEqual(4)
    expect(c).toMatch(/adoptDraft\(result\.conversation_id\)[\s\S]{0,220}syncThreadUrl\(result\.conversation_id\)/)
    expect(c).toMatch(/const newChat = useCallback\(\(\) => \{[\s\S]{0,220}syncThreadUrl\(null\)/)
    expect(c).toMatch(/const openThread = useCallback\([\s\S]{0,200}syncThreadUrl\(id\)/)
  })

  it('the reload restore exists, enters WORKING, and reuses openThread', () => {
    expect(c).toMatch(/const restoredRef = useRef\(false\)/)
    expect(c).toMatch(/if \(restoredRef\.current\) return/)
    expect(c).toMatch(/const id = readThreadId\(window\.location\.search\)/)
    expect(c).toMatch(/restoreThread\(id, \(u\) => fetch\(u\)\)/)
    // Entering working BEFORE the fetch resolves: waiting would flash the welcome screen.
    expect(c).toMatch(/restoredRef\.current = true[\s\S]{0,120}setWorking\(true\)/)
    // Restoring through openThread is what keeps a URL restore identical to a click restore.
    expect(c).toMatch(/openThread\(restored\.id, restored\.messages\)/)
  })

  it('a thread that no longer resolves falls back to welcome AND drops the stale id', () => {
    expect(c).toMatch(/if \(!restored\) \{[\s\S]{0,160}setWorking\(false\)[\s\S]{0,120}syncThreadUrl\(null\)/)
  })

  it('?c= suppresses ?q= auto-send — a reload must not append a question', () => {
    expect(c).toMatch(/if \(readThreadId\(window\.location\.search\)\) return[\s\S]{0,200}\.get\('q'\)/)
  })

  it('the scroll effect honours a restored offset ONCE and otherwise still goes to the bottom', () => {
    // A live conversation must always be pulled to its newest turn; the restore offset is consumed
    // by the very next run so it can never hold the view away from an arriving message.
    expect(c).toMatch(/pendingScrollRef\.current = null/)
    expect(c).toContain('flowRef.current.scrollTop = 9e9')
    expect(c).toMatch(/onScroll=\{e => \{ if \(!isBusy\) rememberScroll\(conversationId/)
  })

  it('MUTATION PROBE — dropping the thread identity on reload is detectable', () => {
    // The sprint's named mutation. Removing the id read is the whole defect, restored.
    const mutated = AX.replace('const id = readThreadId(window.location.search)', 'const id = null')
    expect(mutated).not.toBe(AX)
    expect(code(mutated)).not.toMatch(/const id = readThreadId\(window\.location\.search\)/)
  })
})
