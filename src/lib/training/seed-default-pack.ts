import { supabaseAdmin } from '@/lib/supabase-admin'

// TP-SEED — the default day-one training pack. NON-compliance tiers only (systems + culture):
// compliance courses (Food Safety, RSA) stay owner-confirmed via the TP-6 Aria starter-library,
// because a default shell would falsely signal "you're covered". Reuses the TP-6 insert shape
// (training_courses + a type='game' lesson carrying game_round). Idempotent: a course is only
// created if one with the same title doesn't already exist for the business.

interface SeedCourse {
  title: string
  description: string
  tier: 'systems' | 'culture'
  is_mandatory: boolean
  est_minutes: number
  game_round?: string          // when set, adds an interactive game lesson (TP-3 engine)
  text_lesson?: { title: string; content: string; type: 'text' | 'acknowledge' }
}

function defaultPack(businessName: string): SeedCourse[] {
  return [
    { title: 'Run the POS', tier: 'systems', is_mandatory: true, est_minutes: 10, game_round: 'pos',
      description: 'A hands-on game: build the order, take payment, give the right change. The fastest way to get someone confident on the till.' },
    { title: 'Spot the Honest Answer', tier: 'systems', is_mandatory: false, est_minutes: 10, game_round: 'truth',
      description: 'A quick game that teaches grounded thinking — only one statement matches the data.' },
    { title: `Welcome to ${businessName}`, tier: 'culture', is_mandatory: false, est_minutes: 10,
      text_lesson: { title: 'Our story & how we work', type: 'acknowledge', content: `Welcome to the ${businessName} team!\n\nThis is your space to learn how we do things. Your manager will add our values, menu knowledge and day-to-day standards here.\n\nTick below to confirm you've read this welcome.` },
      description: 'Your story, values and the standard you expect — an editable culture course for new starters.' },
  ]
}

export interface SeedResult { created: number; skipped: number; course_ids: string[] }

// Seed the default pack for one business. createdBy is optional (nullable column).
export async function seedDefaultTrainingPack(businessId: string, createdBy: string | null, businessName = 'your business'): Promise<SeedResult> {
  const db = supabaseAdmin
  const pack = defaultPack(businessName)
  const result: SeedResult = { created: 0, skipped: 0, course_ids: [] }

  for (const c of pack) {
    // Idempotent: skip if a course with this title already exists for the business.
    const { data: existing } = await db.from('training_courses')
      .select('id').eq('business_id', businessId).eq('title', c.title).maybeSingle()
    if (existing) { result.skipped++; continue }

    const { data: course, error } = await db.from('training_courses').insert({
      business_id: businessId, title: c.title, description: c.description, tier: c.tier,
      role_tags: [], is_mandatory: c.is_mandatory, pass_mark: 80,
      est_minutes: c.est_minutes, expires_months: null, status: 'published', created_by: createdBy,
    }).select('id').single()
    if (error || !course) continue
    result.created++; result.course_ids.push(course.id)

    if (c.game_round) {
      await db.from('training_lessons').insert({
        course_id: course.id, business_id: businessId, sort_order: 0, type: 'game',
        title: c.title, game_round: c.game_round, duration_seconds: c.est_minutes * 60,
      })
    } else if (c.text_lesson) {
      await db.from('training_lessons').insert({
        course_id: course.id, business_id: businessId, sort_order: 0, type: c.text_lesson.type,
        title: c.text_lesson.title, content: c.text_lesson.content,
      })
    }
  }
  return result
}
