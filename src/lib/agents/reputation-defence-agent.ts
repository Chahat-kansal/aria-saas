import { supabaseAdmin } from '@/lib/supabase-admin'
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
    } catch { /* non-fatal */ }
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
        }>({
          system: 'You analyse customer reviews and return JSON only.',
          user: 'Analyse this review. Return JSON: { "sentiment": "positive"|"neutral"|"negative", "score": -1_to_1, "key_themes": ["string"], "is_crisis": boolean }\n\nCrisis = rating<=2 AND mentions food safety, illness, discrimination, or legal threat.\n\nReview: ' + String(review.review_text ?? ''),
          maxTokens: 200,
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

    // Fetch past posted responses to learn tone
    const { data: posted } = await supabaseAdmin
      .from('business_reviews')
      .select('response_text')
      .eq('business_id', business_id)
      .eq('response_status', 'posted')
      .not('response_text', 'is', null)
      .limit(5)

    const toneExamples = (posted ?? []).map(p => p.response_text).filter(Boolean).join('\n---\n')

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
        if (biz?.user_id && process.env.TWILIO_ACCOUNT_SID) {
          const { data: profile } = await supabaseAdmin.from('staff_members').select('phone').eq('user_id', biz.user_id).maybeSingle()
          if (profile?.phone) {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const twilio = require('twilio') as { default: (sid: string, token: string | undefined) => { messages: { create: (opts: Record<string, string>) => Promise<unknown> } } }
            const client = twilio.default(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
            await client.messages.create({
              body: 'URGENT: ' + String(bizName) + ' has received ' + String(neg24h) + ' negative reviews in the last 24 hours. Auto-responses have been paused. Log in to manage your reputation.',
              from: process.env.TWILIO_FROM_NUMBER ?? '',
              to: String(profile.phone),
            })
          }
        }
      } catch { /* non-fatal */ }

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
          .select('name,phone,email,marketing_opt_in')
          .eq('id', sale.customer_id)
          .maybeSingle()
        if (!customer || !customer.marketing_opt_in) continue

        const firstName = String(customer.name ?? 'there').split(' ')[0]
        const msg = 'Hi ' + firstName + '! Hope you enjoyed your visit to ' + String(bizName) + '. Mind leaving us a quick Google review? It means a lot: ' + reviewLink
        let channel: 'sms' | 'email' | null = null

        if (customer.phone && process.env.TWILIO_ACCOUNT_SID) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const twilio = require('twilio') as { default: (sid: string, token: string | undefined) => { messages: { create: (opts: Record<string, string>) => Promise<unknown> } } }
            const client = twilio.default(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
            await client.messages.create({ body: msg, from: process.env.TWILIO_FROM_NUMBER ?? '', to: String(customer.phone) })
            channel = 'sms'
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
          } catch { /* non-fatal */ }
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
}
