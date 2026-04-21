// Registration is handled by Supabase Auth via /signup page.
import { NextResponse } from 'next/server';
export async function POST() { return NextResponse.json({ error: 'Use /signup instead' }, { status: 410 }); }