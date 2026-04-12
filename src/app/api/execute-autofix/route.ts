import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PISTON_URL = 'https://emkc.org/api/v2/piston';

const LANGUAGE_MAP: Record<string, { language: string; version: string }> = {
  python:     { language: 'python',     version: '3.10.0' },
  python3:    { language: 'python',     version: '3.10.0' },
  py:         { language: 'python',     version: '3.10.0' },
  javascript: { language: 'javascript', version: '18.15.0' },
  js:         { language: 'javascript', version: '18.15.0' },
  typescript: { language: 'typescript', version: '5.0.3' },
  ts:         { language: 'typescript', version: '5.0.3' },
  bash:       { language: 'bash',       version: '5.2.0' },
  sh:         { language: 'bash',       version: '5.2.0' },
  c:          { language: 'c',          version: '10.2.0' },
  cpp:        { language: 'c++',        version: '10.2.0' },
  'c++':      { language: 'c++',        version: '10.2.0' },
  go:         { language: 'go',         version: '1.16.2' },
  rust:       { language: 'rust',       version: '1.50.0' },
  ruby:       { language: 'ruby',       version: '3.0.1' },
  java:       { language: 'java',       version: '15.0.2' },
  r:          { language: 'r',          version: '4.1.1' },
  php:        { language: 'php',        version: '8.2.3' },
  swift:      { language: 'swift',      version: '5.3.3' },
  kotlin:     { language: 'kotlin',     version: '1.8.20' },
};

const MAX_ATTEMPTS = 3;

interface ExecutionResult {
  stdout: string;
  stderr: string;
  code: number;
  compile_output?: string;
  error?: string;
}

interface Attempt {
  attempt: number;
  code: string;
  result: ExecutionResult;
  fixed: boolean;
  explanation?: string;
}

async function executeCode(code: string, language: string, stdin: string): Promise<ExecutionResult> {
  const lang = LANGUAGE_MAP[language?.toLowerCase()];
  if (!lang) throw new Error(`Unsupported language: ${language}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(`${PISTON_URL}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        language: lang.language,
        version: lang.version,
        files: [{ name: `main.${language}`, content: code }],
        stdin,
        args: [],
        compile_timeout: 5000,
        run_timeout: 8000,
      }),
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.text();
      return { stdout: '', stderr: '', code: 1, error: `Execution service error: ${err}` };
    }

    const data = await res.json();
    return {
      stdout: data.run?.stdout || '',
      stderr: data.run?.stderr || '',
      code: data.run?.code ?? 0,
      compile_output: data.compile?.output || '',
    };
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      return { stdout: '', stderr: '', code: 1, error: 'Execution timed out (12s limit)' };
    }
    return { stdout: '', stderr: '', code: 1, error: 'Execution service unavailable' };
  }
}

function hasError(result: ExecutionResult): boolean {
  if (result.error) return true;
  if (result.code !== 0) return true;
  if (result.stderr && result.stderr.trim().length > 0) return true;
  if (result.compile_output && result.compile_output.trim().length > 0) return true;
  return false;
}

function buildErrorSummary(result: ExecutionResult): string {
  const parts: string[] = [];
  if (result.error) parts.push(`Error: ${result.error}`);
  if (result.compile_output?.trim()) parts.push(`Compile error:\n${result.compile_output}`);
  if (result.stderr?.trim()) parts.push(`Runtime error (stderr):\n${result.stderr}`);
  if (result.code !== 0) parts.push(`Exit code: ${result.code}`);
  return parts.join('\n\n');
}

async function askClaudeToFix(
  originalCode: string,
  language: string,
  errorSummary: string,
  attemptHistory: Attempt[]
): Promise<{ fixedCode: string; explanation: string }> {
  const historyContext = attemptHistory.length > 1
    ? `\n\nPrevious fix attempts that also failed:\n${attemptHistory.slice(0, -1).map((a, i) =>
        `Attempt ${i + 1}:\n\`\`\`${language}\n${a.code}\n\`\`\`\nError: ${buildErrorSummary(a.result)}`
      ).join('\n\n')}`
    : '';

  const prompt = `You are a code debugger. Fix this ${language} code that has an error.

ORIGINAL CODE:
\`\`\`${language}
${originalCode}
\`\`\`

ERROR:
${errorSummary}${historyContext}

Return ONLY a JSON object with this exact format, no other text:
{
  "fixedCode": "the complete fixed code here",
  "explanation": "one sentence explaining what was wrong and what you fixed"
}`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001', // Use Haiku for speed - auto-fix should be fast
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');

  try {
    // Strip markdown fences if present
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(clean);
    return {
      fixedCode: parsed.fixedCode || originalCode,
      explanation: parsed.explanation || 'Fixed the code',
    };
  } catch {
    // Fallback: extract code block if JSON parsing fails
    const codeMatch = text.match(/```(?:\w+)?\n([\s\S]*?)```/);
    return {
      fixedCode: codeMatch ? codeMatch[1].trim() : originalCode,
      explanation: 'Applied a fix based on the error',
    };
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code, language, stdin = '', autoFix = true } = await req.json();

  if (!code?.trim()) return NextResponse.json({ error: 'Code required' }, { status: 400 });
  if (code.length > 50000) return NextResponse.json({ error: 'Code too large (max 50KB)' }, { status: 400 });

  if (!LANGUAGE_MAP[language?.toLowerCase()]) {
    return NextResponse.json({ error: `Unsupported language: ${language}` }, { status: 400 });
  }

  const attempts: Attempt[] = [];
  let currentCode = code;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const isFirstAttempt = i === 0;

    // Run the code
    const result = await executeCode(currentCode, language, stdin);

    const attempt: Attempt = {
      attempt: i + 1,
      code: currentCode,
      result,
      fixed: !isFirstAttempt,
    };

    attempts.push(attempt);

    // Success — stop here
    if (!hasError(result)) {
      return NextResponse.json({
        success: true,
        attempts,
        finalCode: currentCode,
        autoFixed: i > 0,
        totalAttempts: i + 1,
      });
    }

    // Failed — if autoFix is off or we've hit max attempts, stop
    if (!autoFix || i === MAX_ATTEMPTS - 1) break;

    // Ask Claude to fix it
    try {
      const errorSummary = buildErrorSummary(result);
      const { fixedCode, explanation } = await askClaudeToFix(code, language, errorSummary, attempts);
      attempts[attempts.length - 1].explanation = explanation;
      currentCode = fixedCode;
    } catch (err) {
      // If Claude fix fails, just report the original error
      break;
    }
  }

  // All attempts failed
  return NextResponse.json({
    success: false,
    attempts,
    finalCode: currentCode,
    autoFixed: false,
    totalAttempts: attempts.length,
  });
}
