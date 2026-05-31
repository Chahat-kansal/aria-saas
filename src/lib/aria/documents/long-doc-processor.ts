import { callAnthropic } from '@/lib/aria/providers/anthropic'

export interface DocChunk { index: number; text: string; page_range: string }
export interface DocSummary { chunk_summaries: string[]; full_synthesis: string; key_facts: string[]; page_count: number }

export function chunkDocument(pages: string[], tokensPerChunk = 8000): DocChunk[] {
  const chunks: DocChunk[] = []
  let current = ''
  let startPage = 1
  let chunkIndex = 0
  const charsPerChunk = tokensPerChunk * 4

  for (let i = 0; i < pages.length; i++) {
    if ((current + pages[i]).length > charsPerChunk && current.length > 0) {
      chunks.push({ index: chunkIndex++, text: current, page_range: `${startPage}-${i}` })
      current = pages[i]
      startPage = i + 1
    } else {
      current += '\n\n' + pages[i]
    }
  }
  if (current.trim()) chunks.push({ index: chunkIndex, text: current, page_range: `${startPage}-${pages.length}` })
  return chunks
}

export async function processLongDocument(
  pages: string[],
  question: string,
  businessId: string,
): Promise<DocSummary> {
  const chunks = chunkDocument(pages)

  const chunkSummaries = await Promise.all(
    chunks.map(async chunk => {
      const result = await callAnthropic({
        model: 'haiku',
        systemPrompt: `Extract all information relevant to this question from this document section (pages ${chunk.page_range}). Question: "${question}". List every relevant fact, figure, date, name, and clause. Be exhaustive — do not summarise away details.`,
        userPrompt: chunk.text,
        maxTokens: 1500,
        businessId,
        agentKey: 'long_doc_map',
        role: 'document',
      }, '')
      return `[Pages ${chunk.page_range}]: ${result.raw}`
    })
  )

  const synthesis = await callAnthropic({
    model: 'sonnet',
    systemPrompt: `You have summaries of every section of a ${pages.length}-page document. Answer the owner's question by reasoning across ALL sections. Cite page ranges. Question: "${question}"`,
    userPrompt: chunkSummaries.join('\n\n'),
    maxTokens: 3000,
    businessId,
    agentKey: 'long_doc_reduce',
    role: 'document',
  }, '')

  const keyFacts = chunkSummaries.flatMap(s =>
    s.split('\n').filter(l => /\$[\d,]+|\d{1,2}\/\d{1,2}\/\d{2,4}|clause|section \d|\d+%/i.test(l)).slice(0, 5)
  ).slice(0, 30)

  return {
    chunk_summaries: chunkSummaries,
    full_synthesis: synthesis.raw,
    key_facts: keyFacts,
    page_count: pages.length,
  }
}
