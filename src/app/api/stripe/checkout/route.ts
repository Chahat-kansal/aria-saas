// Superseded by /api/stripe/create-checkout which uses Supabase auth.
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
async function _POST() {
  return NextResponse.json({ error: 'Use /api/stripe/create-checkout instead' }, { status: 410 });
}

export const POST = withErrorCapture('stripe/checkout', _POST)
