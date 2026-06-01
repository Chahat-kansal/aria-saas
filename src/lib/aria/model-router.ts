import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

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
};

export type AriaModelResult<T = any> = {
  ok: boolean;
  data: T | null;
  text: string;
  error?: string;
  provider?: 'anthropic' | 'openai' | 'openrouter';
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

function providerOrder(task: AriaTask): Array<'anthropic' | 'openai' | 'openrouter'> {
  const order: Array<'anthropic' | 'openai' | 'openrouter'> = [];
  if (SMART_TASKS.has(task)) {
    if (hasAnthropic()) order.push('anthropic');
    if (hasOpenAI()) order.push('openai');
  } else {
    if (hasOpenAI()) order.push('openai');
    if (hasAnthropic()) order.push('anthropic');
  }
  if (hasOpenRouter()) order.push('openrouter');
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

async function callAnthropic(input: RunInput) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
  const createParams: any = {
    model: SMART_TASKS.has(input.task) ? 'claude-sonnet-4-5-20250929' : 'claude-haiku-4-5-20251001',
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
  return response.content
    .map(block => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim();
}

async function callOpenAI(input: RunInput) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: SMART_TASKS.has(input.task) ? 'gpt-4o' : 'gpt-4o-mini',
    temperature: input.temperature ?? 0.2,
    max_tokens: input.maxTokens ?? 2500,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: input.userPrompt },
    ],
  });
  return response.choices[0]?.message?.content?.trim() ?? '';
}

async function callOpenRouter(input: RunInput) {
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
      model: SMART_TASKS.has(input.task) ? 'anthropic/claude-sonnet-4-5-20250929' : 'openai/gpt-4o-mini',
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
  return json.choices?.[0]?.message?.content?.trim() ?? '';
}

async function callProvider(provider: 'anthropic' | 'openai' | 'openrouter', input: RunInput) {
  if (provider === 'anthropic') return callAnthropic(input);
  if (provider === 'openai') return callOpenAI(input);
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
      const text = await callProvider(provider, promptWithSchema);
      const data = parseModelJson(text);
      if (data) return { ok: true, data, text, provider };

      const repairText = await callProvider(provider, {
        ...promptWithSchema,
        task: 'fallback',
        temperature: 0,
        userPrompt: `Repair this response into valid JSON only. Do not add new facts.\n\n${text}`,
      });
      const repaired = parseModelJson(repairText);
      if (repaired) return { ok: true, data: repaired, text: repairText, provider };
    } catch (error) {
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
