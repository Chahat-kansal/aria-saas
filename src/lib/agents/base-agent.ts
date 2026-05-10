import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
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
      // agent_settings table may not exist yet — default to enabled
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

  protected async claudeReason(opts: { system: string; user: string; maxTokens?: number }): Promise<string> {
    try {
      const msg = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: opts.maxTokens ?? 256,
        system: opts.system,
        messages: [{ role: 'user', content: opts.user }],
      });
      return msg.content[0]?.type === 'text' ? msg.content[0].text : '';
    } catch (e) {
      console.warn('[base-agent] claudeReason failed:', e);
      return '';
    }
  }

  protected async claudeStructured<T>(opts: { system: string; user: string; maxTokens?: number }): Promise<T | null> {
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
