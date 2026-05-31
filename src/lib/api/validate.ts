import { z } from 'zod'
import { NextResponse } from 'next/server'

export async function validateBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { error: NextResponse }> {
  try {
    const body = await req.json()
    const result = schema.safeParse(body)
    if (!result.success) {
      return { error: NextResponse.json(
        { error: 'Invalid request', details: result.error.flatten() },
        { status: 400 }
      )}
    }
    return { data: result.data }
  } catch {
    return { error: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  }
}
