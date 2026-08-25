import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildFeedbackSnapshot, isReproducible, toEvalCaseDraft } from './feedback-snapshot'

const root = join(__dirname, '..', '..', '..')
const SURFACE = readFileSync(join(root, 'src/components/ask-aria-ax/AskAriaTransition.tsx'), 'utf8')

const rated = () => buildFeedbackSnapshot({
  rating: 'down',
  reason: 'the margin is wrong',
  question: 'what was our margin last week?',
  answer: 'Your margin was 61% on $14,208 of sales.',
  model: 'gemini-2.0-flash',
  provider: 'google',
  anchors: [14208, 61],
  tiers: { verified: 1, estimated: 1, plain: 0 },
  messageId: 'a:2026-08-25T00:00:00Z',
  conversationId: 'c1',
})

describe('phase 5 · a rating is a snapshot, not a pointer', () => {
  it('captures the question, the answer, the model and the provenance by value', () => {
    const s = rated()
    expect(s.question).toBe('what was our margin last week?')
    expect(s.answer).toBe('Your margin was 61% on $14,208 of sales.')
    expect(s.model).toBe('gemini-2.0-flash')
    expect(s.provider).toBe('google')
    expect(s.provenance.anchors).toEqual([14208, 61])
    expect(s.provenance.tiers).toEqual({ verified: 1, estimated: 1, plain: 0 })
  })

  it('SURVIVES the message being edited or regenerated afterwards', () => {
    // The acceptance test the sprint names. Messages here are JSONB entries that get SUPERSEDED,
    // so a row pointing only at an id would describe something the owner never rated.
    const s = rated()
    const conversationAfterEdit = [{ id: 'a:2026-08-25T00:00:00Z', content: 'a completely different answer' }]

    // the snapshot is untouched by what happened to the thread
    expect(s.answer).toBe('Your margin was 61% on $14,208 of sales.')
    expect(conversationAfterEdit[0]!.content).not.toBe(s.answer)
    expect(isReproducible(s)).toBe(true)
  })

  it('copies arrays and objects, so later mutation of the source cannot rewrite history', () => {
    const anchors = [1, 2]
    const tiers = { verified: 1 }
    const s = buildFeedbackSnapshot({ rating: 'up', question: 'q', answer: 'a', anchors, tiers })
    anchors.push(999)
    tiers.verified = 99
    expect(s.provenance.anchors).toEqual([1, 2])
    expect(s.provenance.tiers).toEqual({ verified: 1 })
  })

  it('MUTATION PROBE — storing only the id is not reproducible', () => {
    // What a dead feedback table looks like.
    const idOnly = buildFeedbackSnapshot({
      rating: 'down', question: '', answer: '', messageId: 'a:123',
    })
    expect(isReproducible(idOnly)).toBe(false)
    expect(isReproducible(rated())).toBe(true)
  })

  it('records whether the rated answer was a stopped partial', () => {
    const s = buildFeedbackSnapshot({ rating: 'down', question: 'q', answer: 'half', answerIncomplete: true })
    expect(s.answerIncomplete).toBe(true)
    // a thumbs-down on a partial means something different from one on a finished answer
    expect(rated().answerIncomplete).toBe(false)
  })

  it('drops an empty reason rather than storing a blank string', () => {
    expect(buildFeedbackSnapshot({ rating: 'up', question: 'q', answer: 'a', reason: '   ' }).reason).toBeUndefined()
  })
})

describe('a thumbs-down converts into an eval case', () => {
  it('carries the question, the bad answer and the ground truth straight across', () => {
    const draft = toEvalCaseDraft(rated())
    expect(draft.question).toBe('what was our margin last week?')
    expect(draft.bad).toBe('Your margin was 61% on $14,208 of sales.')
    expect(draft.ground.anchors).toEqual([14208, 61])
    // the one field that needs a person: what Aria SHOULD have said
    expect(draft.needsHuman).toBe('good')
  })

  it('expects a REFUSAL when the answer carried unbacked figures', () => {
    const s = buildFeedbackSnapshot({
      rating: 'down', question: 'q', answer: 'Revenue was $9,999.', tiers: { plain: 2 },
    })
    expect(toEvalCaseDraft(s).expectBad).toBe('refuse')
  })

  it('expects a HEDGE when every figure was backed', () => {
    expect(toEvalCaseDraft(rated()).expectBad).toBe('hedge')
  })
})

describe('the thumbs UI is PARKED, and correctly so', () => {
  it('no feedback control is on the surface, because nothing could store it', () => {
    // There is no feedback/rating table in the live database. MS17's rail: a control that cannot
    // do anything must not be on screen. A thumbs-down that silently drops the rating is worse
    // than none — the owner believes they have told us something.
    const code = SURFACE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/thumbs|ThumbUp|ThumbDown|rateMessage/i)
  })

  it('the schema it needs is written down where the next reader will find it', () => {
    const LIB = readFileSync(join(root, 'src/lib/aria/feedback-snapshot.ts'), 'utf8')
    expect(LIB).toMatch(/create table public\.aria_message_feedback/)
    expect(LIB).toMatch(/rating\s+text not null check \(rating in \('up','down'\)\)/)
    expect(LIB).toMatch(/provenance\s+jsonb/)
  })
})
