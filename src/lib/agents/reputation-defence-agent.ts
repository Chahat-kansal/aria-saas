import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendSMS } from '@/lib/clicksend'
import { BaseAgent } from './base-agent'
import type { AgentType, AgentRunResult, AgentDecisionInput } from './types'

export class ReputationDefenceAgent extends BaseAgent {
  type: AgentType = 'reputation_defence'

  async run(business_id: string): Promise<AgentRunResult> {
    const start = Date.now()
    const decisions: AgentDecisionInput[] = []
    const errors: Error[] = []

    try {
      const settings = await this.getSettings(business_id)
      if (!settings.enabled) return { decisions: [], errors: [], duration_ms: Date.now() - start }

      const { data: biz } = await supabaseAdmin
        .from('businesses')
        .select('name,industry,city,google_place_id')
        .eq('id', business_id)
        .maybeSingle()
      if (!biz) return { decisions: [], errors: [], duration_ms: Date.now() - start }

      // STEP 1: Sync Google reviews into business_reviews
      await this.syncGoogleReviews(business_id, String(biz.google_place_id ?? ''))

      // STEP 2: Sentiment analysis on new reviews
      await this.analyseNewReviews(business_id)

      // STEP 3: Draft responses
      const drafted = await this.draftResponses(business_id, biz.name, biz.industry, settings.config)

      // STEP 4: Review velocity monitoring
      const velocityDecisions = await this.checkReviewVelocity(business_id, biz.name)
      decisions.push(...velocityDecisions)

      // STEP 5: Proactive review requests
      await this.sendReviewRequests(business_id, biz.name, biz.google_place_id, settings.config)

      // STEP 6: Competitor rating benchmarking
      const compDecisions = await this.benchmarkCompetitorRatings(business_id, biz.name)
      decisions.push(...compDecisions)

    } catch (e) {
      errors.push(e instanceof Error ? e : new Error(String(e)))
    }

    const savedDecisions = decisions.length > 0
      ? await this.saveDecisions(decisions)
      : []
    const result: AgentRunResult = { decisions: savedDecisions, errors, duration_ms: Date.now() - start }
    await this.logRun(business_id, result)
    return result
  }

  private async syncGoogleReviews(business_id: string, place_id: string): Promise<void> {
    if (!place_id || !process.env.GOOGLE_PLACES_API_KEY) return
    try {
      const url = 'https://maps.googleapis.com/maps/api/place/details/json?place_id=' + place_id +
        '&fields=reviews&key=' + process.env.GOOGLE_PLACES_API_KEY
      const res = await fetch(url)
      const data = await res.json() as { result?: { reviews?: Array<{ author_name: string; profile_photo_url?: string; rating: number; text: string; time: number; author_url?: string }> } }
      const reviews = data.result?.reviews ?? []

      for (const r of reviews) {
        const external_id = 'g_' + r.time + '_' + (r.author_url ?? r.author_name).replace(/\W/g, '')
        await supabaseAdmin.from('business_reviews').upsert({
          business_id,
          platform: 'google',
          external_id,
          reviewer_name: r.author_name,
          reviewer_photo_url: r.profile_photo_url ?? null,
          rating: r.rating,
          review_text: r.text,
          review_date: new Date(r.time * 1000).toISOString(),
        }, { onConflict: 'business_id,platform,external_id', ignoreDuplicates: true })
      }
    } catch (e) { console.error('[non-fatal]', e) }
  }

  private async analyseNewReviews(business_id: string): Promise<void> {
    const { data: newReviews } = await supabaseAdmin
      .from('business_reviews')
      .select('id,rating,review_text')
      .eq('business_id', business_id)
      .is('sentiment', null)
      .not('review_text', 'is', null)
      .limit(20)

    for (const review of newReviews ?? []) {
      try {
        const result = await this.claudeStructured<{
          sentiment: 'positive' | 'neutral' | 'negative'
          score: number
          key_themes: string[]
          is_crisis: boolean
          aspect_scores: { food: number | null; service: number | null; ambiance: number | null; value: number | null }
        }>({
          system: 'You analyse customer reviews and return JSON only.',
          user: 'Analyse this review. Return JSON:\n' +
            '{ "sentiment": "positive"|"neutral"|"negative", "score": -1_to_1, "key_themes": ["string"], "is_crisis": boolean,\n' +
            '  "aspect_scores": { "food": -1_to_1_or_null, "service": -1_to_1_or_null, "ambiance": -1_to_1_or_null, "value": -1_to_1_or_null } }\n\n' +
            'aspect_scores: score each aspect -1 (very negative) to 1 (very positive); null if not mentioned.\n' +
            'Crisis = rating<=2 AND mentions food safety, illness, discrimination, or legal threat.\n\n' +
            'Review (rating ' + String(review.rating) + '/5): ' + String(review.review_text ?? ''),
          maxTokens: 250,
          agent_key: 'reputation_defence',
          role: 'analysis',
          business_id,
        })
        if (result) {
          await supabaseAdmin.from('business_reviews').update({
            sentiment: result.sentiment,
            sentiment_score: result.score,
            key_themes: result.key_themes,
            is_crisis: result.is_crisis,
            aspect_scores: result.aspect_scores ?? null,
          }).eq('id', review.id)
        }
      } catch { /* per-review non-fatal */ }
    }
  }

  private async draftResponses(
    business_id: string,
    bizName: string,
    industry: string,
    config: Record<string, unknown>,
  ): Promise<number> {
    const autoMode = String(config.response_mode ?? 'suggest') === 'auto'

    // Fetch past posted review+response pairs to teach tone and avoid repetition
    const { data: posted } = await supabaseAdmin
      .from('business_reviews')
      .select('rating,review_text,response_text')
      .eq('business_id', business_id)
      .eq('response_status', 'posted')
      .not('response_text', 'is', null)
      .order('response_posted_at', { ascending: false })
      .limit(8)

    const toneExamples = (posted ?? [])
      .filter(p => p.response_text)
      .map(p => '[' + String(p.rating) + '★] Review: "' + String(p.review_text ?? '').slice(0, 80) + '…"\nResponse: ' + String(p.response_text))
      .join('\n---\n')

    const { data: pending } = await supabaseAdmin
      .from('business_reviews')
      .select('id,rating,reviewer_name,review_text,key_themes,is_crisis')
      .eq('business_id', business_id)
      .eq('response_status', 'pending')
      .is('response_text', null)
      .lte('rating', 4)
      .limit(10)

    let drafted = 0
    for (const review of pending ?? []) {
      if (review.is_crisis) continue // never auto-draft crisis reviews
      try {
        const firstName = String(review.reviewer_name ?? 'there').split(' ')[0]
        const themes = Array.isArray(review.key_themes) ? review.key_themes.join(', ') : ''
        const draft = await this.claudeReason({
          system: 'You draft authentic, warm review responses for Australian businesses. Keep responses 2-4 sentences.',
          user: 'Draft a response for ' + bizName + ', an Australian ' + String(industry ?? 'business') + '.\n' +
            'Reviewer ' + firstName + ' gave ' + String(review.rating) + ' stars: "' + String(review.review_text ?? '') + '"\n' +
            (themes ? 'Key themes: ' + themes + '\n' : '') +
            "Write a response that: uses their first name, acknowledges specific feedback, doesn't make excuses, " +
            (Number(review.rating) <= 2 ? 'offers a path to resolution, ' : '') +
            "feels warm and personal not corporate. Never say 'valued customer' or 'we strive to'.\n" +
            (toneExamples ? 'Match this response tone:\n' + toneExamples : ''),
          maxTokens: 200,
          agent_key: 'reputation_defence',
          role: 'narrative',
          business_id,
        })
        if (draft) {
          const newStatus = (autoMode && Number(review.rating) >= 4) ? 'approved' : 'pending'
          await supabaseAdmin.from('business_reviews').update({
            response_text: draft,
            response_status: newStatus,
            response_drafted_by: 'agent',
          }).eq('id', review.id)
          drafted++
        }
      } catch { /* per-review non-fatal */ }
    }
    return drafted
  }

  private async checkReviewVelocity(business_id: string, bizName: string): Promise<AgentDecisionInput[]> {
    const decisions: AgentDecisionInput[] = []
    const now = new Date()
    const h24 = new Date(now.getTime() - 24 * 3600000).toISOString()
    const d7 = new Date(now.getTime() - 7 * 86400000).toISOString()
    const d14 = new Date(now.getTime() - 14 * 86400000).toISOString()

    const { count: neg24h } = await supabaseAdmin
      .from('business_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business_id)
      .lte('rating', 2)
      .gte('review_date', h24)

    if ((neg24h ?? 0) >= 3) {
      // Crisis alert — suspend auto-reply and notify
      await supabaseAdmin.from('business_reviews').update({ response_status: 'pending' })
        .eq('business_id', business_id).eq('response_status', 'approved')
      try {
        const { data: biz } = await supabaseAdmin.from('businesses').select('user_id,name').eq('id', business_id).maybeSingle()
        if (biz?.user_id) {
          const { data: profile } = await supabaseAdmin.from('staff_members').select('phone').eq('user_id', biz.user_id).maybeSingle()
          if (profile?.phone) {
            // AUD-1: ClickSend SMS helper (Twilio npm pkg dropped); no-op if SMS unconfigured.
            await sendSMS(
              String(profile.phone),
              'URGENT: ' + String(bizName) + ' has received ' + String(neg24h) + ' negative reviews in the last 24 hours. Auto-responses have been paused. Log in to manage your reputation.',
            )
          }
        }
      } catch (e) { console.error('[non-fatal]', e) }

      await supabaseAdmin.from('aria_autopilot_actions').insert({
        business_id,
        agent_type: 'reputation_defence',
        action_type: 'alert',
        description: 'CRISIS: ' + String(neg24h) + ' negative reviews in 24h. Auto-responses paused. Immediate owner attention required.',
        status: 'pending',
      }).then(() => {}, () => {})
    }

    // Weekly velocity
    const { count: thisWeek } = await supabaseAdmin
      .from('business_reviews').select('id', { count: 'exact', head: true })
      .eq('business_id', business_id).gte('review_date', d7)
    const { count: lastWeek } = await supabaseAdmin
      .from('business_reviews').select('id', { count: 'exact', head: true })
      .eq('business_id', business_id).gte('review_date', d14).lt('review_date', d7)

    if ((thisWeek ?? 0) > 0 && (lastWeek ?? 0) === 0 && (thisWeek ?? 0) >= 5) {
      decisions.push({
        agent_type: 'reputation_defence',
        business_id,
        decision_data: { this_week: thisWeek, last_week: lastWeek },
        reasoning: 'Review velocity spike: ' + String(thisWeek) + ' reviews this week vs ' + String(lastWeek) + ' last week',
        confidence_score: 0.8,
        projected_impact_cents: Math.round((thisWeek ?? 0) * 5000),
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      })
    }

    return decisions
  }

  private async sendReviewRequests(
    business_id: string,
    bizName: string,
    google_place_id: unknown,
    config: Record<string, unknown>,
  ): Promise<void> {
    const delayHours = Number(config.request_delay_hours ?? 2)
    const minAmount = Number(config.min_sale_amount ?? 15)
    const now = new Date()
    const windowStart = new Date(now.getTime() - (delayHours + 24) * 3600000).toISOString()
    const windowEnd = new Date(now.getTime() - delayHours * 3600000).toISOString()

    const { data: sales } = await supabaseAdmin
      .from('pos_sales')
      .select('id, total_amount, customer_id, created_at')
      .eq('business_id', business_id)
      .neq('status', 'voided')
      .gte('created_at', windowStart)
      .lte('created_at', windowEnd)
      .gte('total_amount', minAmount)
      .not('customer_id', 'is', null)

    const placeId = String(google_place_id ?? '')
    const reviewLink = placeId ? 'https://g.page/' + placeId + '/review' : ''

    for (const sale of sales ?? []) {
      try {
        // Check no request sent in last 90 days
        const d90 = new Date(now.getTime() - 90 * 86400000).toISOString()
        const { count: existing } = await supabaseAdmin
          .from('review_requests')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', business_id)
          .eq('customer_id', sale.customer_id)
          .gte('sent_at', d90)
        if ((existing ?? 0) > 0) continue

        const { data: customer } = await supabaseAdmin
          .from('pos_customers')
          .select('name,phone,email,marketing_consent')
          .eq('id', sale.customer_id)
          .maybeSingle()
        if (!customer || !customer.marketing_consent) continue

        const firstName = String(customer.name ?? 'there').split(' ')[0]
        const msg = 'Hi ' + firstName + '! Hope you enjoyed your visit to ' + String(bizName) + '. Mind leaving us a quick Google review? It means a lot: ' + reviewLink
        let channel: 'sms' | 'email' | null = null

        if (customer.phone) {
          // AUD-1: ClickSend SMS helper (Twilio npm pkg dropped); ok=false → email fallback.
          try {
            const sms = await sendSMS(String(customer.phone), msg)
            if (sms.ok) channel = 'sms'
          } catch { /* try email */ }
        }
        if (!channel && customer.email && process.env.RESEND_API_KEY) {
          try {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: 'Aria <noreply@ariaos.site>',
                to: String(customer.email),
                subject: 'How was your visit to ' + String(bizName) + '?',
                html: '<p>' + msg.replace(reviewLink, '<a href="' + reviewLink + '">Leave a Google review</a>') + '</p>',
              }),
            })
            channel = 'email'
          } catch (e) { console.error('[non-fatal]', e) }
        }

        if (channel) {
          await supabaseAdmin.from('review_requests').insert({
            business_id,
            customer_id: sale.customer_id,
            sale_id: sale.id,
            channel,
            message_text: msg,
            google_review_link: reviewLink || null,
          })
          await supabaseAdmin.from('aria_autopilot_actions').insert({
            business_id,
            agent_type: 'reputation_defence',
            action_type: 'review_request',
            description: 'Review request sent to ' + String(customer.name) + ' via ' + channel,
            status: 'executed',
          }).then(() => {}, () => {})
        }
      } catch { /* per-customer non-fatal */ }
    }
  }

  private async benchmarkCompetitorRatings(business_id: string, bizName: string): Promise<AgentDecisionInput[]> {
    const decisions: AgentDecisionInput[] = []
    try {
      // Own avg rating from synced reviews
      const { data: ownReviews } = await supabaseAdmin
        .from('business_reviews')
        .select('rating')
        .eq('business_id', business_id)
        .gte('review_date', new Date(Date.now() - 90 * 86400000).toISOString())
      const ownRatings = (ownReviews ?? []).map(r => Number(r.rating)).filter(v => v > 0)
      const ownAvg = ownRatings.length > 0 ? ownRatings.reduce((s, v) => s + v, 0) / ownRatings.length : 0
      const ownCount = ownRatings.length

      const { data: competitors } = await supabaseAdmin
        .from('aria_competitor_watches')
        .select('competitor_name,competitor_data')
        .eq('business_id', business_id)
        .eq('is_active', true)
        .limit(5)
        .then(r => r, () => ({ data: null }))

      for (const comp of competitors ?? []) {
        const info = comp.competitor_data as Record<string, unknown> | null
        const compRating = Number(info?.rating ?? 0)
        const compCount = Number(info?.user_ratings_total ?? info?.review_count ?? 0)
        if (compRating <= 0) continue
        const ratingGap = compRating - ownAvg
        const countGap = compCount - ownCount
        if (ratingGap < 0.2 && countGap < 20) continue // no meaningful gap
        const impactCents = Math.round(Math.max(10000, (ratingGap * 50000) + (countGap * 300)))
        decisions.push({
          agent_type: 'reputation_defence',
          business_id,
          decision_data: {
            type: 'competitor_rating_gap',
            competitor: String(comp.competitor_name),
            your_avg_rating: Math.round(ownAvg * 100) / 100,
            your_review_count_90d: ownCount,
            comp_avg_rating: compRating,
            comp_review_count: compCount,
            rating_gap: Math.round(ratingGap * 100) / 100,
          },
          reasoning: String(bizName) + ' avg ' + ownAvg.toFixed(1) + '★ vs ' + String(comp.competitor_name) + ' ' + String(compRating.toFixed(1)) + '★ — close the gap by increasing review request frequency and resolving recurring complaint themes.',
          confidence_score: 0.78,
          projected_impact_cents: impactCents,
          expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
          status: 'pending',
        })
      }
    } catch (e) { console.error('[non-fatal]', e) }
    return decisions
  }
}
