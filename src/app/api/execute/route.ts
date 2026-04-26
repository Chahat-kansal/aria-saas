import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// Judge0 CE — free code execution API
// Free tier: 100 requests/day on rapidapi, or use the public instance
const JUDGE0_URL = 'https://ce.judge0.com';

// Judge0 language IDs
const LANGUAGE_MAP: Record<string, { id: number; name: string }> = {
  python:     { id: 71,  name: 'Python 3' },
  python3:    { id: 71,  name: 'Python 3' },
  py:         { id: 71,  name: 'Python 3' },
  javascript: { id: 63,  name: 'JavaScript (Node.js)' },
  js:         { id: 63,  name: 'JavaScript (Node.js)' },
  typescript: { id: 74,  name: 'TypeScript' },
  ts:         { id: 74,  name: 'TypeScript' },
  bash:       { id: 46,  name: 'Bash' },
  sh:         { id: 46,  name: 'Bash' },
  c:          { id: 50,  name: 'C (GCC)' },
  cpp:        { id: 54,  name: 'C++ (GCC)' },
  'c++':      { id: 54,  name: 'C++ (GCC)' },
  go:         { id: 60,  name: 'Go' },
  rust:       { id: 73,  name: 'Rust' },
  ruby:       { id: 72,  name: 'Ruby' },
  java:       { id: 62,  name: 'Java' },
  r:          { id: 80,  name: 'R' },
  php:        { id: 68,  name: 'PHP' },
  swift:      { id: 83,  name: 'Swift' },
  kotlin:     { id: 78,  name: 'Kotlin' },
  csharp:     { id: 51,  name: 'C#' },
  'c#':       { id: 51,  name: 'C#' },
  sql:        { id: 82,  name: 'SQL' },
  perl:       { id: 85,  name: 'Perl' },
  lua:        { id: 64,  name: 'Lua' },
};

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
    // Submit code for execution
    const submitRes = await fetch(`${JUDGE0_URL}/submissions?base64_encoded=false&wait=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language_id: lang.id,
        source_code: code,
        stdin: stdin || '',
        cpu_time_limit: 10,
        memory_limit: 128000,
      }),
    });

    if (!submitRes.ok) {
      const err = await submitRes.text();
      return NextResponse.json({ error: `Execution service error: ${err}` }, { status: 500 });
    }

    const result = await submitRes.json();

    // Status IDs: 1=In Queue, 2=Processing, 3=Accepted, 4=Wrong Answer, 5=TLE, 6=CE, 11=RE, 12=MLE
    const statusId = result.status?.id;
    const stderr = result.stderr || result.compile_output || '';
    const stdout = result.stdout || '';
    const exitCode = statusId === 3 ? 0 : 1;

    let errorMsg = '';
    if (statusId === 5) errorMsg = 'Time limit exceeded (10s)';
    else if (statusId === 12) errorMsg = 'Memory limit exceeded (128MB)';
    else if (statusId === 6) errorMsg = `Compilation error:\n${result.compile_output || ''}`;

    return NextResponse.json({
      stdout,
      stderr,
      code: exitCode,
      signal: null,
      compile_output: result.compile_output || '',
      language: lang.name,
      error: errorMsg || undefined,
      status: result.status?.description || 'Unknown',
    });

  } catch (err: any) {
    return NextResponse.json({ error: `Execution failed: ${err.message}` }, { status: 503 });
  }
}

export async function GET() {
  return NextResponse.json({ supported: Object.keys(LANGUAGE_MAP) });
}
