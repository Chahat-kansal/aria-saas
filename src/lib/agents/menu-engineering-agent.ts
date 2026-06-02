import { BaseAgent } from './base-agent'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { AgentType, AgentDecisionInput, AgentRunResult } from './types'

interface ProductRow {
  id: string; name: string; price: number; cost_price: number | null
  margin_pct: number | null; category_id: string | null
  grid_position: number | null; agent_hidden: boolean | null
  agent_upsell_product_id: string | null; agent_bundle_product_id: string | null
  agent_bundle_price: number | null; stock_quantity: number | null
  prep_time_minutes: number | null
}

interface SaleItemRow {
  product_id: string; quantity: number; line_total: number; sale_id: string; created_at: string
}

interface ScoreData {
  product: ProductRow
  velocity_vs_avg: number
  units_sold_this_period: number
  units_sold_baseline: number
  margin_pct: number
  margin_dollars_per_unit: number
  margin_score: number
  halo_score: number
  halo_products: string[]
  halo_avg_copur_margin: number
  composite_score: number
  performance_tier: 'star' | 'plowhouse' | 'puzzle' | 'dog' | 'normal'
}

export class MenuEngineeringAgent extends BaseAgent {
  type: AgentType = 'menu_engineering'

  async run(business_id: string): Promise<AgentRunResult> {
    const t0 = Date.now()
    const errors: Error[] = []
    const decisions: AgentDecisionInput[] = []

    try {
      const settings = await this.getSettings(business_id)
      if (!settings.enabled) {
        return { decisions: [], errors: [], duration_ms: Date.now() - t0 }
      }

      const cfg = settings.config as Record<string, unknown>
      const learnedWeights = (cfg.learned_weights as Record<string, number> | undefined) ?? {}
      const velocityWeight = Number(learnedWeights.velocity ?? cfg.velocity_weight ?? 0.40)
      const marginWeight   = Number(learnedWeights.margin   ?? cfg.margin_weight   ?? 0.35)
      const haloWeight     = Number(learnedWeights.halo     ?? cfg.halo_weight     ?? 0.25)

      const starVelThreshold = Number(cfg.star_velocity_threshold ?? 1.2)
      const starMarginThreshold = Number(cfg.star_margin_threshold ?? 0.6)
      const dogVelThreshold = Number(cfg.dog_velocity_threshold ?? 0.8)
      const dogMarginThreshold = Number(cfg.dog_margin_threshold ?? 0.4)

      const nowUtc = new Date()
      const hour = nowUtc.getUTCHours()
      const dow = nowUtc.getUTCDay() // 0=Sun..6=Sat
      const fourHoursAgo = new Date(nowUtc.getTime() - 4 * 3600000)
      const fourteenDaysAgo = new Date(nowUtc.getTime() - 14 * 86400000)
      const thirtyDaysAgo = new Date(nowUtc.getTime() - 30 * 86400000)

      // STEP 1: FETCH PRODUCTS AND SALES DATA
      const [prodRes, saleItemsNowRes, saleItemsBaselineRes, saleItemsHaloRes] = await Promise.all([
        supabaseAdmin.from('pos_products')
          .select('id,name,price,cost_price,margin_pct,category_id,grid_position,agent_hidden,agent_upsell_product_id,agent_bundle_product_id,agent_bundle_price,stock_quantity,prep_time_minutes')
          .eq('business_id', business_id)
          .eq('is_active', true),
        supabaseAdmin.from('pos_sale_items')
          .select('product_id,quantity,line_total,sale_id,created_at')
          .eq('pos_sales.business_id', business_id)
          .gte('created_at', fourHoursAgo.toISOString()),
        supabaseAdmin.from('pos_sale_items')
          .select('product_id,quantity,line_total,sale_id,created_at')
          .eq('pos_sales.business_id', business_id)
          .gte('created_at', thirtyDaysAgo.toISOString())
          .lt('created_at', fourHoursAgo.toISOString()),
        supabaseAdmin.from('pos_sale_items')
          .select('product_id,quantity,line_total,sale_id,created_at')
          .eq('pos_sales.business_id', business_id)
          .gte('created_at', fourteenDaysAgo.toISOString()),
      ])

      const products = (prodRes.data ?? []) as ProductRow[]
      if (products.length === 0) {
        return { decisions: [], errors: [], duration_ms: Date.now() - t0 }
      }

      const saleItemsNow = (saleItemsNowRes.data ?? []) as SaleItemRow[]
      const saleItemsBaseline = (saleItemsBaselineRes.data ?? []) as SaleItemRow[]
      const saleItemsHalo = (saleItemsHaloRes.data ?? []) as SaleItemRow[]

      // STEP 2: VELOCITY SCORING
      const unitsSoldNow: Record<string, number> = {}
      for (const si of saleItemsNow) {
        unitsSoldNow[si.product_id] = (unitsSoldNow[si.product_id] ?? 0) + Number(si.quantity)
      }

      // Baseline: same time-of-day window in last 30 days (4h window starting at same hour)
      const baselineUnits: Record<string, number[]> = {}
      const nowHour = hour
      for (const si of saleItemsBaseline) {
        const siDate = new Date(si.created_at)
        const siHour = siDate.getUTCHours()
        if (siHour >= nowHour && siHour < nowHour + 4) {
          if (!baselineUnits[si.product_id]) baselineUnits[si.product_id] = []
          baselineUnits[si.product_id].push(Number(si.quantity))
        }
      }

      // STEP 3: MARGIN SCORING
      const maxMargin = Math.max(
        ...products.map(p => {
          const mp = Number(p.margin_pct ?? 0)
          if (mp > 0) return mp
          if (p.price && p.cost_price) return ((p.price - p.cost_price) / p.price) * 100
          return 0
        }),
        0.01
      )

      const businessAvgMargin = products.reduce((s, p) => {
        const mp = Number(p.margin_pct ?? 0) || (p.price && p.cost_price ? ((p.price - p.cost_price) / p.price) * 100 : 0)
        return s + mp
      }, 0) / Math.max(products.length, 1)

      // STEP 4: HALO SCORING — build co-purchase map
      const haloBySaleId: Record<string, Array<{ product_id: string; line_total: number }>> = {}
      for (const si of saleItemsHalo) {
        if (!haloBySaleId[si.sale_id]) haloBySaleId[si.sale_id] = []
        haloBySaleId[si.sale_id].push({ product_id: si.product_id, line_total: Number(si.line_total) })
      }

      // STEP 5: COMPOSITE SCORE + BCG CLASSIFICATION
      const scores: ScoreData[] = products.map(p => {
        // Velocity
        const unitsSold = unitsSoldNow[p.id] ?? 0
        const baselineArr = baselineUnits[p.id] ?? []
        const baselineTotal = baselineArr.reduce((s, v) => s + v, 0)
        const baselineDays = 30
        const baselineAvg = baselineArr.length > 0 ? baselineTotal / baselineDays * (baselineArr.length / baselineDays) : 0
        let velocityVsAvg = 1.0
        if (baselineAvg > 0) velocityVsAvg = unitsSold / baselineAvg
        else if (unitsSold > 0) velocityVsAvg = 2.0
        else velocityVsAvg = 0

        // Margin
        const rawMargin = Number(p.margin_pct ?? 0) || (p.price && p.cost_price
          ? ((p.price - (p.cost_price ?? 0)) / p.price) * 100 : 0)
        const marginPerUnit = p.price * (rawMargin / 100)
        const marginScore = Math.min(1, Math.max(0, rawMargin / maxMargin))

        // Halo
        const coPurchased: Record<string, { count: number; totalMargin: number }> = {}
        for (const [, items] of Object.entries(haloBySaleId)) {
          const hasProduct = items.some(i => i.product_id === p.id)
          if (!hasProduct) continue
          for (const item of items) {
            if (item.product_id === p.id) continue
            if (!coPurchased[item.product_id]) coPurchased[item.product_id] = { count: 0, totalMargin: 0 }
            coPurchased[item.product_id].count++
            const coProd = products.find(pp => pp.id === item.product_id)
            const coMargin = Number(coProd?.margin_pct ?? 0) || (coProd?.price && coProd?.cost_price
              ? ((coProd.price - (coProd.cost_price ?? 0)) / coProd.price) * 100 : 0)
            coPurchased[item.product_id].totalMargin += coMargin
          }
        }

        const topHalo = Object.entries(coPurchased)
          .sort(([, a], [, b]) => b.count - a.count)
          .slice(0, 3)

        const haloProducts = topHalo.map(([pid]) => pid)
        const totalHaloCount = topHalo.reduce((s, [, v]) => s + v.count, 0)
        const haloAvgMargin = totalHaloCount > 0
          ? topHalo.reduce((s, [, v]) => s + v.totalMargin, 0) / totalHaloCount
          : businessAvgMargin
        const rawHaloScore = businessAvgMargin > 0 ? haloAvgMargin / businessAvgMargin - 1 : 0
        const haloScore = Math.min(1, Math.max(0, rawHaloScore))

        const composite = velocityVsAvg * velocityWeight + marginScore * marginWeight + haloScore * haloWeight

        let tier: 'star' | 'plowhouse' | 'puzzle' | 'dog' | 'normal' = 'normal'
        if (velocityVsAvg > starVelThreshold && marginScore > starMarginThreshold) tier = 'star'
        else if (velocityVsAvg > starVelThreshold && marginScore <= dogMarginThreshold) tier = 'plowhouse'
        else if (velocityVsAvg <= dogVelThreshold && marginScore > starMarginThreshold) tier = 'puzzle'
        else if (velocityVsAvg <= dogVelThreshold && marginScore <= dogMarginThreshold) tier = 'dog'

        return {
          product: p,
          velocity_vs_avg: velocityVsAvg,
          units_sold_this_period: unitsSold,
          units_sold_baseline: baselineAvg,
          margin_pct: rawMargin,
          margin_dollars_per_unit: marginPerUnit,
          margin_score: marginScore,
          halo_score: haloScore,
          halo_products: haloProducts,
          halo_avg_copur_margin: haloAvgMargin,
          composite_score: composite,
          performance_tier: tier,
        }
      })

      // STEP 10: TIME-OF-DAY MODE SWITCHING (determine before grid sort)
      // Using UTC hours; AEST = UTC+10, AEDT = UTC+11
      // Fri/Sat (UTC dow 4,5) dinner rush 18-20 UTC ≈ 4-6am AEST (not dinner)
      // Better to use raw UTC logic as a proxy
      const isPeak = (dow >= 4 && dow <= 5 && hour >= 8 && hour <= 10) ||
                     (hour >= 1 && hour <= 3 && dow >= 1 && dow <= 5)
      const isQuiet = (dow >= 1 && dow <= 4 && hour >= 4 && hour <= 6)
      let currentMode: 'peak' | 'quiet' | 'normal' = 'normal'
      if (isPeak) currentMode = 'peak'
      else if (isQuiet) currentMode = 'quiet'

      // STEP 6: GRID POSITIONING
      let gridSorted: ScoreData[]
      if (currentMode === 'peak') {
        // Speed proxy: prefer products with no prep_time (null or 0) and low price
        gridSorted = [...scores].sort((a, b) => {
          const aSpeed = (a.product.prep_time_minutes ?? 0) === 0 ? 0 : 1
          const bSpeed = (b.product.prep_time_minutes ?? 0) === 0 ? 0 : 1
          if (aSpeed !== bSpeed) return aSpeed - bSpeed
          return b.composite_score - a.composite_score
        })
      } else if (currentMode === 'quiet') {
        gridSorted = [...scores].sort((a, b) => b.margin_score - a.margin_score)
      } else {
        gridSorted = [...scores].sort((a, b) => b.composite_score - a.composite_score)
      }

      const gridActions: Array<{ product_id: string; prev: number | null; next: number }> = []
      for (let i = 0; i < gridSorted.length; i++) {
        const s = gridSorted[i]
        const newPos = i + 1
        if (s.product.grid_position !== newPos) {
          gridActions.push({ product_id: s.product.id, prev: s.product.grid_position, next: newPos })
        }
      }

      if (gridActions.length > 0) {
        for (const ga of gridActions) {
          await supabaseAdmin.from('pos_products').update({ grid_position: ga.next, last_scored_at: nowUtc.toISOString() }).eq('id', ga.product_id)
        }
        await supabaseAdmin.from('menu_engineering_actions').insert({
          business_id,
          action_type: 'reorder_grid',
          previous_state: { positions: gridActions.map(g => ({ product_id: g.product_id, position: g.prev })) },
          new_state: { positions: gridActions.map(g => ({ product_id: g.product_id, position: g.next })) },
          reasoning: currentMode + ' mode — sorted ' + gridActions.length + ' products by ' + (currentMode === 'peak' ? 'speed' : currentMode === 'quiet' ? 'margin' : 'composite score'),
        })

        if (currentMode === 'peak') {
          await supabaseAdmin.from('menu_engineering_actions').insert({ business_id, action_type: 'activate_peak_mode', reasoning: 'Peak hour detected — grid sorted by speed proxy' })
        } else if (currentMode === 'quiet') {
          await supabaseAdmin.from('menu_engineering_actions').insert({ business_id, action_type: 'activate_quiet_mode', reasoning: 'Quiet period — grid sorted by margin_score DESC' })
        }
      }

      // STEP 7: UPSELL WIRING
      const starProducts = scores.filter(s => s.performance_tier === 'star')
      const puzzleProducts = scores.filter(s => s.performance_tier === 'puzzle')

      for (const star of starProducts) {
        const xCatPuzzle = puzzleProducts.filter(p => p.product.category_id !== star.product.category_id)
        if (xCatPuzzle.length === 0) continue
        const bestPuzzle = xCatPuzzle.sort((a, b) => b.margin_score - a.margin_score)[0]
        if (star.product.agent_upsell_product_id !== bestPuzzle.product.id) {
          await supabaseAdmin.from('pos_products').update({ agent_upsell_product_id: bestPuzzle.product.id }).eq('id', star.product.id)
          await supabaseAdmin.from('menu_engineering_actions').insert({
            business_id,
            action_type: 'set_upsell',
            product_id: star.product.id,
            new_state: { upsell_product_id: bestPuzzle.product.id, upsell_name: bestPuzzle.product.name },
            reasoning: 'Star product ' + star.product.name + ' upsells Puzzle product ' + bestPuzzle.product.name + ' (highest margin, different category)',
          })
        }
      }

      // STEP 8: BUNDLE DETECTION
      for (const s of scores) {
        if (s.halo_products.length === 0) continue
        const topCoPurchased = s.halo_products[0]
        const coProd = scores.find(sc => sc.product.id === topCoPurchased)
        if (!coProd || coProd.performance_tier !== 'puzzle') continue

        const bundlePrice = (s.product.price + coProd.product.price) * 0.90
        const minProfitable = ((s.product.cost_price ?? s.product.price * 0.5) + (coProd.product.cost_price ?? coProd.product.price * 0.5)) * 1.20
        if (bundlePrice < minProfitable) continue

        if (s.product.agent_bundle_product_id !== coProd.product.id || s.product.agent_bundle_price !== bundlePrice) {
          await supabaseAdmin.from('pos_products').update({
            agent_bundle_product_id: coProd.product.id,
            agent_bundle_price: Math.round(bundlePrice * 100) / 100,
          }).eq('id', s.product.id)
          await supabaseAdmin.from('menu_engineering_actions').insert({
            business_id,
            action_type: 'activate_bundle',
            product_id: s.product.id,
            new_state: { bundle_with: coProd.product.id, bundle_price: bundlePrice },
            reasoning: s.product.name + ' and ' + coProd.product.name + ' co-purchased in ' + Math.round((s.halo_products.length > 0 ? 1 : 0) * 100) + '% of sales — bundle at $' + bundlePrice.toFixed(2),
          })
        }
      }

      // STEP 9: HIDE DOG PRODUCTS
      const dogProducts = scores.filter(s =>
        s.performance_tier === 'dog' &&
        s.velocity_vs_avg < 0.3 &&
        Number(s.product.stock_quantity ?? 0) > 0 &&
        !s.product.agent_hidden
      )

      for (const dog of dogProducts) {
        await supabaseAdmin.from('pos_products').update({ agent_hidden: true, grid_position: 9999 }).eq('id', dog.product.id)
        await supabaseAdmin.from('menu_engineering_actions').insert({
          business_id,
          action_type: 'hide_product',
          product_id: dog.product.id,
          previous_state: { agent_hidden: false, grid_position: dog.product.grid_position },
          new_state: { agent_hidden: true, grid_position: 9999 },
          reasoning: 'velocity ' + dog.velocity_vs_avg.toFixed(2) + 'x avg, BCG=dog, hiding to reduce menu confusion',
        })
        // Clearance promotion
        await supabaseAdmin.from('pos_promotions').insert({
          business_id,
          name: 'Clearance — ' + dog.product.name,
          discount_percent: 20,
          product_ids: [dog.product.id],
          valid_from: nowUtc.toISOString(),
          valid_until: new Date(nowUtc.getTime() + 48 * 3600000).toISOString(),
          is_active: true,
          created_at: nowUtc.toISOString(),
        }).then(() => {}, () => {})
      }

      // STEP 11: LEARNING LOOP
      const fourHourCheck = new Date(nowUtc.getTime() - 4 * 3600000)
      const eightHoursAgo = new Date(nowUtc.getTime() - 8 * 3600000)
      const { data: oldActions } = await supabaseAdmin
        .from('menu_engineering_actions')
        .select('id, product_id, action_type, executed_at')
        .eq('business_id', business_id)
        .is('revenue_impact_actual', null)
        .gte('executed_at', eightHoursAgo.toISOString())
        .lt('executed_at', fourHourCheck.toISOString())

      let weightAdjusted = false
      const positiveMoves: number[] = []
      const negativeMoves: number[] = []

      for (const action of oldActions ?? []) {
        if (!action.product_id) continue
        const execAt = new Date(action.executed_at)
        const endAt = new Date(execAt.getTime() + 4 * 3600000)

        const { data: afterItems } = await supabaseAdmin
          .from('pos_sale_items')
          .select('line_total')
          .eq('product_id', action.product_id)
          .gte('created_at', execAt.toISOString())
          .lt('created_at', endAt.toISOString())

        const afterRevenue = (afterItems ?? []).reduce((s: number, i: { line_total: number }) => s + Number(i.line_total), 0)

        // Find before revenue from product_performance_scores
        const { data: scoreRow } = await supabaseAdmin
          .from('product_performance_scores')
          .select('revenue_4h_before_change')
          .eq('business_id', business_id)
          .eq('product_id', action.product_id)
          .order('scored_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        const beforeRevenue = Number(scoreRow?.revenue_4h_before_change ?? 0)
        const impact = afterRevenue - beforeRevenue

        await supabaseAdmin.from('menu_engineering_actions')
          .update({ revenue_impact_actual: impact })
          .eq('id', action.id)

        if (action.action_type === 'reorder_grid') {
          if (impact > 0) positiveMoves.push(impact)
          else negativeMoves.push(impact)
        }
      }

      // Weight adaptation — 0.02 per cycle
      if ((positiveMoves.length > 0 || negativeMoves.length > 0) && !weightAdjusted) {
        const currentVW = velocityWeight
        const currentMW = marginWeight
        const currentHW = haloWeight
        let newVW = currentVW, newMW = currentMW, newHW = currentHW

        if (positiveMoves.length > negativeMoves.length) {
          // Grid reorder working well — velocity weight is good
          newVW = Math.min(0.60, currentVW + 0.02)
        } else {
          // Puzzle promotions underperforming — shift from halo to margin
          newHW = Math.max(0.10, currentHW - 0.02)
          newMW = Math.min(0.50, currentMW + 0.02)
        }

        // Normalise to sum to 1
        const total = newVW + newMW + newHW
        await supabaseAdmin.from('agent_settings').upsert({
          business_id,
          agent_type: 'menu_engineering',
          config: {
            ...cfg,
            learned_weights: {
              velocity: Math.round(newVW / total * 100) / 100,
              margin: Math.round(newMW / total * 100) / 100,
              halo: Math.round(newHW / total * 100) / 100,
            },
          },
          updated_at: nowUtc.toISOString(),
        }, { onConflict: 'business_id,agent_type' }).then(() => {}, () => {})
        weightAdjusted = true
      }

      // FINAL: Upsert product_performance_scores
      const upsertRows = scores.map(s => ({
        business_id,
        product_id: s.product.id,
        scored_at: nowUtc.toISOString(),
        period_hours: 4,
        units_sold_this_period: s.units_sold_this_period,
        units_sold_baseline_same_period: s.units_sold_baseline,
        velocity_vs_avg: Math.round(s.velocity_vs_avg * 1000) / 1000,
        margin_pct: Math.round(s.margin_pct * 100) / 100,
        margin_dollars_per_unit: Math.round(s.margin_dollars_per_unit * 100) / 100,
        margin_score: Math.round(s.margin_score * 1000) / 1000,
        halo_score: Math.round(s.halo_score * 1000) / 1000,
        halo_products: s.halo_products,
        halo_avg_copur_margin: Math.round(s.halo_avg_copur_margin * 100) / 100,
        composite_score: Math.round(s.composite_score * 1000) / 1000,
        performance_tier: s.performance_tier,
        recommended_grid_position: gridSorted.findIndex(gs => gs.product.id === s.product.id) + 1,
      }))

      // Batch insert (ignore conflict = same scored_at)
      for (const row of upsertRows) {
        await supabaseAdmin.from('product_performance_scores').insert(row).then(() => {}, () => {})
      }

      // Update performance_tier on products
      for (const s of scores) {
        await supabaseAdmin.from('pos_products')
          .update({ performance_tier: s.performance_tier, last_scored_at: nowUtc.toISOString() })
          .eq('id', s.product.id)
      }

      // Save an AgentDecision summarising the run
      decisions.push({
        agent_type: 'menu_engineering',
        business_id,
        decision_data: {
          action_type: 'menu_reorder',
          title: 'Menu engineering cycle complete',
          description: 'Scored ' + scores.length + ' products. Stars: ' + scores.filter(s => s.performance_tier === 'star').length + ', Dogs: ' + dogProducts.length + ' hidden, Mode: ' + currentMode,
          stars: scores.filter(s => s.performance_tier === 'star').length,
          dogs: scores.filter(s => s.performance_tier === 'dog').length,
          puzzles: scores.filter(s => s.performance_tier === 'puzzle').length,
          plowhouses: scores.filter(s => s.performance_tier === 'plowhouse').length,
          grid_changes: gridActions.length,
          mode: currentMode,
        },
        reasoning: 'Full BCG scoring cycle: ' + gridActions.length + ' grid changes, ' + dogProducts.length + ' products hidden',
        confidence_score: 0.8,
        projected_impact_cents: Math.round(scores.filter(s => s.performance_tier === 'star').reduce((s, sc) => s + sc.margin_dollars_per_unit * sc.units_sold_this_period, 0) * 100),
        expires_at: new Date(nowUtc.getTime() + 4 * 3600000).toISOString(),
      })

      const savedDecisions = await this.saveDecisions(decisions)
      await this.logRun(business_id, { decisions: savedDecisions, errors, duration_ms: Date.now() - t0 })
      return { decisions: savedDecisions, errors, duration_ms: Date.now() - t0 }
    } catch (e) {
      errors.push(e as Error)
      return { decisions: [], errors, duration_ms: Date.now() - t0 }
    }
  }
}
