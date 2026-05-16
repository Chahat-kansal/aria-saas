/**
 * Robust JSON extraction from LLM responses.
 *
 * LLMs often wrap JSON in:
 *   - ```json fenced code blocks
 *   - prose ("Here's the analysis: { ... }. Let me know if...")
 *   - markdown bullets containing braces
 *   - multiple JSON objects (we want the largest/main one)
 *
 * Naive regex /\{[\s\S]*\}/ is greedy and captures everything from
 * first { to last }, including prose between unrelated JSON blobs.
 *
 * This utility tries multiple strategies in priority order and
 * returns the parsed object (or null) without ever throwing.
 */

export interface ParseLLMResult<T> {
  ok: boolean
  data: T | null
  error?: string
  rawSnippet?: string  // first 200 chars of raw for debugging
}

/**
 * Extract balanced { } JSON object using brace-depth counting.
 * Walks the string char-by-char, respecting string literals and
 * escape sequences. Returns the FIRST top-level {...} found.
 */
function extractBalancedJson(text: string, startChar: '{' | '[' = '{'): string | null {
  const endChar = startChar === '{' ? '}' : ']'
  let start = -1
  let depth = 0
  let inString = false
  let escapeNext = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (escapeNext) { escapeNext = false; continue }
    if (ch === '\\') { escapeNext = true; continue }
    if (ch === '"' && !escapeNext) { inString = !inString; continue }
    if (inString) continue

    if (ch === startChar) {
      if (depth === 0) start = i
      depth++
    } else if (ch === endChar) {
      depth--
      if (depth === 0 && start !== -1) {
        return text.slice(start, i + 1)
      }
    }
  }
  return null
}

/**
 * Try to strip common code fence markers around JSON.
 */
function stripFences(text: string): string {
  return text
    .replace(/```(?:json|JSON)?\s*/g, '')
    .replace(/```/g, '')
    .trim()
}

/**
 * Try strategies in order until one yields parseable JSON.
 * Returns { ok: true, data } on success, { ok: false, error, rawSnippet } on failure.
 *
 * @param raw The full LLM response string.
 * @param shape 'object' (default) extracts {...}, 'array' extracts [...].
 */
export function parseLLMJson<T = Record<string, unknown>>(
  raw: string | null | undefined,
  shape: 'object' | 'array' = 'object',
): ParseLLMResult<T> {
  if (!raw || typeof raw !== 'string') {
    return { ok: false, data: null, error: 'empty_input' }
  }

  const snippet = raw.slice(0, 200)

  // Strategy 1: try parsing the entire string as-is (Claude/GPT often
  // do this when response_format: json_object is set)
  try {
    return { ok: true, data: JSON.parse(raw) as T }
  } catch { /* try next */ }

  // Strategy 2: strip code fences, parse the result
  const unfenced = stripFences(raw)
  try {
    return { ok: true, data: JSON.parse(unfenced) as T }
  } catch { /* try next */ }

  // Strategy 3: extract balanced {...} or [...] using depth counter
  const balanced = extractBalancedJson(unfenced, shape === 'array' ? '[' : '{')
  if (balanced) {
    try {
      return { ok: true, data: JSON.parse(balanced) as T }
    } catch { /* try next */ }
  }

  // Strategy 4: if asked for object, also try array (some LLMs return [...] when [{...}] expected)
  if (shape === 'object') {
    const balancedArray = extractBalancedJson(unfenced, '[')
    if (balancedArray) {
      try {
        return { ok: true, data: JSON.parse(balancedArray) as T }
      } catch { /* try next */ }
    }
  }

  // Strategy 5: aggressive cleanup — remove trailing commas
  const cleaned = unfenced
    .replace(/,(\s*[}\]])/g, '$1')      // trailing commas
    .replace(/“|”/g, '"')     // smart quotes → straight
    .replace(/‘|’/g, "'")     // smart apostrophes

  const balancedCleaned = extractBalancedJson(cleaned, shape === 'array' ? '[' : '{')
  if (balancedCleaned) {
    try {
      return { ok: true, data: JSON.parse(balancedCleaned) as T }
    } catch { /* give up */ }
  }

  return {
    ok: false,
    data: null,
    error: 'parse_failed_all_strategies',
    rawSnippet: snippet,
  }
}

/**
 * Convenience wrapper — returns parsed data or the fallback.
 * Logs a warning when falling back so we can spot bad LLM output.
 */
export function parseLLMJsonOr<T>(
  raw: string | null | undefined,
  fallback: T,
  context: string = 'unknown',
  shape: 'object' | 'array' = 'object',
): T {
  const result = parseLLMJson<T>(raw, shape)
  if (!result.ok) {
    console.warn(`[ai-json] parse failed in ${context}:`, result.error, 'snippet:', result.rawSnippet)
    return fallback
  }
  return result.data as T
}