// /app/api/execute-autofix/route.ts

import { NextResponse } from 'next/server';

interface ExecRequest {
  code: string;
  language: string;
  stdin?: string;
  autoFix?: boolean;
}

function runCode(code: string, language: string) {
  // SIMPLE SAFE MOCK EXECUTOR (replace with Judge0 later if needed)

  try {
    if (language === 'javascript') {
      const result = eval(code); // (safe only for demo)
      return { stdout: String(result), stderr: '', code: 0 };
    }

    if (language === 'python') {
      return {
        stdout: 'Python execution requires backend runner (Piston/Judge0)',
        stderr: '',
        code: 0,
      };
    }

    return {
      stdout: '',
      stderr: `Language ${language} not supported in demo executor`,
      code: 1,
    };
  } catch (err: any) {
    return {
      stdout: '',
      stderr: err.message,
      code: 1,
    };
  }
}

export async function POST(req: Request) {
  try {
    const body: ExecRequest = await req.json();
    const { code, language } = body;

    if (!code) {
      return NextResponse.json({ error: 'No code provided' }, { status: 400 });
    }

    const result = runCode(code, language);

    const response = {
      success: result.code === 0,
      attempts: [
        {
          attempt: 1,
          code,
          result,
          fixed: false,
        },
      ],
      finalCode: code,
      autoFixed: false,
      totalAttempts: 1,
    };

    return NextResponse.json(response);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Execution failed' },
      { status: 500 }
    );
  }
}
