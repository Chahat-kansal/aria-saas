import { supabaseAdmin } from '@/lib/supabase-admin'
import type { AgentType, AgentRunResult } from './types'
import { BaseAgent } from './base-agent'

// Australian public holidays 2026 (national + key states)
const PUBLIC_HOLIDAYS_2026: string[] = [
  '2026-01-01', '2026-01-26', '2026-04-03', '2026-04-04',
  '2026-04-05', '2026-04-06', '2026-04-25', '2026-06-08',
  '2026-12-25', '2026-12-26', '2026-12-28',
]

function isPublicHoliday(date: Date): boolean {
  const d = date.toISOString().slice(0, 10)
  return PUBLIC_HOLIDAYS_2026.includes(d)
}

function weatherToMultiplier(code: number, maxTemp: number, productCategory: string): number {
  const isCold = code >= 61 // rain
  const isHot = maxTemp > 22
  const isColdTemp = maxTemp < 15
  const cat = (productCategory ?? '').toLowerCase()
  const isHotDrink = cat.includes('coffee') || cat.includes('tea') || cat.includes('hot')
  const isColdDrink = cat.includes('cold') || cat.includes('iced') || cat.includes('juice') || cat.includes('smoothie')

  if (isCold) {
    if (isHotDrink) return 1.15
    if (isColdDrink) return 0.8
    return 0.85
  }
  if (isHot) {
    if (isColdDrink) return 1.1
    if (isHotDrink) return 0.9
    return 1.0
  }
  if (isColdTemp) {
    if (isHotDrink) return 1.2
    if (isColdDrink) return 0.9
    return 1.0
  }
  return 1.0
}

export class WasteEliminationAgent extends BaseAgent {
  type: AgentType = 'waste_elimination'

  async run(business_id: string, targetDate?: Date): Promise<AgentRunResult> {
    const start = Date.now()
    const errors: Error[] = []

    try {
      const tomorrow = targetDate ?? new Date(Date.now() + 86400000)
      const tomorrowStr = tomorrow.toISOString().slice(0, 10)
      const dow = tomorrow.getDay()

      // STEP 1: Fetch products needing prep prediction
      const { data: products } = await supabaseAdmin
        .from('pos_products')
        .select('id,name,cost_price,price,category,prep_time_minutes,shelf_life_hours,waste_threshold_pct')
        .eq('business_id', business_id)
        .eq('is_active', true)
        .or('prep_time_minutes.gt.0,shelf_life_hours.not.is.null')

      if (!products || products.length === 0) {
        return { decisions: [], errors, duration_ms: Date.now() - start}
      }

      // STEP 2: Fetch business location for weather
      const { data: biz } = await supabaseAdmin
        .from('businesses')
        .select('latitude,longitude,state')
        .eq('id', business_id)
        .maybeSingle()

      // Fetch weather forecast
      let weatherCode = 0
      let maxTemp = 20
      if (biz?.latitude && biz?.longitude) {
        try {
          const wRes = await fetch(
            'https://api.open-meteo.com/v1/forecast?latitude=' + biz.latitude + '&longitude=' + biz.longitude +
            '&daily=weathercode,temperature_2m_max&timezone=Australia%2FSydney&forecast_days=2'
          )
          if (wRes.ok) {
            const wd = await wRes.json() as { daily?: { weathercode?: number[]; temperature_2m_max?: number[] } }
            weatherCode = wd.daily?.weathercode?.[1] ?? 0
            maxTemp = wd.daily?.temperature_2m_max?.[1] ?? 20
          }
        } catch { /* weather non-fatal */ }
      }

      const pubHoliday = isPublicHoliday(tomorrow)

      // STEP 3: Build predictions per product
      const predictions: Array<{
        business_id: string
        product_id: string
        prediction_date: string
        day_of_week: number
        weather_code: number
        is_public_holiday: boolean
        predicted_units_sold: number
        prediction_confidence: number
        recommended_prep_qty: number
        recommended_prep_time: string
        prep_guide_narrative: string
      }> = []

      const twelveWeeksAgo = new Date(tomorrow.getTime() - 84 * 86400000).toISOString().slice(0, 10)
      const eightWeeksAgo = new Date(tomorrow.getTime() - 56 * 86400000).toISOString().slice(0, 10)
      const fourWeeksAgo = new Date(tomorrow.getTime() - 28 * 86400000).toISOString().slice(0, 10)

      for (const product of products) {
        try {
          // Historical sales on same day of week for last 12 weeks
          const { data: historicalSales } = await supabaseAdmin
            .from('pos_sale_items')
            .select('quantity, pos_sales!inner(created_at, business_id, status)')
            .eq('product_id', product.id)
            .gte('pos_sales.created_at', twelveWeeksAgo)
            .neq('pos_sales.status', 'voided')
            .eq('pos_sales.business_id', business_id)

          // Group by day and filter to same dow
          const byDay: Record<string, number> = {}
          for (const item of historicalSales ?? []) {
            const saleDate = (item as { pos_sales?: { created_at?: string } }).pos_sales?.created_at?.slice(0, 10)
            if (!saleDate) continue
            const saleDow = new Date(saleDate).getDay()
            if (saleDow !== dow) continue
            byDay[saleDate] = (byDay[saleDate] ?? 0) + Number(item.quantity ?? 0)
          }

          const allUnits = Object.values(byDay).sort((a, b) => a - b)
          if (allUnits.length === 0) continue

          // Median (robust to outliers)
          const mid = Math.floor(allUnits.length / 2)
          const baseUnits = allUnits.length % 2 === 0
            ? (allUnits[mid - 1] + allUnits[mid]) / 2
            : allUnits[mid]

          const p25 = allUnits[Math.floor(allUnits.length * 0.25)] ?? baseUnits * 0.7
          const p75 = allUnits[Math.floor(allUnits.length * 0.75)] ?? baseUnits * 1.3

          // Trend multiplier: last 4 matching days vs prior 4
          const last4Days = Object.entries(byDay).filter(([d]) => d >= fourWeeksAgo).map(([, v]) => v)
          const prior4Days = Object.entries(byDay).filter(([d]) => d >= eightWeeksAgo && d < fourWeeksAgo).map(([, v]) => v)
          const last4Avg = last4Days.length > 0 ? last4Days.reduce((s, v) => s + v, 0) / last4Days.length : baseUnits
          const prior4Avg = prior4Days.length > 0 ? prior4Days.reduce((s, v) => s + v, 0) / prior4Days.length : baseUnits
          const trendMultiplier = prior4Avg > 0 ? Math.min(1.3, Math.max(0.7, last4Avg / prior4Avg)) : 1

          // Weather multiplier
          const weatherMult = weatherToMultiplier(weatherCode, maxTemp, product.category ?? '')

          // Holiday multiplier
          const holidayMult = pubHoliday ? 1.25 : 1.0

          // Sell-through buffer: check if recent predictions show we under-prepped
          const { data: recentPreds } = await supabaseAdmin
            .from('prep_predictions')
            .select('recommended_prep_qty, actual_units_sold')
            .eq('business_id', business_id)
            .eq('product_id', product.id)
            .gte('prediction_date', eightWeeksAgo)
            .not('actual_units_sold', 'is', null)

          const soldOutDays = (recentPreds ?? []).filter(
            p => Number(p.actual_units_sold) >= Number(p.recommended_prep_qty) * 0.95
          ).length
          const sellThroughBuffer = soldOutDays >= 3 ? 1.15 : 1.0

          // Final prediction
          let predicted = baseUnits * trendMultiplier * weatherMult * holidayMult * sellThroughBuffer
          predicted = Math.max(p25 * 0.8, Math.min(p75 * 1.2, predicted))
          predicted = Math.round(predicted * 10) / 10

          // Confidence
          let confidence = 0.5
          if (allUnits.length >= 12) confidence = 0.8
          else if (allUnits.length >= 6) confidence = 0.65
          if (weatherCode >= 61 || pubHoliday) confidence = Math.min(confidence, 0.65)

          // Recommended prep qty and timing
          const shelfLife = Number(product.shelf_life_hours ?? 24)
          let prepQty: number
          let prepTime: string

          if (shelfLife < 4) {
            const batch1 = Math.ceil(predicted * 0.6)
            const batch2 = Math.ceil(predicted * 0.4)
            prepQty = batch1 + batch2
            prepTime = 'Prep ' + batch1 + ' by open. Top up ' + batch2 + ' by midday.'
          } else if (shelfLife < 24) {
            prepQty = Math.ceil(predicted)
            prepTime = 'Prep all ' + prepQty + ' by open time.'
          } else {
            prepQty = Math.ceil(predicted * 1.05)
            prepTime = 'Prep ' + prepQty + ' any time before open.'
          }

          predictions.push({
            business_id,
            product_id: product.id,
            prediction_date: tomorrowStr,
            day_of_week: dow,
            weather_code: weatherCode,
            is_public_holiday: pubHoliday,
            predicted_units_sold: predicted,
            prediction_confidence: confidence,
            recommended_prep_qty: prepQty,
            recommended_prep_time: prepTime,
            prep_guide_narrative: '',
          })
        } catch (e) {
          errors.push(e instanceof Error ? e : new Error(String(e)))
        }
      }

      if (predictions.length === 0) {
        return { decisions: [], errors, duration_ms: Date.now() - start}
      }

      // STEP 3b: Generate narrative prep briefing via Haiku
      const topItems = [...predictions]
        .sort((a, b) => b.recommended_prep_qty - a.recommended_prep_qty)
        .slice(0, 6)
        .map(p => {
          const prod = products.find(pr => pr.id === p.product_id)
          return (prod?.name ?? 'Item') + ': prep ' + p.recommended_prep_qty + ' (' + p.recommended_prep_time + ')'
        })
        .join('\n')

      let narrative = 'Prep guide for ' + tomorrowStr + ': ' + topItems
      try {
        const resp = await this.anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: 'Write a kitchen briefing in 3-4 sentences for tomorrow (' + tomorrowStr + ').' +
              ' Weather code: ' + weatherCode + ', max temp: ' + maxTemp + 'C.' +
              (pubHoliday ? ' Public holiday — expect higher traffic.' : '') +
              ' Prep plan:\n' + topItems +
              '\nHighlight top 3 items, mention weather if notable. Tone: practical, like a head chef briefing.',
          }],
        })
        narrative = (resp.content[0] as { type: string; text: string }).type === 'text'
          ? (resp.content[0] as { text: string }).text
          : narrative
      } catch { /* non-fatal */ }

      // Attach narrative to all predictions
      for (const p of predictions) {
        p.prep_guide_narrative = narrative
      }

      // STEP 4: Upsert predictions
      await supabaseAdmin
        .from('prep_predictions')
        .upsert(predictions, { onConflict: 'business_id,product_id,prediction_date' })

      // STEP 5: Send SMS prep guide (9pm trigger)
      if (process.env.TWILIO_ACCOUNT_SID) {
        const { data: bizContact } = await supabaseAdmin
          .from('businesses')
          .select('phone')
          .eq('id', business_id)
          .maybeSingle()
        const phone = (bizContact as { phone?: string } | null)?.phone
        if (phone) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const twilio = require('twilio') as { default: (sid: string, token: string | undefined) => { messages: { create: (opts: Record<string, string>) => Promise<unknown> } } }
            const client = twilio.default(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
            const smsBody = 'Aria Prep Guide for ' + tomorrowStr + ':\n' + narrative.slice(0, 300)
            await client.messages.create({ body: smsBody, from: process.env.TWILIO_FROM_NUMBER ?? '', to: phone })
          } catch { /* SMS non-fatal */ }
        }
      }

      return {
        decisions: [],
        errors,
        duration_ms: Date.now() - start,
      }
    } catch (e) {
      errors.push(e instanceof Error ? e : new Error(String(e)))
      return { decisions: [], errors, duration_ms: Date.now() - start}
    }
  }

  async runNoonCheck(business_id: string): Promise<void> {
    const todayStr = new Date().toISOString().slice(0, 10)

    const { data: todayPreds } = await supabaseAdmin
      .from('prep_predictions')
      .select('id,product_id,recommended_prep_qty,promotion_triggered')
      .eq('business_id', business_id)
      .eq('prediction_date', todayStr)

    for (const pred of todayPreds ?? []) {
      if (pred.promotion_triggered) continue

      // Get actual sales so far today
      const midnightToday = new Date()
      midnightToday.setHours(0, 0, 0, 0)
      const { data: salesItems } = await supabaseAdmin
        .from('pos_sale_items')
        .select('quantity, pos_sales!inner(created_at, business_id, status)')
        .eq('product_id', pred.product_id)
        .gte('pos_sales.created_at', midnightToday.toISOString())
        .neq('pos_sales.status', 'voided')
        .eq('pos_sales.business_id', business_id)

      const actualSoFar = (salesItems ?? []).reduce((s, i) => s + Number(i.quantity ?? 0), 0)
      const projectedEod = actualSoFar * 2

      const overPrepped = Number(pred.recommended_prep_qty) - projectedEod

      // Check shelf life
      const { data: product } = await supabaseAdmin
        .from('pos_products')
        .select('shelf_life_hours,name')
        .eq('id', pred.product_id)
        .maybeSingle()

      if (overPrepped > 3 && Number(product?.shelf_life_hours ?? 24) < 6) {
        // Trigger flash promotion
        try {
          const closeTime = new Date()
          closeTime.setHours(22, 0, 0, 0)

          const { data: promo } = await supabaseAdmin
            .from('pos_promotions')
            .insert({
              business_id,
              name: 'Today Special — ' + (product?.name ?? 'Item'),
              discount_pct: 20,
              product_ids: [pred.product_id],
              valid_from: new Date().toISOString(),
              valid_until: closeTime.toISOString(),
              is_active: true,
              created_by: 'waste_agent',
            })
            .select('id')
            .maybeSingle()

          await supabaseAdmin
            .from('prep_predictions')
            .update({ promotion_triggered: true, promotion_id: promo?.id ?? null })
            .eq('id', pred.id)
        } catch { /* promo creation non-fatal */ }
      }
    }
  }

  async runEndOfDay(business_id: string): Promise<void> {
    const todayStr = new Date().toISOString().slice(0, 10)
    const midnightToday = new Date()
    midnightToday.setHours(0, 0, 0, 0)

    const { data: todayPreds } = await supabaseAdmin
      .from('prep_predictions')
      .select('id,product_id,recommended_prep_qty,prediction_confidence')
      .eq('business_id', business_id)
      .eq('prediction_date', todayStr)
      .is('actual_units_sold', null)

    for (const pred of todayPreds ?? []) {
      const { data: salesItems } = await supabaseAdmin
        .from('pos_sale_items')
        .select('quantity, pos_sales!inner(created_at, business_id, status)')
        .eq('product_id', pred.product_id)
        .gte('pos_sales.created_at', midnightToday.toISOString())
        .neq('pos_sales.status', 'voided')
        .eq('pos_sales.business_id', business_id)

      const actualSold = (salesItems ?? []).reduce((s, i) => s + Number(i.quantity ?? 0), 0)
      const wasteUnits = Math.max(0, Number(pred.recommended_prep_qty) - actualSold)

      const { data: product } = await supabaseAdmin
        .from('pos_products')
        .select('cost_price')
        .eq('id', pred.product_id)
        .maybeSingle()

      const costPerUnit = Number((product as { cost_price?: number } | null)?.cost_price ?? 0)
      const wasteValue = wasteUnits * costPerUnit
      const predError = actualSold > 0
        ? Math.abs(Number(pred.recommended_prep_qty) - actualSold) / actualSold * 100
        : 0

      await supabaseAdmin
        .from('prep_predictions')
        .update({
          actual_units_sold: actualSold,
          actual_waste_units: wasteUnits,
          actual_waste_value: wasteValue,
          prediction_error_pct: Math.round(predError * 10) / 10,
          waste_reason: wasteUnits > 0 ? 'over_prepped' : null,
        })
        .eq('id', pred.id)

      if (wasteUnits > 0) {
        await supabaseAdmin
          .from('waste_log')
          .insert({
            business_id,
            product_id: pred.product_id,
            waste_date: todayStr,
            units_wasted: wasteUnits,
            cost_per_unit: costPerUnit,
            total_waste_value: wasteValue,
            reason: 'over_prepped',
            prevented_by_agent: false,
            logged_by: 'waste_agent',
          })
      }
    }
  }
}
