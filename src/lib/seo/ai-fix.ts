import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { trackAICall } from '@/lib/aria/ai-telemetry'

const MODEL = 'claude-haiku-4-5-20251001'
// Bound cost/time: only critical+warning, capped. ~$0.20–0.50 per audit.
const MAX_FIXES = 30

export interface FixableIssue {
  id: string
  issue_type: string
  severity: string
  page_url: string
  detail: string | null
}

/**
 * Generate concrete fix text via Haiku for every CRITICAL or WARNING issue (never info).
 * Writes the result to seo_issues.ai_fix_text (+ suggested_fix for the dashboard).
 */
export async function generateFixes(
  businessId: string,
  issues: FixableIssue[],
  biz: { name?: string | null; city?: string | null }
): Promise<number> {
  if (!process.env.ANTHROPIC_API_KEY) return 0
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const targets = issues
    .filter(i => i.severity === 'critical' || i.severity === 'warning')
    .sort((a, b) => (a.severity === 'critical' ? 0 : 1) - (b.severity === 'critical' ? 0 : 1))
    .slice(0, MAX_FIXES)

  const where = `${biz.name ? ' called ' + biz.name : ''}${biz.city ? ' in ' + biz.city : ''}`
  let done = 0

  for (const issue of targets) {
    const prompt = `You are an SEO expert advising an Australian small business${where}. ` +
      `Issue: ${issue.issue_type} on ${issue.page_url}. Context: ${issue.detail ?? ''}. ` +
      `Write a 2-3 sentence fix the owner can apply in their CMS or hand to their developer. ` +
      `Be concrete: give the exact text or code to paste where possible. Output only the fix — no preamble, no markdown headers.`
    try {
      const msg = await trackAICall(
        { route: 'seo/crawl', model: MODEL, businessId, purpose: 'seo_fix' },
        () => anthropic.messages.create({
          model: MODEL,
          max_tokens: 400,
          messages: [{ role: 'user', content: prompt }],
        })
      )
      const text = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : ''
      if (text) {
        await supabaseAdmin.from('seo_issues')
          .update({ ai_fix_text: text, suggested_fix: text, fix_format: 'guidance', state: 'suggested' })
          .eq('id', issue.id)
        done++
      }
    } catch { /* one failure must not abort the batch */ }
  }
  return done
}
