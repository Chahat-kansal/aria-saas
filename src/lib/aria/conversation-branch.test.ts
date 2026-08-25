import { describe, it, expect } from 'vitest'
import {
  renderPath, supersedeLastAssistant, supersedeFrom, lastLiveAssistantIndex,
  liveIndexToAbsolute, isLive, type ThreadMessage,
} from './conversation-branch'

/**
 * S1 PHASES 2 & 3 — the branch model, tested as behaviour rather than asserted about.
 *
 * The rule both phases turn on: NOTHING IS EVER DELETED. Regenerating keeps the old answer;
 * editing an earlier question keeps every answer that followed it. The array only ever grows.
 */

const thread = (): ThreadMessage[] => [
  { role: 'user', content: 'how did last week go?', ts: '1', id: 'm1' },
  { role: 'assistant', content: 'first answer', ts: '2', id: 'm2' },
  { role: 'user', content: 'and oat milk?', ts: '3', id: 'm3' },
  { role: 'assistant', content: 'second answer', ts: '4', id: 'm4' },
]

describe('phase 2 · regenerate keeps the old answer', () => {
  it('supersedes the last assistant turn instead of overwriting it', () => {
    const before = thread()
    const { messages, supersededIndex } = supersedeLastAssistant(before, 'm5', 'T')

    expect(supersededIndex).toBe(3)
    // THE OLD ROW IS STILL THERE
    expect(messages).toHaveLength(4)
    expect(messages[3]!.content).toBe('second answer')
    expect(messages[3]!.superseded_at).toBe('T')
    expect(messages[3]!.superseded_by).toBe('m5')
    // and it no longer renders
    expect(renderPath(messages).map(m => m.content)).toEqual([
      'how did last week go?', 'first answer', 'and oat milk?',
    ])
  })

  it('regenerating twice leaves THREE assistant rows for that turn, newest rendering', () => {
    // The sprint's acceptance test, on a single-exchange thread so "three assistant rows" means
    // exactly what it says. (My first version of this used the 4-message thread and asserted 3,
    // forgetting its EARLIER assistant also counts — the code was right and the assertion wasn't.)
    let msgs: ThreadMessage[] = [
      { role: 'user', content: 'how did last week go?', ts: '1', id: 'm1' },
      { role: 'assistant', content: 'original', ts: '2', id: 'm2' },
    ]

    const r1 = supersedeLastAssistant(msgs, 'g1', 'T1')
    msgs = [...r1.messages, { role: 'assistant', content: 'regen 1', ts: '3', id: 'g1' }]

    const r2 = supersedeLastAssistant(msgs, 'g2', 'T2')
    msgs = [...r2.messages, { role: 'assistant', content: 'regen 2', ts: '4', id: 'g2' }]

    const assistants = msgs.filter(m => m.role === 'assistant')
    expect(assistants).toHaveLength(3)
    expect(assistants.map(a => a.content)).toEqual(['original', 'regen 1', 'regen 2'])

    // exactly one renders, and it is the newest
    const rendered = renderPath(msgs).filter(m => m.role === 'assistant')
    expect(rendered).toHaveLength(1)
    expect(rendered[0]!.content).toBe('regen 2')

    // and both older answers are still in the database
    expect(msgs.filter(m => !isLive(m)).map(m => m.content)).toEqual(['original', 'regen 1'])
  })

  it('MUTATION PROBE — overwriting instead of appending loses a row', () => {
    // What a naive implementation does, and why the count assertion above matters.
    const msgs = thread()
    const overwritten = msgs.map((m, i) => (i === 3 ? { ...m, content: 'regen 1' } : m))
    expect(overwritten.filter(m => m.role === 'assistant')).toHaveLength(2)   // one fewer
    expect(overwritten.find(m => m.content === 'second answer')).toBeUndefined()
  })

  it('does nothing gracefully when there is no assistant turn yet', () => {
    const onlyUser: ThreadMessage[] = [{ role: 'user', content: 'hi' }]
    const { messages, supersededIndex } = supersedeLastAssistant(onlyUser, 'x')
    expect(supersededIndex).toBe(-1)
    expect(messages).toEqual(onlyUser)
  })

  it('never supersedes an already-superseded row twice', () => {
    const { messages } = supersedeLastAssistant(thread(), 'g1', 'T1')
    const again = supersedeLastAssistant(messages, 'g2', 'T2')
    // it moves to the EARLIER live assistant, leaving the first marker intact
    expect(again.supersededIndex).toBe(1)
    expect(again.messages[3]!.superseded_by).toBe('g1')
  })
})

describe('phase 3 · edit and re-run supersedes downstream, never deletes it', () => {
  it('keeps messages 3 and 4 in the array after editing message 2', () => {
    // The sprint's acceptance test: edit message 2 of a 4-message thread.
    const before = thread()
    const { messages, supersededCount } = supersedeFrom(before, 2, 'e1', 'T')

    expect(supersededCount).toBe(2)
    expect(messages).toHaveLength(4)                       // NOTHING REMOVED
    expect(messages[2]!.content).toBe('and oat milk?')
    expect(messages[3]!.content).toBe('second answer')
    expect(messages[2]!.superseded_at).toBe('T')
    expect(messages[3]!.superseded_at).toBe('T')

    // the rendered thread is the surviving prefix, ready for the new branch
    expect(renderPath(messages).map(m => m.content)).toEqual([
      'how did last week go?', 'first answer',
    ])
  })

  it('the new branch renders and the old one survives underneath', () => {
    const { messages } = supersedeFrom(thread(), 2, 'e1', 'T')
    const withBranch: ThreadMessage[] = [
      ...messages,
      { role: 'user', content: 'and almond milk?', id: 'e1', edited_from: 'm3' },
      { role: 'assistant', content: 'new answer', id: 'e2' },
    ]
    expect(withBranch).toHaveLength(6)
    expect(renderPath(withBranch).map(m => m.content)).toEqual([
      'how did last week go?', 'first answer', 'and almond milk?', 'new answer',
    ])
    // the superseded pair is still queryable
    expect(withBranch.filter(m => !isLive(m)).map(m => m.content))
      .toEqual(['and oat milk?', 'second answer'])
  })

  it('MUTATION PROBE — splicing downstream rows out is detectable', () => {
    const spliced = thread().slice(0, 2)
    expect(spliced).toHaveLength(2)
    expect(spliced.find(m => m.content === 'second answer')).toBeUndefined()
    // whereas superseding keeps them
    const { messages } = supersedeFrom(thread(), 2, 'e1')
    expect(messages.find(m => m.content === 'second answer')).toBeDefined()
  })

  it('out-of-range edits change nothing', () => {
    expect(supersedeFrom(thread(), -1, 'x').supersededCount).toBe(0)
    expect(supersedeFrom(thread(), 99, 'x').supersededCount).toBe(0)
  })
})

describe('the client counts what it sees; the server stores everything', () => {
  it('maps a rendered index to its absolute position past superseded rows', () => {
    const { messages } = supersedeFrom(thread(), 2, 'e1', 'T')
    const withBranch: ThreadMessage[] = [
      ...messages,
      { role: 'user', content: 'and almond milk?', id: 'e1' },
    ]
    // rendered: [m1, m2, e1] -> live index 2 is absolute index 4
    expect(liveIndexToAbsolute(withBranch, 0)).toBe(0)
    expect(liveIndexToAbsolute(withBranch, 1)).toBe(1)
    expect(liveIndexToAbsolute(withBranch, 2)).toBe(4)
    expect(liveIndexToAbsolute(withBranch, 9)).toBe(-1)
  })

  it('lastLiveAssistantIndex ignores superseded answers', () => {
    const { messages } = supersedeLastAssistant(thread(), 'g1')
    expect(lastLiveAssistantIndex(messages)).toBe(1)
  })
})

// ── THE WIRING — the branch model is actually used by the route and the surface ────────────────
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const ROUTE = read('src/app/api/aria/ask/route.ts')
const SURFACE = read('src/components/ask-aria-ax/AskAriaTransition.tsx')

describe('the route persists branches instead of overwriting', () => {
  it('regenerate supersedes the previous answer and does not repeat the question', () => {
    expect(ROUTE).toMatch(/supersedeLastAssistant\(msgs, newAssistantId, stamp\)/)
    // only the assistant is appended on a regenerate — the owner asked once
    expect(ROUTE).toMatch(/toAppend = \[\{ \.\.\.pair\[1\]!, id: newAssistantId \}\]/)
  })

  it('an edit supersedes from the edited message onward', () => {
    expect(ROUTE).toMatch(/supersedeFrom\(msgs, abs, newAssistantId, stamp\)/)
    expect(ROUTE).toMatch(/liveIndexToAbsolute\(msgs, branch\?\.editLiveIndex/)
  })

  it('the stored array is only ever extended, never spliced', () => {
    // `[...base, ...toAppend]` — base is the superseded-marked array, same length as before.
    expect(ROUTE).toMatch(/messages: \[\.\.\.base, \.\.\.toAppend\]/)
    expect(ROUTE).not.toMatch(/messages: msgs\.slice\(/)
    expect(ROUTE).not.toMatch(/messages: msgs\.filter\(/)
  })

  it('MUTATION PROBE — splicing downstream rows in the route is detectable', () => {
    const mutated = ROUTE.replace('messages: [...base, ...toAppend]', 'messages: [...base.slice(0, 2), ...toAppend]')
    expect(mutated).not.toBe(ROUTE)
    expect(mutated).not.toMatch(/messages: \[\.\.\.base, \.\.\.toAppend\]/)
  })
})

describe('the surface asks for the right branch', () => {
  it('regenerate no longer throws the old answer away', () => {
    // MS17 shipped `turns.slice(0, lastUser)`, which discarded it. That is what phase 2 forbids.
    expect(SURFACE).toMatch(/ask\(question, \{ regenerate: true \}\)/)
    expect(SURFACE).not.toMatch(/setTurns\(turns\.slice\(0, lastUser\)\)/)
  })

  it('editing sends the live index so the server can supersede from it', () => {
    expect(SURFACE).toMatch(/ask\(text, \{ editLiveIndex: liveIndex \}\)/)
    expect(SURFACE).toMatch(/edit_live_index: branch\.editLiveIndex/)
  })

  it('there is no branch-navigation UI, deliberately', () => {
    // A cafe owner will never compare generations side by side.
    const code = SURFACE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/branchNav|previousBranch|nextBranch|versionPicker/i)
  })
})
