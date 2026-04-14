import { CodeArtifact } from '@/components/chat/PreviewPanel';

const uuid = () => crypto.randomUUID();

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

function normalizeLang(raw: string): CodeArtifact['language'] {
  const r = raw.toLowerCase();
  if (r === 'html') return 'html';
  if (r === 'jsx' || r === 'javascript' || r === 'js') return 'jsx';
  if (r === 'tsx' || r === 'typescript' || r === 'ts') return 'tsx';
  if (r === 'css') return 'css';
  if (r === 'python' || r === 'py') return 'python';
  return r as CodeArtifact['language'];
}

export function extractArtifacts(content: string, messageContext?: string): CodeArtifact[] {
  const artifacts: CodeArtifact[] = [];
  
  // Match properly closed code blocks first
  const closedRegex = /```(\w+)?\n([\s\S]+?)```/g;
  let match;
  while ((match = closedRegex.exec(content)) !== null) {
    const lang = normalizeLang(match[1] || 'other');
    const code = match[2].trim();
    if (!code || code.length < 20) continue;
    artifacts.push({
      id: uuid(),
      title: guessTitle(messageContext || content, lang),
      language: lang,
      code,
      streaming: false,
    });
  }
  
  // If no closed blocks found, try to get an unclosed block (streaming ended early)
  if (artifacts.length === 0) {
    const unclosedRegex = /```(\w+)?\n([\s\S]+?)$/;
    const unclosed = content.match(unclosedRegex);
    if (unclosed) {
      const lang = normalizeLang(unclosed[1] || 'html');
      const code = unclosed[2].trim();
      if (code && code.length >= 20) {
        artifacts.push({
          id: uuid(),
          title: guessTitle(messageContext || content, lang),
          language: lang,
          code,
          streaming: false,
        });
      }
    }
  }
  
  return artifacts;
}

export function isPreviewable(lang: string): boolean {
  return PREVIEWABLE.has(lang);
}

export function shouldShowPreview(content: string): boolean {
  return /```(html|jsx|tsx|javascript|js|typescript|ts)/i.test(content);
}
