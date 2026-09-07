import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { computeCostCents } from '@/lib/aria/cost';
import type { AgentType, AgentDecision, AgentDecisionInput, AgentRunResult, AgentSettings } from './types';

export abstract class BaseAgent {
  abstract type: AgentType;
  abstract run(business_id: string): Promise<AgentRunResult>;

  protected supabase = createServerSupabaseClient();
  protected anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  });

  protected async getSettings(business_id: string): Promise<AgentSettings> {
    try {
      const { data, error } = await this.supabase
        .from('agent_settings')
        .select('enabled,auto_approve_below_cents,config')
        .eq('business_id', business_id)
        .eq('agent_type', this.type)
        .maybeSingle();
      // M13C phase 2, sibling sweep. A failed read falls through to enabled:true — so a broken
      // query silently RUNS an agent the owner switched off. Still non-fatal, no longer silent.
      if (error) console.error('[base-agent] agent_settings read failed, defaulting to enabled', { agent: this.type, reason: error.message });
      return {
        enabled: data?.enabled ?? true,
        auto_approve_below_cents: data?.auto_approve_below_cents ?? 0,
        config: (data?.config as Record<string, unknown>) ?? {},
      };
    } catch (e) {
      console.error('[base-agent] agent_settings read threw, defaulting to enabled', { agent: this.type, reason: (e as Error)?.message });
      return { enabled: true, auto_approve_below_cents: 0, config: {} };
    }
  }

  protected async saveDecisions(decisions: AgentDecisionInput[]): Promise<AgentDecision[]> {
    if (!decisions.length) return [];
    const rows = decisions.map(d => ({
      business_id: d.business_id,
      agent_type: d.agent_type,
      decision_data: d.decision_data,
      reasoning: d.reasoning,
      confidence_score: d.confidence_score,
      projected_impact_cents: d.projected_impact_cents,
      expires_at: d.expires_at,
      status: 'pending',
    }));
    // M13C PHASE 2 — W6, BY HAND, ON A LINE THAT HAS BEEN LYING SINCE 4 JUNE.
    //
    // This discarded its error and returned `data ?? []`. A REJECTED insert therefore looked
    // exactly like "this agent had nothing to propose" — and under RLS in a cron it is rejected
    // every single night, because `this.supabase` is the ANON cookie client (see the parked finding
    // in RUN-M13C.md). `agent_decisions` has held 2 rows since 4 June for this reason.
    //
    // The rejection is now recorded where it can be queried, and then THROWN. Returning [] after
    // failing to save real decisions is reporting success for work that did not happen — the
    // sprint's rule, and the difference between an agent that found nothing and an agent that lost
    // everything it found. Every route that constructs an agent is wrapped in withErrorCapture, so
    // a throw lands in this repo's existing error shape rather than inventing one.
    const { data, error } = await this.supabase.from('agent_decisions').insert(rows).select();
    if (error) {
      console.error('[base-agent] agent_decisions insert REJECTED', { agent: this.type, count: rows.length, reason: error.message });
      // supabaseAdmin, not this.supabase — the diagnostic must land even when the agent's own
      // client is the thing that cannot write. This is a NEW record, not a change of who may write
      // what: the agent's own reads and writes still go through its own client.
      const { error: auditErr } = await supabaseAdmin.from('agent_runs').insert({
        business_id: rows[0]?.business_id,
        agent_type: this.type,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: 0,
        decisions_count: 0,
        errors: ['save_rejected: ' + error.message + ' (' + rows.length + ' decisions lost)'],
        triggered_by: 'save_failed',
      });
      if (auditErr) console.error('[base-agent] the save-failure record was ALSO rejected:', auditErr.message);
      throw new Error('agent_decisions insert rejected for ' + this.type + ': ' + error.message);
    }
    return (data ?? []) as AgentDecision[];
  }

  protected async logRun(business_id: string, result: AgentRunResult, triggered_by = 'cron') {
    // M13C PHASE 2 — WHY agent_runs STOPPED ON 4 JUNE, ANSWERED.
    //
    // Not because this insert fails: the exact shape below was proven ACCEPTED against production
    // in a rolled-back DO block. It stopped because `this.supabase` is the ANON cookie client and
    // RLS rejects it in a cron, where there are no cookies. 4 June is the last day these agents ran
    // from the dashboard with a real session.
    //
    // The try/catch around it could never have told anyone: Supabase RESOLVES with { error } and
    // never throws, so the catch has never once fired. The error is now destructured and read. The
    // CLIENT itself is parked as an authorisation change (RUN-M13C.md) — this commit makes the
    // failure loud, which is what lets the next person fix it in one line instead of guessing.
    try {
      const { error } = await this.supabase.from('agent_runs').insert({
        business_id,
        agent_type: this.type,
        started_at: new Date(Date.now() - result.duration_ms).toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: result.duration_ms,
        decisions_count: result.decisions.length,
        errors: result.errors.length > 0 ? result.errors.map(e => e.message) : null,
        triggered_by,
      });
      if (error) {
        console.error('[base-agent] agent_runs insert REJECTED', { agent: this.type, triggered_by, reason: error.message });
        // Same reasoning as saveDecisions: the record of the failure goes through the client that
        // can actually write. Non-fatal — losing run telemetry must never take down an agent that
        // otherwise worked. Silence is what was wrong here, not the non-fatality.
        const { error: auditErr } = await supabaseAdmin.from('agent_runs').insert({
          business_id, agent_type: this.type,
          started_at: new Date(Date.now() - result.duration_ms).toISOString(),
          completed_at: new Date().toISOString(),
          duration_ms: result.duration_ms,
          decisions_count: result.decisions.length,
          errors: ['logrun_rejected: ' + error.message],
          triggered_by: triggered_by + '_retry',
        });
        if (auditErr) console.error('[base-agent] the logRun-failure record was ALSO rejected:', auditErr.message);
      }
    } catch (e: unknown) {
      // Kept for a genuine network throw. It has never fired for a rejected insert and never could.
      console.warn('[base-agent] logRun threw:', (e as Error).message);
    }
  }

  protected async claudeReason(opts: {
    system: string;
    user: string;
    maxTokens?: number;
    model?: string;
    agent_key?: string;
    role?: string;
    business_id?: string;
  }): Promise<string> {
    const t0 = Date.now();
    const model = opts.model ?? 'claude-haiku-4-5-20251001';
    try {
      const msg = await this.anthropic.messages.create({
        model,
        max_tokens: opts.maxTokens ?? 256,
        system: opts.system,
        messages: [{ role: 'user', content: opts.user }],
      });
      const latencyMs = Date.now() - t0;
      const raw = msg.content[0]?.type === 'text' ? msg.content[0].text : '';

      if (opts.agent_key && opts.role) {
        // AI-COST-2 — was a private, hardcoded pricing table 4x too cheap on haiku ($0.25/$1.25 vs
        // cost.ts's correct $1.00/$5.00) and disagreeing with cost.ts on opus ($15/$75 vs $5/$25).
        // One canonical pricing table now (AI-COST-AUDIT-1 §1/§5.4).
        const costUsdCents = computeCostCents(model, msg.usage.input_tokens, msg.usage.output_tokens);
        try {
          const { error: aiCallErr } = await supabaseAdmin.from('aria_ai_calls').insert({  // LOGGING-AUDIT-3 Part 3
            business_id: opts.business_id ?? null,
            agent_key: opts.agent_key,
            provider: 'anthropic',
            model_id: model,
            role: opts.role,
            input_tokens: msg.usage.input_tokens,
            output_tokens: msg.usage.output_tokens,
            latency_ms: latencyMs,
            cost_usd_cents: costUsdCents,
            success: true,
            request_summary: opts.agent_key + ' reasoning call',
            response_summary: raw.slice(0, 120),
          });
          if (aiCallErr) console.error('[aria_ai_calls insert failed]', { agentKey: opts.agent_key, role: opts.role, reason: aiCallErr.message })
        } catch (e) { console.error('[non-fatal]', e) }
      }

      return raw;
    } catch (e) {
      console.warn('[base-agent] claudeReason failed:', e);

      if (opts.agent_key && opts.role) {
        try {
          await supabaseAdmin.from('aria_ai_calls').insert({
            business_id: opts.business_id ?? null,
            agent_key: opts.agent_key,
            provider: 'anthropic',
            model_id: model,
            role: opts.role,
            input_tokens: 0,
            output_tokens: 0,
            latency_ms: Date.now() - t0,
            cost_usd_cents: 0,
            success: false,
            error_message: (e as Error).message,
            request_summary: opts.agent_key + ' reasoning call',
            response_summary: null,
          });
        } catch (e) { console.error('[non-fatal]', e) }
      }

      return '';
    }
  }

  protected async claudeStructured<T>(opts: {
    system: string;
    user: string;
    maxTokens?: number;
    model?: string;
    agent_key?: string;
    role?: string;
    business_id?: string;
  }): Promise<T | null> {
    const raw = await this.claudeReason({ ...opts, maxTokens: opts.maxTokens ?? 512 });
    try {
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleaned) as T;
    } catch {
      console.warn('[base-agent] claudeStructured parse failed, raw:', raw.slice(0, 200));
      return null;
    }
  }

  protected roundToNearest99(price: number): number {
    return Math.floor(price) + 0.99;
  }
}
