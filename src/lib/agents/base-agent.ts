import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
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
      const { data } = await this.supabase
        .from('agent_settings')
        .select('enabled,auto_approve_below_cents,config')
        .eq('business_id', business_id)
        .eq('agent_type', this.type)
        .maybeSingle();
      return {
        enabled: data?.enabled ?? true,
        auto_approve_below_cents: data?.auto_approve_below_cents ?? 0,
        config: (data?.config as Record<string, unknown>) ?? {},
      };
    } catch {
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
    const { data } = await this.supabase.from('agent_decisions').insert(rows).select();
    return (data ?? []) as AgentDecision[];
  }

  protected async logRun(business_id: string, result: AgentRunResult, triggered_by = 'cron') {
    try {
      await this.supabase.from('agent_runs').insert({
        business_id,
        agent_type: this.type,
        started_at: new Date(Date.now() - result.duration_ms).toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: result.duration_ms,
        decisions_count: result.decisions.length,
        errors: result.errors.length > 0 ? result.errors.map(e => e.message) : null,
        triggered_by,
      });
    } catch (e: unknown) {
      console.warn('[base-agent] logRun failed:', (e as Error).message);
    }
  }

  private computeCostCents(model: string, inputTokens: number, outputTokens: number): number {
    if (model.includes('sonnet')) {
      return Math.round((inputTokens * 0.000003 + outputTokens * 0.000015) * 100);
    }
    if (model.includes('opus')) {
      return Math.round((inputTokens * 0.000015 + outputTokens * 0.000075) * 100);
    }
    // haiku
    return Math.round((inputTokens * 0.00000025 + outputTokens * 0.00000125) * 100);
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
        const costUsdCents = this.computeCostCents(model, msg.usage.input_tokens, msg.usage.output_tokens);
        try {
          await supabaseAdmin.from('aria_ai_calls').insert({
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
