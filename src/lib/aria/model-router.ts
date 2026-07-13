import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { makeLazyServiceRoleClient } from '@/lib/supabase-lazy';
import { computeCostCentsWithCache } from './cost';

// AI-COST-2 — this file's runAriaModel() had ZERO aria_ai_calls logging of any kind
// (AI-COST-AUDIT-1 §1: the single largest confirmed blind spot — business-brain's dashboard-load
// "analyse()" call, 15-25K token prompts, was completely invisible to the cost ledger). Lazy client
// — module-scope createClient() crashes Next's build-time page-data collection.
const supabaseAdmin = makeLazyServiceRoleClient();

async function logModelRouterCall(params: {
  task: AriaTask; provider: Provider; model_id: string
  input_tokens: number; output_tokens: number; success: boolean
  business_id?: string; agent_key?: string; error_message?: string
}) {
  if (!params.business_id) return; // no business context to attribute this call to — nothing to log against
  try {
    // Cost is only computable for models present in cost.ts's PRICING table (Anthropic + the OpenAI
    // models added there). OpenRouter/OpenRouter-free model IDs are configurable via env slug and are
    // not in a static pricing table — token counts still land in the ledger for volume visibility,
    // cost is 0 for those two providers (computeCostCentsWithCache already no-ops on an unknown model).
    const cost = computeCostCentsWithCache(params.model_id, params.input_tokens, params.output_tokens);
    const { error } = await supabaseAdmin.from('aria_ai_calls').insert({
      business_id: params.business_id,
      agent_key: params.agent_key ?? `model_router_${params.task}`,
      provider: params.provider === 'anthropic' ? 'anthropic' : params.provider === 'openai' ? 'openai' : 'other',
      model_id: params.model_id,
      role: 'analysis',
      input_tokens: params.input_tokens,
      output_tokens: params.output_tokens,
      cost_usd_cents: cost,
      success: params.success,
      error_message: params.error_message ?? null,
    });
    if (error) console.error('[model-router] aria_ai_calls insert failed:', error.message);
  } catch (e) { console.error('[model-router] aria_ai_calls insert threw (non-fatal):', (e as Error).message); }
}

// Retry helper — catches transient 529/503/overload errors from any provider.
// model-router's callAnthropic creates its own client without the SDK-level retry,
// so we add the same withBackoff pattern used in providers/anthropic.ts.
async function withBackoff<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e as Error;
      const msg = lastErr.message ?? '';
      const isTransient = /529|503|overload|rate.?limit/i.test(msg);
      if (!isTransient || attempt === maxAttempts - 1) throw lastErr;
      await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempt), 4000)));
    }
  }
  throw lastErr ?? new Error('All retries failed');
}

export type AriaTask =
  | 'daily_briefing'
  | 'business_health'
  | 'sales_analysis'
  | 'inventory_analysis'
  | 'reorder_plan'
  | 'profit_leak'
  | 'supplier_risk'
  | 'customer_winback'
  | 'staff_analysis'
  | 'explain'
  | 'chat'
  | 'csv_mapping'
  | 'sms_draft'
  | 'fallback';

type RunInput = {
  task: AriaTask;
  systemPrompt: string;
  userPrompt: string;
  schema?: object;
  temperature?: number;
  maxTokens?: number;
  tools?: any[];
  /** AI-COST-2 — when set, every provider attempt for this call is logged to aria_ai_calls. */
  businessId?: string;
  agentKey?: string;
};

type ProviderCallResult = { text: string; inputTokens: number; outputTokens: number; modelId: string };

// 'openrouter_free' is the $0 last-resort floor — distinct from paid 'openrouter' so free-model
// usage is visible in logs/result.provider (MODEL-ROUTER-UPGRADE Section C).
type Provider = 'anthropic' | 'openai' | 'openrouter' | 'openrouter_free';

export type AriaModelResult<T = any> = {
  ok: boolean;
  data: T | null;
  text: string;
  error?: string;
  provider?: Provider;
};

// Tasks that genuinely need Sonnet-level reasoning (user-initiated, high-value)
// High-frequency auto-refresh tasks (daily_briefing, business_health) use Haiku
// to avoid 504 timeouts — they run on a schedule and volume matters more than depth
const SMART_TASKS = new Set<AriaTask>([
  'reorder_plan',
  'profit_leak',
  'supplier_risk',
  'explain',
]);

function hasAnthropic() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function hasOpenAI() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function hasOpenRouter() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

// The free floor only activates when the OpenRouter key AND at least one free-model slug are configured.
// Slugs are env-supplied (OPENROUTER_FREE_SMART_MODEL / OPENROUTER_FREE_ROUTINE_MODEL) — NO hardcoded
// model strings, so a wrong/missing slug simply leaves the floor inert rather than failing silently.
function hasOpenRouterFree() {
  return hasOpenRouter() && Boolean(process.env.OPENROUTER_FREE_SMART_MODEL || process.env.OPENROUTER_FREE_ROUTINE_MODEL);
}

function providerOrder(task: AriaTask): Provider[] {
  const order: Provider[] = [];
  // Anthropic-first for all tasks — avoids OpenRouter fallback errors when OPENAI_API_KEY is absent
  if (hasAnthropic()) order.push('anthropic');
  if (hasOpenAI()) order.push('openai');
  if (hasOpenRouter()) order.push('openrouter');
  // Free models are the LAST-RESORT floor — only reached when every paid provider above has failed.
  if (hasOpenRouterFree()) order.push('openrouter_free');
  return order;
}

function stripJsonFences(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

function extractJson(text: string) {
  const stripped = stripJsonFences(text);
  if (stripped.startsWith('{') || stripped.startsWith('[')) return stripped;
  const objectStart = stripped.indexOf('{');
  const objectEnd = stripped.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) return stripped.slice(objectStart, objectEnd + 1);
  const arrayStart = stripped.indexOf('[');
  const arrayEnd = stripped.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) return stripped.slice(arrayStart, arrayEnd + 1);
  return stripped;
}

export function parseModelJson(text: string) {
  try {
    return JSON.parse(extractJson(text));
  } catch {
    return null;
  }
}

async function callAnthropic(input: RunInput): Promise<ProviderCallResult> {
  const model = SMART_TASKS.has(input.task) ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
  const createParams: any = {
    model,
    max_tokens: input.maxTokens ?? 2500,
    temperature: input.temperature ?? 0.2,
    system: input.systemPrompt,
    messages: [{ role: 'user', content: input.userPrompt }],
  };
  if (input.tools?.length) createParams.tools = input.tools;
  const requestOpts: any = input.tools?.length
    ? { headers: { 'anthropic-beta': 'web-search-2025-03-05' } }
    : {};
  // withBackoff handles 529/503/overload — retries up to 3x with exponential delay
  const response = await withBackoff(() => client.messages.create(createParams, requestOpts));
  const text = response.content
    .map(block => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim();
  return { text, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, modelId: model };
}

async function callOpenAI(input: RunInput): Promise<ProviderCallResult> {
  const model = SMART_TASKS.has(input.task) ? 'gpt-4o' : 'gpt-4o-mini';
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model,
    temperature: input.temperature ?? 0.2,
    max_tokens: input.maxTokens ?? 2500,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: input.userPrompt },
    ],
  });
  const text = response.choices[0]?.message?.content?.trim() ?? '';
  return {
    text, modelId: model,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
  };
}

async function callOpenRouter(input: RunInput): Promise<ProviderCallResult> {
  const model = SMART_TASKS.has(input.task) ? 'anthropic/claude-sonnet-4-6' : 'openai/gpt-4o-mini';
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      ...(process.env.OPENROUTER_SITE_URL ? { 'HTTP-Referer': process.env.OPENROUTER_SITE_URL } : {}),
      ...(process.env.OPENROUTER_APP_NAME ? { 'X-Title': process.env.OPENROUTER_APP_NAME } : {}),
    },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      model,
      temperature: input.temperature ?? 0.2,
      max_tokens: input.maxTokens ?? 2500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.userPrompt },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenRouter returned ${response.status}`);
  const json = await response.json();
  const text = json.choices?.[0]?.message?.content?.trim() ?? '';
  return {
    text, modelId: model,
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
  };
}

// MODEL-ROUTER-UPGRADE Section B — $0 OpenRouter free-model floor. Same endpoint/key as paid
// OpenRouter, but the model slug comes ENTIRELY from env (no hardcoded model IDs). Smart tasks prefer
// OPENROUTER_FREE_SMART_MODEL, routine tasks prefer OPENROUTER_FREE_ROUTINE_MODEL; each falls back to
// the other if only one is set. Throws (→ runAriaModel skips it) when nothing is configured.
// NOTE: free models are rate-limited and more prone to hallucination — this is why they sit at the
// very bottom of the chain and their output is validated by the SAME strict parseModelJson + repair
// path as every paid provider (an invalid/empty response yields {ok:false}, never accepted bad data).
async function callOpenRouterFree(input: RunInput): Promise<ProviderCallResult> {
  const smart = process.env.OPENROUTER_FREE_SMART_MODEL;
  const routine = process.env.OPENROUTER_FREE_ROUTINE_MODEL;
  const model = SMART_TASKS.has(input.task) ? (smart || routine) : (routine || smart);
  if (!model) throw new Error('OpenRouter free model not configured');
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      ...(process.env.OPENROUTER_SITE_URL ? { 'HTTP-Referer': process.env.OPENROUTER_SITE_URL } : {}),
      ...(process.env.OPENROUTER_APP_NAME ? { 'X-Title': process.env.OPENROUTER_APP_NAME } : {}),
    },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      model,
      temperature: input.temperature ?? 0.2,
      max_tokens: input.maxTokens ?? 2500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.userPrompt },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenRouter (free) returned ${response.status}`);
  const json = await response.json();
  const text = json.choices?.[0]?.message?.content?.trim() ?? '';
  return {
    text, modelId: model,
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
  };
}

async function callProvider(provider: Provider, input: RunInput): Promise<ProviderCallResult> {
  if (provider === 'anthropic') return callAnthropic(input);
  if (provider === 'openai') return callOpenAI(input);
  if (provider === 'openrouter_free') return callOpenRouterFree(input);
  return callOpenRouter(input);
}

export async function runAriaModel<T = any>(input: RunInput): Promise<AriaModelResult<T>> {
  const providers = providerOrder(input.task);
  if (providers.length === 0) {
    return {
      ok: false,
      data: null,
      text: '',
      error: 'AI provider is not configured.',
    };
  }

  const promptWithSchema = {
    ...input,
    userPrompt: `${input.userPrompt}\n\nReturn valid JSON only.${input.schema ? `\nSchema guide:\n${JSON.stringify(input.schema)}` : ''}`,
  };

  for (const provider of providers) {
    try {
      const result = await callProvider(provider, promptWithSchema);
      const data = parseModelJson(result.text);
      await logModelRouterCall({
        task: input.task, provider, model_id: result.modelId,
        input_tokens: result.inputTokens, output_tokens: result.outputTokens, success: !!data,
        business_id: input.businessId, agent_key: input.agentKey,
      });
      if (data) return { ok: true, data, text: result.text, provider };

      const repairResult = await callProvider(provider, {
        ...promptWithSchema,
        task: 'fallback',
        temperature: 0,
        userPrompt: `Repair this response into valid JSON only. Do not add new facts.\n\n${result.text}`,
      });
      const repaired = parseModelJson(repairResult.text);
      await logModelRouterCall({
        task: input.task, provider, model_id: repairResult.modelId,
        input_tokens: repairResult.inputTokens, output_tokens: repairResult.outputTokens, success: !!repaired,
        business_id: input.businessId, agent_key: input.agentKey ? `${input.agentKey}_repair` : undefined,
      });
      if (repaired) return { ok: true, data: repaired, text: repairResult.text, provider };
    } catch (error) {
      await logModelRouterCall({
        task: input.task, provider, model_id: 'unknown', input_tokens: 0, output_tokens: 0, success: false,
        business_id: input.businessId, agent_key: input.agentKey, error_message: (error as Error).message,
      });
      console.error(`[aria/model-router] ${provider} failed`, error);
    }
  }

  return {
    ok: false,
    data: null,
    text: '',
    error: 'Aria could not generate a valid structured response.',
  };
}
