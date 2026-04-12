import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { connectDB } from '@/lib/mongodb';
import { User } from '@/models/User';

export async function POST(req: Request) {
  const { name, email, password } = await req.json();
  if (!name || !email || !password) return NextResponse.json({ error: 'All fields required' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  await connectDB();
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
  const hashed = await bcrypt.hash(password, 12);
  await User.create({ name, email: email.toLowerCase(), password: hashed, plan: 'free' });
  return NextResponse.json({ success: true }, { status: 201 });
}
