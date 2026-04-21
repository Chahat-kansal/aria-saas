// NextAuth removed — auth is handled by Supabase.
// This stub prevents 404s from any lingering client references.
import { NextResponse } from 'next/server';
export async function GET() { return NextResponse.json({ error: 'Not used' }, { status: 410 }); }
export async function POST() { return NextResponse.json({ error: 'Not used' }, { status: 410 }); }