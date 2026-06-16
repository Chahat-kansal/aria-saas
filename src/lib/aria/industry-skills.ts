// I6 INDUSTRY-KNOWLEDGE — aria_skills has NO industry column (verified live), so the industry→skill
// mapping lives here as an explicit code constant. Universal skills (null) apply to every industry;
// industry-specific skills enable only for the listed industries. A null business industry enables
// ONLY the universal skills (no hollow enable).

// skill name → industries it applies to. null = universal (all industries).
export const SKILL_INDUSTRIES: Record<string, string[] | null> = {
  'Accountant': null,
  'Compliance officer': null,
  'HR coach': null,
  'Inventory expert': ['cafe', 'retail', 'gym', 'tradie', 'warehouse'],
  'Marketing strategist': ['cafe', 'retail', 'gym', 'realestate'],
  'Growth advisor': ['cafe', 'retail', 'gym', 'tradie', 'realestate'],
}

// Should a built-in skill be enabled by default for a given business industry?
// - universal skill (null) → always
// - industry-specific → only if the business's industry is in its list
// - null/unknown industry → only universal skills (never a hollow enable)
export function skillEnabledForIndustry(skillName: string, industry: string | null): boolean {
  const inds = SKILL_INDUSTRIES[skillName]
  if (inds === undefined) return false           // not a recognised built-in
  if (inds === null) return true                 // universal
  if (!industry) return false                    // unknown industry → only universal
  return inds.includes(industry)
}

// I6 PART 3 — which skills each council advisor adopts (max 2 per advisor, per the sprint).
export const ADVISOR_SKILLS: Record<'growth' | 'risk' | 'strategy' | 'context', string[]> = {
  growth: ['Growth advisor', 'Marketing strategist'],
  risk: ['Compliance officer', 'Accountant'],
  strategy: ['Growth advisor'],
  context: ['Inventory expert', 'HR coach'],
}

export interface EnabledSkill { name: string; system_prompt_addition: string }

// Build the per-advisor skill injection: the role's mapped skills that are currently enabled for the
// business, capped at 2. Returns the prompt text (to append to the brain's system prompt) + the names
// injected (for logging). Returns empty when no mapped skill is enabled.
export function buildSkillInjection(
  role: 'growth' | 'risk' | 'strategy' | 'context',
  enabled: EnabledSkill[],
): { text: string; names: string[] } {
  const byName = new Map(enabled.map(s => [s.name, s.system_prompt_addition]))
  const picked: EnabledSkill[] = []
  for (const name of ADVISOR_SKILLS[role]) {
    const add = byName.get(name)
    if (add) picked.push({ name, system_prompt_addition: add })
    if (picked.length >= 2) break
  }
  if (picked.length === 0) return { text: '', names: [] }
  const text = '\n\nADOPT THESE EXPERT LENSES (owner-enabled for this business):\n' +
    picked.map(s => `[${s.name}] ${s.system_prompt_addition}`).join('\n')
  return { text, names: picked.map(s => s.name) }
}
