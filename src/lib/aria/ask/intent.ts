import { callAnthropic } from '../providers/anthropic'
import { parseLLMJsonOr } from '@/lib/ai-json'

export type IntentType = 'question' | 'file_export' | 'troubleshoot' | 'escalate' | 'smalltalk'

export interface ClassifiedIntent {
  type: IntentType
  confidence: 'high' | 'medium' | 'low'
  export_format?: 'csv' | 'excel' | 'pdf'
  export_subject?: string
  export_period?: string
  issue_summary?: string
  issue_category?: 'hardware' | 'billing' | 'bug' | 'data' | 'general'
}

const SYSTEM = `You are an intent classifier for a business AI assistant. Classify the user message into one of these intents:
- question: asking for information, analysis, or advice about their business
- file_export: wants to download or generate a CSV, Excel, or PDF file
- troubleshoot: reporting a technical problem (hardware, sync, data, POS issues)
- escalate: explicitly asking to speak to support or lodge a complaint
- smalltalk: greetings, thanks, general chitchat

FILE_EXPORT triggers — classify as file_export if the message contains ANY of:
  "export", "download", "give me a file", "as a csv", "as excel", "as pdf",
  "generate a report", "pull a report", "get me a list", "send me a report",
  "csv of", "excel of", "pdf of", "spreadsheet", "extract", "dump",
  "can you export", "i need a file", "get a report", "run a report"

For file_export, identify: export_format (csv/excel/pdf — default csv if unspecified), export_subject (sales/inventory/staff/customers/products — infer from context), export_period (today/week/month — default month if unspecified).
For troubleshoot/escalate, identify: issue_summary (brief), issue_category (hardware/billing/bug/data/general).

Respond with JSON only: {"type":"...","confidence":"high|medium|low","export_format":"...","export_subject":"...","export_period":"...","issue_summary":"...","issue_category":"..."}`

export async function classifyIntent(
  message: string,
  conversationContext?: string,
): Promise<ClassifiedIntent> {
  const userPrompt = conversationContext
    ? `Recent context:\n${conversationContext}\n\nNew message: ${message}`
    : message

  const result = await callAnthropic<ClassifiedIntent>(
    {
      model: 'haiku',
      systemPrompt: SYSTEM,
      userPrompt,
      maxTokens: 200,
      agentKey: 'intent_classifier',
      role: 'classify',
    },
    { type: 'question', confidence: 'low' },
  )

  return parseLLMJsonOr<ClassifiedIntent>(result.raw, { type: 'question', confidence: 'low' }, 'intent/classify')
}
