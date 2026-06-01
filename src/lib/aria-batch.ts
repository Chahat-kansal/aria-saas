import { logger } from '@/lib/observability/logger'

interface BatchRequest {
  custom_id: string
  params: {
    model: string
    max_tokens: number
    system?: unknown
    messages: unknown[]
  }
}

const BATCH_HEADERS = {
  'x-api-key': process.env.ANTHROPIC_API_KEY!,
  'anthropic-version': '2023-06-01',
  'anthropic-beta': 'message-batches-2024-09-24',
  'Content-Type': 'application/json',
}

export async function submitBatch(requests: BatchRequest[]): Promise<string> {
  logger.info('anthropic batch submit', { count: requests.length })
  const res = await fetch('https://api.anthropic.com/v1/messages/batches', {
    method: 'POST',
    headers: BATCH_HEADERS,
    body: JSON.stringify({ requests }),
  })
  const data = await res.json() as { id?: string; error?: { message: string } }
  if (!res.ok) {
    logger.error('anthropic batch submit failed', { error: data.error?.message, count: requests.length })
    throw new Error(data.error?.message ?? 'Batch submit failed')
  }
  logger.info('anthropic batch submitted', { batchId: data.id, count: requests.length })
  return data.id!
}

export async function pollBatchResults(batchId: string): Promise<unknown[] | null> {
  const res = await fetch(`https://api.anthropic.com/v1/messages/batches/${batchId}`, {
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'message-batches-2024-09-24',
    },
  })
  const data = await res.json() as { processing_status?: string; results_url?: string }
  if (data.processing_status !== 'ended') return null

  const resultsRes = await fetch(data.results_url!, {
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
  })
  const text = await resultsRes.text()
  return text.split('\n').filter(Boolean).map(line => JSON.parse(line))
}
