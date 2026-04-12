import { CodeArtifact } from '@/components/chat/PreviewPanel';
import { v4 as uuid } from 'uuid';

const PREVIEWABLE = new Set(['html', 'jsx', 'tsx']);

const TITLE_PATTERNS: [RegExp, string][] = [
  [/(?:build|create|make|write)\s+(?:a\s+)?(.+?)(?:\s+(?:page|component|app|website|dashboard|form|landing))?(?:\.|$)/i, '$1'],
  [/(?:here(?:'s| is)|this is)\s+(?:a\s+)?(.+?)(?:\s+(?:page|component|app|website))?(?:\.|$)/i, '$1'],
];

function guessTitle(message: string, lang: string): string {
  for (const [pattern] of TITLE_PATTERNS) {
    const m = message.match(pattern);
    if (m?.[1]) return m[1].trim().slice(0, 50);
  }
  return `${lang.toUpperCase()} file`;
}

export function extractArtifacts(content: string, messageContext?: string): CodeArtifact[] {
  const artifacts: CodeArtifact[] = [];
  // Match ``` code blocks with optional language tag
  const regex = /```(\w+)?\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const rawLang = (match[1] || 'other').toLowerCase();
    const code = match[2].trim();
    if (!code || code.length < 20) continue;

    // Normalise language
    let lang: CodeArtifact['language'] = 'other';
    if (rawLang === 'html') lang = 'html';
    else if (rawLang === 'jsx' || rawLang === 'javascript' || rawLang === 'js') lang = 'jsx';
    else if (rawLang === 'tsx' || rawLang === 'typescript' || rawLang === 'ts') lang = 'tsx';
    else if (rawLang === 'css') lang = 'css';
    else if (rawLang === 'python' || rawLang === 'py') lang = 'python';
    else lang = rawLang as CodeArtifact['language'];

    artifacts.push({
      id: uuid(),
      title: guessTitle(messageContext || content, lang),
      language: lang,
      code,
      streaming: false,
    });
  }
  return artifacts;
}

export function isPreviewable(lang: string): boolean {
  return PREVIEWABLE.has(lang);
}

export function shouldShowPreview(content: string): boolean {
  return /```(html|jsx|tsx|javascript|js|typescript|ts)/i.test(content);
}
