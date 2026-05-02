export interface QualityResult {
  valid: boolean;
  issues: string[];
}

export function validateAriaResponse(text: string | null | undefined): QualityResult {
  const issues: string[] = [];
  if (!text?.trim()) { issues.push('empty'); return { valid: false, issues }; }

  // JSON artifacts leaked into response
  if (/```json[\s\S]*?```/.test(text)) issues.push('json_code_block');
  if (/^[{\[]/.test(text.trim()))       issues.push('raw_json');

  // Unfilled template placeholders
  if (/\[business_name\]|\[name\]|\[insert\]|\[TODO\]/i.test(text)) issues.push('placeholder');

  // Repetition (same sentence twice)
  const sentences = text.split(/[.!?]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  const seen = new Set<string>();
  for (const s of sentences) {
    if (s.length > 20 && seen.has(s)) { issues.push('repetition'); break; }
    seen.add(s);
  }

  return { valid: issues.length === 0, issues };
}

export function cleanAriaResponse(text: string): string {
  return text
    .replace(/```json[\s\S]*?```/g, '')   // strip JSON blocks
    .replace(/```[\s\S]*?```/g, '')        // strip code blocks
    .replace(/<chart>[\s\S]*?<\/chart>/g, '') // strip chart data
    .replace(/\n{3,}/g, '\n\n')            // collapse triple+ newlines
    .trim();
}

/**
 * Validate, clean, and optionally retry.
 * Returns null if unrecoverable (caller should show graceful fallback).
 */
export function processAriaText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = cleanAriaResponse(raw);
  const { valid } = validateAriaResponse(cleaned);
  if (valid) return cleaned;
  // Second pass: try cleaning more aggressively
  const reClean = cleaned.replace(/\[.*?\]/g, '').trim();
  if (reClean.length > 10) return reClean;
  return null;
}
