

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const JUDGE0_URL = 'https://ce.judge0.com';

const LANGUAGE_MAP: Record<string, { id: number; name: string }> = {
  python:     { id: 71, name: 'Python 3' },
  python3:    { id: 71, name: 'Python 3' },
  py:         { id: 71, name: 'Python 3' },
  javascript: { id: 63, name: 'JavaScript' },
  js:         { id: 63, name: 'JavaScript' },
  typescript: { id: 74, name: 'TypeScript' },
  ts:         { id: 74, name: 'TypeScript' },
  bash:       { id: 46, name: 'Bash' },
  sh:         { id: 46, name: 'Bash' },
  c:          { id: 50, name: 'C' },
  cpp:        { id: 54, name: 'C++' },
  'c++':      { id: 54, name: 'C++' },
  go:         { id: 60, name: 'Go' },
  rust:       { id: 73, name: 'Rust' },
  ruby:       { id: 72, name: 'Ruby' },
  java:       { id: 62, name: 'Java' },
  r:          { id: 80, name: 'R' },
  php:        { id: 68, name: 'PHP' },
  swift:      { id: 83, name: 'Swift' },
  kotlin:     { id: 78, name: 'Kotlin' },
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

  try {
    const res = await fetch(`${JUDGE0_URL}/submissions?base64_encoded=false&wait=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        language_id: lang.id,
        source_code: code,
        stdin: stdin || '',
        cpu_time_limit: 10,
        memory_limit: 128000,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { stdout: '', stderr: '', code: 1, error: `Execution service error: ${err}` };
    }

    const data = await res.json();
    const statusId = data.status?.id;
    let error = '';
    if (statusId === 5) error = 'Time limit exceeded';
    else if (statusId === 12) error = 'Memory limit exceeded';
    else if (statusId === 6) error = `Compilation error:\n${data.compile_output || ''}`;

    return {
      stdout: data.stdout || '',
      stderr: data.stderr || '',
      code: statusId === 3 ? 0 : 1,
      compile_output: data.compile_output || '',
      error: error || undefined,
    };
  } catch (err: any) {
    return { stdout: '', stderr: '', code: 1, error: `Execution failed: ${err.message}` };
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
  const { createServerSupabaseClient } = await import('@/lib/supabase-server');
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
