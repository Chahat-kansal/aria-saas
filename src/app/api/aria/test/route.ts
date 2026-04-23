import { NextResponse } from 'next/server';

export async function GET() {
  const key = process.env.ANTHROPIC_API_KEY;
  return NextResponse.json({
    status: 'ok',
    has_anthropic_key: !!key,
    key_preview: key ? key.substring(0, 14) + '...' : 'MISSING',
    key_valid: key ? key.startsWith('sk-ant-') : false,
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
}