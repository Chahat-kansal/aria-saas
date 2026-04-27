// Judge0 CE code execution — extracted from /api/execute/route.ts
const JUDGE0_URL = 'https://ce.judge0.com';

const LANGUAGE_MAP: Record<string, { id: number; name: string }> = {
  python:     { id: 71, name: 'Python 3' },
  python3:    { id: 71, name: 'Python 3' },
  py:         { id: 71, name: 'Python 3' },
  javascript: { id: 63, name: 'JavaScript (Node.js)' },
  js:         { id: 63, name: 'JavaScript (Node.js)' },
  typescript: { id: 74, name: 'TypeScript' },
  ts:         { id: 74, name: 'TypeScript' },
  bash:       { id: 46, name: 'Bash' },
  sh:         { id: 46, name: 'Bash' },
  c:          { id: 50, name: 'C (GCC)' },
  cpp:        { id: 54, name: 'C++ (GCC)' },
  'c++':      { id: 54, name: 'C++ (GCC)' },
  go:         { id: 60, name: 'Go' },
  rust:       { id: 73, name: 'Rust' },
  ruby:       { id: 72, name: 'Ruby' },
  java:       { id: 62, name: 'Java' },
  r:          { id: 80, name: 'R' },
  php:        { id: 68, name: 'PHP' },
  swift:      { id: 83, name: 'Swift' },
  kotlin:     { id: 78, name: 'Kotlin' },
  csharp:     { id: 51, name: 'C#' },
  'c#':       { id: 51, name: 'C#' },
  sql:        { id: 82, name: 'SQL' },
  perl:       { id: 85, name: 'Perl' },
  lua:        { id: 64, name: 'Lua' },
};

export const SUPPORTED_LANGUAGES = Object.keys(LANGUAGE_MAP).filter(
  (k, i, a) => a.indexOf(k) === i
);

export interface ExecuteResult {
  stdout: string;
  stderr: string;
  code: number;
  language: string;
  compile_output?: string;
  error?: string;
  status: string;
}

export async function executeCode(
  code: string,
  language: string,
  stdin?: string
): Promise<ExecuteResult> {
  const lang = LANGUAGE_MAP[language?.toLowerCase()];
  if (!lang) {
    throw new Error(
      `Unsupported language: ${language}. Supported: ${SUPPORTED_LANGUAGES.join(', ')}`
    );
  }

  const submitRes = await fetch(
    `${JUDGE0_URL}/submissions?base64_encoded=false&wait=true`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language_id: lang.id,
        source_code: code,
        stdin: stdin || '',
        cpu_time_limit: 10,
        memory_limit: 128000,
      }),
    }
  );

  if (!submitRes.ok) {
    const err = await submitRes.text();
    throw new Error(`Execution service error: ${err}`);
  }

  const result = await submitRes.json();
  const statusId = result.status?.id;
  const exitCode = statusId === 3 ? 0 : 1;

  let errorMsg = '';
  if (statusId === 5) errorMsg = 'Time limit exceeded (10s)';
  else if (statusId === 12) errorMsg = 'Memory limit exceeded (128MB)';
  else if (statusId === 6) errorMsg = `Compilation error:\n${result.compile_output || ''}`;

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || result.compile_output || '',
    code: exitCode,
    language: lang.name,
    compile_output: result.compile_output || '',
    error: errorMsg || undefined,
    status: result.status?.description || 'Unknown',
  };
}
