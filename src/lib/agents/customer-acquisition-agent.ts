import { supabaseAdmin } from '@/lib/supabase-admin'
import { BaseAgent } from './base-agent'
import type { AgentType, AgentRunResult, AgentDecisionInput } from './types'

interface GBPDetails {
  name?: string
  formatted_address?: string
  formatted_phone_number?: string
  website?: string
  opening_hours?: { weekday_text?: string[] }
  photos?: unknown[]
  rating?: number
  user_ratings_total?: number
  price_level?: number
}

export class CustomerAcquisitionAgent extends BaseAgent {
  type: AgentType = 'customer_acquisition'

  async run(business_id: string): Promise<AgentRunResult> {
    const start = Date.now()
    const decisions: AgentDecisionInput[] = []
    const errors: Error[] = []

    try {
      const settings = await this.getSettings(business_id)
      if (!settings.enabled) return { decisions: [], errors: [], duration_ms: Date.now() - start }
      const autoMode = String(settings.config.response_mode ?? 'suggest') === 'auto'

      const { data: biz } = await supabaseAdmin
        .from('businesses')
        .select('name,industry,city,address,phone,website,description,google_place_id,google_average_rating,google_total_reviews')
        .eq('id', business_id)
        .maybeSingle()
      if (!biz) return { decisions: [], errors: [], duration_ms: Date.now() - start }

      // STEP 1: Build AEO profile
      let gbpDetails: GBPDetails = {}
      if (biz.google_place_id && process.env.GOOGLE_PLACES_API_KEY) {
        try {
          const fields = 'name,formatted_address,formatted_phone_number,website,opening_hours,photos,rating,user_ratings_total,price_level'
          const url = 'https://maps.googleapis.com/maps/api/place/details/json?place_id=' + String(biz.google_place_id) + '&fields=' + fields + '&key=' + process.env.GOOGLE_PLACES_API_KEY
          const res = await fetch(url)
          const data = await res.json() as { result?: GBPDetails }
          gbpDetails = data.result ?? {}
        } catch { /* non-fatal */ }
      }

      // Score: google_business_score (max 40 in weighted formula but scored out of 100)
      let gbpScore = 0
      if (gbpDetails.name ?? biz.name) gbpScore += 10
      if (gbpDetails.formatted_address ?? biz.address) gbpScore += 10
      if (gbpDetails.formatted_phone_number ?? biz.phone) gbpScore += 10
      if (gbpDetails.website ?? biz.website) gbpScore += 10
      const hoursCount = (gbpDetails.opening_hours?.weekday_text ?? []).length
      if (hoursCount >= 7) gbpScore += 15
      else if (hoursCount > 0) gbpScore += 7
      const photoCount = (gbpDetails.photos ?? []).length
      gbpScore += Math.min(15, photoCount)
      if (biz.description && String(biz.description).length > 100) gbpScore += 10
      gbpScore = Math.min(100, gbpScore)

      // Review velocity score
      const rating = Number(gbpDetails.rating ?? biz.google_average_rating ?? 0)
      const reviewCount = Number(gbpDetails.user_ratings_total ?? biz.google_total_reviews ?? 0)
      let reviewScore = 0
      if (rating >= 4.0) reviewScore += 30
      else if (rating >= 3.5) reviewScore += 15
      if (reviewCount >= 100) reviewScore += 30
      else if (reviewCount >= 50) reviewScore += 20
      else if (reviewCount >= 20) reviewScore += 10

      // Check response rate
      const { count: totalReviews } = await supabaseAdmin
        .from('business_reviews').select('id', { count: 'exact', head: true }).eq('business_id', business_id)
      const { count: respondedReviews } = await supabaseAdmin
        .from('business_reviews').select('id', { count: 'exact', head: true }).eq('business_id', business_id).eq('response_status', 'posted')
      const responseRate = (totalReviews ?? 0) > 0 ? ((respondedReviews ?? 0) / (totalReviews ?? 1)) * 100 : 0
      if (responseRate >= 80) reviewScore += 20
      else if (responseRate >= 50) reviewScore += 10
      reviewScore = Math.min(100, reviewScore)

      // Content freshness score
      const d7 = new Date(Date.now() - 7 * 86400000).toISOString()
      const d30 = new Date(Date.now() - 30 * 86400000).toISOString()
      const d90 = new Date(Date.now() - 90 * 86400000).toISOString()
      let contentScore = 0

      const { count: recentGBPPost } = await supabaseAdmin
        .from('aeo_content_pieces').select('id', { count: 'exact', head: true })
        .eq('business_id', business_id).eq('content_type', 'google_post').gte('created_at', d7)
        .then(r => r, () => ({ count: 0 }))
      if ((recentGBPPost ?? 0) > 0) contentScore += 30
      else {
        const { count: recentGBPPost30 } = await supabaseAdmin
          .from('aeo_content_pieces').select('id', { count: 'exact', head: true })
          .eq('business_id', business_id).eq('content_type', 'google_post').gte('created_at', d30)
          .then(r => r, () => ({ count: 0 }))
        if ((recentGBPPost30 ?? 0) > 0) contentScore += 15
      }

      const { count: recentComPost } = await supabaseAdmin
        .from('aeo_content_pieces').select('id', { count: 'exact', head: true })
        .eq('business_id', business_id).eq('content_type', 'community_post').gte('created_at', d7)
        .then(r => r, () => ({ count: 0 }))
      if ((recentComPost ?? 0) > 0) contentScore += 20

      const { count: updatedProducts } = await supabaseAdmin
        .from('pos_products').select('id', { count: 'exact', head: true })
        .eq('business_id', business_id).gte('updated_at', d90).not('description', 'is', null)
        .then(r => r, () => ({ count: 0 }))
      if ((updatedProducts ?? 0) >= 5) contentScore += 30
      else if ((updatedProducts ?? 0) > 0) contentScore += 15
      contentScore = Math.min(100, contentScore)

      const overall_aeo_score = Math.round(gbpScore * 0.4 + reviewScore * 0.35 + contentScore * 0.25)

      // Missing fields
      const missingFields: string[] = []
      if (!biz.address && !gbpDetails.formatted_address) missingFields.push('physical_address')
      if (!biz.phone && !gbpDetails.formatted_phone_number) missingFields.push('phone_number')
      if (!biz.website && !gbpDetails.website) missingFields.push('website')
      if (!biz.description || String(biz.description).length < 100) missingFields.push('business_description')
      if (hoursCount < 7) missingFields.push('opening_hours_all_days')
      if (photoCount < 5) missingFields.push('photos_5_plus')
      if (reviewCount < 20) missingFields.push('min_20_reviews')

      // STEP 2: Gap analysis via Sonnet
      let recommendations: Array<{ field: string; action: string; impact: string; effort: string; priority: number }> = []
      try {
        const recs = await this.claudeStructured<{ recommendations: typeof recommendations }>({
          system: 'You are an AEO (Answer Engine Optimisation) expert for Australian SMBs. Return JSON only.',
          user: 'Business: "' + String(biz.name) + '", ' + String(biz.industry ?? 'retail') + ' in ' + String(biz.city ?? 'Australia') + '.\n' +
            'AEO Score: ' + String(overall_aeo_score) + '/100. Missing: ' + missingFields.join(', ') + '.\n' +
            'Reviews: ' + String(reviewCount) + ' total, rating ' + String(rating.toFixed(1)) + '.\n' +
            'Identify top 5 specific AEO improvements for ChatGPT/Perplexity/Google AI visibility.\n' +
            'Return JSON: { "recommendations": [{ "field": "...", "action": "...", "impact": "high|medium|low", "effort": "minutes|hours|days", "priority": 1-5 }] }',
          maxTokens: 600,
          agent_key: 'customer_acquisition',
          role: 'competitor',
          business_id,
        })
        if (recs?.recommendations) recommendations = recs.recommendations
      } catch { /* non-fatal */ }

      // Upsert AEO profile
      const priceLevel = gbpDetails.price_level
      const priceRange = priceLevel === 1 ? '$' : priceLevel === 2 ? '$$' : priceLevel === 3 ? '$$$' : null
      await supabaseAdmin.from('business_aeo_profiles').upsert({
        business_id,
        google_business_score: gbpScore,
        review_velocity_score: reviewScore,
        content_freshness_score: contentScore,
        overall_aeo_score,
        known_name: gbpDetails.name ?? biz.name,
        known_address: gbpDetails.formatted_address ?? biz.address,
        known_phone: gbpDetails.formatted_phone_number ?? biz.phone,
        known_website: gbpDetails.website ?? biz.website,
        known_hours: gbpDetails.opening_hours?.weekday_text ? gbpDetails.opening_hours.weekday_text : null,
        known_price_range: priceRange,
        missing_fields: missingFields,
        improvement_recommendations: recommendations,
        last_updated: new Date().toISOString(),
      }, { onConflict: 'business_id' })

      // STEP 3: Auto-fix — generate description if missing/short
      const descLen = String(biz.description ?? '').length
      if (descLen < 150) {
        const { data: topProducts } = await supabaseAdmin
          .from('pos_products').select('name').eq('business_id', business_id).eq('is_active', true).limit(5)
        const productNames = (topProducts ?? []).map(p => String(p.name)).join(', ')
        const desc = await this.claudeReason({
          system: 'Write factual, specific business descriptions for AI search engines. 150-200 words.',
          user: 'Write a description for "' + String(biz.name) + '", an Australian ' + String(biz.industry ?? 'business') + ' in ' + String(biz.city ?? 'Australia') + '. Top items: ' + (productNames || 'various products') + '. Include suburb name, what makes them special. Factual and specific for AI search.',
          maxTokens: 250,
          agent_key: 'customer_acquisition',
          role: 'narrative',
          business_id,
        })
        if (desc) {
          await supabaseAdmin.from('businesses').update({ description: desc }).eq('id', business_id)
          await supabaseAdmin.from('aeo_content_pieces').insert({
            business_id,
            content_type: 'business_description',
            title: 'Business description for ' + String(biz.name),
            content: desc,
            target_queries: ['best ' + String(biz.industry) + ' in ' + String(biz.city ?? ''), String(biz.name) + ' review'],
            created_by: 'agent',
          })
        }
      }

      // Generate FAQ content
      const { count: faqCount } = await supabaseAdmin
        .from('aeo_content_pieces').select('id', { count: 'exact', head: true })
        .eq('business_id', business_id).eq('content_type', 'faq_entry')
        .then(r => r, () => ({ count: 0 }))

      if ((faqCount ?? 0) < 3) {
        const faqs = await this.claudeStructured<Array<{ q: string; a: string }>>({
          system: 'Generate Q&A FAQ entries that answer common AI assistant queries about a business. Return JSON array.',
          user: 'Generate 5 FAQ Q&A pairs for "' + String(biz.name) + '", a ' + String(biz.industry ?? 'business') + ' in ' + String(biz.city ?? 'Australia') + '. Include: opening hours, location, what they serve, price range, parking. Return: [{ "q": "...", "a": "..." }]',
          maxTokens: 400,
          agent_key: 'customer_acquisition',
          role: 'customer',
          business_id,
        })
        if (faqs && faqs.length > 0) {
          for (const faq of faqs.slice(0, 5)) {
            await supabaseAdmin.from('aeo_content_pieces').insert({
              business_id,
              content_type: 'faq_entry',
              title: faq.q,
              content: faq.a,
              target_queries: [faq.q],
              created_by: 'agent',
            }).then(() => {}, () => {})
          }
        }
      }

      // STEP 4: Weekly content — Google Post + Community Post
      const { count: recentPost7d } = await supabaseAdmin
        .from('aeo_content_pieces').select('id', { count: 'exact', head: true })
        .eq('business_id', business_id).in('content_type', ['google_post', 'community_post']).gte('created_at', d7)
        .then(r => r, () => ({ count: 0 }))

      if ((recentPost7d ?? 0) === 0) {
        const suburb = String(biz.city ?? '').split(',')[0].trim()
        const postContent = await this.claudeReason({
          system: 'Write AI-citation-optimised social posts for local businesses. First sentence answers a question. Include location, hours, price.',
          user: 'Write a 100-word Google Business Post for "' + String(biz.name) + '" in ' + suburb + '. Start with a factual statement answering "where to find good ' + String(biz.industry) + ' in ' + suburb + '". Include address, hours if known, 1-2 signature items with prices if known.',
          maxTokens: 180,
          agent_key: 'customer_acquisition',
          role: 'social',
          business_id,
        })
        if (postContent) {
          await supabaseAdmin.from('aeo_content_pieces').insert({
            business_id,
            content_type: 'google_post',
            title: 'Weekly spotlight — ' + String(biz.name),
            content: postContent,
            target_queries: ['best ' + String(biz.industry) + ' in ' + suburb, String(biz.industry) + ' near me ' + suburb],
            created_by: 'agent',
          })
        }
      }

      // STEP 5: Competitor AEO comparison
      const { data: competitors } = await supabaseAdmin
        .from('aria_competitor_watches')
        .select('competitor_name,competitor_data')
        .eq('business_id', business_id)
        .eq('is_active', true)
        .limit(3)
        .then(r => r, () => ({ data: null }))

      if (competitors && competitors.length > 0) {
        const compData = competitors[0]
        const compInfo = compData.competitor_data as Record<string, unknown> | null
        const compRating = Number((compInfo as Record<string, unknown> | null)?.rating ?? 0)
        const compReviews = Number((compInfo as Record<string, unknown> | null)?.user_ratings_total ?? 0)
        if (compRating > rating || compReviews > reviewCount) {
          decisions.push({
            agent_type: 'customer_acquisition',
            business_id,
            decision_data: {
              your_score: overall_aeo_score,
              competitor: String(compData.competitor_name),
              your_rating: rating,
              comp_rating: compRating,
              your_reviews: reviewCount,
              comp_reviews: compReviews,
            },
            reasoning: 'Competitor "' + String(compData.competitor_name) + '" has stronger AI search signals: ' +
              String(compReviews) + ' reviews vs your ' + String(reviewCount) + '. Increase review requests.',
            confidence_score: 0.8,
            projected_impact_cents: Math.max(5000, Math.round((compReviews - reviewCount) * 500)),
            expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
            status: 'pending',
          })
        }
      }

      // STEP 6: Top 3 recommendations as decisions
      for (const rec of recommendations.slice(0, 3)) {
        decisions.push({
          agent_type: 'customer_acquisition',
          business_id,
          decision_data: { field: rec.field, action: rec.action, impact: rec.impact, effort: rec.effort },
          reasoning: 'AEO improvement (' + rec.impact + ' impact, ' + rec.effort + '): ' + rec.action,
          confidence_score: rec.impact === 'high' ? 0.9 : 0.7,
          projected_impact_cents: rec.impact === 'high' ? 150000 : rec.impact === 'medium' ? 50000 : 20000,
          expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
          status: 'pending',
        })
      }
      void autoMode

    } catch (e) {
      errors.push(e instanceof Error ? e : new Error(String(e)))
    }

    const savedDecisions = decisions.length > 0 ? await this.saveDecisions(decisions) : []
    const result: AgentRunResult = { decisions: savedDecisions, errors, duration_ms: Date.now() - start }
    await this.logRun(business_id, result)
    return result
  }
}
