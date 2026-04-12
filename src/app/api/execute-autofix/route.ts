import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { code, language } = body;

    if (!code || !language) {
      return NextResponse.json(
        { success: false, error: 'Missing code or language' },
        { status: 400 }
      );
    }

    // ✅ TEMP TEST RESPONSE (ensures frontend works)
    return NextResponse.json({
      success: true,
      attempts: [
        {
          attempt: 1,
          code,
          fixed: false,
          result: {
            stdout: 'Hello from server ✅',
            stderr: '',
            code: 0,
          },
        },
      ],
      finalCode: code,
      autoFixed: false,
      totalAttempts: 1,
    });

  } catch (error: any) {
    console.error('EXECUTOR ERROR:', error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Server error',
      },
      { status: 500 }
    );
  }
}
