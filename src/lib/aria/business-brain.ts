import { AriaBusinessData, AriaDataStatus } from '@/lib/aria/business-data';
import { AriaTask, runAriaModel } from '@/lib/aria/model-router';
import { trackAICall } from '@/lib/aria/ai-telemetry';
import { getBusinessContext } from '@/lib/aria/get-business-context';
import { getSystemPrompt } from '@/lib/aria/get-system-prompt';

export type AriaBrainMode =
  | 'daily'
  | 'health'
  | 'sales'
  | 'inventory'
  | 'reorder'
  | 'profit'
  | 'supplier'
  | 'customer'
  | 'staff'
  | 'explain'
  | 'chat';

type Severity = 'low' | 'medium' | 'high' | 'critical';
type Priority = 'low' | 'medium' | 'high' | 'urgent';
type Confidence = 'low' | 'medium' | 'high';

export type AriaObservation = {
  title: string;
  category: string;
  severity: Severity;
  what_happened: string;
  what_it_means: string;
  evidence: string[];
  confidence: Confidence;
};

export type AriaRecommendation = {
  title: string;
  category: string;
  priority: Priority;
  recommendation: string;
  reason: string;
  expected_impact: string;
  risk_if_ignored: string;
  evidence: string[];
  confidence: Confidence;
  suggested_action: {
    type: string;
    label: string;
    requires_owner_approval: boolean;
    payload: Record<string, unknown>;
  };
};

export type AriaBrainOutput = {
  summary: string;
  business_health_score: number | null;
  data_status: AriaDataStatus;
  observations: AriaObservation[];
  recommendations: AriaRecommendation[];
  questions_to_ask_owner: string[];
  missing_data: string[];
  onboarding_guidance?: string;
  error?: string;
};

const SYSTEM_PROMPT = `You are Aria, an AI co-owner for Australian retail and hospitality businesses. You are not a generic chatbot. Your job is to analyse real business data and produce practical decisions for the owner. Use only the provided business data. Never invent sales, stock, customer, supplier, labour, margin, or compliance numbers. Clearly say when data is missing. Always separate observation, reasoning, recommendation, evidence, expected impact, risk if ignored, and confidence. Use plain English for busy business owners. Prioritise profit, stock, cashflow, labour, waste, supplier cost changes, compliance risk, and customer retention. Prepare actions for owner approval. Never send SMS, change prices, place orders, or modify records without owner approval. Be honest when confidence is low. Output valid JSON only matching the provided schema.`;

const OUTPUT_SCHEMA = {
  summary: 'string',
  business_health_score: 'number or null',
  data_status: 'object copied from input',
  observations: [{
    title: 'string',
    category: 'string',
    severity: 'low | medium | high | critical',
    what_happened: 'string',
    what_it_means: 'string',
    evidence: ['string'],
    confidence: 'low | medium | high',
  }],
  recommendations: [{
    title: 'string',
    category: 'string',
    priority: 'low | medium | high | urgent',
    recommendation: 'string',
    reason: 'string',
    expected_impact: 'string',
    risk_if_ignored: 'string',
    evidence: ['string'],
    confidence: 'low | medium | high',
    suggested_action: {
      type: 'string',
      label: 'string',
      requires_owner_approval: true,
      payload: {},
    },
  }],
  questions_to_ask_owner: ['string'],
  missing_data: ['string'],
};

function emptyOutput(data: AriaBusinessData, summary: string, missing?: string[]): AriaBrainOutput {
  const missingData = missing ?? data.data_status.missing_required_data;
  return {
    summary,
    business_health_score: null,
    data_status: data.data_status,
    observations: [],
    recommendations: [],
    questions_to_ask_owner: [],
    missing_data: missingData,
    onboarding_guidance: onboardingGuidance(missingData),
  };
}

function onboardingGuidance(missing: string[]) {
  if (missing.length === 0) return '';
  return `Connect or upload ${missing.join(', ')} so Aria can generate real business decisions.`;
}

function needs(data: AriaBusinessData, required: Array<keyof AriaDataStatus>) {
  return required.filter(key => !data.data_status[key]).map(key => {
    if (key === 'has_sales_data') return 'sales data';
    if (key === 'has_product_data') return 'product catalogue';
    if (key === 'has_inventory_data') return 'inventory or stock levels';
    if (key === 'has_supplier_data') return 'supplier cost history';
    if (key === 'has_customer_data') return 'customer activity';
    if (key === 'has_staff_data') return 'staff records';
    if (key === 'has_pos_connection') return 'POS connection';
    if (key === 'has_uploaded_data') return 'CSV import';
    return String(key);
  });
}

function enoughForMode(data: AriaBusinessData, mode: AriaBrainMode) {
  if (mode === 'daily' || mode === 'health') return needs(data, ['has_sales_data', 'has_product_data']);
  if (mode === 'sales') return needs(data, ['has_sales_data']);
  if (mode === 'inventory' || mode === 'reorder') return needs(data, ['has_sales_data', 'has_inventory_data']);
  if (mode === 'profit') return needs(data, ['has_sales_data', 'has_product_data']);
  if (mode === 'supplier') return needs(data, ['has_supplier_data']);
  if (mode === 'customer') return needs(data, ['has_customer_data']);
  if (mode === 'staff') return needs(data, ['has_staff_data']);
  return [];
}

function compactRows(rows: any[], fields: string[], limit = 80) {
  return rows.slice(0, limit).map(row => {
    const out: Record<string, unknown> = {};
    for (const field of fields) {
      if (row[field] !== undefined && row[field] !== null) out[field] = row[field];
    }
    return out;
  });
}

function compactData(data: AriaBusinessData) {
  return {
    business: data.business
      ? {
          id: data.business.id,
          name: data.business.name,
          industry: data.business.industry,
          city: data.business.city,
          data_source: data.business.data_source,
          pos_enabled: (data.business as any).pos_enabled ?? false,
          entity_type: (data.business as any).entity_type ?? null,
          business_model: (data.business as any).business_model ?? null,
          year_established: (data.business as any).year_established ?? null,
          biggest_challenge: (data.business as any).biggest_challenge ?? null,
          access_status: (data.business as any).access_status ?? null,
        }
      : null,
    data_status: data.data_status,
    raw_counts: data.raw_counts,
    sales: compactRows(data.sales, ['id', 'total_amount', 'total_cents', 'subtotal', 'discount_amount', 'created_at', 'sold_at', 'status'], 120),
    products: compactRows(data.products, ['id', 'name', 'sku', 'price', 'price_cents', 'cost_price', 'cost_cents', 'stock_quantity', 'current_stock', 'low_stock_threshold', 'reorder_point', 'is_active'], 120),
    sale_items: compactRows(data.sale_items, ['product_id', 'product_name', 'quantity', 'unit_price', 'total_price', 'created_at'], 200),
    inventory: compactRows(data.inventory, ['item_id', 'product_id', 'item_name', 'quantity_added', 'quantity_remaining', 'movement_type', 'expiry_date', 'created_at'], 120),
    suppliers: compactRows(data.suppliers, ['id', 'name', 'email', 'phone', 'lead_time_days', 'created_at'], 80),
    supplier_costs: compactRows(data.supplier_costs, ['supplier_id', 'supplier_name', 'total_cost_cents', 'status', 'created_at', 'on_time_rate', 'fill_rate'], 80),
    customers: compactRows(data.customers, ['id', 'name', 'last_visit', 'last_visit_at', 'visit_count', 'total_spent', 'total_spent_cents', 'created_at'], 80),
    staff: compactRows(data.staff, ['id', 'name', 'role', 'employment_type', 'visa_status', 'status', 'created_at'], 80),
    imports: data.imports.slice(0, 20).map(file => ({
      id: file.id,
      upload_type: file.upload_type,
      file_name: file.file_name,
      columns: file.columns,
      row_count: file.row_count,
      mapping: file.mapping,
      created_at: file.created_at,
      rows_preview: Array.isArray(file.rows) ? file.rows.slice(0, 25) : [],
    })),
    previous_actions: compactRows(data.previous_actions, ['id', 'title', 'category', 'priority', 'status', 'reason', 'expected_impact', 'created_at', 'reviewed_at', 'completed_at'], 50),
  };
}

function taskForMode(mode: AriaBrainMode): AriaTask {
  if (mode === 'daily') return 'daily_briefing';
  if (mode === 'health') return 'business_health';
  if (mode === 'sales') return 'sales_analysis';
  if (mode === 'inventory') return 'inventory_analysis';
  if (mode === 'reorder') return 'reorder_plan';
  if (mode === 'profit') return 'profit_leak';
  if (mode === 'supplier') return 'supplier_risk';
  if (mode === 'customer') return 'customer_winback';
  if (mode === 'staff') return 'staff_analysis';
  if (mode === 'explain') return 'explain';
  return 'chat';
}

function normaliseOutput(value: any, data: AriaBusinessData): AriaBrainOutput {
  const observations = Array.isArray(value?.observations) ? value.observations : [];
  const recommendations = Array.isArray(value?.recommendations) ? value.recommendations : [];
  return {
    summary: typeof value?.summary === 'string' ? value.summary : 'Aria reviewed the connected business data.',
    business_health_score: typeof value?.business_health_score === 'number' ? Math.max(0, Math.min(100, value.business_health_score)) : null,
    data_status: data.data_status,
    observations: observations.map((item: any) => ({
      title: String(item.title ?? 'Observation'),
      category: String(item.category ?? 'business'),
      severity: ['low', 'medium', 'high', 'critical'].includes(item.severity) ? item.severity : 'medium',
      what_happened: String(item.what_happened ?? ''),
      what_it_means: String(item.what_it_means ?? ''),
      evidence: Array.isArray(item.evidence) ? item.evidence.map(String) : [],
      confidence: ['low', 'medium', 'high'].includes(item.confidence) ? item.confidence : 'low',
    })),
    recommendations: recommendations.map((item: any) => ({
      title: String(item.title ?? item.recommendation ?? 'Aria recommendation'),
      category: String(item.category ?? 'business'),
      priority: ['low', 'medium', 'high', 'urgent'].includes(item.priority) ? item.priority : 'medium',
      recommendation: String(item.recommendation ?? ''),
      reason: String(item.reason ?? ''),
      expected_impact: String(item.expected_impact ?? ''),
      risk_if_ignored: String(item.risk_if_ignored ?? ''),
      evidence: Array.isArray(item.evidence) ? item.evidence.map(String) : [],
      confidence: ['low', 'medium', 'high'].includes(item.confidence) ? item.confidence : 'low',
      suggested_action: {
        type: String(item.suggested_action?.type ?? 'review'),
        label: String(item.suggested_action?.label ?? 'Review'),
        requires_owner_approval: true,
        payload: item.suggested_action?.payload && typeof item.suggested_action.payload === 'object' ? item.suggested_action.payload : {},
      },
    })).filter((item: AriaRecommendation) => item.recommendation && item.reason),
    questions_to_ask_owner: Array.isArray(value?.questions_to_ask_owner) ? value.questions_to_ask_owner.map(String) : [],
    missing_data: Array.isArray(value?.missing_data) ? value.missing_data.map(String) : data.data_status.missing_required_data,
  };
}

async function analyse(mode: AriaBrainMode, data: AriaBusinessData, context?: object, systemPromptOverride?: string, tools?: any[]): Promise<AriaBrainOutput> {
  const missing = enoughForMode(data, mode);
  if (missing.length > 0 && mode !== 'explain' && mode !== 'chat') {
    return emptyOutput(data, 'Aria is ready, but live business data is not connected yet.', missing);
  }

  const smartModes = new Set<AriaBrainMode>(['reorder', 'profit', 'supplier', 'explain'])
  const model = smartModes.has(mode) ? 'claude-sonnet-4-5-20250929' : 'claude-haiku-4-5-20251001'

  const result = await trackAICall(
    {
      route: 'aria/business-brain',
      model,
      businessId: data.business?.id ?? undefined,
      industry: data.business?.industry ?? undefined,
      purpose: `business-brain-${mode}`,
    },
    () => runAriaModel({
      task: taskForMode(mode),
      systemPrompt: systemPromptOverride ?? SYSTEM_PROMPT,
      schema: OUTPUT_SCHEMA,
      temperature: 0.15,
      maxTokens: 800,
      tools,
      userPrompt: JSON.stringify({
        mode,
        context: context ?? null,
        business_data: compactData(data),
        instruction: 'Analyse only the provided real records. If evidence is thin or missing, say that clearly and return no unsupported recommendations.',
      }),
    })
  );

  if (!result.ok || !result.data) {
    return {
      ...emptyOutput(data, result.error ?? 'Aria could not generate intelligence right now.', data.data_status.missing_required_data),
      error: result.error,
    };
  }

  return normaliseOutput(result.data, data);
}

export function analyseBusinessHealth(input: AriaBusinessData) {
  return analyse('health', input);
}

export function generateDailyDecisions(input: AriaBusinessData) {
  return analyse('daily', input);
}

export function analyseSales(input: AriaBusinessData) {
  return analyse('sales', input);
}

export function analyseInventory(input: AriaBusinessData) {
  return analyse('inventory', input);
}

export function analyseProfitLeaks(input: AriaBusinessData) {
  return analyse('profit', input);
}

export function analyseSupplierRisks(input: AriaBusinessData) {
  return analyse('supplier', input);
}

export function analyseCustomerWinback(input: AriaBusinessData) {
  return analyse('customer', input);
}

export function analyseStaffing(input: AriaBusinessData) {
  return analyse('staff', input);
}

export function generateReorderPlan(input: AriaBusinessData) {
  return analyse('reorder', input);
}

export function explainRecommendation(input: AriaBusinessData, context?: object) {
  return analyse('explain', input, context);
}

const WEB_SEARCH_TOOLS = [{ type: 'web_search_20250305' as any, name: 'web_search' }];

export async function chatWithBusinessBrain(input: AriaBusinessData, context?: object): Promise<AriaBrainOutput> {
  let systemPromptOverride: string | undefined
  const businessId = (input.business as any)?.id as string | undefined
  const industry = ((input.business as any)?.industry as string | undefined) ?? 'retail'
  if (businessId) {
    try {
      const businessContext = await getBusinessContext(businessId)
      systemPromptOverride = getSystemPrompt(industry, businessContext)
    } catch { /* fall back to generic SYSTEM_PROMPT */ }
  }
  return analyse('chat', input, context, systemPromptOverride, WEB_SEARCH_TOOLS)
}

export function convertInsightToAction(input: { recommendation: AriaRecommendation }) {
  return {
    title: input.recommendation.title,
    category: input.recommendation.category,
    priority: input.recommendation.priority === 'urgent' ? 'high' : input.recommendation.priority,
    recommendation: input.recommendation.recommendation,
    reason: input.recommendation.reason,
    expected_impact: input.recommendation.expected_impact,
    confidence: input.recommendation.confidence,
    payload: {
      evidence: input.recommendation.evidence,
      risk_if_ignored: input.recommendation.risk_if_ignored,
      suggested_action: input.recommendation.suggested_action,
    },
  };
}
