import { NextResponse } from 'next/server'

// TODO: implement outlet cost history — stub prevents 404 until real query is built
export async function GET() {
  return NextResponse.json({ costs: [] })
}
