// Superseded by /api/stripe/create-checkout which uses Supabase auth.
import { NextResponse } from 'next/server';
export async function POST() {
  return NextResponse.json({ error: 'Use /api/stripe/create-checkout instead' }, { status: 410 });
}