import { supabaseAdmin } from '@/lib/supabase-admin'

const MAX_DAILY_GROUNDED = 150 // buffer below 166/day free limit

export async function checkGeminiRateLimit(): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0]
  const { count } = await supabaseAdmin
    .from('aria_ai_calls')
    .select('id', { count: 'exact', head: true })
    .eq('model_provider', 'gemini')
    .gte('created_at', `${today}T00:00:00Z`)
  return (count ?? 0) < MAX_DAILY_GROUNDED
}
