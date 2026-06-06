import { supabaseAdmin } from '@/lib/supabase-admin'
import type { AgentType, AgentRunResult, AgentDecisionInput } from './types'
import { BaseAgent } from './base-agent'

interface NegotiationBriefResponse {
  negotiation_goal: string
  leverage_arguments: Array<{ argument: string; data_point: string; strength: 'strong' | 'medium' | 'weak' }>
  expected_outcome: string
  success_probability: number
  draft_email_subject: string
  draft_email_body: string
  draft_talking_points: string[]
  // Monetary fields are computed deterministically via PPV — not from AI
}

export class SupplierNegotiationAgent extends BaseAgent {
  type: AgentType = 'supplier_negotiation'

  async run(business_id: string): Promise<AgentRunResult> {
    const start = Date.now()
    const errors: Error[] = []
    const decisions: AgentDecisionInput[] = []
    const twelveMonthsAgo = new Date(Date.now() - 365 * 86400000).toISOString()
    const thirteenMonthsAgo = new Date(Date.now() - 396 * 86400000).toISOString()
    const elevenMonthsAgo = new Date(Date.now() - 335 * 86400000).toISOString()
    const twoMonthsAgo = new Date(Date.now() - 60 * 86400000).toISOString()
    const ninetyDaysFromNow = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)

    try {
      // STEP 1: Get all invoices for last 12 months
      const { data: invoices } = await supabaseAdmin
        .from('supplier_invoices')
        .select('id,supplier_name,supplier_id,invoice_date,due_date,total,paid_at')
        .eq('business_id', business_id)
        .gte('invoice_date', twelveMonthsAgo.slice(0, 10))

      if (!invoices || invoices.length === 0) {
        return { decisions: [], errors, duration_ms: Date.now() - start }
      }

      // Group by supplier
      const supplierMap: Record<string, { supplier_name: string; supplier_id: string | null; invoices: typeof invoices }> = {}
      for (const inv of invoices) {
        if (!supplierMap[inv.supplier_name]) {
          supplierMap[inv.supplier_name] = { supplier_name: inv.supplier_name, supplier_id: inv.supplier_id ?? null, invoices: [] }
        }
        supplierMap[inv.supplier_name].invoices.push(inv)
      }

      // Get all invoice items for 12 months
      const invoiceIds = invoices.map(i => i.id)
      // supplier_invoice_items table does not exist in current schema — guard gracefully
      console.warn('[supplier-negotiation-agent] supplier_invoice_items table not present — skipping line-item detail')
      const allItems: Array<{ invoice_id: string; product_name: string; unit_price: number; line_total: number }> = []
      void invoiceIds // suppress unused-var lint

      // Get price variances
      const { data: variances } = await supabaseAdmin
        .from('supplier_price_variances')
        .select('supplier_name,variance_amount,total_variance,created_at')
        .eq('business_id', business_id)
        .gte('created_at', twelveMonthsAgo)
        .gt('variance_amount', 0)

      // Get contracts for renewal dates
      const { data: contracts } = await supabaseAdmin
        .from('supplier_contracts')
        .select('supplier_name,end_date,start_date')
        .eq('business_id', business_id)

      // Get oldest invoice per supplier to estimate relationship_years
      const { data: oldestInvoices } = await supabaseAdmin
        .from('supplier_invoices')
        .select('supplier_name,invoice_date')
        .eq('business_id', business_id)
        .order('invoice_date', { ascending: true })

      const oldestBySupplier: Record<string, string> = {}
      for (const inv of oldestInvoices ?? []) {
        if (!oldestBySupplier[inv.supplier_name]) oldestBySupplier[inv.supplier_name] = inv.invoice_date
      }

      // Build invoice id to date map
      const invDateMap: Record<string, string> = {}
      for (const inv of invoices) invDateMap[inv.id] = inv.invoice_date

      const profiles: Array<Record<string, unknown>> = []
      const productSpendBySupplier = new Map<string, Record<string, number>>()

      for (const [supplierName, sup] of Object.entries(supplierMap)) {
        try {
          const totalSpend = sup.invoices.reduce((s, i) => s + Number(i.total ?? 0), 0)
          const paidInvoices = sup.invoices.filter(i => i.paid_at)
          const onTimePaid = paidInvoices.filter(i => !i.due_date || new Date(i.paid_at!) <= new Date(i.due_date)).length
          const paymentOnTimePct = paidInvoices.length > 0 ? (onTimePaid / paidInvoices.length) * 100 : 100

          // Price creep per product
          const supplierInvoiceIds = new Set(sup.invoices.map(i => i.id))
          const supplierItems = (allItems ?? []).filter(item => supplierInvoiceIds.has(item.invoice_id))

          // Group items by product + period
          const productPrices12mAgo: Record<string, number[]> = {}
          const productPricesNow: Record<string, number[]> = {}
          for (const item of supplierItems) {
            const invDate = invDateMap[item.invoice_id]
            if (!invDate) continue
            const d = invDate
            if (d >= thirteenMonthsAgo.slice(0, 10) && d <= elevenMonthsAgo.slice(0, 10)) {
              if (!productPrices12mAgo[item.product_name]) productPrices12mAgo[item.product_name] = []
              productPrices12mAgo[item.product_name].push(Number(item.unit_price))
            }
            if (d >= twoMonthsAgo.slice(0, 10)) {
              if (!productPricesNow[item.product_name]) productPricesNow[item.product_name] = []
              productPricesNow[item.product_name].push(Number(item.unit_price))
            }
          }

          const creepProducts: Array<{ product_name: string; price_12m_ago: number; current_price: number; creep_pct: number }> = []
          let totalCreepPct = 0, creepCount = 0
          for (const [prodName, oldPrices] of Object.entries(productPrices12mAgo)) {
            const newPrices = productPricesNow[prodName]
            if (!newPrices || newPrices.length === 0) continue
            const oldAvg = oldPrices.reduce((s, v) => s + v, 0) / oldPrices.length
            const newAvg = newPrices.reduce((s, v) => s + v, 0) / newPrices.length
            if (oldAvg <= 0) continue
            const creep = (newAvg - oldAvg) / oldAvg * 100
            totalCreepPct += creep
            creepCount++
            if (creep > 2) {
              creepProducts.push({ product_name: prodName, price_12m_ago: Math.round(oldAvg * 100) / 100, current_price: Math.round(newAvg * 100) / 100, creep_pct: Math.round(creep * 10) / 10 })
            }
          }
          const avgCreepPct = creepCount > 0 ? totalCreepPct / creepCount : 0

          // Overcharge analysis
          const supplierVariances = (variances ?? []).filter(v => v.supplier_name === supplierName)
          const overchargeCount = supplierVariances.length
          const totalOvercharge = supplierVariances.reduce((s, v) => s + Number(v.total_variance ?? 0), 0)
          const totalInvoicesCount = sup.invoices.length
          const invoicesWithVariance = new Set(supplierVariances.map(v => v.supplier_name)).size
          const invoiceAccuracyPct = totalInvoicesCount > 0 ? ((totalInvoicesCount - invoicesWithVariance) / totalInvoicesCount) * 100 : 100

          // Contract renewal
          const contract = contracts?.find(c => c.supplier_name === supplierName)
          const contractRenewalDate = contract?.end_date ?? null
          const startDate = contract?.start_date
          const oldestDate = oldestBySupplier[supplierName]
          const refDate = startDate ?? oldestDate
          const relationshipYears = refDate
            ? (Date.now() - new Date(refDate).getTime()) / (365 * 86400000)
            : 1

          // Key products by spend
          const productSpend: Record<string, number> = {}
          for (const item of supplierItems) {
            productSpend[item.product_name] = (productSpend[item.product_name] ?? 0) + Number(item.line_total ?? 0)
          }
          const keyProducts = Object.entries(productSpend)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name]) => name)

          productSpendBySupplier.set(supplierName, productSpend)

          // Cross-supplier comparison for top product
          let vsCompetitorPct = 0
          if (keyProducts.length > 0) {
            const topProduct = keyProducts[0]
            const otherSupplierPrices: number[] = []
            for (const [otherName, otherSup] of Object.entries(supplierMap)) {
              if (otherName === supplierName) continue
              const otherIds = new Set(otherSup.invoices.map(i => i.id))
              const otherItems = (allItems ?? []).filter(i => otherIds.has(i.invoice_id) && i.product_name === topProduct)
              if (otherItems.length > 0) {
                const avg = otherItems.reduce((s, i) => s + Number(i.unit_price), 0) / otherItems.length
                otherSupplierPrices.push(avg)
              }
            }
            if (otherSupplierPrices.length > 0) {
              const cheapestOther = Math.min(...otherSupplierPrices)
              const myAvg = (productPricesNow[topProduct] ?? []).reduce((s, v) => s + v, 0) / (productPricesNow[topProduct]?.length ?? 1)
              if (cheapestOther > 0) vsCompetitorPct = (myAvg - cheapestOther) / cheapestOther * 100
            }
          }

          // LEVERAGE SCORE
          let leverageScore = 50
          const leverageFactors: string[] = []

          if (totalSpend > 100000) { leverageScore += 25; leverageFactors.push('Very high spend volume ($100k+/year)') }
          else if (totalSpend > 50000) { leverageScore += 15; leverageFactors.push('High spend volume ($50k+/year)') }
          else if (totalSpend < 10000) { leverageScore -= 10 }

          if (paymentOnTimePct > 95) { leverageScore += 10; leverageFactors.push('Excellent payment record (' + Math.round(paymentOnTimePct) + '% on time)') }

          if (vsCompetitorPct > 5) { leverageScore += 15; leverageFactors.push('Competitor offers same products ' + Math.round(vsCompetitorPct) + '% cheaper') }

          if (avgCreepPct > 5 && !contractRenewalDate) { leverageScore += 10; leverageFactors.push('Price creep of ' + Math.round(avgCreepPct) + '% with no contract protection') }

          if (relationshipYears < 1) { leverageScore -= 15 }
          else if (relationshipYears > 3) { leverageScore += 5; leverageFactors.push('Established ' + Math.round(relationshipYears) + '-year relationship') }

          if (overchargeCount > 3) { leverageScore += 5; leverageFactors.push('History of billing inaccuracies (' + overchargeCount + ' overcharges)') }

          leverageScore = Math.max(0, Math.min(100, leverageScore))

          // Priority
          let priority = 'low'
          const renewalSoon = contractRenewalDate && contractRenewalDate <= thirtyDaysFromNow
          const renewalNinety = contractRenewalDate && contractRenewalDate <= ninetyDaysFromNow
          if (avgCreepPct > 8 || renewalSoon) priority = 'urgent'
          else if (avgCreepPct > 5 || renewalNinety || totalOvercharge > 500) priority = 'high'
          else if (avgCreepPct > 3 || vsCompetitorPct > 5) priority = 'medium'

          profiles.push({
            business_id,
            supplier_id: sup.supplier_id,
            supplier_name: supplierName,
            total_spend_12m: Math.round(totalSpend * 100) / 100,
            total_orders_12m: sup.invoices.length,
            avg_order_value_12m: sup.invoices.length > 0 ? Math.round(totalSpend / sup.invoices.length * 100) / 100 : 0,
            payment_on_time_pct: Math.round(paymentOnTimePct * 10) / 10,
            price_creep_pct: Math.round(avgCreepPct * 10) / 10,
            price_creep_products: creepProducts,
            overcharge_count_12m: overchargeCount,
            total_overcharge_12m: Math.round(totalOvercharge * 100) / 100,
            invoice_accuracy_pct: Math.round(invoiceAccuracyPct * 10) / 10,
            vs_competitor_supplier_pct: Math.round(vsCompetitorPct * 10) / 10,
            leverage_score: Math.round(leverageScore),
            leverage_factors: leverageFactors,
            contract_renewal_date: contractRenewalDate,
            relationship_years: Math.round(relationshipYears * 10) / 10,
            key_products: keyProducts,
            negotiation_priority: priority,
            updated_at: new Date().toISOString(),
          })
        } catch (e) {
          errors.push(e instanceof Error ? e : new Error(String(e)))
        }
      }

      // STEP 2: Upsert profiles
      if (profiles.length > 0) {
        await supabaseAdmin
          .from('supplier_negotiation_profiles')
          .upsert(profiles as Record<string, unknown>[], { onConflict: 'business_id,supplier_name' })
      }

      // STEP 3: Generate briefs for urgent + high priority
      const urgentProfiles = profiles.filter(p => p.negotiation_priority === 'urgent' || p.negotiation_priority === 'high')
      const ninetyDaysOut = new Date(Date.now() + 90 * 86400000).toISOString()

      for (const profile of urgentProfiles) {
        try {
          // Check if we already have a recent pending/in_progress brief
          const { data: existingBrief } = await supabaseAdmin
            .from('supplier_negotiation_briefs')
            .select('id')
            .eq('business_id', business_id)
            .eq('supplier_name', profile.supplier_name as string)
            .in('status', ['pending', 'in_progress'])
            .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
            .maybeSingle()

          if (existingBrief) continue

          const context = {
            supplier_name: profile.supplier_name,
            total_spend_12m: profile.total_spend_12m,
            leverage_score: profile.leverage_score,
            leverage_factors: profile.leverage_factors,
            price_creep_pct: profile.price_creep_pct,
            price_creep_products: profile.price_creep_products,
            total_overcharge_12m: profile.total_overcharge_12m,
            overcharge_count_12m: profile.overcharge_count_12m,
            vs_competitor_supplier_pct: profile.vs_competitor_supplier_pct,
            key_products: profile.key_products,
            relationship_years: profile.relationship_years,
            payment_on_time_pct: profile.payment_on_time_pct,
            contract_renewal_date: profile.contract_renewal_date,
            negotiation_priority: profile.negotiation_priority,
          }

          // PPV — purchase price variance: deterministic saving if we negotiate back to 12m-ago prices
          const creepProds = (profile.price_creep_products as Array<{ product_name: string; creep_pct: number }>) ?? []
          const productSpendMap = productSpendBySupplier.get(String(profile.supplier_name)) ?? {}
          const annualSavingPPV = Math.round(
            creepProds.reduce((sum, cp) => {
              const spend = productSpendMap[cp.product_name] ?? 0
              const savingRatio = (cp.creep_pct / 100) / (1 + cp.creep_pct / 100)
              return sum + spend * savingRatio
            }, 0)
          )
          // Fallback: if no per-product data, estimate from total spend × avg creep
          const annualSavingIfSuccessful = annualSavingPPV > 0
            ? annualSavingPPV
            : Math.round(Number(profile.total_spend_12m) * (Number(profile.price_creep_pct) / 100) / (1 + Number(profile.price_creep_pct) / 100))
          const monthlySavingIfSuccessful = Math.round(annualSavingIfSuccessful / 12)

          const brief = await this.claudeStructured<NegotiationBriefResponse>({
            system: 'You are an expert procurement negotiator for Australian small businesses. Generate a supplier negotiation package. Monetary savings are already computed — focus on narrative, arguments, and email copy. Respond with valid JSON only, no markdown.',
            user: 'Generate a negotiation brief for this supplier context:\n' + JSON.stringify({ ...context, ppv_annual_saving: annualSavingIfSuccessful }, null, 2) +
              '\n\nRespond with JSON matching this schema exactly:\n' +
              '{"negotiation_goal":"string","leverage_arguments":[{"argument":"string","data_point":"string","strength":"strong|medium|weak"}],"expected_outcome":"string","success_probability":0.0,"draft_email_subject":"string","draft_email_body":"string","draft_talking_points":["string"]}',
            maxTokens: 1200,
            model: 'claude-sonnet-4-5-20250929',
            agent_key: 'supplier_negotiation',
            role: 'analysis',
            business_id,
          }) ?? {
            negotiation_goal: 'Negotiate price reduction with ' + String(profile.supplier_name),
            leverage_arguments: [] as NegotiationBriefResponse['leverage_arguments'],
            expected_outcome: 'Moderate chance of success',
            success_probability: 0.5,
            draft_email_subject: 'Price Review — ' + String(profile.supplier_name),
            draft_email_body: 'We would like to discuss our pricing arrangement.',
            draft_talking_points: ['Review price creep', 'Discuss contract terms'],
          }

          const { data: profileRow } = await supabaseAdmin
            .from('supplier_negotiation_profiles')
            .select('id')
            .eq('business_id', business_id)
            .eq('supplier_name', profile.supplier_name as string)
            .maybeSingle()

          await supabaseAdmin
            .from('supplier_negotiation_briefs')
            .insert({
              business_id,
              supplier_id: profile.supplier_id as string | null,
              supplier_name: profile.supplier_name as string,
              profile_id: profileRow?.id ?? null,
              trigger_reason: String(profile.negotiation_priority) === 'urgent' ? 'price_creep_exceeded_threshold' : 'high_priority_review',
              negotiation_goal: brief.negotiation_goal,
              leverage_arguments: brief.leverage_arguments,
              expected_outcome: brief.expected_outcome,
              success_probability: brief.success_probability,
              draft_email_subject: brief.draft_email_subject,
              draft_email_body: brief.draft_email_body,
              draft_talking_points: brief.draft_talking_points,
              annual_saving_if_successful: annualSavingIfSuccessful,
              monthly_saving_if_successful: monthlySavingIfSuccessful,
              status: 'pending',
            })

          decisions.push({
            business_id,
            agent_type: 'supplier_negotiation' as AgentType,
            decision_data: {
              action_type: 'negotiate_supplier',
              supplier_name: profile.supplier_name,
              negotiation_goal: brief.negotiation_goal,
              annual_saving_if_successful: annualSavingIfSuccessful,
              monthly_saving_if_successful: monthlySavingIfSuccessful,
              leverage_score: profile.leverage_score,
              priority: profile.negotiation_priority,
            },
            reasoning: brief.expected_outcome + ' — ' + brief.negotiation_goal,
            confidence_score: brief.success_probability,
            projected_impact_cents: annualSavingIfSuccessful * 100,
            expires_at: ninetyDaysOut,
          })
        } catch (e) {
          errors.push(e instanceof Error ? e : new Error(String(e)))
        }
      }

      const saved = await this.saveDecisions(decisions)
      await this.logRun(business_id, { decisions: saved, errors, duration_ms: Date.now() - start })
      return { decisions: saved, errors, duration_ms: Date.now() - start }

    } catch (e) {
      errors.push(e instanceof Error ? e : new Error(String(e)))
    }

    return { decisions: [], errors, duration_ms: Date.now() - start }
  }
}
