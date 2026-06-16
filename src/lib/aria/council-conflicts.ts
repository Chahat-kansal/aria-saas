// I9 DEEP-REASONING Part 2 — detect conflicts between the 4 council advisors BEFORE synthesis, so
// Aria can address disagreements honestly instead of papering over them. Pure function, no DB, no LLM.

export interface BrainLike {
  role: string
  recommendations: string[]
  confidence: 'high' | 'medium' | 'low'
  succeeded: boolean
}

export interface CouncilConflict {
  kind: 'recommendation' | 'confidence'
  advisors: [string, string]
  detail: string
}

const CONF_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 }

// Opposing action pairs on a shared topic (e.g. raise vs lower price). Each pair = [upWords, downWords].
const OPPOSITES: Array<{ topic: string; up: RegExp; down: RegExp }> = [
  { topic: 'price', up: /\b(raise|increase|lift|bump|put up)\b[^.]*\bprice/i, down: /\b(lower|drop|cut|reduce|discount|mark ?down)\b[^.]*\bprice/i },
  { topic: 'price', up: /\bprice[^.]*\b(raise|increase|up)\b/i, down: /\bprice[^.]*\b(lower|drop|cut|discount|down)\b/i },
  { topic: 'staffing', up: /\b(add|hire|increase|more)\b[^.]*\b(staff|roster|hours|shifts?)\b/i, down: /\b(cut|reduce|trim|fewer|less)\b[^.]*\b(staff|roster|hours|shifts?)\b/i },
  { topic: 'stock', up: /\b(order more|increase|restock|reorder|stock up)\b/i, down: /\b(reduce|cut|hold off|stop ordering|run down)\b[^.]*\bstock\b/i },
  { topic: 'spend', up: /\b(increase|invest|spend more)\b[^.]*\b(marketing|ads?|advertis)/i, down: /\b(cut|pause|reduce|stop)\b[^.]*\b(marketing|ads?|advertis)/i },
]

export function detectCouncilConflicts(brains: BrainLike[]): CouncilConflict[] {
  const ok = brains.filter(b => b.succeeded)
  const conflicts: CouncilConflict[] = []

  // 1) Recommendation-direction conflicts: one advisor pushes UP a lever, another pushes it DOWN.
  for (let i = 0; i < ok.length; i++) {
    for (let j = i + 1; j < ok.length; j++) {
      const a = ok[i], b = ok[j]
      const aText = a.recommendations.join(' '), bText = b.recommendations.join(' ')
      for (const o of OPPOSITES) {
        const aUp = o.up.test(aText), aDown = o.down.test(aText)
        const bUp = o.up.test(bText), bDown = o.down.test(bText)
        if ((aUp && bDown) || (aDown && bUp)) {
          conflicts.push({ kind: 'recommendation', advisors: [a.role, b.role], detail: `disagree on ${o.topic}: ${a.role} wants to ${aUp ? 'increase' : 'decrease'} it, ${b.role} the opposite` })
          break // one conflict per advisor pair is enough
        }
      }
    }
  }

  // 2) Confidence split: a high-confidence advisor and a low-confidence one (≥2 ranks apart).
  for (let i = 0; i < ok.length; i++) {
    for (let j = i + 1; j < ok.length; j++) {
      const a = ok[i], b = ok[j]
      if (Math.abs((CONF_RANK[a.confidence] ?? 2) - (CONF_RANK[b.confidence] ?? 2)) >= 2) {
        const hi = (CONF_RANK[a.confidence] ?? 2) > (CONF_RANK[b.confidence] ?? 2) ? a : b
        const lo = hi === a ? b : a
        conflicts.push({ kind: 'confidence', advisors: [hi.role, lo.role], detail: `confidence split: ${hi.role} is ${hi.confidence}, ${lo.role} is ${lo.confidence}` })
      }
    }
  }

  return conflicts
}

// Synthesis fact-pointer (NOT a rule): tells Aria to address the disagreement honestly.
export function formatConflictsForSynthesis(conflicts: CouncilConflict[]): string {
  if (conflicts.length === 0) return ''
  return 'ADVISOR CONFLICTS (the brains disagree — address this honestly; use council_split if the owner must choose):\n' +
    conflicts.slice(0, 4).map(c => `- ${c.advisors[0]} vs ${c.advisors[1]} — ${c.detail}`).join('\n')
}
