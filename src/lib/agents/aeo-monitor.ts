import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'
import { createDecision } from '@/lib/decisions/createDecision'

interface AeoResult {
  appeared: boolean
  position: number | null
  snippet: string | null
  competitors: string[]
  recommendations: string[]
}

export class AeoMonitor {
  private anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  async runForBusiness(business_id: string): Promise<void> {
    const { data: biz } = await supabaseAdmin
      .from('businesses')
      .select('name,industry,city,address,google_average_rating,google_total_reviews,phone,website')
      .eq('id', business_id)
      .maybeSingle()
    if (!biz) return

    const bizName = String(biz.name ?? '')
    const industry = String(biz.industry ?? 'business')
    const city = String(biz.city ?? '')
    const suburb = city.split(',')[0].trim()

    const queries = [
      'best ' + industry + ' in ' + suburb + ' ' + city,
      industry + ' near ' + suburb + ' open now',
      bizName + ' ' + city + ' reviews',
      industry + ' ' + city + ' recommendation',
      industry + ' ' + suburb,
    ]

    for (const query of queries) {
      try {
        const result = await this.checkAiSearch(bizName, query)
        await supabaseAdmin.from('aeo_snapshots').upsert({
          business_id,
          query,
          engine: 'google_aio',
          appeared: result.appeared,
          position: result.position,
          snippet: result.snippet,
          competitor_names: result.competitors,
          recommendations: result.recommendations,
        }, { onConflict: 'business_id,engine,query,date_trunc(\'week\', checked_at)', ignoreDuplicates: false })
      } catch { /* per-query non-fatal */ }
    }

    // Profile completeness check
    await this.checkProfileCompleteness(business_id, biz)
  }

  private async checkAiSearch(bizName: string, query: string): Promise<AeoResult> {
    try {
      const msg = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: 'You are an AI search visibility analyser. When given a business name and search query, simulate what AI search engines would likely return based on typical online presence factors. Return JSON only.',
        messages: [{
          role: 'user',
          content: 'Business: "' + bizName + '"\nQuery: "' + query + '"\n\n' +
            'Based on typical AI search behaviour, estimate if this business would appear. ' +
            'Return JSON: { "appeared": boolean, "position": 1-5_or_null, "snippet": "what_AI_might_say_or_null", "competitors": ["competitor_names"], "recommendations": ["specific_action_items"] }',
        }],
      })
      const raw = msg.content[0]?.type === 'text' ? msg.content[0].text : ''
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const parsed = JSON.parse(cleaned) as AeoResult & { competitors?: string[]; recommendations?: string[] }
      return {
        appeared: Boolean(parsed.appeared),
        position: parsed.position ?? null,
        snippet: parsed.snippet ?? null,
        competitors: Array.isArray(parsed.competitors) ? parsed.competitors : [],
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      }
    } catch {
      return { appeared: false, position: null, snippet: null, competitors: [], recommendations: [] }
    }
  }

  private async checkProfileCompleteness(business_id: string, biz: Record<string, unknown>): Promise<void> {
    const gaps: string[] = []
    if (!biz.phone) gaps.push('Add a phone number to your Google Business Profile for better AI citations')
    if (!biz.website) gaps.push('Add your website URL — AI engines prioritise businesses with a web presence')
    if (!biz.city) gaps.push('Add your full address to improve local AI search visibility')
    const reviews = Number(biz.google_total_reviews ?? 0)
    const rating = Number(biz.google_average_rating ?? 0)
    if (reviews < 20) gaps.push('You have ' + String(reviews) + ' reviews. AI tools need 20+ to confidently recommend a business')
    if (rating < 4.0 && reviews >= 5) gaps.push('Your average rating is ' + String(rating.toFixed(1)) + '. AI tools heavily favour businesses rated 4.0+')
    if (reviews < 5) gaps.push('Actively request reviews from your customers — 5+ reviews is the minimum threshold for AI citations')

    if (gaps.length > 0) {
      // SPINE-1 — same row PLUS a title. TITLE FIX (approved, disclosed): this site wrote a
      // 'pending' row with NO title, which renders as a blank card in the PH-1 Decisions tab — a
      // decision the owner can't read isn't a decision. The title is DERIVED from this row's own
      // existing description prefix ('AEO Profile Gaps: ...'), not invented (GROUNDING-TEETH).
      await createDecision({
        business_id,
        domain: 'growth',
        kind: 'aeo_profile_gaps',
        agent_type: 'reputation_defence',
        action_type: 'recommendation',
        title: 'AEO profile gaps',
        subtitle: 'AEO Profile Gaps: ' + gaps.join(' | '),
      }).catch(() => {})
    }
  }

  async getAeoScore(business_id: string): Promise<{ score: number; snapshots: Array<{ query: string; appeared: boolean; recommendations: string[] }> }> {
    const { data: snapshots } = await supabaseAdmin
      .from('aeo_snapshots')
      .select('query,appeared,recommendations,checked_at')
      .eq('business_id', business_id)
      .order('checked_at', { ascending: false })
      .limit(20)

    const latestByQuery: Record<string, { query: string; appeared: boolean; recommendations: string[] }> = {}
    for (const s of snapshots ?? []) {
      const q = String(s.query)
      if (!latestByQuery[q]) {
        latestByQuery[q] = {
          query: q,
          appeared: Boolean(s.appeared),
          recommendations: Array.isArray(s.recommendations) ? s.recommendations as string[] : [],
        }
      }
    }

    const list = Object.values(latestByQuery)
    const total = list.length
    const appeared = list.filter(s => s.appeared).length
    const score = total > 0 ? Math.round((appeared / total) * 100) : 0

    return { score, snapshots: list }
  }
}
