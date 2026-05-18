import { createServerSupabaseClient } from '@/lib/supabase-server'
import { embedText, isOpenAIAvailable } from '../providers/openai'

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1)
}

export async function findSimilarDismissal(
  proposedTitle: string,
  businessId: string,
): Promise<{ title: string; reason: string; similarity: number } | null> {
  if (!isOpenAIAvailable()) return null
  const supabase = createServerSupabaseClient()

  const cutoff = new Date(Date.now() - 60 * 24 * 3600_000).toISOString()
  const { data: dismissed } = await supabase.from('aria_actions')
    .select('title, reason, payload')
    .eq('business_id', businessId)
    .eq('status', 'dismissed')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(50)

  if (!dismissed?.length) return null

  const proposalEmbedding = await embedText(proposedTitle, businessId)
  if (!proposalEmbedding) return null

  let best: { title: string; reason: string; similarity: number } | null = null
  for (const d of dismissed) {
    const title = String(d.title ?? '')
    if (!title) continue
    const dismissalEmbedding = await embedText(title)
    if (!dismissalEmbedding) continue
    const sim = cosineSimilarity(proposalEmbedding, dismissalEmbedding)
    if (sim > 0.85 && (!best || sim > best.similarity)) {
      best = {
        title,
        reason: String(d.reason ?? (d.payload as Record<string, unknown> | null)?.dismissed_reason ?? 'previously dismissed'),
        similarity: sim,
      }
    }
  }
  return best
}
