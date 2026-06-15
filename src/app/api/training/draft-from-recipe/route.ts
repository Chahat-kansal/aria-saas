export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'
import { parseLLMJsonOr } from '@/lib/ai-json'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { logAICallSafe } from '@/lib/aria/log-ai-call'

// TP-6 Part 2 — Aria auto-drafts a DRAFT course from a recipe: method lesson + ingredient/method/
// allergen quiz + (if allergens) an acknowledge lesson. Owner reviews + publishes in the TP-1 builder.

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

interface Ingredient { ingredient_name: string; quantity: string | number | null; unit: string | null; allergens: string[] | null }
interface DraftQuiz { question: string; options: string[]; correct_index: number }
interface DraftPayload { method_steps: string; quiz: DraftQuiz[] }

// GET ?recipes=1 — list the business's recipes for the picker.
async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ recipes: [] })
  const { data } = await supabase.from('recipes').select('id, name, category, allergens').eq('business_id', bid).is('deleted_at', null).order('name').limit(200)
  return NextResponse.json({ recipes: data ?? [] })
}

// Deterministic fallback so a draft is ALWAYS produced (no API key / parse fail / thin recipe).
function fallbackDraft(name: string, description: string | null, notes: string | null, ings: Ingredient[]): DraftPayload {
  const ingLines = ings.map(i => `- ${i.ingredient_name}${i.quantity ? ` (${i.quantity}${i.unit ?? ''})` : ''}`).join('\n')
  const method = `# Make: ${name}\n\n${description ?? ''}\n\n## Ingredients\n${ingLines || '- (add ingredients in the recipe)'}\n\n## Method\n1. Gather the ingredients above.\n2. Prepare each component to spec.\n3. Combine and finish to the standard.\n4. Plate/serve and check presentation.\n${notes ? `\n**Notes:** ${notes}` : ''}`
  const quiz: DraftQuiz[] = []
  if (ings.length > 0) {
    const distractors = ['Soy sauce', 'Plain flour', 'Olive oil', 'White vinegar'].filter(d => !ings.some(i => i.ingredient_name.toLowerCase() === d.toLowerCase()))
    quiz.push({ question: `Which of these is an ingredient in a ${name}?`, options: [ings[0].ingredient_name, distractors[0] ?? 'Soy sauce', distractors[1] ?? 'Flour', distractors[2] ?? 'Vinegar'], correct_index: 0 })
  }
  quiz.push({ question: `How should you check a ${name} before serving?`, options: ['Against the recipe spec and presentation standard', 'Just guess', 'Ask the customer to check', 'Skip the check when busy'], correct_index: 0 })
  return { method_steps: method, quiz }
}

function validateDraft(raw: unknown, fallback: DraftPayload): DraftPayload {
  const d = raw as Partial<DraftPayload>
  const method = typeof d?.method_steps === 'string' && d.method_steps.trim().length > 20 ? d.method_steps : fallback.method_steps
  const quizIn = Array.isArray(d?.quiz) ? d.quiz : []
  const quiz = quizIn.filter(q => q && typeof q.question === 'string' && Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(q.correct_index) && q.correct_index >= 0 && q.correct_index < q.options.length)
    .slice(0, 5).map(q => ({ question: String(q.question), options: q.options.slice(0, 4).map(String), correct_index: q.correct_index }))
  return { method_steps: method, quiz: quiz.length ? quiz : fallback.quiz }
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const recipeId = String(body.recipe_id ?? '')
  if (!recipeId) return NextResponse.json({ error: 'recipe_id required' }, { status: 400 })

  const { data: recipe } = await supabase.from('recipes')
    .select('id, name, description, category, allergens, prep_time_minutes, serves, notes')
    .eq('id', recipeId).eq('business_id', bid).maybeSingle()
  if (!recipe) return NextResponse.json({ error: 'Recipe not found' }, { status: 404 })

  const { data: ingData } = await supabase.from('recipe_ingredients').select('ingredient_name, quantity, unit, allergens').eq('recipe_id', recipeId)
  const ings = (ingData ?? []) as Ingredient[]

  // Union of recipe + ingredient allergens.
  const allergenSet = new Set<string>([...(recipe.allergens ?? [])])
  for (const i of ings) for (const a of i.allergens ?? []) allergenSet.add(a)
  const allergens = [...allergenSet]

  const fallback = fallbackDraft(recipe.name, recipe.description, recipe.notes, ings)
  let draft = fallback
  let aiOk = false

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const ingText = ings.map(i => `${i.ingredient_name}${i.quantity ? ` ${i.quantity}${i.unit ?? ''}` : ''}`).join(', ') || '(none listed)'
      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1100,
        messages: [{
          role: 'user',
          content: `You are writing STAFF TRAINING for a café. Draft a short course to teach a new staff member to make this item. Use ONLY the facts given — do not invent ingredients or make any legal/health claims.

Item: ${recipe.name}
Category: ${recipe.category ?? 'n/a'}
Description: ${recipe.description ?? 'n/a'}
Notes: ${recipe.notes ?? 'n/a'}
Ingredients: ${ingText}
${allergens.length ? `Allergens present: ${allergens.join(', ')}` : 'No allergens recorded.'}

Return ONLY JSON:
{
  "method_steps": "markdown: a clear numbered step-by-step method to make this item, written to train a new staff member. Include the ingredient list.",
  "quiz": [ { "question": "string", "options": ["string","string","string","string"], "correct_index": 0 } ]
}
Write 3-5 quiz questions testing ingredients, method order${allergens.length ? ', and the allergens' : ''}. Each question needs exactly one correct option (correct_index). Keep it grounded in the facts above.`,
        }],
      })
      const rawText = msg.content[0]?.type === 'text' ? msg.content[0].text : ''
      const parsed = parseLLMJsonOr<Partial<DraftPayload>>(rawText, fallback, 'draft-from-recipe')
      draft = validateDraft(parsed, fallback)
      aiOk = true
    } catch (e) {
      console.error('[draft-from-recipe] AI call failed', (e as Error).message)
      draft = fallback
    }
  }

  await logAICallSafe({
    business_id: bid, agent_key: 'training', role: 'generator', provider: 'anthropic', success: aiOk,
    request_summary: JSON.stringify({ recipe: recipe.name, ingredients: ings.length, allergens: allergens.length, ai: aiOk, quiz_q: draft.quiz.length }),
  })

  // ── Build the DRAFT course ──
  const { data: course, error: cErr } = await supabase.from('training_courses').insert({
    business_id: bid, title: `Make: ${recipe.name}`,
    description: `Learn to make ${recipe.name} to spec — method, ingredients${allergens.length ? ' and allergen safety' : ''}. Drafted by Aria; review and publish.`,
    tier: 'skill', role_tags: [], is_mandatory: false, pass_mark: 80,
    est_minutes: recipe.prep_time_minutes ?? 15, expires_months: null, status: 'draft', created_by: user.id,
  }).select('id').single()
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  let sort = 0
  // Lesson 1 — method (type 'recipe', recipe_id linked)
  const { error: l1 } = await supabase.from('training_lessons').insert({
    course_id: course.id, business_id: bid, sort_order: sort++, type: 'recipe',
    title: `Method — ${recipe.name}`, content: draft.method_steps, recipe_id: recipeId,
  })
  if (l1) return NextResponse.json({ error: l1.message }, { status: 500 })

  // Lesson 2 — quiz + questions
  const { data: quizLesson, error: l2 } = await supabase.from('training_lessons').insert({
    course_id: course.id, business_id: bid, sort_order: sort++, type: 'quiz', title: 'Knowledge check',
  }).select('id').single()
  if (l2) return NextResponse.json({ error: l2.message }, { status: 500 })

  const optIds = ['a', 'b', 'c', 'd', 'e']
  const questionRows = draft.quiz.map((q, qi) => ({
    lesson_id: quizLesson.id, business_id: bid, sort_order: qi, question: q.question,
    options: q.options.map((text, oi) => ({ id: optIds[oi], text })),
    correct: optIds[q.correct_index] ?? 'a', points: 1,
  }))
  if (questionRows.length) {
    const { error: qErr } = await supabase.from('training_quiz_questions').insert(questionRows)
    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })
  }

  // Lesson 3 — allergen acknowledge (only if allergens present)
  if (allergens.length) {
    await supabase.from('training_lessons').insert({
      course_id: course.id, business_id: bid, sort_order: sort++, type: 'acknowledge',
      title: 'Allergen safety',
      content: `This item contains: ${allergens.join(', ')}. I understand these allergens and will inform customers who ask. Never guess an allergen answer — check the recipe or ask a manager.`,
    })
  }

  return NextResponse.json({ ok: true, course_id: course.id, ai: aiOk, quiz_questions: draft.quiz.length, allergen_lesson: allergens.length > 0 })
}

export const GET = withErrorCapture('training/draft-from-recipe', _GET)
export const POST = withErrorCapture('training/draft-from-recipe', _POST)
