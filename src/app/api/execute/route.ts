import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';

// Piston API — free, open source code execution engine
// Supports Python, JavaScript, TypeScript, C, C++, Go, Rust, Ruby, Java, etc.
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

const TIMEOUT_MS = 10000;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code, language, stdin = '' } = await req.json();

  if (!code?.trim()) return NextResponse.json({ error: 'Code required' }, { status: 400 });
  if (code.length > 50000) return NextResponse.json({ error: 'Code too large (max 50KB)' }, { status: 400 });

  const lang = LANGUAGE_MAP[language?.toLowerCase()];
  if (!lang) {
    return NextResponse.json({
      error: `Unsupported language: ${language}. Supported: ${Object.keys(LANGUAGE_MAP).filter((k, i, a) => a.indexOf(k) === i).join(', ')}`,
    }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

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
        compile_memory_limit: -1,
        run_memory_limit: -1,
      }),
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Execution service error: ${err}` }, { status: 500 });
    }

    const data = await res.json();

    return NextResponse.json({
      stdout: data.run?.stdout || '',
      stderr: data.run?.stderr || '',
      code: data.run?.code ?? 0,
      signal: data.run?.signal || null,
      compile_output: data.compile?.output || '',
      language: lang.language,
      version: lang.version,
    });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return NextResponse.json({ error: 'Code execution timed out (10s limit)' }, { status: 408 });
    }
    return NextResponse.json({ error: 'Execution service unavailable' }, { status: 503 });
  }
}

// GET supported languages
export async function GET() {
  return NextResponse.json({ supported: Object.keys(LANGUAGE_MAP) });
}
